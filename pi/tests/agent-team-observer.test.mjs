import assert from "node:assert/strict";
import test from "node:test";

import { buildSnapshot, parseTraceText } from "../manual-extensions/agent-team-observer.mjs";

function event(sequence, type, payload = {}) {
	return {
		version: 1,
		sessionId: "session-1",
		runId: "run-1",
		sequence,
		timestamp: new Date(Date.UTC(2026, 8, 21, 12, 0, sequence)).toISOString(),
		type,
		team: "implementation",
		agent: "builder",
		payload,
	};
}

test("parseTraceText ignores incomplete and malformed lines", () => {
	const valid = event(1, "dispatch_start", { task: "Build it" });
	assert.deepEqual(parseTraceText(`${JSON.stringify(valid)}\nnot-json\n{`), [valid]);
});

test("buildSnapshot aggregates run, tool, usage, and error metrics", () => {
	const snapshot = buildSnapshot([
		event(1, "dispatch_start", { kind: "agent", parentRunId: "dispatcher-1", task: "Build it", model: "test/model", thinking: "high", contextWindow: 100_000 }),
		event(2, "tool_start", { toolName: "read", args: { path: "a.ts" } }),
		event(3, "tool_end", { toolName: "read", isError: true }),
		event(4, "message_end", { usage: { input: 100, output: 20, cacheRead: 50, cost: { total: 0.03 } } }),
		event(5, "dispatch_end", { status: "done", exitCode: 0 }),
	], "/project");

	assert.equal(snapshot.metrics.runs, 1);
	assert.equal(snapshot.metrics.tools, 1);
	assert.equal(snapshot.metrics.toolErrors, 1);
	assert.equal(snapshot.metrics.toolErrorRate, 1);
	assert.equal(snapshot.metrics.cost, 0.03);
	assert.equal(snapshot.runs[0].status, "done");
	assert.equal(snapshot.runs[0].kind, "agent");
	assert.equal(snapshot.runs[0].parentRunId, "dispatcher-1");
	assert.equal(snapshot.runs[0].task, "Build it");
	assert.deepEqual(snapshot.runs[0].tools, { read: 1 });
});

test("buildSnapshot exposes dispatcher runs as first-class telemetry", () => {
	const events = [
		event(1, "dispatch_start", { kind: "dispatcher", task: "Ship the feature", model: "test/lead" }),
		event(2, "tool_start", { toolName: "dispatch_agent", args: { agent: "builder" } }),
		event(3, "tool_end", { toolName: "dispatch_agent", isError: false }),
		event(4, "dispatch_end", { status: "done" }),
	];
	for (const item of events) item.agent = "dispatcher";
	const snapshot = buildSnapshot(events);
	assert.equal(snapshot.runs[0].agent, "dispatcher");
	assert.equal(snapshot.runs[0].kind, "dispatcher");
	assert.deepEqual(snapshot.runs[0].tools, { dispatch_agent: 1 });
});

test("buildSnapshot coalesces streamed assistant chunks into response segments", () => {
	const snapshot = buildSnapshot([
		event(1, "dispatch_start", { task: "Explain it" }),
		event(2, "assistant_stream", { outputKind: "streamed", text: "First " }),
		event(3, "heartbeat", { elapsedMs: 5_000 }),
		event(4, "assistant_stream", { outputKind: "streamed", text: "response." }),
		event(5, "tool_start", { toolName: "read" }),
		event(6, "tool_end", { toolName: "read", isError: false }),
		event(7, "assistant_stream", { outputKind: "streamed", text: "After tool." }),
		event(8, "assistant_final", { outputKind: "final", text: "After tool." }),
		event(9, "message_end", { usage: {} }),
		event(10, "dispatch_end", { status: "done" }),
	]);

	const assistantEvents = snapshot.runs[0].events.filter(item => item.type === "assistant_stream");
	assert.equal(assistantEvents.length, 2);
	assert.equal(assistantEvents[0].payload.text, "First response.");
	assert.equal(assistantEvents[1].payload.text, "After tool.");
	assert.equal(snapshot.runs[0].events.some(item => item.type === "heartbeat"), false);
	const finalEvent = snapshot.runs[0].events.find(item => item.type === "assistant_final");
	assert.equal(finalEvent.payload.outputKind, "final");
});

test("buildSnapshot retains auditable approval transitions", () => {
	const snapshot = buildSnapshot([
		event(1, "plan_presented", { previousState: "planning", state: "awaiting approval" }),
		event(2, "approval_requested", { state: "awaiting approval", source: "tool:call-1" }),
		event(3, "approval_granted", { state: "implementation approved", source: "/agents-approve" }),
	]);
	assert.deepEqual(
		snapshot.runs[0].events.map(item => item.type),
		["plan_presented", "approval_requested", "approval_granted"],
	);
});
