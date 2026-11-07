#!/usr/bin/env node

import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_FILE = join(HERE, "agent-team-dashboard.html");

function number(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseTraceText(text) {
	const events = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const event = JSON.parse(line);
			if (event?.version === 1 && event.runId && event.type && event.timestamp) events.push(event);
		} catch {
			// A writer may be midway through the final line while we poll it.
		}
	}
	return events;
}

function usageFrom(payload) {
	const usage = payload?.usage ?? {};
	return {
		input: number(usage.input),
		output: number(usage.output),
		cacheRead: number(usage.cacheRead),
		cacheWrite: number(usage.cacheWrite),
		cost: number(usage.cost?.total),
	};
}

function appendTimelineEvent(run, event) {
	// Heartbeats keep liveness accurate but add no useful visual information.
	if (event.type === "heartbeat") return;

	const isAssistantStream = event.type === "assistant_stream" || event.type === "assistant_delta";
	const timelineEvent = {
		sequence: event.sequence,
		timestamp: event.timestamp,
		type: isAssistantStream ? "assistant_stream" : event.type,
		payload: event.payload ?? {},
	};
	if (!isAssistantStream) {
		run.events.push(timelineEvent);
		return;
	}

	const previous = run.events.at(-1);
	if (previous?.type === "assistant_stream") {
		previous.payload.text = `${previous.payload.text ?? ""}${event.payload?.text ?? ""}`;
		previous.endTimestamp = event.timestamp;
		return;
	}
	run.events.push(timelineEvent);
}

export function buildSnapshot(events, project = "") {
	const runsById = new Map();
	for (const event of events.sort((a, b) => a.sequence - b.sequence)) {
		if (event.type === "session_start") continue;
		let run = runsById.get(event.runId);
		if (!run) {
			run = {
				id: event.runId,
				sessionId: event.sessionId,
				agent: event.agent,
				team: event.team,
				status: "running",
				task: "",
				model: "",
				thinking: "",
				kind: "agent",
				parentRunId: null,
				startAt: event.timestamp,
				endAt: null,
				lastActivityAt: event.timestamp,
				toolCount: 0,
				toolErrors: 0,
				tools: {},
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
				contextWindow: 0,
				events: [],
			};
			runsById.set(event.runId, run);
		}

		run.lastActivityAt = event.timestamp;
		appendTimelineEvent(run, event);

		if (event.type === "dispatch_start") {
			run.kind = event.payload?.kind === "dispatcher" ? "dispatcher" : "agent";
			run.parentRunId = event.payload?.parentRunId ?? null;
			run.task = event.payload?.task ?? "";
			run.model = event.payload?.model ?? "";
			run.thinking = event.payload?.thinking ?? "";
			run.contextWindow = number(event.payload?.contextWindow);
			run.startAt = event.timestamp;
		} else if (event.type === "tool_start") {
			run.toolCount++;
			const toolName = event.payload?.toolName ?? "unknown";
			run.tools[toolName] = (run.tools[toolName] ?? 0) + 1;
		} else if (event.type === "tool_end" && event.payload?.isError) {
			run.toolErrors++;
		} else if (event.type === "message_end") {
			const usage = usageFrom(event.payload);
			for (const key of Object.keys(run.usage)) run.usage[key] += usage[key];
		} else if (event.type === "dispatch_end") {
			run.status = event.payload?.status === "done" ? "done" : "error";
			run.endAt = event.timestamp;
		} else if (event.type === "dispatch_error") {
			run.status = "error";
			run.endAt = event.timestamp;
		}
	}

	const now = Date.now();
	const runs = Array.from(runsById.values()).map(run => {
		const start = Date.parse(run.startAt);
		const end = run.endAt ? Date.parse(run.endAt) : now;
		const stale = run.status === "running" && now - Date.parse(run.lastActivityAt) > 15_000;
		return { ...run, status: stale ? "interrupted" : run.status, durationMs: Math.max(0, end - start), events: run.events.slice(-250) };
	}).sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

	const completedDurations = runs.filter(run => run.endAt).map(run => run.durationMs);
	const aggregateTools = {};
	for (const run of runs) {
		for (const [name, count] of Object.entries(run.tools)) aggregateTools[name] = (aggregateTools[name] ?? 0) + count;
	}
	const totals = runs.reduce((acc, run) => {
		acc.tools += run.toolCount;
		acc.toolErrors += run.toolErrors;
		acc.cost += run.usage.cost;
		acc.input += run.usage.input;
		acc.output += run.usage.output;
		acc.cacheRead += run.usage.cacheRead;
		return acc;
	}, { tools: 0, toolErrors: 0, cost: 0, input: 0, output: 0, cacheRead: 0 });

	return {
		generatedAt: new Date().toISOString(),
		project,
		metrics: {
			runs: runs.length,
			running: runs.filter(run => run.status === "running").length,
			errors: runs.filter(run => run.status === "error").length,
			averageDurationMs: completedDurations.length
				? completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length
				: 0,
			toolErrorRate: totals.tools ? totals.toolErrors / totals.tools : 0,
			...totals,
			toolMix: aggregateTools,
		},
		runs: runs.slice(0, 50),
	};
}

export function loadSnapshot(project) {
	const traceDir = join(project, ".pi", "agent-traces");
	if (!existsSync(traceDir)) return buildSnapshot([], project);
	const files = readdirSync(traceDir)
		.filter(file => file.endsWith(".jsonl"))
		.map(file => ({ file, mtime: statSync(join(traceDir, file)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, 30);
	const events = files.flatMap(({ file }) => parseTraceText(readFileSync(join(traceDir, file), "utf-8")));
	return buildSnapshot(events, project);
}

function parseArgs(argv) {
	const options = { project: process.cwd(), host: "127.0.0.1", port: 7331 };
	for (let index = 0; index < argv.length; index++) {
		if (argv[index] === "--project") options.project = resolve(argv[++index]);
		else if (argv[index] === "--host") options.host = argv[++index];
		else if (argv[index] === "--port") options.port = Number.parseInt(argv[++index], 10);
		else if (argv[index] === "--help") options.help = true;
		else throw new Error(`Unknown argument: ${argv[index]}`);
	}
	if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) throw new Error("--port must be between 1 and 65535");
	if (!["127.0.0.1", "localhost", "::1"].includes(options.host)) throw new Error("The prototype only binds to localhost");
	return options;
}

export function startServer(options) {
	const dashboard = readFileSync(DASHBOARD_FILE, "utf-8");
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
		if (url.pathname === "/") {
			response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
			response.end(dashboard);
			return;
		}
		if (url.pathname === "/api/snapshot") {
			try {
				response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
				response.end(JSON.stringify(loadSnapshot(options.project)));
			} catch (error) {
				response.writeHead(500, { "content-type": "application/json" });
				response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
			}
			return;
		}
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		response.end("Not found");
	});
	server.listen(options.port, options.host, () => {
		console.log(`Agent Team Observatory: http://${options.host}:${options.port}`);
		console.log(`Watching: ${join(options.project, ".pi", "agent-traces")}`);
	});
	return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const options = parseArgs(process.argv.slice(2));
		if (options.help) {
			console.log("Usage: node agent-team-observer.mjs [--project PATH] [--port 7331]");
		} else {
			startServer(options).on("error", error => {
				console.error(`Observer failed: ${error.message}`);
				process.exitCode = 1;
			});
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
