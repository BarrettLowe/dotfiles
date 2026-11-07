import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createAgentSessionFile } from "../manual-extensions/agent-team-runtime.ts";
import { AgentTraceWriter, createTraceSessionId, sanitizeTracePayload } from "../manual-extensions/agent-team-trace.ts";

test("sanitizeTracePayload redacts sensitive fields and truncates large strings", () => {
	const clean = sanitizeTracePayload({
		token: "do-not-log",
		nested: { Authorization: "Bearer nope", safe: "visible" },
		large: "x".repeat(13_000),
	});
	assert.equal(clean.token, "[redacted]");
	assert.deepEqual(clean.nested, { Authorization: "[redacted]", safe: "visible" });
	assert.match(clean.large as string, /\[truncated\]$/);
});

test("createTraceSessionId is stable for supplied clock and pid", () => {
	assert.equal(
		createTraceSessionId(new Date("2026-09-21T12:34:56.789Z"), 42),
		"2026-09-21T12-34-56-789Z-42",
	);
});

test("AgentTraceWriter appends versioned JSONL events", () => {
	const project = mkdtempSync(join(tmpdir(), "agent-team-trace-"));
	try {
		const writer = new AgentTraceWriter(project, true);
		writer.emit({ runId: "run-1", type: "tool_start", team: "team", agent: "scout", payload: { toolName: "read" } });
		const lines = readFileSync(writer.traceFile, "utf-8").trim().split("\n");
		assert.equal(lines.length, 1);
		assert.deepEqual(JSON.parse(lines[0]), {
			version: 1,
			sessionId: writer.sessionId,
			runId: "run-1",
			sequence: 1,
			timestamp: JSON.parse(lines[0]).timestamp,
			type: "tool_start",
			team: "team",
			agent: "scout",
			payload: { toolName: "read" },
		});
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
});


test("approval and assistant output events remain correlated with subagent sessions", () => {
	const project = mkdtempSync(join(tmpdir(), "agent-team-correlation-"));
	try {
		const writer = new AgentTraceWriter(project, true);
		const runId = `${writer.sessionId}:dispatcher:1`;
		for (const [type, payload] of [
			["assistant_stream", { outputKind: "streamed", text: "draft" }],
			["assistant_final", { outputKind: "final", text: "answer" }],
			["plan_presented", { state: "awaiting approval" }],
			["approval_requested", { state: "awaiting approval" }],
			["approval_granted", { state: "implementation approved", source: "/agents-approve" }],
			["approval_denied", { state: "planning", source: "/agents-deny" }],
		] as const) {
			writer.emit({ runId, type, team: "implementation", agent: "dispatcher", payload });
		}

		const events = readFileSync(writer.traceFile, "utf-8").trim().split("\n").map(line => JSON.parse(line));
		assert.deepEqual(events.map(event => event.type), [
			"assistant_stream",
			"assistant_final",
			"plan_presented",
			"approval_requested",
			"approval_granted",
			"approval_denied",
		]);
		assert.equal(events.every(event => event.sessionId === writer.sessionId), true);
		assert.equal(
			createAgentSessionFile(project, writer.sessionId, "software-engineer"),
			join(project, ".pi", "agent-sessions", writer.sessionId, "software-engineer.jsonl"),
		);
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
});
