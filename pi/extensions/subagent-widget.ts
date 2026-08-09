/**
 * Subagent Widget — /sub, /subpers, /subclear, /subrm, /subcont commands with stacking live widgets
 *
 * Each /sub spawns a background Pi subagent with its own persistent session,
 * enabling conversation continuations via /subcont.
 *
 * Agent personalities are markdown files in ~/.pi/agent/agents/*.md with a
 * YAML frontmatter block (name, description, tools, model, color) followed
 * by the personality prompt body. The `model` field is ignored — model
 * selection stays with --model / the parent model. The body is appended
 * verbatim to the subagent's system prompt via --append-system-prompt, so
 * the same personality always produces the exact same appended text across
 * every spawn/continue call (stable for prompt caching).
 *
 * Usage: pi -e extensions/subagent-widget.ts
 * Then:
 *   /sub list files and summarize                    — spawn using the parent model/thinking
 *   /sub --model openai/gpt-5 --thinking high review this code
 *   /sub --agent bug-investigator find why login fails
 *   /subpers                                         — pick a personality interactively, then be prompted for a task
 *   /subpers bug-investigator find why login fails    — pick a personality directly
 *   /subcont 1 --thinking xhigh now write tests for it — reuses the same personality (if any) automatically
 *   /subrm 2                                         — remove subagent #2 widget
 *   /subclear                                        — clear all subagent widgets
 *
 * Persistence across /reload and session resume:
 * The `agents` map lives in this module's closure, which /reload throws away
 * and rebuilds from scratch — a bare in-memory Map cannot survive that. To
 * survive it, every state change (spawn, turn continue, completion, removal,
 * clear) is snapshotted into the session via pi.appendEntry(), and
 * session_start/session_tree replay the latest snapshot to rebuild `agents`
 * and re-render widgets. session_shutdown (which still runs on the *old*,
 * still-populated instance, unlike session_start which runs on the new one)
 * kills any still-running child processes and clears their widgets before
 * the swap, so reload never leaves orphaned processes or ghost widgets with
 * no backing state.
 */

import { StringEnum, type ThinkingLevel } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
const { spawn } = require("child_process") as any;
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

const FALLBACK_MODEL = "openrouter/google/gemini-3.5-flash";
// Inline character cap for a subagent's result text delivered back to the
// main agent. Outputs at or under this are returned in full, no file written.
// Longer outputs are truncated to this many chars inline, with the full,
// untruncated text saved next to the subagent's session file so the main
// agent can read the rest on demand.
const INLINE_RESULT_LIMIT = 4000;
const THINKING_OVERRIDES = ["low", "medium", "high", "xhigh"] as const;
type ThinkingOverride = (typeof THINKING_OVERRIDES)[number];

const AGENTS_DIR = path.join(os.homedir(), ".pi", "agent", "agents");

interface Personality {
	name: string;
	description: string;
	body: string;
}

/**
 * Discover agent personality markdown files from ~/.pi/agent/agents/*.md.
 * Each file is YAML frontmatter (name, description, tools, model, color) +
 * a body. `model` is intentionally ignored here — model choice stays with
 * --model / the parent model, not the personality. The returned body is
 * the exact, unmodified text that gets appended to the subagent's system
 * prompt, so re-loading this on every call is safe: the content for a given
 * personality name never changes within a session unless the file itself
 * is edited on disk.
 */
function loadPersonalities(): Map<string, Personality> {
	const map = new Map<string, Personality>();
	if (!fs.existsSync(AGENTS_DIR)) return map;

	for (const file of fs.readdirSync(AGENTS_DIR)) {
		if (!file.endsWith(".md")) continue;
		try {
			const raw = fs.readFileSync(path.join(AGENTS_DIR, file), "utf-8");
			const { frontmatter, body } = parseFrontmatter(raw);
			const fm = frontmatter as Record<string, unknown>;
			const name = (typeof fm.name === "string" && fm.name.trim()) || file.replace(/\.md$/, "");
			const description = (typeof fm.description === "string" && fm.description.trim()) || "";
			map.set(name, { name, description, body: body.trim() });
		} catch {
			// Skip unreadable/malformed personality files rather than failing the whole extension.
		}
	}
	return map;
}

interface SpawnOptions {
	model?: string;
	thinking?: ThinkingOverride;
	personality?: string;
}

interface SubState {
	id: number;
	status: "running" | "done" | "error";
	task: string;
	textChunks: string[];
	toolCount: number;
	elapsed: number;
	sessionFile: string;   // persistent JSONL session path — used by /subcont to resume
	turnCount: number;     // increments each time /subcont continues this agent
	model: string;
	thinking: ThinkingLevel;
	proc?: any;            // active ChildProcess ref (for kill on /subrm)
	personality?: string;  // name of the agent personality applied to this subagent, if any
}

// Serializable projection of SubState used for session persistence — everything
// except `proc`, which is a live ChildProcess handle that cannot (and does not
// need to) survive a reload: a subagent surviving reload is by definition not
// still attached to a live process on the new side.
type SubStateRecord = Omit<SubState, "proc">;

interface SubagentSnapshot {
	nextId: number;
	agents: SubStateRecord[];
}

const SUBAGENT_STATE_ENTRY = "subagent-state";

interface ParsedCommand {
	options: SpawnOptions;
	rest: string;
	error?: string;
}

function readCommandValue(input: string): { value?: string; rest: string } {
	const trimmed = input.trimStart();
	if (!trimmed) return { rest: "" };

	const quote = trimmed[0];
	if (quote === '"' || quote === "'") {
		const end = trimmed.indexOf(quote, 1);
		if (end === -1) return { rest: trimmed };
		return { value: trimmed.slice(1, end), rest: trimmed.slice(end + 1) };
	}

	const end = trimmed.search(/\s/);
	return end === -1
		? { value: trimmed, rest: "" }
		: { value: trimmed.slice(0, end), rest: trimmed.slice(end) };
}

function parseCommandOptions(input: string): ParsedCommand {
	const options: SpawnOptions = {};
	let rest = input.trimStart();

	while (rest.startsWith("--")) {
		const flagMatch = rest.match(/^--(model|thinking|agent)(?:=([^\s]+))?(?:\s+|$)/);
		if (!flagMatch) {
			const flag = rest.match(/^\S+/)?.[0] || rest;
			return { options, rest: "", error: `Unknown or malformed option: ${flag}` };
		}

		const flag = flagMatch[1];
		let value = flagMatch[2];
		rest = rest.slice(flagMatch[0].length);
		if (!value) {
			const parsed = readCommandValue(rest);
			value = parsed.value;
			rest = parsed.rest;
		}
		if (!value) return { options, rest: "", error: `Missing value for --${flag}` };

		if (flag === "model") {
			options.model = value;
			rest = rest.trimStart();
			continue;
		}

		if (flag === "agent") {
			options.personality = value;
			rest = rest.trimStart();
			continue;
		}

		const thinking = value.toLowerCase();
		if (!THINKING_OVERRIDES.includes(thinking as ThinkingOverride)) {
			return {
				options,
				rest: "",
				error: "Thinking must be one of: low, medium, high, xhigh",
			};
		}
		options.thinking = thinking as ThinkingOverride;
		rest = rest.trimStart();
	}

	return { options, rest: rest.trim() };
}

export default function (pi: ExtensionAPI) {
	const agents: Map<number, SubState> = new Map();
	let nextId = 1;
	let widgetCtx: any;
	// Ids whose widget is currently on screen. Used by updateWidgets() to tear
	// down widgets for agents that have disappeared from `agents` (e.g. after
	// /tree navigates to a branch where the subagent doesn't exist yet) — without
	// this, a stale widget keeps rendering even though its backing state is gone.
	let renderedWidgetIds: Set<number> = new Set();

	// ── State persistence (survives /reload, session resume, /tree) ──────────

	// Strips the live `proc` handle before a state is written to the session.
	function toRecord(state: SubState): SubStateRecord {
		const { proc, ...rest } = state;
		return rest;
	}

	// Snapshots the full agents map into the session as a custom entry. Called
	// after every mutation (spawn, turn continue, completion, removal, clear) so
	// the latest entry always reflects current state. Cheap: entries are small
	// and infrequent (state changes, not per streamed token).
	function persistState() {
		const snapshot: SubagentSnapshot = {
			nextId,
			agents: Array.from(agents.values()).map(toRecord),
		};
		pi.appendEntry(SUBAGENT_STATE_ENTRY, snapshot);
	}

	// Rebuilds `agents`/`nextId` from the latest persisted snapshot on the
	// current branch. Called from session_start/session_tree, where this
	// module's own in-memory state has just been reset to empty (new instance
	// on reload, or a fresh branch view) and needs restoring from disk.
	function reconstructState(ctx: any) {
		agents.clear();
		nextId = 1;

		let latest: SubagentSnapshot | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === SUBAGENT_STATE_ENTRY) {
				latest = entry.data as SubagentSnapshot;
			}
		}
		if (!latest) return;

		nextId = latest.nextId ?? 1;
		for (const rec of latest.agents ?? []) {
			agents.set(rec.id, { ...rec });
		}
	}

	// ── Session file helpers ──────────────────────────────────────────────────

	function makeSessionFile(id: number): string {
		const dir = path.join(os.homedir(), ".pi", "agent", "sessions", "subagents");
		fs.mkdirSync(dir, { recursive: true });
		return path.join(dir, `subagent-${id}-${Date.now()}.jsonl`);
	}

	// ── Widget rendering ──────────────────────────────────────────────────────

	function updateWidgets() {
		if (!widgetCtx) return;

		// Clear widgets for any previously-rendered id that's no longer in `agents`
		// (removed, or the current branch/session simply doesn't have it).
		const liveIds = new Set(agents.keys());
		for (const id of renderedWidgetIds) {
			if (!liveIds.has(id)) widgetCtx.ui.setWidget(`sub-${id}`, undefined);
		}
		renderedWidgetIds = liveIds;

		for (const [id, state] of Array.from(agents.entries())) {
			const key = `sub-${id}`;
			widgetCtx.ui.setWidget(key, (_tui: any, theme: any) => {
				const container = new Container();
				const borderFn = (s: string) => theme.fg("dim", s);

				container.addChild(new Text("", 0, 0)); // top margin
				container.addChild(new DynamicBorder(borderFn));
				const content = new Text("", 1, 0);
				container.addChild(content);
				container.addChild(new DynamicBorder(borderFn));

				return {
					render(width: number): string[] {
						const lines: string[] = [];
						const statusColor = state.status === "running" ? "accent"
							: state.status === "done" ? "success" : "error";
						const statusIcon = state.status === "running" ? "●"
							: state.status === "done" ? "✓" : "✗";

						const taskPreview = state.task.length > 40
							? state.task.slice(0, 37) + "..."
							: state.task;

						const turnLabel = state.turnCount > 1
							? theme.fg("dim", ` · Turn ${state.turnCount}`)
							: "";
						const personalityLabel = state.personality
							? theme.fg("dim", ` · [${state.personality}]`)
							: "";

						lines.push(
							theme.fg(statusColor, `${statusIcon} Subagent #${state.id}`) +
							turnLabel +
							personalityLabel +
							theme.fg("dim", `  ${taskPreview}`) +
							theme.fg("dim", `  (${Math.round(state.elapsed / 1000)}s)`) +
							theme.fg("dim", ` | Tools: ${state.toolCount}`)
						);

						const fullText = state.textChunks.join("");
						const lastLine = fullText.split("\n").filter((l: string) => l.trim()).pop() || "";
						if (lastLine) {
							const trimmed = lastLine.length > width - 10
								? lastLine.slice(0, width - 13) + "..."
								: lastLine;
							lines.push(theme.fg("muted", `  ${trimmed}`));
						}

						content.setText(lines.join("\n"));
						return container.render(width);
					},
					invalidate() {
						container.invalidate();
					},
				};
			});
		}
	}

	// ── Streaming helpers ─────────────────────────────────────────────────────

	function processLine(state: SubState, line: string) {
		if (!line.trim()) return;
		try {
			const event = JSON.parse(line);
			const type = event.type;

			if (type === "message_update") {
				const delta = event.assistantMessageEvent;
				if (delta?.type === "text_delta") {
					state.textChunks.push(delta.delta || "");
					updateWidgets();
				}
			} else if (type === "tool_execution_start") {
				state.toolCount++;
				updateWidgets();
			}
		} catch {}
	}

	function spawnAgent(
		state: SubState,
		prompt: string,
		ctx: any,
		options: SpawnOptions = {},
	): Promise<void> {
		const parentProvider = ctx.model?.provider?.trim();
		const parentModelId = ctx.model?.id?.trim();
		const hasParentModel = parentProvider && parentModelId
			&& parentProvider !== "unknown" && parentModelId !== "unknown";
		const parentModel = hasParentModel
			? `${parentProvider}/${parentModelId}`
			: FALLBACK_MODEL;
		const model = options.model?.trim() || parentModel;
		const thinking = options.thinking || pi.getThinkingLevel();
		state.model = model;
		state.thinking = thinking;

		// A personality picked at creation time sticks across /subcont turns unless
		// explicitly overridden, so the same subagent keeps the same appended
		// system-prompt text for every turn.
		const personalityName = options.personality ?? state.personality;
		state.personality = personalityName;

		const spawnArgs = [
			"--mode", "json",
			"-p",
			"--session", state.sessionFile,   // persistent session for /subcont resumption
			"--no-extensions",
			"--model", model,
			"--tools", "read,bash,grep,find,ls",
			"--thinking", thinking,
		];

		if (personalityName) {
			const personality = loadPersonalities().get(personalityName);
			if (personality?.body) {
				// Append the personality body verbatim. This text is identical on every
				// call for a given personality name, which keeps the subagent's system
				// prompt stable across turns for prompt-cache reuse.
				spawnArgs.push("--append-system-prompt", personality.body);
			}
		}

		spawnArgs.push(prompt);

		return new Promise<void>((resolve) => {
			const proc = spawn("pi", spawnArgs, {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			});

			state.proc = proc;

			const startTime = Date.now();
			const timer = setInterval(() => {
				state.elapsed = Date.now() - startTime;
				updateWidgets();
			}, 1000);

			let buffer = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(state, line);
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => {
				if (chunk.trim()) {
					state.textChunks.push(chunk);
					updateWidgets();
				}
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(state, buffer);
				clearInterval(timer);
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "done" : "error";
				state.proc = undefined;
				updateWidgets();
				persistState();

				const result = state.textChunks.join("");
				ctx.ui.notify(
					`Subagent #${state.id} ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
					state.status === "done" ? "success" : "error"
				);

				const resultText = result.length > INLINE_RESULT_LIMIT
					? (() => {
						const resultFile = state.sessionFile.replace(/\.jsonl$/, ".result.txt");
						fs.writeFileSync(resultFile, result, "utf-8");
						return `Result (showing first ${INLINE_RESULT_LIMIT} of ${result.length} chars — full output saved to ${resultFile}):\n${result.slice(0, INLINE_RESULT_LIMIT)}`;
					})()
					: `Result:\n${result}`;

				pi.sendMessage({
					customType: "subagent-result",
					content: `Subagent #${state.id}${state.turnCount > 1 ? ` (Turn ${state.turnCount})` : ""} finished "${prompt}" in ${Math.round(state.elapsed / 1000)}s.\n\n${resultText}`,
					display: true,
				}, { deliverAs: "followUp", triggerTurn: true });

				resolve();
			});

			proc.on("error", (err) => {
				clearInterval(timer);
				state.status = "error";
				state.proc = undefined;
				state.textChunks.push(`Error: ${err.message}`);
				updateWidgets();
				persistState();
				resolve();
			});
		});
	}

	// ── Tools for the Main Agent ──────────────────────────────────────────────

	// Enumerated once at extension load (and again on /reload) so the tool schema
	// stays static for the model, matching how skills/prompts are discovered.
	const discoveredPersonalityNames = Array.from(loadPersonalities().keys());
	const agentParamSchema = discoveredPersonalityNames.length > 0
		? Type.Optional(StringEnum([...discoveredPersonalityNames], {
			description: `Optional agent personality to give this subagent a specialized system prompt. One of: ${discoveredPersonalityNames.join(", ")}. Leave unset for the default generalist subagent.`,
		}))
		: Type.Optional(Type.String({
			description: `No agent personalities were found in ${AGENTS_DIR} at load time. Leave unset.`,
		}));

	pi.registerTool({
		name: "subagent_create",
		description: "Spawn a background subagent. Thinking level is required and is the primary way to match the subagent to task complexity: low for lightweight/simple tasks, medium for routine tasks needing moderate reasoning, high for complex multi-step work, and xhigh for the hardest tasks or when accuracy and performance are critical. Unless the user explicitly requests a specific model, omit model and use the default inherited parent model. Returns immediately and delivers results as a follow-up message.",
		parameters: Type.Object({
			task: Type.String({ description: "The complete task description for the subagent to perform" }),
			model: Type.Optional(Type.String({
				description: "Leave blank or omit unless the user explicitly requests a specific model. Do not choose a different model autonomously. When explicitly requested, provide the override in provider/model form. The default reuses the parent caller's current model and falls back to openrouter/google/gemini-3.5-flash only if the parent has no model.",
			})),
			thinking: StringEnum([...THINKING_OVERRIDES], {
				description: "Required thinking level. Use low for lightweight/simple tasks; medium for routine tasks needing moderate reasoning; high for complex, multi-step, or ambiguous work; and xhigh for the hardest tasks or when accuracy and performance are critical. Pi may clamp the value to the selected model's supported maximum.",
			}),
			agent: agentParamSchema,
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;

			if (args.agent && !loadPersonalities().has(args.agent)) {
				return { content: [{ type: "text", text: `Error: Unknown agent personality "${args.agent}". Available: ${Array.from(loadPersonalities().keys()).join(", ") || "(none found)"}` }] };
			}

			const id = nextId++;
			const state: SubState = {
				id,
				status: "running",
				task: args.task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
				model: "",
				thinking: pi.getThinkingLevel(),
				personality: args.agent,
			};
			agents.set(id, state);
			updateWidgets();
			persistState();

			// Fire-and-forget
			spawnAgent(state, args.task, ctx, { model: args.model, thinking: args.thinking, personality: args.agent });

			return {
				content: [{ type: "text", text: `Subagent #${id}${args.agent ? ` [${args.agent}]` : ""} spawned with ${state.model} (${state.thinking} thinking) and is running in background.` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_continue",
		description: "Continue an existing subagent conversation. Thinking level is required and is the primary way to match this turn to task complexity: low for lightweight/simple tasks, medium for routine tasks needing moderate reasoning, high for complex multi-step work, and xhigh for the hardest tasks or when accuracy and performance are critical. Unless the user explicitly requests a specific model, omit model and use the default inherited parent model. Returns immediately while it runs in the background.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the subagent to continue" }),
			prompt: Type.String({ description: "The follow-up prompt or new instructions" }),
			model: Type.Optional(Type.String({
				description: "Leave blank or omit unless the user explicitly requests a specific model. Do not choose a different model autonomously. When explicitly requested, provide the override in provider/model form for this turn. The default reuses the parent caller's current model.",
			})),
			thinking: StringEnum([...THINKING_OVERRIDES], {
				description: "Required thinking level for this turn. Use low for lightweight/simple tasks; medium for routine tasks needing moderate reasoning; high for complex, multi-step, or ambiguous work; and xhigh for the hardest tasks or when accuracy and performance are critical. Pi may clamp the value to the selected model's supported maximum.",
			}),
			agent: agentParamSchema,
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No subagent #${args.id} found.` }] };
			}
			if (state.status === "running") {
				return { content: [{ type: "text", text: `Error: Subagent #${args.id} is still running.` }] };
			}
			if (args.agent && !loadPersonalities().has(args.agent)) {
				return { content: [{ type: "text", text: `Error: Unknown agent personality "${args.agent}". Available: ${Array.from(loadPersonalities().keys()).join(", ") || "(none found)"}` }] };
			}

			state.status = "running";
			state.task = args.prompt;
			state.textChunks = [];
			state.elapsed = 0;
			state.turnCount++;
			updateWidgets();
			persistState();

			ctx.ui.notify(`Continuing Subagent #${args.id} (Turn ${state.turnCount})…`, "info");
			// args.agent overrides only if explicitly given; otherwise spawnAgent keeps state.personality.
			spawnAgent(state, args.prompt, ctx, { model: args.model, thinking: args.thinking, personality: args.agent });

			return {
				content: [{ type: "text", text: `Subagent #${args.id} continuing with ${state.model} (${state.thinking} thinking) in background.` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_remove",
		description: "Remove a specific subagent. Kills it if it's currently running.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the subagent to remove" }),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No subagent #${args.id} found.` }] };
			}

			if (state.proc && state.status === "running") {
				state.proc.kill("SIGTERM");
			}
			ctx.ui.setWidget(`sub-${args.id}`, undefined);
			agents.delete(args.id);
			persistState();

			return {
				content: [{ type: "text", text: `Subagent #${args.id} removed successfully.` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_list",
		description: "List all active and finished subagents, showing their IDs, tasks, and status.",
		parameters: Type.Object({}),
		execute: async () => {
			if (agents.size === 0) {
				return { content: [{ type: "text", text: "No active subagents." }] };
			}

			const list = Array.from(agents.values()).map(s =>
				`#${s.id} [${s.status.toUpperCase()}]${s.personality ? ` [${s.personality}]` : ""} (Turn ${s.turnCount}, ${s.model}, ${s.thinking}) - ${s.task}`
			).join("\n");

			return {
				content: [{ type: "text", text: `Subagents:\n${list}` }],
			};
		},
	});
	// ── /sub [--model <model>] [--thinking <level>] <task> ────────────────────

	pi.registerCommand("sub", {
		description: "Spawn a subagent: /sub [--model provider/model] [--thinking low|medium|high|xhigh] [--agent <personality>] <task>",
		handler: async (args, ctx) => {
			widgetCtx = ctx;

			const parsed = parseCommandOptions(args || "");
			if (parsed.error) {
				ctx.ui.notify(parsed.error, "error");
				return;
			}
			const task = parsed.rest;
			if (!task) {
				ctx.ui.notify("Usage: /sub [--model provider/model] [--thinking low|medium|high|xhigh] [--agent <personality>] <task>", "error");
				return;
			}
			if (parsed.options.personality && !loadPersonalities().has(parsed.options.personality)) {
				const names = Array.from(loadPersonalities().keys());
				ctx.ui.notify(`Unknown agent "${parsed.options.personality}". Available: ${names.join(", ") || "(none found in " + AGENTS_DIR + ")"}`, "error");
				return;
			}

			const id = nextId++;
			const state: SubState = {
				id,
				status: "running",
				task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
				model: "",
				thinking: pi.getThinkingLevel(),
				personality: parsed.options.personality,
			};
			agents.set(id, state);
			updateWidgets();
			persistState();

			// Fire-and-forget
			spawnAgent(state, task, ctx, parsed.options);
			ctx.ui.notify(`Subagent #${id}${state.personality ? ` [${state.personality}]` : ""}: ${state.model} (${state.thinking} thinking)`, "info");
		},
	});

	// ── /subcont <id> [--model <model>] [--thinking <level>] <prompt> ─────────

	pi.registerCommand("subcont", {
		description: "Continue a subagent: /subcont <id> [--model provider/model] [--thinking low|medium|high|xhigh] [--agent <personality>] <prompt>",
		handler: async (args, ctx) => {
			widgetCtx = ctx;

			const trimmed = args?.trim() ?? "";
			const idMatch = trimmed.match(/^(\d+)(?:\s+|$)/);
			if (!idMatch) {
				ctx.ui.notify("Usage: /subcont <id> [--model provider/model] [--thinking low|medium|high|xhigh] [--agent <personality>] <prompt>", "error");
				return;
			}

			const num = parseInt(idMatch[1], 10);
			const parsed = parseCommandOptions(trimmed.slice(idMatch[0].length));
			if (parsed.error) {
				ctx.ui.notify(parsed.error, "error");
				return;
			}
			const prompt = parsed.rest;

			if (!prompt) {
				ctx.ui.notify("Usage: /subcont <id> [--model provider/model] [--thinking low|medium|high|xhigh] [--agent <personality>] <prompt>", "error");
				return;
			}
			if (parsed.options.personality && !loadPersonalities().has(parsed.options.personality)) {
				const names = Array.from(loadPersonalities().keys());
				ctx.ui.notify(`Unknown agent "${parsed.options.personality}". Available: ${names.join(", ") || "(none found in " + AGENTS_DIR + ")"}`, "error");
				return;
			}

			const state = agents.get(num);
			if (!state) {
				ctx.ui.notify(`No subagent #${num} found. Use /sub to create one.`, "error");
				return;
			}

			if (state.status === "running") {
				ctx.ui.notify(`Subagent #${num} is still running — wait for it to finish first.`, "warning");
				return;
			}

			// Resume: update state for a new turn
			state.status = "running";
			state.task = prompt;
			state.textChunks = [];
			state.elapsed = 0;
			state.turnCount++;
			updateWidgets();
			persistState();

			ctx.ui.notify(`Continuing Subagent #${num} (Turn ${state.turnCount})…`, "info");

			// Fire-and-forget — reuses the same sessionFile for conversation history.
			// parsed.options.personality only overrides if --agent was explicitly passed;
			// spawnAgent falls back to state.personality otherwise.
			spawnAgent(state, prompt, ctx, parsed.options);
			ctx.ui.notify(`Subagent #${num}${state.personality ? ` [${state.personality}]` : ""}: ${state.model} (${state.thinking} thinking)`, "info");
		},
	});

	// ── /subpers [<agent-name>] [--model <model>] [--thinking <level>] [<task>] ─

	pi.registerCommand("subpers", {
		description: "Spawn a subagent with a chosen personality: /subpers [<agent-name>] [--model provider/model] [--thinking low|medium|high|xhigh] [<task>]",
		handler: async (args, ctx) => {
			widgetCtx = ctx;

			const personalities = loadPersonalities();
			if (personalities.size === 0) {
				ctx.ui.notify(`No agent personalities found in ${AGENTS_DIR}. Add a *.md file with a name/description frontmatter block and a prompt body.`, "error");
				return;
			}

			const parsed = parseCommandOptions(args || "");
			if (parsed.error) {
				ctx.ui.notify(parsed.error, "error");
				return;
			}
			let rest = parsed.rest;

			// --agent explicitly given takes priority.
			let personalityName = parsed.options.personality;
			if (personalityName && !personalities.has(personalityName)) {
				ctx.ui.notify(`Unknown agent "${personalityName}". Available: ${Array.from(personalities.keys()).join(", ")}`, "error");
				return;
			}

			// Otherwise, treat a leading token that matches a known personality name as the pick.
			if (!personalityName) {
				const leading = rest.match(/^(\S+)(?:\s+|$)/);
				if (leading && personalities.has(leading[1])) {
					personalityName = leading[1];
					rest = rest.slice(leading[0].length).trim();
				}
			}

			// Otherwise, prompt the user to pick one interactively.
			if (!personalityName) {
				const choices = Array.from(personalities.values()).map(p =>
					`${p.name} — ${p.description || "(no description)"}`
				);
				const choice = await ctx.ui.select("Pick an agent personality:", choices);
				if (!choice) return;
				personalityName = choice.split(" — ")[0];
			}

			let task = rest.trim();
			if (!task) {
				const input = await ctx.ui.input(`Task for ${personalityName}:`, "");
				if (!input || !input.trim()) {
					ctx.ui.notify("No task provided — cancelled.", "warning");
					return;
				}
				task = input.trim();
			}

			const id = nextId++;
			const state: SubState = {
				id,
				status: "running",
				task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
				model: "",
				thinking: pi.getThinkingLevel(),
				personality: personalityName,
			};
			agents.set(id, state);
			updateWidgets();
			persistState();

			// Fire-and-forget
			spawnAgent(state, task, ctx, { ...parsed.options, personality: personalityName });
			ctx.ui.notify(`Subagent #${id} [${personalityName}]: ${state.model} (${state.thinking} thinking)`, "info");
		},
	});

	// ── /subrm <number> ───────────────────────────────────────────────────────

	pi.registerCommand("subrm", {
		description: "Remove a specific subagent widget: /subrm <number>",
		handler: async (args, ctx) => {
			widgetCtx = ctx;

			const num = parseInt(args?.trim() ?? "", 10);
			if (isNaN(num)) {
				ctx.ui.notify("Usage: /subrm <number>", "error");
				return;
			}

			const state = agents.get(num);
			if (!state) {
				ctx.ui.notify(`No subagent #${num} found.`, "error");
				return;
			}

			// Kill the process if still running
			if (state.proc && state.status === "running") {
				state.proc.kill("SIGTERM");
				ctx.ui.notify(`Subagent #${num} killed and removed.`, "warning");
			} else {
				ctx.ui.notify(`Subagent #${num} removed.`, "info");
			}

			ctx.ui.setWidget(`sub-${num}`, undefined);
			agents.delete(num);
			persistState();
		},
	});

	// ── /subclear ─────────────────────────────────────────────────────────────

	pi.registerCommand("subclear", {
		description: "Clear all subagent widgets",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;

			let killed = 0;
			for (const [id, state] of Array.from(agents.entries())) {
				if (state.proc && state.status === "running") {
					state.proc.kill("SIGTERM");
					killed++;
				}
				ctx.ui.setWidget(`sub-${id}`, undefined);
			}

			const total = agents.size;
			agents.clear();
			nextId = 1;
			persistState();

			const msg = total === 0
				? "No subagents to clear."
				: `Cleared ${total} subagent${total !== 1 ? "s" : ""}${killed > 0 ? ` (${killed} killed)` : ""}.`;
			ctx.ui.notify(msg, total === 0 ? "info" : "success");
		},
	});

	// ── Session lifecycle ─────────────────────────────────────────────────────

	// Runs on the *old*, still-populated extension instance right before /reload
	// (or any other session teardown) discards it. This is the only point where
	// we still have live `proc` handles and accurate in-memory state, so it's the
	// right place to kill running children and clear their widgets — clearing
	// widgets from session_start would run on the *new* instance's empty map and
	// silently do nothing, leaving ghost widgets with no backing state behind.
	pi.on("session_shutdown", async (_event, ctx) => {
		for (const [id, state] of Array.from(agents.entries())) {
			if (state.proc && state.status === "running") {
				state.proc.kill("SIGTERM");
				state.status = "error";
				state.proc = undefined;
				state.textChunks.push("\n[Interrupted: session ended before this subagent finished. Use /subcont to resume its task.]");
			}
			ctx.ui.setWidget(`sub-${id}`, undefined);
		}
		// Final snapshot so the interrupted status above is what gets restored.
		persistState();
	});

	// Runs on the *new* extension instance after reload/resume/tree-navigation —
	// `agents` here always starts empty, so state is rebuilt from the session's
	// persisted snapshot rather than assumed to already be populated.
	const restoreAndRender = (ctx: any) => {
		widgetCtx = ctx;
		reconstructState(ctx);
		updateWidgets();
	};

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		restoreAndRender(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreAndRender(ctx);
	});
}
