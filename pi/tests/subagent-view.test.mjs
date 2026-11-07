import assert from "node:assert/strict";
import test, { after } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { host, loadExtensions } from "./helpers/pi-host.mjs";

// Resolve Pi imports through the installed host, not repository node_modules.
const temporary = mkdtempSync(join(tmpdir(), "pi-subagent-view-"));
after(() => rmSync(temporary, { recursive: true, force: true }));
const helperPath = fileURLToPath(new URL("../extensions/lib/subagent-view.ts", import.meta.url));
const wrapper = join(temporary, "viewer-fixture.ts");
writeFileSync(wrapper, `
import * as helper from ${JSON.stringify(helperPath)};
import { getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
export default function(pi) {
  pi.registerCommand("fixture", { handler: async () => ({ ...helper, keys: getKeybindings(), visibleWidth }) });
}
`);
const loaded = await loadExtensions([wrapper], temporary, undefined, host.createExtensionRuntime());
assert.deepEqual(loaded.errors, []);
host.initTheme("dark", false);
const { SubagentTranscript, SubagentView, keys, visibleWidth } = await loaded.extensions[0].commands.get("fixture").handler();
const theme = { fg: (_color, text) => `\x1b[36m${text}\x1b[0m` };
const key = { up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D", enter: "\r", esc: "\x1b", home: "\x1b[H", end: "\x1b[F", pageUp: "\x1b[5~", pageDown: "\x1b[6~", thinking: "\x14", tools: "\x0f" };
const assistant = (content, extra = {}) => ({ role: "assistant", content: typeof content === "string" ? [{ type: "text", text: content }] : content, stopReason: "stop", timestamp: 1000, ...extra });
const final = (transcript, content, extra) => transcript.processEvent({ type: "message_end", message: assistant(content, extra) });
const delta = (transcript, type, contentIndex, fields = {}) => transcript.processEvent({ type: "message_update", assistantMessageEvent: { type, contentIndex, ...fields } });
const result = (text) => ({ content: [{ type: "text", text }] });
const item = (id, extra = {}) => ({ id, status: "running", task: `task ${id}`, model: "test/model", elapsed: 1200, approvalCount: 0, ...extra });

function fixture(options = {}) {
	const transcripts = new Map();
	let items = options.items ?? [item(1)];
	const selected = [], reviewed = [];
	let closed = 0, renders = 0;
	const tui = { terminal: { rows: options.rows ?? 30 }, requestRender: () => { renders++; } };
	const source = {
		list: () => items,
		transcript: (id) => {
			assert.ok(items.some((entry) => entry.id === id), "must not request a removed child");
			if (!transcripts.has(id)) transcripts.set(id, new SubagentTranscript(join(temporary, `missing-${id}.jsonl`)));
			return transcripts.get(id);
		},
		select: (id) => selected.push(id),
		reviewApproval: async (id) => { reviewed.push(id); await options.review?.(id); },
	};
	const view = new SubagentView(tui, theme, options.keys ?? keys, () => { closed++; }, source, options.initialId, options.lastSelectedId);
	return {
		view, tui, source, selected, reviewed,
		transcript: (id = 1) => source.transcript(id),
		setItems: (next) => { items = next; view.refresh(); },
		press: (name) => view.handleInput(key[name] ?? name),
		lines: (width = 120) => view.render(width),
		text: (width = 180) => stripVTControlCharacters(view.render(width).join("\n")),
		get closed() { return closed; },
		get renders() { return renders; },
	};
}

test("delta-only text and exposed thinking stay separate; signatures never render", () => {
	const f = fixture();
	const transcript = f.transcript();
	transcript.processEvent({ type: "message_start", message: assistant([], { stopReason: "pending" }) });
	delta(transcript, "thinking_start", 0);
	delta(transcript, "thinking_delta", 0, { delta: "Visible reasoning." });
	delta(transcript, "thinking_end", 0, { content: "Authoritative reasoning.", thinkingSignature: "SECRET_SIGNATURE" });
	delta(transcript, "text_start", 1);
	delta(transcript, "text_delta", 1, { delta: "Public " });
	delta(transcript, "text_delta", 1, { delta: "answer." });
	f.view.refresh();
	assert.match(f.text(), /Public answer/);
	assert.doesNotMatch(f.text(), /Visible reasoning|Authoritative reasoning|SECRET_SIGNATURE/);
	f.press("thinking");
	assert.match(f.text(), /Authoritative reasoning/);
	assert.doesNotMatch(f.text(), /Visible reasoning|SECRET_SIGNATURE/);
	final(transcript, [
		{ type: "thinking", thinking: "Final reasoning.", thinkingSignature: "SECRET_SIGNATURE" },
		{ type: "thinking", thinking: "", redacted: true, thinkingSignature: "ENCRYPTED_PAYLOAD" },
		{ type: "text", text: "Final answer.", textSignature: "TEXT_SIGNATURE" },
	]);
	assert.match(f.text(), /Final reasoning/);
	assert.match(f.text(), /Final answer/);
	assert.doesNotMatch(f.text(), /Public answer|Authoritative reasoning|SIGNATURE|ENCRYPTED_PAYLOAD/);
	f.press("thinking");
	assert.doesNotMatch(f.text(), /Final reasoning/);
});

test("block ends and message_end replace previews without duplicating earlier turns", () => {
	const f = fixture();
	const transcript = f.transcript();
	final(transcript, "Previous turn.");
	delta(transcript, "text_delta", 0, { delta: "interim" });
	delta(transcript, "text_end", 0, { content: "block final" });
	assert.match(f.text(), /block final/);
	assert.doesNotMatch(f.text(), /interim/);
	final(transcript, "Authoritative final.");
	final(transcript, "Continuation.");
	const text = f.text();
	for (const phrase of ["Previous turn.", "Authoritative final.", "Continuation."]) assert.equal(text.split(phrase).length - 1, 1);
	assert.doesNotMatch(text, /interim|block final/);
});

test("contentIndex keeps interleaved and initially sparse blocks in place", () => {
	const f = fixture();
	const transcript = f.transcript();
	delta(transcript, "text_delta", 2, { delta: "third block" });
	delta(transcript, "thinking_delta", 1, { delta: "middle reasoning" });
	delta(transcript, "text_delta", 0, { delta: "first block" });
	assert.match(f.text(), /first block[\s\S]*third block/);
	assert.doesNotMatch(f.text(), /middle reasoning/);
	f.press("thinking");
	assert.match(f.text(), /first block[\s\S]*middle reasoning[\s\S]*third block/);
	assert.match(f.text(), /1s/);
});

test("SDK cumulative snapshots are not appended again as deltas", () => {
	const f = fixture();
	const transcript = f.transcript();
	transcript.processEvent({ type: "message_update", message: assistant("one"), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "one" } });
	transcript.processEvent({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: " two", partial: assistant("one two") } });
	assert.match(f.text(), /one two/);
	assert.doesNotMatch(f.text(), /oneone|two two/);
	final(transcript, "one two");
	assert.equal(f.text().split("one two").length - 1, 1);
});

test("tool calls reconstruct indexed arguments and correlate replacing live results", () => {
	const f = fixture({ rows: 60 });
	const transcript = f.transcript();
	delta(transcript, "toolcall_start", 0, { id: "call-1", toolName: "bash" });
	delta(transcript, "toolcall_delta", 0, { delta: '{"command":"echo ' });
	delta(transcript, "toolcall_delta", 0, { delta: 'hello"}' });
	assert.match(f.text(), /echo hello/);
	delta(transcript, "toolcall_end", 0, { toolCall: { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "echo authoritative" }, thoughtSignature: "TOOL_SIGNATURE" } });
	final(transcript, [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "echo authoritative" } }], { stopReason: "toolUse" });
	transcript.processEvent({ type: "tool_execution_start", toolCallId: "call-1", toolName: "bash", args: { command: "echo authoritative" } });
	transcript.processEvent({ type: "tool_execution_start", toolCallId: "call-2", toolName: "read", args: { path: "file" } });
	transcript.processEvent({ type: "tool_execution_update", toolCallId: "call-1", partialResult: result("stale partial") });
	assert.match(f.text(), /stale partial/);
	transcript.processEvent({ type: "tool_execution_update", toolCallId: "call-1", partialResult: result("latest partial") });
	transcript.processEvent({ type: "tool_execution_update", toolCallId: "call-2", partialResult: result("other tool") });
	assert.match(f.text(), /latest partial/);
	assert.match(f.text(), /other tool/);
	assert.doesNotMatch(f.text(), /stale partial|TOOL_SIGNATURE|echo hello/);
	transcript.processEvent({ type: "tool_execution_end", toolCallId: "call-1", result: result("completed output"), isError: false, durationMs: 20 });
	transcript.processEvent({ type: "message_end", message: { role: "toolResult", toolCallId: "call-1", toolName: "bash", ...result("completed output") } });
	const text = f.text();
	assert.equal(text.split("completed output").length - 1, 1);
	assert.equal(text.split("echo authoritative").length - 1, 1);
	assert.doesNotMatch(text, /latest partial/);
});

test("Ctrl+O expands native tool output and retains live updates", () => {
	const f = fixture({ rows: 80 });
	const transcript = f.transcript();
	const output = Array.from({ length: 25 }, (_, index) => `output-${String(index).padStart(2, "0")}`).join("\n");
	transcript.processEvent({ type: "tool_execution_update", toolCallId: "call", toolName: "read", args: {}, partialResult: result(output) });
	assert.match(f.text(), /output-00/);
	assert.doesNotMatch(f.text(), /output-24/);
	f.press("tools");
	assert.match(f.text(), /output-24/);
	f.press("tools");
	assert.doesNotMatch(f.text(), /output-24/);
});

test("session history retains raw pre-compaction turns on the active branch without writing", () => {
	const path = join(temporary, "history.jsonl");
	const header = { type: "session", version: 3, id: "child", cwd: temporary, timestamp: "2026-01-01T00:00:00Z" };
	const entries = [header,
		{ type: "message", id: "u", parentId: null, message: { role: "user", content: "Original task.", timestamp: 1 } },
		{ type: "message", id: "a", parentId: "u", message: assistant("Before compaction.") },
		{ type: "message", id: "abandoned", parentId: "a", message: assistant("Abandoned branch.") },
		{ type: "compaction", id: "compact", parentId: "a", summary: "Summary only.", firstKeptEntryId: "compact", tokensBefore: 100 },
		{ type: "context_edit", id: "edit", parentId: "compact", targetId: "a", replacement: null },
		{ type: "message", id: "later", parentId: "edit", message: assistant("After compaction.") },
	];
	const original = entries.map((entry) => JSON.stringify(entry)).join("\n") + '\n{"type":"message"';
	writeFileSync(path, original);
	const before = statSync(path);
	const files = readdirSync(temporary);
	const transcript = new SubagentTranscript(path);
	const f = fixture({ rows: 60 });
	f.source.transcript = () => transcript;
	final(transcript, "New continuation.");
	assert.match(f.text(), /Original task/);
	assert.match(f.text(), /Before compaction/);
	assert.match(f.text(), /After compaction/);
	assert.match(f.text(), /New continuation/);
	assert.doesNotMatch(f.text(), /Abandoned branch/);
	assert.equal(readFileSync(path, "utf8"), original);
	assert.equal(statSync(path).mtimeMs, before.mtimeMs);
	assert.deepEqual(readdirSync(temporary), files);
});

test("legacy sessions migrate in memory only; missing and empty files remain untouched", () => {
	const path = join(temporary, "legacy.jsonl");
	const original = [
		{ type: "session", version: 1, id: "legacy", cwd: temporary },
		{ type: "message", message: { role: "user", content: "Legacy task." } },
		{ type: "message", message: assistant("Legacy answer.") },
	].map((entry) => JSON.stringify(entry)).join("\n");
	writeFileSync(path, original);
	const f = fixture();
	f.source.transcript = () => new SubagentTranscript(path);
	assert.match(f.text(), /Legacy answer/);
	assert.equal(readFileSync(path, "utf8"), original);
	const missing = join(temporary, "does-not-exist", "session.jsonl");
	assert.doesNotThrow(() => new SubagentTranscript(missing));
	assert.equal(existsSync(missing), false);
	const empty = join(temporary, "empty.jsonl");
	writeFileSync(empty, "");
	new SubagentTranscript(empty);
	assert.equal(readFileSync(empty, "utf8"), "");
});

test("Esc closes exactly once and never cancels agents or approvals", () => {
	const f = fixture({ items: [item(1, { approvalCount: 1 })] });
	final(f.transcript(), "Still running.");
	f.press("esc");
	f.press("esc");
	f.view.close();
	f.view.dispose();
	f.view.dispose();
	f.press("a");
	assert.equal(f.closed, 1);
	assert.deepEqual(f.reviewed, []);
	assert.equal(f.source.list()[0].status, "running");
	assert.equal(f.source.list()[0].approvalCount, 1);
	final(f.transcript(), "Child continues after viewer closes.");
});

test("dispose does not call done or act on children", () => {
	const f = fixture();
	f.view.dispose();
	f.press("esc");
	f.view.refresh();
	assert.equal(f.closed, 0);
	assert.equal(f.source.list().length, 1);
});

test("picker remembers selection, direct entry bypasses it, and arrows switch agents", () => {
	const items = [item(1), item(2), item(3)];
	const f = fixture({ items, lastSelectedId: 2 });
	assert.match(f.text(), /> #2/);
	f.press("down");
	assert.match(f.text(), /> #3/);
	f.press("up");
	f.press("enter");
	assert.deepEqual(f.selected, [2]);
	assert.match(f.text(), /#2.*LIVE/);
	f.press("right");
	assert.match(f.text(), /#3.*LIVE/);
	f.press("right");
	assert.match(f.text(), /#1.*LIVE/);
	f.press("left");
	assert.match(f.text(), /#3.*LIVE/);
	const direct = fixture({ items, initialId: 2, lastSelectedId: 1 });
	assert.deepEqual(direct.selected, [2]);
	assert.doesNotMatch(direct.text(), /Enter view/);
	const single = fixture();
	assert.deepEqual(single.selected, [1]);
});

test("picker honors injected keybindings and keeps a long selection list in bounds", () => {
	const customKeys = { matches: (data, action) => ({ "tui.select.up": "k", "tui.select.down": "j", "tui.select.confirm": "v", "tui.select.cancel": "q" })[action] === data };
	const f = fixture({ items: Array.from({ length: 40 }, (_, index) => item(index + 1)), keys: customKeys, rows: 6 });
	for (let index = 0; index < 30; index++) f.press("j");
	assert.match(f.text(), /> #31/);
	assert.ok(f.lines().length <= 6);
	f.press("v");
	assert.deepEqual(f.selected, [31]);
	f.press("q");
	assert.equal(f.closed, 1);
});

test("follow, line/page scrolling, End and refresh preserve the intended viewport", () => {
	const f = fixture({ rows: 10 });
	const transcript = f.transcript();
	for (let index = 0; index < 30; index++) transcript.addNotice(`line-${String(index).padStart(2, "0")}`);
	assert.match(f.text(), /line-29/);
	f.press("up");
	const scrolled = f.text();
	assert.doesNotMatch(scrolled, /line-29/);
	assert.match(scrolled, /End: live/);
	transcript.addNotice("line-30");
	f.view.refresh();
	assert.equal(f.text(), scrolled);
	f.press("pageUp");
	const paged = f.text();
	assert.notEqual(paged, scrolled);
	f.press("pageDown");
	assert.equal(f.text(), scrolled);
	f.press("down");
	assert.match(f.text(), /line-29/);
	f.press("end");
	assert.match(f.text(), /LIVE/);
	assert.match(f.text(), /line-30/);
	transcript.addNotice("line-31");
	f.view.refresh();
	assert.match(f.text(), /line-31/);
	f.press("home");
	assert.match(f.text(), /line-00/);
	f.tui.terminal.rows = 6;
	assert.match(f.text(), /Read-only · Esc back/);
	assert.ok(f.lines().length <= 6);
});

test("removal returns to a safe picker or empty screen", () => {
	const f = fixture({ items: [item(1), item(2)], initialId: 1 });
	f.setItems([item(2)]);
	assert.match(f.text(), /Enter view/);
	f.press("enter");
	assert.match(f.text(), /#2.*LIVE/);
	f.setItems([]);
	assert.match(f.text(), /No subagents/);
	assert.doesNotThrow(() => { f.press("enter"); f.press("right"); });
	assert.equal(f.closed, 0);
});

test("approval callback leaves underlying viewer stable and catches rejection", async () => {
	let reject;
	const f = fixture({ rows: 8, items: [item(1, { approvalCount: 1 })], review: () => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }) });
	for (let index = 0; index < 25; index++) f.transcript().addNotice(`row ${index}`);
	f.text();
	f.press("up");
	const before = f.text();
	f.press("a");
	f.press("a");
	assert.deepEqual(f.reviewed, [1]);
	assert.equal(f.text(), before);
	assert.equal(f.closed, 0);
	reject(new Error("approval unavailable"));
	await new Promise((resolve) => setImmediate(resolve));
	assert.match(f.text(), /Approval review failed: Error: approval unavailable/);
	assert.match(f.text(), /End: live/);
	assert.equal(f.closed, 0);
	assert.equal(f.source.list()[0].approvalCount, 1);
});

test("successful approval review permits live refresh without resetting scroll or toggles", async () => {
	let finish;
	const f = fixture({ rows: 12, items: [item(1, { approvalCount: 1 })], review: () => new Promise((resolve) => { finish = resolve; }) });
	final(f.transcript(), [{ type: "thinking", thinking: "Exposed earlier reasoning." }, { type: "text", text: "Earlier answer." }]);
	for (let index = 0; index < 30; index++) f.transcript().addNotice(`old row ${index}`);
	f.press("thinking");
	f.text();
	f.press("home");
	const before = f.text();
	f.press("a");
	f.transcript().addNotice("New output while nested approval overlay is open.");
	f.view.refresh();
	assert.equal(f.text(), before);
	finish();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(f.text(), before);
	assert.match(f.text(), /Exposed earlier reasoning/);
	assert.equal(f.closed, 0);
	f.press("end");
	assert.match(f.text(), /New output while nested approval overlay is open/);
});

test("approval completion after close/dispose cannot revive the overlay", async () => {
	let resolve;
	const f = fixture({ items: [item(1, { approvalCount: 1 })], review: () => new Promise((resolvePromise) => { resolve = resolvePromise; }) });
	f.press("a");
	f.press("esc");
	f.view.dispose();
	const renders = f.renders;
	resolve();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(f.renders, renders);
	assert.equal(f.closed, 1);
});

test("native rendering is bounded at narrow widths with ANSI, wide and combining characters", () => {
	const f = fixture({ items: [item(1, { task: "中文 👨‍👩‍👧‍👦 e\u0301 \x1b[31mred\x1b[0m\nnew line" })], rows: 20 });
	final(f.transcript(), [
		{ type: "thinking", thinking: "中文 exposed reasoning" },
		{ type: "text", text: "# Heading\n\n中文 👨‍👩‍👧‍👦 e\u0301\n\n```ts\nconst value = 'long long long';\n```" },
	]);
	f.transcript().processEvent({ type: "tool_execution_update", toolCallId: "wide", toolName: "bash", args: { command: "中文" }, partialResult: result("\x1b[31m中文 👨‍👩‍👧‍👦\x1b[0m") });
	f.press("thinking");
	f.press("tools");
	for (const width of [0, 1, 2, 3, 5, 10, 24, 80]) {
		const lines = f.lines(width);
		assert.ok(lines.length <= f.tui.terminal.rows);
		for (const line of lines) {
			assert.ok(visibleWidth(line) <= width, `width ${width}: ${JSON.stringify(line)}`);
			assert.doesNotMatch(line, /[\r\n]/);
		}
	}
	for (const rows of [1, 2, 3]) {
		f.tui.terminal.rows = rows;
		assert.ok(f.lines().length <= rows);
		assert.match(stripVTControlCharacters(f.lines()[0]), /Read-only · Esc back/);
	}
});
