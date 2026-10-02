/**
 * Agent Team — Dispatcher-only orchestrator with grid dashboard
 *
 * The primary Pi agent has NO codebase tools. It can ONLY delegate work
 * to specialist agents via the `dispatch_agent` tool. Each specialist
 * maintains its own Pi session for cross-invocation memory.
 *
 * Loads local agent definitions first, then globals from ~/.claude/agents/*.md
 * and ~/.pi/agent/agents/*.md. Local definitions override globals by name.
 * Teams are loaded from ~/.pi/agent/agents/teams.yaml and .pi/agents/teams.yaml;
 * project teams override globals by name. Only active team members can be dispatched.
 * Optional team guidance follows the same global/project precedence.
 *
 * Commands:
 *   /agents-team          — switch active team
 *   /agents-list          — list loaded agents
 *   /agents-grid N        — set column count (default 2)
 *
 * Usage: pi -e ~/dotfiles/pi/manual-extensions/agent-team.ts [--agent-team <name>]
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, type AutocompleteItem, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
	loadTeamDispatcherPrompt,
	loadTeams,
	resolveExtensionSource,
	resolveInitialTeam,
	scanAgentDirs,
	type AgentDef,
	type TeamMember,
} from "./agent-team-config.ts";
import { AgentTraceWriter } from "./agent-team-trace.ts";
import {
	AssistantOutputCollector,
	createAgentSessionFile,
	terminateChildProcess,
	watchChildAbort,
} from "./agent-team-runtime.ts";

// ── Types ────────────────────────────────────────

const OPEN_ITEMS_FILE = "/home/barrett-lowe/work-notes/notes/open-items.md";

interface AgentDispatchResult {
	output: string;
	streamedOutput: string;
	exitCode: number;
	elapsed: number;
	aborted: boolean;
}

interface AgentState {
	def: AgentDef;
	extensions: string[];
	status: "idle" | "running" | "done" | "error";
	task: string;
	toolCount: number;
	elapsed: number;
	lastWork: string;
	contextPct: number;
	sessionFile: string | null;
	runCount: number;
	timer?: ReturnType<typeof setInterval>;
}

// ── Display Name Helper ──────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerFlag("agent-team", {
		description: "Select the agent team to activate at startup",
		type: "string",
	});

	const agentStates: Map<string, AgentState> = new Map();
	let allAgentDefs: AgentDef[] = [];
	let teams: Record<string, TeamMember[]> = {};
	let activeTeamName = "";
	let activeTeamPrompt = "";
	let projectCwd = "";
	let gridCols = 2;
	let widgetCtx: any;
	let sessionDir = "";
	let contextWindow = 0;
	let traceWriter: AgentTraceWriter | undefined;
	let dispatcherRunCount = 0;
	let dispatcherRunId = "";
	let dispatcherStartedAt = 0;
	let dispatcherToolCount = 0;
	let dispatcherTextChunks: string[] = [];
	let dispatcherPendingText = "";
	let dispatcherLastTextTraceAt = 0;
	let dispatcherTimer: ReturnType<typeof setInterval> | undefined;

	function flushDispatcherText(force = false) {
		if (!dispatcherRunId || !dispatcherPendingText) return;
		const now = Date.now();
		if (!force && now - dispatcherLastTextTraceAt < 250 && dispatcherPendingText.length < 500 && !dispatcherPendingText.includes("\n")) return;
		traceWriter?.emit({
			runId: dispatcherRunId,
			type: "assistant_stream",
			team: activeTeamName,
			agent: "dispatcher",
			payload: { outputKind: "streamed", text: dispatcherPendingText },
		});
		dispatcherPendingText = "";
		dispatcherLastTextTraceAt = now;
	}

	function loadAgents(cwd: string) {
		projectCwd = cwd;

		if (!sessionDir) throw new Error("Agent session directory was not initialized");
		if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

		// Load all agent definitions
		allAgentDefs = scanAgentDirs(cwd);

		// Merge global and project teams; project definitions win by name.
		teams = loadTeams(cwd);

		// If no teams defined, create a default "all" team
		if (Object.keys(teams).length === 0) {
			teams = { all: allAgentDefs.map(d => ({ name: d.name, extensions: [] })) };
		}
	}

	function activateTeam(teamName: string) {
		activeTeamName = teamName;
		activeTeamPrompt = loadTeamDispatcherPrompt(projectCwd, teamName);
		const members = teams[teamName] || [];
		const defsByName = new Map(allAgentDefs.map(d => [d.name.toLowerCase(), d]));

		agentStates.clear();
		for (const member of members) {
			const def = defsByName.get(member.name.toLowerCase());
			if (!def) continue;
			const key = def.name.toLowerCase().replace(/\s+/g, "-");
			const sessionFile = join(sessionDir, `${key}.jsonl`);
			agentStates.set(def.name.toLowerCase(), {
				def,
				extensions: member.extensions.map(extension => resolveExtensionSource(extension)),
				status: "idle",
				task: "",
				toolCount: 0,
				elapsed: 0,
				lastWork: "",
				contextPct: 0,
				sessionFile: existsSync(sessionFile) ? sessionFile : null,
				runCount: 0,
			});
		}

		// Auto-size grid columns based on team size
		const size = agentStates.size;
		gridCols = size <= 3 ? size : size === 4 ? 2 : 3;
	}

	// ── Grid Rendering ───────────────────────────

	function renderCard(state: AgentState, colWidth: number, theme: any): string[] {
		const w = colWidth - 2;
		const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 3) + "..." : s;

		const statusColor = state.status === "idle" ? "dim"
			: state.status === "running" ? "accent"
			: state.status === "done" ? "success" : "error";
		const statusIcon = state.status === "idle" ? "○"
			: state.status === "running" ? "●"
			: state.status === "done" ? "✓" : "✗";

		const name = displayName(state.def.name);
		const nameStr = theme.fg("accent", theme.bold(truncate(name, w)));
		const nameVisible = Math.min(name.length, w);

		const statusStr = `${statusIcon} ${state.status}`;
		const timeStr = state.status !== "idle" ? ` ${Math.round(state.elapsed / 1000)}s` : "";
		const statusLine = theme.fg(statusColor, statusStr + timeStr);
		const statusVisible = statusStr.length + timeStr.length;

		// Context bar: 5 blocks + percent
		const filled = Math.ceil(state.contextPct / 20);
		const bar = "#".repeat(filled) + "-".repeat(5 - filled);
		const runtime = `${state.def.model || "inherited"}/${state.def.thinking}`;
		const ctxStr = truncate(`[${bar}] ${Math.ceil(state.contextPct)}% · ${runtime}`, w - 1);
		const ctxLine = theme.fg("dim", ctxStr);
		const ctxVisible = ctxStr.length;

		const workRaw = state.task
			? (state.lastWork || state.task)
			: state.def.description;
		const workText = truncate(workRaw, Math.min(50, w - 1));
		const workLine = theme.fg("muted", workText);
		const workVisible = workText.length;

		const top = "┌" + "─".repeat(w) + "┐";
		const bot = "└" + "─".repeat(w) + "┘";
		const border = (content: string, visLen: number) =>
			theme.fg("dim", "│") + content + " ".repeat(Math.max(0, w - visLen)) + theme.fg("dim", "│");

		return [
			theme.fg("dim", top),
			border(" " + nameStr, 1 + nameVisible),
			border(" " + statusLine, 1 + statusVisible),
			border(" " + ctxLine, 1 + ctxVisible),
			border(" " + workLine, 1 + workVisible),
			theme.fg("dim", bot),
		];
	}

	function updateWidget() {
		if (!widgetCtx) return;

		widgetCtx.ui.setWidget("agent-team", (_tui: any, theme: any) => {
			const text = new Text("", 0, 1);

			return {
				render(width: number): string[] {
					if (agentStates.size === 0) {
						text.setText(theme.fg("dim", "No agents found. Add .md files to agents/"));
						return text.render(width);
					}

					const cols = Math.min(gridCols, agentStates.size);
					const gap = 1;
					const colWidth = Math.floor((width - gap * (cols - 1)) / cols);
					const agents = Array.from(agentStates.values());
					const rows: string[][] = [];

					for (let i = 0; i < agents.length; i += cols) {
						const rowAgents = agents.slice(i, i + cols);
						const cards = rowAgents.map(a => renderCard(a, colWidth, theme));

						while (cards.length < cols) {
							cards.push(Array(6).fill(" ".repeat(colWidth)));
						}

						const cardHeight = cards[0].length;
						for (let line = 0; line < cardHeight; line++) {
							rows.push(cards.map(card => card[line] || ""));
						}
					}

					const output = rows.map(cols => cols.join(" ".repeat(gap)));
					text.setText(output.join("\n"));
					return text.render(width);
				},
				invalidate() {
					text.invalidate();
				},
			};
		});
	}

	// ── Dispatch Agent (returns Promise) ─────────

	function dispatchAgent(
		agentName: string,
		task: string,
		ctx: any,
		signal?: AbortSignal,
	): Promise<AgentDispatchResult> {
		const key = agentName.toLowerCase();
		const state = agentStates.get(key);
		if (!state) {
			return Promise.resolve({
				output: `Agent "${agentName}" not found. Available: ${Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ")}`,
				streamedOutput: "",
				exitCode: 1,
				elapsed: 0,
				aborted: false,
			});
		}

		if (state.status === "running") {
			return Promise.resolve({
				output: `Agent "${displayName(state.def.name)}" is already running. Wait for it to finish.`,
				streamedOutput: "",
				exitCode: 1,
				elapsed: 0,
				aborted: false,
			});
		}

		state.status = "running";
		state.task = task;
		state.toolCount = 0;
		state.elapsed = 0;
		state.lastWork = "";
		state.runCount++;
		updateWidget();
		const runId = `${traceWriter?.sessionId ?? "untraced"}:${key}:${state.runCount}`;

		const startTime = Date.now();
		let lastHeartbeatAt = startTime;
		state.timer = setInterval(() => {
			const now = Date.now();
			state.elapsed = now - startTime;
			if (now - lastHeartbeatAt >= 5_000) {
				traceWriter?.emit({
					runId,
					type: "heartbeat",
					team: activeTeamName,
					agent: state.def.name,
					payload: { elapsedMs: state.elapsed },
				});
				lastHeartbeatAt = now;
			}
			updateWidget();
		}, 1000);

		const parentModel = ctx.model
			? `${ctx.model.provider}/${ctx.model.id}`
			: "openrouter/google/gemini-3-flash-preview";
		const model = state.def.model || parentModel;
		const thinking = state.def.thinking || "off";
		const slashIndex = model.indexOf("/");
		const modelProvider = slashIndex === -1 ? model : model.slice(0, slashIndex);
		const modelId = slashIndex === -1 ? "" : model.slice(slashIndex + 1);
		const agentContextWindow = ctx.modelRegistry?.find?.(modelProvider, modelId)?.contextWindow
			?? contextWindow;
		traceWriter?.emit({
			runId,
			type: "dispatch_start",
			team: activeTeamName,
			agent: state.def.name,
			payload: {
				kind: "agent",
				parentRunId: dispatcherRunId || undefined,
				task,
				model,
				thinking,
				tools: state.def.tools,
				extensions: state.extensions,
				contextWindow: agentContextWindow,
				runNumber: state.runCount,
			},
		});

		const agentSessionFile = createAgentSessionFile(
			projectCwd,
			traceWriter?.sessionId ?? "untraced",
			state.def.name,
		);
		const args = [
			"--mode", "json",
			"-p",
			"--no-extensions",
			...state.extensions.flatMap(extension => ["-e", extension]),
			"--model", model,
			"--tools", state.def.tools,
			"--thinking", thinking,
			"--append-system-prompt", state.def.systemPrompt,
			"--session", agentSessionFile,
		];
		if (state.sessionFile) args.push("-c");
		args.push(task);

		const output = new AssistantOutputCollector();
		let pendingTraceText = "";
		let lastTextTraceAt = 0;
		const flushTextTrace = (force = false) => {
			if (!pendingTraceText) return;
			const now = Date.now();
			if (!force && now - lastTextTraceAt < 250 && pendingTraceText.length < 500 && !pendingTraceText.includes("\n")) return;
			traceWriter?.emit({
				runId,
				type: "assistant_stream",
				team: activeTeamName,
				agent: state.def.name,
				payload: { outputKind: "streamed", text: pendingTraceText },
			});
			pendingTraceText = "";
			lastTextTraceAt = now;
		};

		return new Promise((resolve) => {
			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
				detached: process.platform !== "win32",
			});
			let buffer = "";
			let settled = false;
			let abortRequested = false;
			let abortWatcher: ReturnType<typeof watchChildAbort> | undefined;

			const finish = (exitCode: number, errorMessage = "", aborted = false) => {
				if (settled) return;
				settled = true;
				flushTextTrace(true);
				clearInterval(state.timer);
				state.elapsed = Date.now() - startTime;
				state.status = exitCode === 0 && !aborted ? "done" : "error";
				if (state.status === "done") state.sessionFile = agentSessionFile;

				const finalAssistantText = output.finalAssistantText;
				const resultOutput = aborted
					? `Dispatch to ${displayName(state.def.name)} was aborted.`
					: errorMessage || finalAssistantText;
				state.lastWork = resultOutput.split("\n").filter((line: string) => line.trim()).pop() || "";
				traceWriter?.emit({
					runId,
					type: "assistant_final",
					team: activeTeamName,
					agent: state.def.name,
					payload: { outputKind: "final", text: finalAssistantText },
				});
				traceWriter?.emit({
					runId,
					type: "dispatch_end",
					team: activeTeamName,
					agent: state.def.name,
					payload: {
						status: aborted ? "aborted" : state.status,
						exitCode,
						elapsedMs: state.elapsed,
						toolCount: state.toolCount,
						finalAssistantText,
					},
				});
				updateWidget();
				ctx.ui.notify(
					`${displayName(state.def.name)} ${aborted ? "aborted" : state.status} in ${Math.round(state.elapsed / 1000)}s`,
					state.status === "done" ? "success" : "error",
				);
				resolve({
					output: resultOutput,
					streamedOutput: output.streamedText,
					exitCode,
					elapsed: state.elapsed,
					aborted,
				});
			};

			const consumeEvent = (event: any) => {
				const collected = output.consume(event);
				if (collected.streamedDelta !== undefined) {
					pendingTraceText += collected.streamedDelta;
					flushTextTrace();
					const last = output.streamedText.split("\n").filter((line: string) => line.trim()).pop() || "";
					state.lastWork = last;
					updateWidget();
				} else if (event.type === "tool_execution_start") {
					flushTextTrace(true);
					state.toolCount++;
					traceWriter?.emit({
						runId,
						type: "tool_start",
						team: activeTeamName,
						agent: state.def.name,
						payload: { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args },
					});
					updateWidget();
				} else if (event.type === "tool_execution_end") {
					traceWriter?.emit({
						runId,
						type: "tool_end",
						team: activeTeamName,
						agent: state.def.name,
						payload: { toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: Boolean(event.isError) },
					});
				} else if (event.type === "message_end") {
					flushTextTrace(true);
					const message = event.message;
					traceWriter?.emit({
						runId,
						type: "message_end",
						team: activeTeamName,
						agent: state.def.name,
						payload: { role: message?.role, usage: message?.usage, stopReason: message?.stopReason },
					});
					if (message?.usage && agentContextWindow > 0) {
						state.contextPct = ((message.usage.input || 0) / agentContextWindow) * 100;
						updateWidget();
					}
				} else if (event.type === "agent_end") {
					const last = [...(event.messages || [])].reverse().find((message: any) => message.role === "assistant");
					if (last?.usage && agentContextWindow > 0) {
						state.contextPct = ((last.usage.input || 0) / agentContextWindow) * 100;
						updateWidget();
					}
				}
			};

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				if (settled) return;
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.trim()) continue;
					try { consumeEvent(JSON.parse(line)); } catch {}
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => {
				if (settled) return;
				traceWriter?.emit({
					runId,
					type: "stderr",
					team: activeTeamName,
					agent: state.def.name,
					payload: { text: chunk },
				});
			});

			proc.on("close", (code) => {
				const aborted = abortRequested || abortWatcher?.aborted === true;
				abortWatcher?.childExited();
				if (!settled && buffer.trim()) {
					try { consumeEvent(JSON.parse(buffer)); } catch {}
				}
				finish(aborted ? 1 : code ?? 1, "", aborted);
			});
			proc.on("error", (error) => {
				const aborted = abortRequested || abortWatcher?.aborted === true;
				abortWatcher?.childExited();
				if (!aborted) {
					traceWriter?.emit({
						runId,
						type: "dispatch_error",
						team: activeTeamName,
						agent: state.def.name,
						payload: { message: error.message, elapsedMs: Date.now() - startTime },
					});
				}
				finish(1, aborted ? "" : `Error spawning agent: ${error.message}`, aborted);
			});

			abortWatcher = watchChildAbort(
				signal,
				(childSignal) => terminateChildProcess(proc, childSignal),
				() => { abortRequested = true; },
			);
		});
	}

	// ── Restricted open-items tools ─────────────────

	pi.registerTool({
		name: "read_open_items",
		label: "Read Open Items",
		description: "Read /home/barrett-lowe/work-notes/notes/open-items.md. This is the only file this tool can read.",
		parameters: Type.Object({}),
		async execute() {
			return {
				content: [{ type: "text", text: readFileSync(OPEN_ITEMS_FILE, "utf-8") }],
				details: { path: OPEN_ITEMS_FILE },
			};
		},
	});

	pi.registerTool({
		name: "edit_open_items",
		label: "Edit Open Items",
		description: "Apply exact text replacements to /home/barrett-lowe/work-notes/notes/open-items.md. This is the only file this tool can edit.",
		parameters: Type.Object({
			edits: Type.Array(Type.Object({
				oldText: Type.String(),
				newText: Type.String(),
			}), { minItems: 1 }),
		}),
		async execute(_toolCallId, params) {
			let content = readFileSync(OPEN_ITEMS_FILE, "utf-8");
			for (const { oldText, newText } of (params as { edits: Array<{ oldText: string; newText: string }> }).edits) {
				const firstIndex = content.indexOf(oldText);
				if (firstIndex === -1 || firstIndex !== content.lastIndexOf(oldText)) {
					throw new Error("Each oldText must match exactly once in open-items.md");
				}
				content = content.slice(0, firstIndex) + newText + content.slice(firstIndex + oldText.length);
			}
			writeFileSync(OPEN_ITEMS_FILE, content, "utf-8");
			return {
				content: [{ type: "text", text: `Updated ${OPEN_ITEMS_FILE}` }],
				details: { path: OPEN_ITEMS_FILE },
			};
		},
	});

	// ── dispatch_agent Tool (registered at top level) ──

	pi.registerTool({
		name: "dispatch_agent",
		label: "Dispatch Agent",
		description: "Dispatch a task to a specialist agent. The agent will execute the task and return the result. Use the system prompt to see available agent names.",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (case-insensitive)" }),
			task: Type.String({ description: "Task description for the agent to execute" }),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { agent, task } = params as { agent: string; task: string };
			onUpdate?.({
				content: [{ type: "text", text: `Dispatching to ${agent}...` }],
				details: { agent, task, status: "dispatching" },
			});

			const result = await dispatchAgent(agent, task, ctx, signal);
			if (result.exitCode !== 0) throw new Error(result.output);

			return {
				content: [{ type: "text", text: result.output }],
				details: {
					agent,
					task,
					status: "done",
					elapsed: result.elapsed,
					exitCode: result.exitCode,
					fullOutput: result.output,
					finalOutput: result.output,
					streamedOutput: result.streamedOutput,
				},
			};
		},

		renderCall(args, theme) {
			const agentName = (args as any).agent || "?";
			const task = (args as any).task || "";
			const preview = task.length > 60 ? task.slice(0, 57) + "..." : task;
			return new Text(
				theme.fg("toolTitle", theme.bold("dispatch_agent ")) +
				theme.fg("accent", agentName) +
				theme.fg("dim", " — ") +
				theme.fg("muted", preview),
				0, 0,
			);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			// Streaming/partial result while agent is still running
			if (options.isPartial || details.status === "dispatching") {
				return new Text(
					theme.fg("accent", `● ${details.agent || "?"}`) +
					theme.fg("dim", " working..."),
					0, 0,
				);
			}

			const icon = details.status === "done" ? "✓" : "✗";
			const color = details.status === "done" ? "success" : "error";
			const elapsed = typeof details.elapsed === "number" ? Math.round(details.elapsed / 1000) : 0;
			const header = theme.fg(color, `${icon} ${details.agent}`) +
				theme.fg("dim", ` ${elapsed}s`);

			if (options.expanded && details.fullOutput) {
				const output = details.fullOutput.length > 4000
					? details.fullOutput.slice(0, 4000) + "\n... [truncated]"
					: details.fullOutput;
				return new Text(header + "\n" + theme.fg("muted", output), 0, 0);
			}

			return new Text(header, 0, 0);
		},
	});

	// ── Commands ─────────────────────────────────

	pi.registerCommand("agents-team", {
		description: "Select a team to work with",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			const teamNames = Object.keys(teams);
			if (teamNames.length === 0) {
				ctx.ui.notify("No teams defined in .pi/agents/teams.yaml", "warning");
				return;
			}

			const options = teamNames.map(name => {
				const members = teams[name].map(m => displayName(m.name));
				return `${name} — ${members.join(", ")}`;
			});

			const choice = await ctx.ui.select("Select Team", options);
			if (choice === undefined) return;

			const idx = options.indexOf(choice);
			const name = teamNames[idx];
			activateTeam(name);
			updateWidget();
			ctx.ui.setStatus("agent-team", `Team: ${name} (${agentStates.size})`);
			ctx.ui.notify(`Team: ${name} — ${Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ")}`, "info");
		},
	});

	pi.registerCommand("agents-list", {
		description: "List all loaded agents",
		handler: async (_args, _ctx) => {
			widgetCtx = _ctx;
			const names = Array.from(agentStates.values())
				.map(s => {
					const session = s.sessionFile ? "resumed" : "new";
					const model = s.def.model || "dispatcher model";
					return `${displayName(s.def.name)} (${s.status}, ${session}, runs: ${s.runCount}, model: ${model}, thinking: ${s.def.thinking}): ${s.def.description}`;
				})
				.join("\n");
			_ctx.ui.notify(names || "No agents loaded", "info");
		},
	});

	pi.registerCommand("agents-grid", {
		description: "Set grid columns: /agents-grid <1-6>",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items = ["1", "2", "3", "4", "5", "6"].map(n => ({
				value: n,
				label: `${n} columns`,
			}));
			const filtered = items.filter(i => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, _ctx) => {
			widgetCtx = _ctx;
			const n = parseInt(args?.trim() || "", 10);
			if (n >= 1 && n <= 6) {
				gridCols = n;
				_ctx.ui.notify(`Grid set to ${gridCols} columns`, "info");
				updateWidget();
			} else {
				_ctx.ui.notify("Usage: /agents-grid <1-6>", "error");
			}
		},
	});

	// ── System Prompt Override ───────────────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		flushDispatcherText(true);
		if (dispatcherTimer) clearInterval(dispatcherTimer);
		dispatcherRunCount++;
		dispatcherRunId = `${traceWriter?.sessionId ?? "untraced"}:dispatcher:${dispatcherRunCount}`;
		dispatcherStartedAt = Date.now();
		dispatcherToolCount = 0;
		dispatcherTextChunks = [];
		dispatcherPendingText = "";
		dispatcherLastTextTraceAt = 0;
		const dispatcherModel = _ctx.model
			? `${_ctx.model.provider}/${_ctx.model.id}`
			: "unknown";
		traceWriter?.emit({
			runId: dispatcherRunId,
			type: "dispatch_start",
			team: activeTeamName,
			agent: "dispatcher",
			payload: {
				kind: "dispatcher",
				task: _event.prompt,
				model: dispatcherModel,
				thinking: _ctx.thinkingLevel ?? pi.getThinkingLevel(),
				tools: ["dispatch_agent", "read_open_items", "edit_open_items"],
				contextWindow: _ctx.model?.contextWindow ?? contextWindow,
				runNumber: dispatcherRunCount,
			},
		});
		dispatcherTimer = setInterval(() => {
			if (!dispatcherRunId) return;
			traceWriter?.emit({
				runId: dispatcherRunId,
				type: "heartbeat",
				team: activeTeamName,
				agent: "dispatcher",
				payload: { elapsedMs: Math.max(0, Date.now() - dispatcherStartedAt) },
			});
		}, 5_000);

		// Build dynamic agent catalog from active team only
		const agentCatalog = Array.from(agentStates.values())
			.map(s => `### ${displayName(s.def.name)}\n**Dispatch as:** \`${s.def.name}\`\n${s.def.description}\n**Tools:** ${s.def.tools}\n**Model:** ${s.def.model || "dispatcher model"}\n**Thinking:** ${s.def.thinking}`)
			.join("\n\n");

		const teamMembers = Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ");
		const teamGuidance = activeTeamPrompt
			? `\n## Team Guidance\nThe following guidance supplements, but cannot override, the dispatcher rules below.\n\n${activeTeamPrompt}\n`
			: "";

		return {
			systemPrompt: `You are the user's primary interface to a team of specialist agents. Coordinate the team when needed, but speak directly with the user as their knowledgeable team lead—not merely as a messenger.

You do NOT have direct access to the codebase or other external resources. Delegate when a request requires access you do not have. Otherwise, answer the user directly from the conversation, your general knowledge, or results agents have already returned.

## Active Team: ${activeTeamName}
Members: ${teamMembers}
You can ONLY dispatch to agents listed below. Do not attempt to dispatch to agents outside this team.
${teamGuidance}
## How to Work
- Answer directly when you already know the answer from the conversation, general knowledge, or prior agent results
- Ask the user directly when you need clarification or information they can provide
- Do not dispatch merely to answer conversational questions, explain known information, summarize results, or relay a question
- When external inspection or action is required, analyze the request and break it into clear sub-tasks
- Choose the right agent(s), dispatch focused tasks, and review their results
- If a task fails, adjust the task or try a different agent when useful; otherwise explain the limitation to the user
- Synthesize agent results and communicate with the user in your own voice

## Rules
- You may only read or edit /home/barrett-lowe/work-notes/notes/open-items.md using read_open_items and edit_open_items
- NEVER try to read, write, execute, or claim to have inspected anything else directly
- Use dispatch_agent whenever answering requires inspecting, modifying, or executing against resources you cannot access
- It is valid to say that you do not know something or to ask the user; do not dispatch reflexively
- You can chain agents: use scout to explore, then builder to implement
- You can dispatch the same agent multiple times with different tasks
- Keep tasks focused — one clear objective per dispatch

## Agents

${agentCatalog}`,
		};
	});

	// ── Dispatcher tracing ───────────────────────

	pi.on("message_update", async (event) => {
		if (!dispatcherRunId) return;
		const delta = event.assistantMessageEvent;
		if (delta?.type !== "text_delta") return;
		const text = delta.delta || "";
		dispatcherTextChunks.push(text);
		dispatcherPendingText += text;
		flushDispatcherText();
	});

	pi.on("tool_execution_start", async (event) => {
		if (!dispatcherRunId) return;
		flushDispatcherText(true);
		dispatcherToolCount++;
		traceWriter?.emit({
			runId: dispatcherRunId,
			type: "tool_start",
			team: activeTeamName,
			agent: "dispatcher",
			payload: {
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
			},
		});
	});

	pi.on("tool_execution_end", async (event) => {
		if (!dispatcherRunId) return;
		traceWriter?.emit({
			runId: dispatcherRunId,
			type: "tool_end",
			team: activeTeamName,
			agent: "dispatcher",
			payload: {
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				result: event.result,
				isError: Boolean(event.isError),
			},
		});
	});

	pi.on("message_end", async (event) => {
		if (!dispatcherRunId) return;
		flushDispatcherText(true);
		const message = event.message as any;
		traceWriter?.emit({
			runId: dispatcherRunId,
			type: "message_end",
			team: activeTeamName,
			agent: "dispatcher",
			payload: {
				role: message?.role,
				usage: message?.usage,
				stopReason: message?.stopReason,
			},
		});
	});

	pi.on("agent_end", async (event) => {
		if (!dispatcherRunId) return;
		if (dispatcherTimer) clearInterval(dispatcherTimer);
		dispatcherTimer = undefined;
		flushDispatcherText(true);
		const lastAssistant = [...event.messages].reverse().find((message: any) => message.role === "assistant") as any;
		const stopReason = lastAssistant?.stopReason;
		const status = stopReason === "error" || stopReason === "aborted" ? "error" : "done";
		const finalOutput = new AssistantOutputCollector();
		finalOutput.consume({ type: "agent_end", messages: event.messages });
		traceWriter?.emit({
			runId: dispatcherRunId,
			type: "assistant_final",
			team: activeTeamName,
			agent: "dispatcher",
			payload: { outputKind: "final", text: finalOutput.finalAssistantText },
		});
		traceWriter?.emit({
			runId: dispatcherRunId,
			type: "dispatch_end",
			team: activeTeamName,
			agent: "dispatcher",
			payload: {
				status,
				stopReason,
				elapsedMs: Math.max(0, Date.now() - dispatcherStartedAt),
				toolCount: dispatcherToolCount,
				streamedAssistantText: dispatcherTextChunks.join(""),
				finalAssistantText: finalOutput.finalAssistantText,
			},
		});
		dispatcherRunId = "";
	});

	// ── Session Start ────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		// Clear widgets from previous session
		if (widgetCtx) {
			widgetCtx.ui.setWidget("agent-team", undefined);
		}
		widgetCtx = _ctx;
		contextWindow = _ctx.model?.contextWindow || 0;
		if (dispatcherTimer) clearInterval(dispatcherTimer);
		dispatcherTimer = undefined;
		dispatcherRunId = "";
		dispatcherRunCount = 0;
		traceWriter = new AgentTraceWriter(_ctx.cwd);
		sessionDir = join(_ctx.cwd, ".pi", "agent-sessions", traceWriter.sessionId);
		loadAgents(_ctx.cwd);

		// Use the CLI-selected team, or default to the first available team.
		const requestedTeamFlag = pi.getFlag("agent-team");
		const requestedTeam = typeof requestedTeamFlag === "string" ? requestedTeamFlag : undefined;
		const initialTeam = resolveInitialTeam(teams, requestedTeam);
		if (initialTeam) {
			activateTeam(initialTeam);
		}
		traceWriter.emit({
			runId: `${traceWriter.sessionId}:session`,
			type: "session_start",
			team: activeTeamName,
			agent: "dispatcher",
			payload: {
				cwd: _ctx.cwd,
				traceFile: traceWriter.traceFile,
				sessionDir,
				members: Array.from(agentStates.values()).map(state => state.def.name),
			},
		});
		if (requestedTeam && !Object.hasOwn(teams, requestedTeam)) {
			_ctx.ui.notify(
				`Team "${requestedTeam}" not found. Using "${initialTeam}". Available: ${Object.keys(teams).join(", ")}`,
				"error",
			);
		}

		// Lock down to dispatching and the two fixed-path open-items tools.
		pi.setActiveTools(["dispatch_agent", "read_open_items", "edit_open_items"]);

		_ctx.ui.setStatus("agent-team", `Team: ${activeTeamName} (${agentStates.size})`);
		const members = Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ");
		_ctx.ui.notify(
			`Team: ${activeTeamName} (${members})\n` +
			`Teams: ~/.pi/agent/agents/teams.yaml + .pi/agents/teams.yaml\n\n` +
			`/agents-team          Select a team\n` +
			`/agents-list          List active agents and status\n` +
			`/agents-grid <1-6>    Set grid column count`,
			"info",
		);
		updateWidget();

		// Footer: model | team | context bar
		_ctx.ui.setFooter((_tui, theme, _footerData) => ({
			dispose: () => {},
			invalidate() {},
			render(width: number): string[] {
				const model = _ctx.model?.id || "no-model";
				const usage = _ctx.getContextUsage();
				const pct = usage ? usage.percent : 0;
				const filled = Math.round(pct / 10);
				const bar = "#".repeat(filled) + "-".repeat(10 - filled);

				const left = theme.fg("dim", ` ${model}`) +
					theme.fg("muted", " · ") +
					theme.fg("accent", activeTeamName);
				const right = theme.fg("dim", `[${bar}] ${Math.round(pct)}% `);
				const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));

				return [truncateToWidth(left + pad + right, width)];
			},
		}));
	});
}
