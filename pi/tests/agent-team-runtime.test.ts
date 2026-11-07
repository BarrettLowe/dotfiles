import assert from "node:assert/strict";
import test from "node:test";

import {
	AssistantOutputCollector,
	createAgentSessionFile,
	watchChildAbort,
} from "../manual-extensions/agent-team-runtime.ts";

// Test cases identified:
// - subagent sessions share the trace session directory and use JSONL
// - streamed output accumulates while only the last assistant message is final
// - cancellation requests graceful termination, escalates, and cleans up exactly once

test("createAgentSessionFile correlates JSONL sessions with the trace session", () => {
	assert.equal(
		createAgentSessionFile("/project", "trace-session-1", "Software Engineer"),
		"/project/.pi/agent-sessions/trace-session-1/software-engineer.jsonl",
	);
	assert.equal(
		createAgentSessionFile("/project", "trace-session-1", "Software Engineer"),
		createAgentSessionFile("/project", "trace-session-1", "Software Engineer"),
	);
});

test("AssistantOutputCollector separates streamed output from the final assistant text", () => {
	const output = new AssistantOutputCollector();
	output.consume({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "planning " } });
	output.consume({
		type: "message_end",
		message: { role: "assistant", content: [{ type: "text", text: "intermediate question" }] },
	});
	output.consume({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "final answer" } });
	output.consume({
		type: "agent_end",
		messages: [
			{ role: "assistant", content: [{ type: "text", text: "intermediate question" }] },
			{ role: "toolResult", content: [{ type: "text", text: "tool result" }] },
			{ role: "assistant", content: [{ type: "text", text: "Final " }, { type: "text", text: "answer" }] },
		],
	});

	assert.equal(output.streamedText, "planning final answer");
	assert.equal(output.finalAssistantText, "Final answer");
});

test("watchChildAbort reports one abort request and keeps escalating until child exit", async () => {
	const controller = new AbortController();
	const signals: NodeJS.Signals[] = [];
	let abortRequests = 0;
	const watcher = watchChildAbort(
		controller.signal,
		(signal) => signals.push(signal),
		() => abortRequests++,
		5,
	);

	controller.abort();
	controller.abort();
	assert.deepEqual(signals, ["SIGTERM"]);
	assert.equal(abortRequests, 1);
	assert.equal(watcher.aborted, true);
	await new Promise(resolve => setTimeout(resolve, 15));
	assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);

	watcher.childExited();
});

test("watchChildAbort handles an already-aborted signal and child-exit cleanup", async () => {
	const controller = new AbortController();
	controller.abort();
	const signals: NodeJS.Signals[] = [];
	let abortRequested = false;
	const watcher = watchChildAbort(
		controller.signal,
		signal => signals.push(signal),
		() => { abortRequested = true; },
		20,
	);
	assert.equal(abortRequested, true);
	assert.deepEqual(signals, ["SIGTERM"]);
	watcher.childExited();
	await new Promise(resolve => setTimeout(resolve, 30));
	assert.deepEqual(signals, ["SIGTERM"]);
});
