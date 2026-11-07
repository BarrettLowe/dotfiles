/**
 * Subagent Widget — /sub, /subpers, /subclear, /subrm, /subcont commands with stacking live widgets
 *
 * Each /sub spawns a background Pi subagent with its own persistent session,
 * enabling conversation continuations via /subcont.
 *
 * Agent personalities are markdown files in <agent-dir>/agents/*.md (PI_CODING_AGENT_DIR) with a
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
 *   /subview 2                                       — inspect a read-only child session (Alt+↓ opens picker)
 *   /subapprove                                      — review the oldest pending permission (Alt+A)
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

import { StringEnum, type AssistantMessage, type ThinkingLevel } from "@mariozechner/pi-ai";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, RpcExtensionUIRequest } from "@mariozechner/pi-coding-agent";
import { calculateContextTokens, DynamicBorder, getAgentDir, getLastAssistantUsage, parseFrontmatter, SessionManager } from "@mariozechner/pi-coding-agent";
import { Container, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
const { spawn } = require("child_process") as any;
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "node:url";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { SubagentTranscript, SubagentView } from "./lib/subagent-view.ts";
import { SubagentApprovalDialog } from "./lib/subagent-approval.ts";
import { SubagentOverlayGroup } from "./lib/subagent-overlay.ts";

const MODEL_ACCESS_GUARD_EXTENSION = fileURLToPath(
	new URL("./model-access-guard.ts", import.meta.url),
);
const BASH_WHITELIST_EXTENSION = fileURLToPath(
	new URL("./bash-whitelist.ts", import.meta.url),
);
const FALLBACK_MODEL = "openrouter/google/gemini-3.5-flash";
const DEFAULT_SUBAGENT_TOOLS = ["read", "bash", "grep", "find", "ls", "edit", "write"];
const SUPPORTED_SUBAGENT_TOOLS = new Set([...DEFAULT_SUBAGENT_TOOLS, "powershell"]);
const CANCEL_TIMEOUT_MS = 5000; // Grace period before forcibly stopping a child.
const WIDGET_INTERVAL_MS = 1000; // Refresh elapsed time once per second.
// Inline character cap for a subagent's result text delivered back to the
// main agent. Outputs at or under this are returned in full, no file written.
// Longer outputs are truncated to this many chars inline, with the full,
// untruncated text saved next to the subagent's session file so the main
// agent can read the rest on demand.
const INLINE_RESULT_LIMIT = 4000;
// Renders a token count as e.g. "30k" (or the raw number below 1000).
function formatTokenCount(n: number): string {
	return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}
const THINKING_OVERRIDES = ["low", "medium", "high", "xhigh"] as const;
type ThinkingOverride = (typeof THINKING_OVERRIDES)[number];

const AGENTS_DIR = path.join(getAgentDir(), "agents");

interface Personality {
	name: string;
	description: string;
	body: string;
	tools?: unknown;
}

/**
 * Discover agent personality markdown files from <agent-dir>/agents/*.md (PI_CODING_AGENT_DIR).
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
			map.set(name, { name, description, body: body.trim(), tools: fm.tools });
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
	elapsed: number;
	contextTokens: number | null;   // latest response's context size, including cached input and output
	contextWindow: number;
	sessionFile: string;   // persistent JSONL session path — used by /subcont to resume
	turnCount: number;     // increments each time /subcont continues this agent
	model: string;
	thinking: ThinkingLevel;
	personality?: string;  // name of the agent personality applied to this subagent, if any
}

type SubStateRecord = SubState;

interface ActiveRun {
	id: string;
	state: SubState;
	proc?: ChildProcess;
	timer?: ReturnType<typeof setInterval>;
	exitTimer?: ReturnType<typeof setTimeout>;
	ctx: any;
	prompt: string;
	promptSent: boolean;
	settled: boolean;
	failure?: Error;
	activity?: string;
	cancelled: boolean;
	finished: boolean;
	stderr: string;
	lastMessage?: AssistantMessage;
	done: Promise<void>;
	resolve: () => void;
}

interface PendingApproval {
	run: ActiveRun;
	request: Extract<RpcExtensionUIRequest, { method: "select" }>;
	timer?: ReturnType<typeof setTimeout>;
}

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
	const activeRuns = new Map<number, ActiveRun>();
	const transcripts = new Map<number, SubagentTranscript>();
	const approvals: PendingApproval[] = [];
	const overlays = new SubagentOverlayGroup();
	let viewer: SubagentView | undefined;
	let lastViewedId: number | undefined;
	let reviewingApproval: PendingApproval | undefined;
	let dismissApproval: (() => void) | undefined;
	let shuttingDown = false;
	let shutdownCleanup: Promise<void> | undefined;
	let nextId = 1;
	let widgetCtx: any;
	// Ids whose widget is currently on screen. Used by updateWidgets() to tear
	// down widgets for agents that have disappeared from `agents` (e.g. after
	// /tree navigates to a branch where the subagent doesn't exist yet) — without
	// this, a stale widget keeps rendering even though its backing state is gone.
	let renderedWidgetIds: Set<number> = new Set();

	// ── State persistence (survives /reload, session resume, /tree) ──────────

	function toRecord(state: SubState): SubStateRecord {
		return { ...state, textChunks: [...state.textChunks] };
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
		transcripts.clear();
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
			const state = {
				...rec, textChunks: [...rec.textChunks],
				contextTokens: rec.contextWindow === undefined ? restoreContextTokens(rec.sessionFile) : rec.contextTokens,
				contextWindow: contextWindowForModel(rec.model, ctx),
			};
			if (state.status === "running") {
				state.status = "error";
				state.textChunks.push("\n[Interrupted: no live subagent process. Use /subcont to resume.]");
			}
			agents.set(rec.id, state);
		}
	}

	// ── Session file helpers ──────────────────────────────────────────────────

	function makeSessionFile(id: number): string {
		const dir = path.join(getAgentDir(), "sessions", "subagents");
		fs.mkdirSync(dir, { recursive: true });
		return path.join(dir, `subagent-${id}-${randomUUID()}.jsonl`);
	}

	function contextWindowForModel(model: string, ctx: any): number {
		const slash = model.indexOf("/");
		return ctx.modelRegistry?.find?.(model.slice(0, slash), model.slice(slash + 1))?.contextWindow ?? 0;
	}

	// Older snapshots stored cumulative usage without a context window.
	function restoreContextTokens(sessionFile: string): number | null {
		if (!fs.existsSync(sessionFile)) return null;
		try {
			const branch = SessionManager.open(sessionFile).getBranch();
			const compactionIndex = branch.findLastIndex(entry => entry.type === "compaction");
			const usage = getLastAssistantUsage(branch.slice(compactionIndex + 1));
			return usage ? calculateContextTokens(usage) : null;
		} catch {
			return null;
		}
	}

	// ── Read-only inspection and queued permissions ───────────────────────────

	function transcript(state: SubState): SubagentTranscript {
		let history = transcripts.get(state.id);
		if (!history) {
			history = new SubagentTranscript(state.sessionFile);
			transcripts.set(state.id, history);
		}
		return history;
	}

	function removeApproval(pending: PendingApproval) {
		const index = approvals.indexOf(pending);
		if (index !== -1) approvals.splice(index, 1);
		clearTimeout(pending.timer);
		if (reviewingApproval === pending) dismissApproval?.();
	}

	function clearApprovals(run: ActiveRun) {
		for (const pending of [...approvals]) {
			if (pending.run === run) removeApproval(pending);
		}
	}

	function endRunProcess(run: ActiveRun) {
		if (run.exitTimer) return;
		// RPC stays alive after settlement; EOF requests an orderly shutdown.
		run.exitTimer = setTimeout(() => {
			if (!run.finished) run.proc?.kill("SIGKILL");
		}, CANCEL_TIMEOUT_MS);
		run.proc?.stdin?.end();
	}

	function sendRpc(run: ActiveRun, record: object) {
		if (!isCurrentRun(run) || run.proc?.stdin?.writableEnded) return;
		run.proc?.stdin?.write(`${JSON.stringify(record)}\n`);
	}

	function handleUiRequest(run: ActiveRun, request: RpcExtensionUIRequest) {
		if (request.method === "notify") {
			run.ctx.ui.notify(`Subagent #${run.state.id}: ${request.message}`, request.notifyType || "info");
			return;
		}
		if (request.method !== "select") {
			if (["confirm", "input", "editor"].includes(request.method)) {
				sendRpc(run, { type: "extension_ui_response", id: request.id, cancelled: true });
			}
			return;
		}
		if (!run.ctx.hasUI || run.settled || !Array.isArray(request.options) || !request.options.length) {
			sendRpc(run, { type: "extension_ui_response", id: request.id, cancelled: true });
			return;
		}
		if (approvals.some(item => item.run === run && item.request.id === request.id)) return;
		const pending: PendingApproval = { run, request };
		approvals.push(pending);
		if (request.timeout !== undefined) {
			pending.timer = setTimeout(() => {
				removeApproval(pending);
				sendRpc(run, { type: "extension_ui_response", id: request.id, cancelled: true });
				updateWidgets();
			}, request.timeout);
		}
		transcript(run.state).addNotice("Bash permission requested; awaiting user review.");
	}

	async function reviewApproval(ctx: any, id?: number) {
		if (reviewingApproval || shuttingDown) return;
		const pending = approvals.find(item => (id === undefined || item.run.state.id === id) && isCurrentRun(item.run));
		if (!pending) {
			ctx.ui.notify("No pending subagent permissions.", "info");
			return;
		}
		const { run, request } = pending;
		reviewingApproval = pending;
		const state = run.state;
		const title = `Subagent #${state.id}${state.personality ? ` [${state.personality}]` : ""}\nTask: ${state.task}\nWorking directory: ${run.ctx.cwd}\nSession approvals apply only to this subagent run.\n\n${request.title}`;
		try {
			let choice: string | undefined;
			if (ctx.mode === "tui") {
				choice = await overlays.show<string>(ctx, (tui, theme, keys, done) => {
					const dialog = new SubagentApprovalDialog(tui, theme, keys, title, request.options, done);
					dismissApproval = () => dialog.close();
					return dialog;
				});
			} else if (ctx.hasUI) {
				const controller = new AbortController();
				dismissApproval = () => controller.abort();
				choice = await ctx.ui.select(title, request.options, { signal: controller.signal });
			}
			// Esc leaves the request queued; only an explicit choice reaches the child.
			if (choice !== undefined && request.options.includes(choice) && approvals.includes(pending) && isCurrentRun(run)) {
				removeApproval(pending);
				sendRpc(run, { type: "extension_ui_response", id: request.id, value: choice });
				transcript(state).addNotice(`Bash permission decision: ${choice}`);
			}
		} catch (error) {
			if (!shuttingDown) ctx.ui.notify(`Could not review subagent permission: ${String(error)}`, "error");
		} finally {
			if (reviewingApproval === pending) {
				reviewingApproval = undefined;
				dismissApproval = undefined;
			}
			if (!shuttingDown) updateWidgets();
		}
	}

	async function openView(ctx: any, id?: number) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Subagent inspection requires interactive Pi.", "error");
			return;
		}
		if (viewer || reviewingApproval || shuttingDown) return;
		if (id !== undefined && !agents.has(id)) {
			ctx.ui.notify(`No subagent #${id} found.`, "error");
			return;
		}
		if (!agents.size) {
			ctx.ui.notify("No subagents to inspect.", "info");
			return;
		}
		widgetCtx = ctx;
		try {
			await overlays.show<void>(ctx, (tui, theme, keys, done) => {
				viewer = new SubagentView(tui, theme, keys, done, {
					list: () => Array.from(agents.values(), state => ({
						...state, approvalCount: approvals.filter(item => item.run.state === state).length,
					})),
					transcript: agentId => transcript(agents.get(agentId)!),
					reviewApproval: agentId => reviewApproval(ctx, agentId),
					select: agentId => { lastViewedId = agentId; },
				}, id, lastViewedId ?? approvals[0]?.run.state.id);
				return viewer;
			});
		} finally {
			viewer = undefined;
		}
	}

	pi.registerShortcut("alt+down", {
		description: "Inspect subagents (read-only; Esc returns to primary session)",
		handler: ctx => openView(ctx),
	});
	pi.registerShortcut("alt+a", {
		description: "Review the oldest pending subagent bash permission",
		handler: ctx => reviewApproval(ctx),
	});
	pi.registerCommand("subview", {
		description: "Inspect subagent sessions: /subview [id] (Alt+↓)",
		handler: async (args, ctx) => {
			if (args.trim() && !/^\d+$/.test(args.trim())) {
				ctx.ui.notify("Usage: /subview [id]", "error");
				return;
			}
			await openView(ctx, args.trim() ? Number(args.trim()) : undefined);
		},
	});
	pi.registerCommand("subapprove", {
		description: "Review queued bash permissions: /subapprove [id] (Alt+A)",
		handler: async (args, ctx) => {
			if (args.trim() && !/^\d+$/.test(args.trim())) {
				ctx.ui.notify("Usage: /subapprove [id]", "error");
				return;
			}
			await reviewApproval(ctx, args.trim() ? Number(args.trim()) : undefined);
		},
	});

	// ── Widget rendering ──────────────────────────────────────────────────────

	function updateWidgets() {
		viewer?.refresh();
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
						const pending = approvals.filter(item => item.run.state === state);
						const statusColor = pending.length ? "warning" : state.status === "running" ? "accent"
							: state.status === "done" ? "success" : "error";
						const statusIcon = pending.length ? "⏸" : state.status === "running" ? "●"
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

						const used = state.contextTokens === null ? "?" : formatTokenCount(state.contextTokens);
						const limit = state.contextWindow > 0 ? formatTokenCount(state.contextWindow) : "?";
						const percent = state.contextTokens !== null && state.contextWindow > 0
							? ` · ${Math.round(state.contextTokens / state.contextWindow * 100)}%`
							: "";
						const usageLabel = `${used} / ${limit} context${percent}`;

						lines.push(
							theme.fg(statusColor, `${statusIcon} Subagent #${state.id}`) +
							turnLabel +
							personalityLabel +
							theme.fg("dim", `  ${taskPreview}`) +
							theme.fg("dim", `  (${Math.round(state.elapsed / 1000)}s)`) +
							theme.fg("dim", ` | ${state.model || "…"}`) +
							theme.fg("dim", ` | ${usageLabel}`)
						);

						const fullText = state.textChunks.join("");
						const lastLine = pending.length ? `Awaiting bash approval (${pending.length}) · Alt+A review`
							: activeRuns.get(id)?.activity || fullText.split("\n").filter((l: string) => l.trim()).pop() || "";
						if (lastLine) lines.push(theme.fg("muted", `  ${lastLine}`));
						if (id === agents.keys().next().value) lines.push(theme.fg("dim", "  Alt+↓ inspect subagents · Alt+A permissions"));

						content.setText(lines.map(line => truncateToWidth(line.replace(/[\r\n]/g, " "), Math.max(1, width - 2))).join("\n"));
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

	function isCurrentRun(run: ActiveRun): boolean {
		return !shuttingDown && !run.cancelled && !run.finished
			&& activeRuns.get(run.state.id) === run && agents.get(run.state.id) === run.state;
	}

	function assistantText(message?: AssistantMessage): string {
		return message?.content?.filter(part => part.type === "text").map(part => part.text).join("\n") ?? "";
	}

	function processLine(run: ActiveRun, line: string) {
		if (!isCurrentRun(run) || !line.trim()) return;
		let event: any;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (!event || typeof event !== "object") return;
		const state = run.state;
		transcript(state).processEvent(event);
		if (event.type === "extension_ui_request") handleUiRequest(run, event);
		if (event.type === "response") {
			if (!event.success) {
				run.failure = new Error(event.error || `RPC ${event.command} failed.`);
				endRunProcess(run);
			} else if (event.id === `init-${run.id}` && !run.promptSent) {
				run.promptSent = true;
				sendRpc(run, { id: run.id, type: "prompt", message: run.prompt });
			}
		}
		if (event.type === "agent_settled") {
			run.settled = true;
			if (event.aborted) run.failure = new Error("Subagent run was aborted.");
			clearApprovals(run);
			endRunProcess(run);
		}
		if (event.type === "message_update" && event.assistantMessageEvent?.type === "thinking_delta") run.activity = "Thinking…";
		if (event.type === "tool_execution_start") run.activity = `${event.toolName}: ${event.args?.command || event.args?.path || "running"}`;
		if (event.type === "tool_execution_end") run.activity = "Working…";
		if (event.type === "compaction_start") run.activity = "Compacting context…";
		if (event.type === "auto_retry_start") run.activity = `Retrying (${event.attempt})…`;
		if (event.type === "message_start" && event.message?.role === "assistant") {
			state.textChunks = [];
			run.lastMessage = undefined;
			run.activity = "Working…";
		}
		if (event.type === "message_update") {
			const delta = event.assistantMessageEvent;
			if (delta?.type === "text_delta") {
				state.textChunks.push(delta.delta || "");
				run.activity = undefined;
			}
		}
		if (event.type === "message_end" && event.message?.role === "assistant") {
			const message = event.message;
			if (message.usage && message.stopReason !== "error" && message.stopReason !== "aborted") {
				const tokens = calculateContextTokens(message.usage);
				if (tokens > 0) state.contextTokens = tokens;
			}
			run.lastMessage = message;
			state.textChunks = [assistantText(run.lastMessage)];
		}
		if (event.type === "compaction_end" && event.result && !event.aborted) {
			state.contextTokens = event.result.estimatedTokensAfter ?? null;
		}
		updateWidgets();
	}

	async function cancelRun(run: ActiveRun, reason: string) {
		if (run.finished) return;
		if (run.cancelled) return run.done;
		run.cancelled = true;
		clearApprovals(run);
		clearInterval(run.timer);
		clearTimeout(run.exitTimer);
		run.state.status = "error";
		run.state.textChunks = [`[Interrupted: ${reason}. Use /subcont to resume.]`];
		transcripts.get(run.state.id)?.addNotice(run.state.textChunks[0]);
		updateWidgets();
		const escalation = setTimeout(() => {
			if (!run.finished) run.proc?.kill("SIGKILL");
		}, CANCEL_TIMEOUT_MS);
		try {
			run.proc?.kill("SIGTERM");
			await run.done;
		} finally {
			clearTimeout(escalation);
		}
	}

	async function cancelAllRuns(reason: string) {
		await Promise.all(Array.from(activeRuns.values(), run => cancelRun(run, reason)));
	}

	function personalityTools(personality?: Personality): string[] {
		const raw = personality?.tools;
		if (raw === undefined) return DEFAULT_SUBAGENT_TOOLS;
		const tools = typeof raw === "string" ? raw.split(",") : raw;
		if (!Array.isArray(tools) || tools.some(tool => typeof tool !== "string")) {
			throw new Error(`Invalid tools declaration for personality "${personality?.name}".`);
		}
		const names = tools.map(tool => tool.trim()).filter(Boolean);
		const invalid = names.filter(name => !SUPPORTED_SUBAGENT_TOOLS.has(name));
		if (invalid.length) throw new Error(`Unknown tools for personality "${personality?.name}": ${invalid.join(", ")}`);
		return names;
	}

	function spawnAgent(
		state: SubState,
		prompt: string,
		ctx: any,
		options: SpawnOptions = {},
	): boolean {
		let resolve!: () => void;
		const done = new Promise<void>(complete => { resolve = complete; });
		const run: ActiveRun = {
			id: randomUUID(), state, ctx, prompt, promptSent: false, settled: false,
			cancelled: false, finished: false, stderr: "", done, resolve,
		};
		activeRuns.set(state.id, run);
		const startTime = Date.now();

		const finish = (code: number | null, signal?: string | null, error?: Error) => {
			if (run.finished) return;
			const current = isCurrentRun(run);
			run.finished = true;
			clearApprovals(run);
			clearInterval(run.timer);
			clearTimeout(run.exitTimer);
			if (activeRuns.get(state.id) === run) activeRuns.delete(state.id);
			try {
				if (!current) return;
				state.elapsed = Date.now() - startTime;
				const message = run.lastMessage;
				const assistantFailed = message?.stopReason === "error" || message?.stopReason === "aborted";
				state.status = !error && !run.failure && run.settled && code === 0 && message && !assistantFailed ? "done" : "error";
				let result = assistantText(message);
				if (state.status === "error") {
					let failure = error?.message || run.failure?.message || message?.errorMessage || run.stderr.trim();
					if (!failure) {
						if (assistantFailed) failure = `Assistant ${message?.stopReason}.`;
						else if (code !== 0) failure = `Subagent exited with ${signal ? `signal ${signal}` : `code ${code}`}.`;
						else if (!message) failure = "Subagent exited without a final assistant message.";
						else failure = "Subagent exited before its run settled.";
					}
					result = `Error: ${failure}${result ? `\n\n${result}` : ""}`;
				}
				state.textChunks = [result];
				if (state.status === "error") transcript(state).addNotice(result);
				let resultText = `Result:\n${result}`;
				if (result.length > INLINE_RESULT_LIMIT) {
					const resultFile = state.sessionFile.replace(/\.jsonl$/, `.turn-${state.turnCount}-${run.id}.result.txt`);
					try {
						fs.writeFileSync(resultFile, result, "utf-8");
						resultText = `Result (showing first ${INLINE_RESULT_LIMIT} of ${result.length} chars — full output saved to ${resultFile}):\n${result.slice(0, INLINE_RESULT_LIMIT)}`;
					} catch (err) {
						state.status = "error";
						resultText = `Could not save full result: ${(err as Error).message}\n\nResult (truncated):\n${result.slice(0, INLINE_RESULT_LIMIT)}`;
						state.textChunks = [resultText];
					}
				}
				updateWidgets();
				persistState();
				ctx.ui.notify(
					`Subagent #${state.id} ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
					state.status === "done" ? "success" : "error",
				);
				pi.sendMessage({
					customType: "subagent-result",
					content: `Subagent #${state.id}${state.turnCount > 1 ? ` (Turn ${state.turnCount})` : ""} ${state.status} for "${prompt}" in ${Math.round(state.elapsed / 1000)}s.\n\n${resultText}`,
					display: true,
				}, { deliverAs: "followUp", triggerTurn: true });
			} finally {
				run.resolve();
			}
		};

		try {
			const parentProvider = ctx.model?.provider?.trim();
			const parentModelId = ctx.model?.id?.trim();
			const hasParentModel = parentProvider && parentModelId
				&& parentProvider !== "unknown" && parentModelId !== "unknown";
			state.model = options.model?.trim() || (hasParentModel ? `${parentProvider}/${parentModelId}` : FALLBACK_MODEL);
			state.contextWindow = contextWindowForModel(state.model, ctx);
			state.thinking = options.thinking || pi.getThinkingLevel();
			state.personality = options.personality ?? state.personality;
			const personality = state.personality ? loadPersonalities().get(state.personality) : undefined;
			if (state.personality && !personality) throw new Error(`Unknown agent personality "${state.personality}".`);
			const tools = personalityTools(personality);
			const spawnArgs = [
				"--mode", "rpc",
				"--session", state.sessionFile,
				"--no-extensions",
				"--extension", MODEL_ACCESS_GUARD_EXTENSION,
				"--extension", BASH_WHITELIST_EXTENSION,
				"--model", state.model,
				"--thinking", state.thinking,
			];
			if (tools.length) spawnArgs.push("--tools", tools.join(","));
			else spawnArgs.push("--no-tools");
			if (personality?.body) spawnArgs.push("--append-system-prompt", personality.body);
			transcript(state);
			updateWidgets();
			persistState();

			const proc: ChildProcess = spawn("pi", spawnArgs, {
				cwd: ctx.cwd,
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env },
			});
			run.proc = proc;
			run.timer = setInterval(() => {
				if (!isCurrentRun(run)) return;
				state.elapsed = Date.now() - startTime;
				updateWidgets();
			}, WIDGET_INTERVAL_MS);

			let buffer = "";
			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				if (!isCurrentRun(run)) return;
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(run, line);
			});
			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => {
				if (isCurrentRun(run)) run.stderr += chunk;
			});
			proc.on("close", (code, signal) => {
				if (buffer.trim()) processLine(run, buffer);
				finish(code, signal);
			});
			proc.on("error", err => finish(null, null, err));
			proc.stdin!.on("error", (error: Error) => {
				if (!isCurrentRun(run)) return;
				run.failure = error;
				endRunProcess(run);
				proc.kill("SIGTERM");
			});
			sendRpc(run, { id: `init-${run.id}`, type: "get_state" });
		} catch (err) {
			finish(null, null, err as Error);
		}
		return state.status === "running";
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
		executionMode: "sequential",
		description: "Spawn a background subagent. Thinking level is required and is the primary way to match the subagent to task complexity: low for lightweight/simple tasks, medium for routine tasks needing moderate reasoning, high for complex multi-step work, and xhigh for the hardest tasks or when accuracy and performance are critical. Unless the user explicitly requests a specific model, omit model and use the default inherited parent model. Returns immediately and delivers results as a follow-up message. Continue only independent work while it runs; do not poll its status, sleep while waiting, or read its session/result files. Settle normally when independent work is done so the follow-up can be delivered.",
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
				elapsed: 0,
				contextTokens: null,
				contextWindow: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
				model: "",
				thinking: pi.getThinkingLevel(),
				personality: args.agent,
			};
			agents.set(id, state);
			if (!spawnAgent(state, args.task, ctx, { model: args.model, thinking: args.thinking, personality: args.agent })) {
				return { content: [{ type: "text", text: state.textChunks.join("") }], isError: true };
			}

			return {
				content: [{ type: "text", text: `Subagent #${id}${args.agent ? ` [${args.agent}]` : ""} spawned with ${state.model} (${state.thinking} thinking) and is running in background.` }],
				terminate: true,
			};
		},
	});

	pi.registerTool({
		name: "subagent_continue",
		executionMode: "sequential",
		description: "Continue an existing subagent conversation. Thinking level is required and is the primary way to match this turn to task complexity: low for lightweight/simple tasks, medium for routine tasks needing moderate reasoning, high for complex multi-step work, and xhigh for the hardest tasks or when accuracy and performance are critical. Unless the user explicitly requests a specific model, omit model and use the default inherited parent model. Returns immediately and delivers results as a follow-up message. Continue only independent work while it runs; do not poll its status, sleep while waiting, or read its session/result files. Settle normally when independent work is done so the follow-up can be delivered.",
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
			if (state.status === "running" || activeRuns.has(args.id)) {
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

			ctx.ui.notify(`Continuing Subagent #${args.id} (Turn ${state.turnCount})…`, "info");
			// args.agent overrides only if explicitly given; otherwise spawnAgent keeps state.personality.
			if (!spawnAgent(state, args.prompt, ctx, { model: args.model, thinking: args.thinking, personality: args.agent })) {
				return { content: [{ type: "text", text: state.textChunks.join("") }], isError: true };
			}

			return {
				content: [{ type: "text", text: `Subagent #${args.id} continuing with ${state.model} (${state.thinking} thinking) in background.` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_remove",
		executionMode: "sequential",
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

			const run = activeRuns.get(args.id);
			agents.delete(args.id);
			if (run) await cancelRun(run, "removed");
			transcripts.delete(args.id);
			updateWidgets();
			ctx.ui.setWidget(`sub-${args.id}`, undefined);
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
				elapsed: 0,
				contextTokens: null,
				contextWindow: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
				model: "",
				thinking: pi.getThinkingLevel(),
				personality: parsed.options.personality,
			};
			agents.set(id, state);
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

			if (state.status === "running" || activeRuns.has(num)) {
				ctx.ui.notify(`Subagent #${num} is still running — wait for it to finish first.`, "warning");
				return;
			}

			// Resume: update state for a new turn
			state.status = "running";
			state.task = prompt;
			state.textChunks = [];
			state.elapsed = 0;
			state.turnCount++;

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
		getArgumentCompletions: (prefix) => {
			if (/\s/.test(prefix) || prefix.startsWith("-")) return null;
			const matches = Array.from(loadPersonalities().values())
				.filter(personality => personality.name.startsWith(prefix))
				.sort((a, b) => a.name.localeCompare(b.name))
				.map(personality => ({
					value: `${personality.name} `,
					label: personality.name,
					description: personality.description || undefined,
				}));
			return matches.length ? matches : null;
		},
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
				elapsed: 0,
				contextTokens: null,
				contextWindow: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
				model: "",
				thinking: pi.getThinkingLevel(),
				personality: personalityName,
			};
			agents.set(id, state);
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

			const run = activeRuns.get(num);
			agents.delete(num);
			if (run) {
				await cancelRun(run, "removed");
				ctx.ui.notify(`Subagent #${num} killed and removed.`, "warning");
			} else {
				ctx.ui.notify(`Subagent #${num} removed.`, "info");
			}

			transcripts.delete(num);
			updateWidgets();
			ctx.ui.setWidget(`sub-${num}`, undefined);
			persistState();
		},
	});

	// ── /subclear ─────────────────────────────────────────────────────────────

	pi.registerCommand("subclear", {
		description: "Clear all subagent widgets",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;

			const killed = activeRuns.size;
			const total = agents.size;
			for (const id of agents.keys()) ctx.ui.setWidget(`sub-${id}`, undefined);
			agents.clear();
			transcripts.clear();
			updateWidgets();
			await cancelAllRuns("cleared");
			if (agents.size === 0) nextId = 1;
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
	pi.on("session_shutdown", (_event, ctx) => {
		if (shutdownCleanup) return shutdownCleanup;
		shuttingDown = true;
		dismissApproval?.();
		viewer?.close();
		shutdownCleanup = (async () => {
			await cancelAllRuns("session ended before this subagent finished");
			for (const id of agents.keys()) ctx.ui.setWidget(`sub-${id}`, undefined);
			persistState();
		})();
		return shutdownCleanup;
	});

	pi.on("session_before_tree", async () => {
		dismissApproval?.();
		viewer?.close();
		const hadRuns = activeRuns.size > 0;
		await cancelAllRuns("tree navigation interrupted this subagent");
		if (hadRuns) persistState();
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
		await cancelAllRuns("tree navigation interrupted this subagent");
		restoreAndRender(ctx);
	});
}
