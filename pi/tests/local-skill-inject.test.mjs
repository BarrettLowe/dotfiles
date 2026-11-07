import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { host, loadExtensions } from "./helpers/pi-host.mjs";
import { estimateTokens } from "../manual-extensions/local-model-support/shared.ts";

const extensionPath = fileURLToPath(new URL("../manual-extensions/local-model-support/skill-inject.ts", import.meta.url));
const local = { provider: "llama.cpp", id: "ornith_1.5", maxTokens: 4096, input: ["text"] };
const names = ["read", "edit", "write", "bash", "grep", "find"];
const definitions = Object.fromEntries(names.map(name => [name,
	host[`create${name[0].toUpperCase()}${name.slice(1)}ToolDefinition`](process.cwd()),
]));

async function fixture(t, activeTools = names) {
	const cwd = mkdtempSync(join(tmpdir(), "pi-skill-inject-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	let active = activeTools;
	const forbidden = () => assert.fail("guidance must not queue messages, alter tools/settings or use UI");
	const runtime = host.createExtensionRuntime();
	Object.assign(runtime, {
		getActiveTools: () => active,
		getAllTools: () => [...Object.values(definitions), { name: "run_implementation" }],
		setActiveTools: forbidden, sendMessage: forbidden, sendUserMessage: forbidden,
		setThinkingLevel: forbidden, appendEntry: forbidden,
	});
	const loaded = await loadExtensions([extensionPath], cwd, undefined, runtime);
	assert.deepEqual(loaded.errors, []);
	const extension = loaded.extensions[0];
	const ctx = { cwd, model: local, hasUI: false, ui: { notify: forbidden }, abort: forbidden };
	const emit = async (name, event = {}, context = ctx) => {
		const handlers = extension.handlers.get(name) ?? [];
		assert.equal(handlers.length, 1, `1 ${name} handler`);
		return handlers[0]({ type: name, ...event }, context);
	};
	const prompt = async text => {
		const event = { type: "before_agent_start", prompt: text, systemPrompt: "unchanged prefix", systemPromptOptions: { sections: { user: "unchanged" } } };
		const original = structuredClone(event);
		const result = await emit("before_agent_start", event);
		assert.deepEqual(event, original);
		if (result) {
			assert.deepEqual(Object.keys(result), ["message"]);
			assert.equal(result.message.customType, "local-tool-guidance");
			assert.equal(result.message.display, false);
			assert.ok(estimateTokens(result.message.content) <= Math.min(450, ctx.model.maxTokens));
		}
		return result?.message.content;
	};
	const toolEvent = (name, isError = false, text = "success") => ({
		type: "tool_result", toolName: name, toolCallId: `${name}-1`, input: {},
		content: [{ type: "text", text }], details: { retained: true }, isError,
	});
	await emit("session_start");
	return { extension, ctx, runtime, cwd, emit, prompt, toolEvent, setActive: tools => { active = tools; } };
}

test("standalone factory adds only lifecycle guidance, never tools or commands", async t => {
	const f = await fixture(t);
	assert.equal(f.extension.tools.size, 0);
	assert.equal(f.extension.commands.size, 0);
	assert.deepEqual([...f.extension.handlers.keys()].sort(), ["before_agent_start", "model_select", "session_start", "tool_result"]);
});

test("cards describe installed Pi schemas, including original-file edit arrays", async t => {
	const required = { read: ["path"], edit: ["path", "edits"], write: ["path", "content"], bash: ["command"], grep: ["pattern"], find: ["pattern"] };
	for (const name of names) {
		assert.deepEqual(definitions[name].parameters.required, required[name]);
		const f = await fixture(t, [name]);
		const text = await f.prompt(`Use ${name} to ${name === "find" ? "locate files" : name} this file`);
		assert.match(text, new RegExp(`^${name}:`, "m"));
		for (const property of Object.keys(definitions[name].parameters.properties)) assert.ok(text.includes(property), `${name}.${property}`);
	}
	assert.match(definitions.read.parameters.properties.offset.description, /1-indexed/);
	assert.deepEqual(definitions.edit.parameters.properties.edits.items.required, ["oldText", "newText"]);
	const f = await fixture(t);
	const text = await f.prompt("Edit this file and run tests");
	assert.match(text, /exact, unique oldText/);
	assert.match(text, /original file; keep them nonoverlapping/);
	assert.match(text, /re-read only the relevant range/i);
	assert.match(text, /timeout is seconds, with no default/);
	assert.match(text, /Existing permissions still apply/);
	assert.doesNotMatch(text, /whitelist|allow-list|cat|sed\b|ShellStart|Browser|EvidenceAdd|glob:/i);
});

test("read uses 1-indexed ranges and real source prefixes are not replacement text", async t => {
	const f = await fixture(t, ["read"]);
	const path = join(f.cwd, "source.ts");
	writeFileSync(path, "// Copyright 2026 Example\n\nconst first = 1;\nconst second = 2;\n");
	const result = await definitions.read.execute("read-1", { path, offset: 3, limit: 1 }, undefined, undefined, f.ctx);
	assert.match(result.content[0].text, /^const first = 1;/);
	const loaded = await loadExtensions([
		fileURLToPath(new URL("../extensions/strip-license-header-read.ts", import.meta.url)),
	], f.cwd, undefined, host.createExtensionRuntime());
	assert.deepEqual(loaded.errors, []);
	const read = loaded.extensions[0].tools.get("read").definition;
	const oldDisable = process.env.PI_READ_STRIP_HEADER_DISABLE;
	delete process.env.PI_READ_STRIP_HEADER_DISABLE;
	t.after(() => {
		if (oldDisable === undefined) delete process.env.PI_READ_STRIP_HEADER_DISABLE;
		else process.env.PI_READ_STRIP_HEADER_DISABLE = oldDisable;
	});
	const numbered = await read.execute("numbered", { path, offset: 3, limit: 1 }, undefined, undefined, f.ctx);
	assert.match(numbered.content[0].text, /^3: const first = 1;/);
	const text = await f.prompt("Read this file");
	assert.match(text, /offset is 1-indexed \(default 1\)/);
	assert.match(text, /Real on-disk line prefixes/);
	assert.match(text, /metadata, not file content/);
	assert.doesNotMatch(text, /0-indexed|tab-separated|absolute paths only/);
});

test("only active tools are named, even when every built-in is registered but inactive for Chief", async t => {
	for (const active of [[], ["run_implementation"], ["read"], ["edit"], ["bash"], ["write"], ["grep"], ["find"]]) {
		const f = await fixture(t, active);
		const text = await f.prompt("Read, edit, write, create, run, search, grep, find and implement this file");
		if (!active.some(name => names.includes(name))) assert.equal(text, undefined);
		for (const name of names.filter(name => !active.includes(name))) {
			if (text) assert.doesNotMatch(text, new RegExp(`\\b${name}\\b`, "i"), `${name} inactive`);
			assert.equal(await f.emit("tool_result", f.toolEvent(name, true, "Could not find the exact text")), undefined);
		}
	}
});

test("tail additions stay bounded and each card is delivered once per session, not once per combination", async t => {
	const f = await fixture(t);
	const lines = new Set();
	let injected = 0;
	for (const prompt of ["Read this file", "Edit this file", "Run tests", "Create a file", "Search references", "Find files", "Read this file", "Edit this file"]) {
		const text = await f.prompt(prompt);
		if (!text) continue;
		injected++;
		for (const line of text.split("\n").slice(1)) {
			assert.ok(!lines.has(line), `duplicate guidance: ${line}`);
			lines.add(line);
		}
	}
	assert.ok(injected > 1);
	assert.equal(await f.prompt("Read this file"), undefined);
	await f.emit("session_start", { reason: "new" });
	assert.ok(await f.prompt("Read this file"));
});

test("a small advertised output budget bounds the whole message", async t => {
	for (const maxTokens of [32, 128, 256, 512]) {
		const f = await fixture(t);
		f.ctx.model = { ...local, maxTokens };
		await f.prompt("Implement this file, run tests, search and find files");
		const result = await f.emit("tool_result", f.toolEvent("edit", true, "Could not find the exact text"));
		if (result) assert.ok(estimateTokens(result.content.at(-1).text) <= maxTokens);
	}
});

test("last successful and failed tools select cards for a continuation, with failure first", async t => {
	const f = await fixture(t);
	assert.equal(await f.emit("tool_result", f.toolEvent("grep")), undefined);
	await f.emit("tool_result", f.toolEvent("read", true, "Offset 200 is beyond end of file (10 lines total)"));
	const text = await f.prompt("Continue");
	assert.match(text, /^read:/m);
	assert.match(text, /^grep:/m);
	assert.ok(text.indexOf("read:") < text.indexOf("grep:"));
	assert.equal(await f.prompt("Continue"), undefined);
});

test("real edit mismatch advice is immediate, range-scoped, and preserves useful error data", async t => {
	const f = await fixture(t);
	const path = join(f.cwd, "edit.ts");
	writeFileSync(path, "const value = 1;\n");
	let error;
	try {
		await definitions.edit.execute("bad", { path, edits: [{ oldText: "missing", newText: "changed" }] }, undefined, undefined, f.ctx);
	} catch (caught) { error = caught.message; }
	assert.match(error, /Could not find the exact text/);
	const event = { ...f.toolEvent("edit", true, error), structuredContent: { retained: "structured" } };
	const original = structuredClone(event);
	const result = await f.emit("tool_result", event);
	assert.deepEqual(event, original);
	assert.deepEqual(result.content.slice(0, -1), event.content);
	assert.deepEqual(result.structuredContent, event.structuredContent);
	assert.equal(result.isError, undefined, "original error status is unchanged");
	assert.equal(result.details, undefined, "original details stay in place");
	assert.match(result.content.at(-1).text, /Re-read only the relevant range.*1-indexed/);
	assert.match(result.content.at(-1).text, /original file; merge overlapping edits/);
	assert.doesNotMatch(result.content.at(-1).text, /read the whole file|use write/i);
	assert.equal(f.extension.handlers.has("turn_end"), false, "recovery never forces another model turn");
});

test("recovery distinguishes range errors from path/permission failures and names no inactive helper", async t => {
	const f = await fixture(t);
	const range = await f.emit("tool_result", f.toolEvent("read", true, "Offset 20 is beyond end of file (10 lines total)"));
	assert.match(range.content.at(-1).text, /1-indexed.*reported file length/);
	const missing = await f.emit("tool_result", f.toolEvent("read", true, "ENOENT: missing.ts"));
	assert.match(missing.content.at(-1).text, /path, arguments and permissions/);
	assert.doesNotMatch(missing.content.at(-1).text, /file length/);
	const shell = await f.emit("tool_result", { ...f.toolEvent("bash", true, "stderr\nCommand exited with code 2"), structuredContent: { exit_code: 2 } });
	assert.deepEqual(shell.structuredContent, { exit_code: 2 });
	assert.match(shell.content.at(-1).text, /stdout\/stderr and exit status/);
	f.setActive(["edit"]);
	const edit = await f.emit("tool_result", f.toolEvent("edit", true, "Found 2 occurrences of edits[0]"));
	assert.doesNotMatch(edit.content.at(-1).text, /\bread\b|\bwrite\b/i);
});

test("review, research and explanation never inherit mutation cards or force implementation/builds", async t => {
	for (const prompt of ["Review these code changes for a race", "Explain why this source needs a fix", "Research how to implement this feature; do not change code"]) {
		const f = await fixture(t);
		await f.emit("tool_result", f.toolEvent("write"));
		await f.emit("tool_result", f.toolEvent("edit", true, "Could not find the exact text"));
		const text = await f.prompt(prompt);
		assert.match(text, /Separate hypotheses from observed source/);
		assert.match(text, /verify callers and shared-state readers and writers/);
		assert.doesNotMatch(text, /^(edit|write|bash):/m);
		assert.doesNotMatch(text, /run relevant tests|commit to an implementation|research-first|Browser|Evidence/i);
	}
	const f = await fixture(t);
	const text = await f.prompt("Fix this source file");
	assert.match(text, /unrelated behavior stays unchanged.*tests\/builds/);
});

test("cloud and non-Ornith hooks are exact pass-throughs with no runtime calls", async t => {
	const f = await fixture(t);
	f.runtime.getActiveTools = () => assert.fail("unsupported models must not inspect the tool loadout");
	for (const model of [undefined, { provider: "openai", id: "ornith" }, { provider: "anthropic", id: "claude" }, { provider: "llama.cpp", id: "ornithology" }]) {
		const ctx = { ...f.ctx, model };
		for (const name of f.extension.handlers.keys()) {
			const event = { ...f.toolEvent("edit", true, "Could not find the exact text"), type: name, model, prompt: "Implement this file", systemPrompt: "original", systemPromptOptions: {} };
			const original = structuredClone(event);
			assert.equal(await f.emit(name, event, ctx), undefined);
			assert.deepEqual(event, original);
		}
	}
});

test("cloud-to-local switches discard tool signals without queued reminders or repeated cards", async t => {
	const f = await fixture(t);
	await f.prompt("Read this file");
	await f.emit("tool_result", f.toolEvent("edit", true, "Could not find the exact text"));
	const cloud = { provider: "openai", id: "cloud", maxTokens: 4096 };
	await f.emit("model_select", { model: cloud, previousModel: local }, { ...f.ctx, model: cloud });
	assert.equal(await f.emit("tool_result", f.toolEvent("write", true, "cloud failure"), { ...f.ctx, model: cloud }), undefined);
	await f.emit("model_select", { model: local, previousModel: cloud });
	assert.equal(await f.prompt("Continue"), undefined);
	assert.equal(await f.prompt("Read this file"), undefined);
	assert.ok(await f.prompt("Edit this file"));
});
