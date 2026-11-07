import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { host, loadExtensions } from "./helpers/pi-host.mjs";

// Resolve TUI and dialog code from the same installation as the extension host.
const packageUrl = new URL("../", import.meta.resolve("@earendil-works/pi-coding-agent"));
const { InteractiveMode } = await import(new URL("dist/modes/interactive/interactive-mode.js", packageUrl));
const { TuiMainScreen } = await import(new URL("../pi-tui/dist/tui-main-screen.js", packageUrl));
const { Container, Text, getKeybindings } = await import(new URL("../pi-tui/dist/index.js", packageUrl));
host.initTheme("dark", false);

const keys = { enter: "\r", esc: "\x1b", down: "\x1b[B" };
const parentTitle = "PARENT_PERMISSION: run unknown-parent-command?";
const permission = {
	type: "extension_ui_request", method: "select", id: "child-permission",
	title: "CHILD_PERMISSION: run unknown-child-command?\n" +
		Array.from({ length: 40 }, (_, index) => `Child command detail ${index}`).join("\n"),
	options: ["Yes, just this once", "No"],
};
const flushUi = () => new Promise(resolve => setImmediate(resolve));
const testTimeout = 5000; // Bound failures where a broken close leaves a dialog pending.

async function fixture(t) {
	// Keep child processes and session files local to this test.
	const agentDir = mkdtempSync(join(tmpdir(), "pi-subagent-focus-"));
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const children = [], parentDialogs = [], messages = [];
	let extension, ctx;
	const spawnMock = t.mock.method(childProcess, "spawn", () => {
		const child = new EventEmitter();
		Object.assign(child, {
			stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
			records: [], signals: [],
		});
		child.stdin.setEncoding("utf8");
		child.stdin.on("data", chunk => {
			for (const line of chunk.trim().split("\n")) {
				const record = JSON.parse(line);
				child.records.push(record);
				if (record.type === "get_state") {
					child.stdout.write(JSON.stringify({ type: "response", command: "get_state", id: record.id, success: true }) + "\n");
				}
			}
		});
		child.kill = signal => {
			child.signals.push(signal);
			child.emit("close", null, signal);
			return true;
		};
		children.push(child);
		return child;
	});
	syncBuiltinESMExports();
	t.after(async () => {
		try {
			for (const handler of extension?.handlers.get("session_shutdown") ?? []) await handler({}, ctx);
			for (const dialog of parentDialogs) dialog.controller.abort();
			await flushUi();
		} finally {
			for (const child of children) child.emit("close", null, "SIGTERM");
			spawnMock.mock.restore();
			syncBuiltinESMExports();
			if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousDir;
			rmSync(agentDir, { recursive: true, force: true });
		}
	});

	// Use real focus, input listeners, overlay compositing, and native selectors.
	const terminal = {
		columns: 120, rows: 24, // A normal terminal with enough room for both dialogs.
		write() {}, hideCursor() {}, showCursor() {},
	};
	const ui = new TuiMainScreen(terminal);
	ui.stopped = true; // Tests advance real rendering explicitly, without timers or a TTY.
	const editorKeys = [];
	const editor = new Text("MAIN_SESSION_EDITOR", 0, 0);
	editor.getText = () => "";
	editor.handleInput = data => editorKeys.push(data);
	const mode = Object.assign(Object.create(InteractiveMode.prototype), {
		ui, editor, editorContainer: new Container(), extensionDialogs: [],
		extensionTerminalInputSubscriptions: new Set(), keybindings: getKeybindings(),
		programStatus: { setBlocked() {} },
		disposeActiveSelector() {}, showExtensionNotify() {}, setExtensionWidget() {},
	});
	mode.editorContainer.addChild(editor);
	ui.addChild(new Text("MAIN_SESSION_TRANSCRIPT", 0, 0));
	ui.addChild(mode.editorContainer);
	ui.setFocus(editor);
	const paintedText = () => stripVTControlCharacters(ui.captureRenderState().previousLines.slice(-terminal.rows).join("\n"));
	const render = () => {
		ui.stopped = false;
		try { ui.renderNow(); } finally { ui.stopped = true; }
		return paintedText();
	};

	// Load the production extension; only subprocess creation is mocked.
	const runtime = host.createExtensionRuntime();
	Object.assign(runtime, {
		getThinkingLevel: () => "low",
		appendEntry: () => runtime.assertActive(),
		sendMessage: message => { runtime.assertActive(); messages.push(message); },
	});
	const loaded = await loadExtensions([
		fileURLToPath(new URL("../extensions/subagent-widget.ts", import.meta.url)),
	], agentDir, undefined, runtime);
	assert.deepEqual(loaded.errors, []);
	extension = loaded.extensions[0];
	ctx = {
		cwd: agentDir, mode: "tui", hasUI: true,
		model: { provider: "test", id: "model" },
		modelRegistry: { find: () => ({ contextWindow: 32000 }) },
		ui: mode.createExtensionUIContext(),
	};
	const command = (name, args = "") => extension.commands.get(name).handler(args, ctx);
	await command("sub", "Inspect this child without changing it.");
	const child = children[0];
	const emit = event => child.stdout.write(JSON.stringify(event) + "\n");
	emit({ type: "message_end", message: {
		role: "assistant", stopReason: "stop",
		content: [{ type: "text", text: Array.from({ length: 40 }, (_, index) => `CHILD_TRANSCRIPT ${index}`).join("\n\n") }],
	} });
	emit(permission);
	const replies = () => child.records.filter(record => record.type === "extension_ui_response");
	const untouched = () => {
		assert.deepEqual(child.signals, [], "inspection must not cancel the child");
		assert.deepEqual(replies(), [], "closing overlays must leave child permission queued");
		assert.deepEqual(messages, [], "inspection must not deliver a child result");
	};
	const press = name => ui.handleTerminalInput(keys[name] ?? name);

	return {
		ui, editor, editorKeys, command, press, render, paintedText, replies, untouched,
		async open(nested) {
			const viewing = extension.shortcuts.get("alt+down").handler(ctx);
			await flushUi();
			assert.match(render(), /Read-only · Esc back/);
			assert.match(paintedText(), /CHILD_TRANSCRIPT/);
			if (nested) {
				press("a");
				await flushUi();
				assert.match(render(), /Subagent permission · Esc back/);
				assert.match(paintedText(), /CHILD_PERMISSION/);
				await flushUi();
			}
			return { viewing };
		},
		parentApproval() {
			const dialog = { controller: new AbortController(), settled: false, value: undefined };
			dialog.promise = ctx.ui.select(parentTitle, ["Yes, just this once", "No"], { signal: dialog.controller.signal });
			dialog.selector = ui.getFocusedComponent();
			dialog.promise.then(value => { dialog.settled = true; dialog.value = value; });
			parentDialogs.push(dialog);
			return dialog;
		},
	};
}

for (const nested of [false, true]) {
	const screenName = nested ? "viewer plus nested child approval" : "viewer";

	test(`${screenName}: Enter before a render cannot approve a hidden parent command`, { timeout: testTimeout }, async t => {
		const f = await fixture(t);
		const { viewing } = await f.open(nested);
		const parent = f.parentApproval();
		assert.doesNotMatch(f.paintedText(), /PARENT_PERMISSION/, "the old frame still covers the new parent dialog");

		// Input can arrive before the next frame exposes the parent selector.
		f.press("enter");
		await flushUi();
		assert.equal(parent.settled, false, "first Enter must be consumed, not approve the unseen parent command");
		assert.match(f.render(), /PARENT_PERMISSION/);
		await flushUi();
		assert.equal(f.ui.hasOverlayEntries, false, "both owned overlays must close after losing focus");
		assert.equal(f.ui.getFocusedComponent(), parent.selector, "closing owned overlays must not steal parent focus");
		await viewing;
		f.untouched();

		// Only fresh input, after the parent command is visible, may approve it.
		f.press("enter");
		await flushUi();
		assert.equal(parent.value, "Yes, just this once");
		assert.equal(f.ui.getFocusedComponent(), f.editor);
		f.untouched();

		// The queued child request remains reviewable; no old listener eats Enter.
		const reviewing = f.command("subapprove");
		await flushUi();
		assert.match(f.render(), /CHILD_PERMISSION/);
		f.press("enter");
		await reviewing;
		assert.deepEqual(f.replies(), [{ type: "extension_ui_response", id: permission.id, value: "No" }]);
	});

	test(`${screenName}: a render exposes a new parent selector without stealing its focus`, { timeout: testTimeout }, async t => {
		const f = await fixture(t);
		const { viewing } = await f.open(nested);
		const parent = f.parentApproval();

		// Visibility must change in this frame; closing waits until rendering ends.
		const screen = f.render();
		assert.match(screen, /PARENT_PERMISSION/, "parent command must not stay behind an unfocused overlay");
		assert.doesNotMatch(screen, /Read-only · Esc back|Subagent permission · Esc back/);
		await flushUi();
		assert.equal(f.ui.hasOverlayEntries, false);
		assert.equal(f.ui.getFocusedComponent(), parent.selector);
		assert.equal(parent.settled, false);
		await viewing;
		f.untouched();

		f.press("down");
		f.press("enter");
		await flushUi();
		assert.equal(parent.value, "No", "visible parent selector must accept explicit input normally");
		assert.equal(f.ui.getFocusedComponent(), f.editor);
		f.untouched();
	});
}

test("nested child approval keeps its viewer alive; Esc backs out without cancelling either child or request", { timeout: testTimeout }, async t => {
	const f = await fixture(t);
	const { viewing } = await f.open(true);
	assert.match(f.render(), /Subagent permission · Esc back/);
	await flushUi();
	assert.match(f.render(), /Subagent permission · Esc back/, "own nested focus must not dismiss the overlay group");

	f.press("esc");
	await flushUi();
	assert.match(f.render(), /Read-only · Esc back/);
	assert.match(f.paintedText(), /CHILD_TRANSCRIPT/);
	assert.notEqual(f.ui.getFocusedComponent(), f.editor);
	f.untouched();

	f.press("esc");
	await viewing;
	await flushUi();
	assert.equal(f.ui.hasOverlayEntries, false);
	assert.equal(f.ui.getFocusedComponent(), f.editor);
	assert.match(f.render(), /MAIN_SESSION_EDITOR/);
	f.untouched();
	f.press("enter");
	assert.deepEqual(f.editorKeys, [keys.enter], "closed overlay group must release its input listener");
});
