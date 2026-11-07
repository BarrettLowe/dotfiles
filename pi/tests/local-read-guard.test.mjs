import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { host, loadExtensions } from "./helpers/pi-host.mjs";
import { getReadTokenBudget, trimReadText } from "../manual-extensions/local-model-support/read-guard.ts";
import { estimateTokens, getOutputTokenBudget, OUTPUT_RESERVE_TOKENS } from "../manual-extensions/local-model-support/shared.ts";

const extensionPath = fileURLToPath(new URL("../manual-extensions/local-model-support/read-guard.ts", import.meta.url));
const model = { provider: "llama.cpp", id: "ornith", contextWindow: 32768, maxTokens: 8192 };
const oversized = "x".repeat(43) + "\n";
const largeRead = oversized.repeat(1000);
const usage = { contextWindow: 32768, tokens: 21700, percent: null };

function freeze(value) {
	if (value && typeof value === "object") {
		Object.freeze(value);
		for (const item of Object.values(value)) freeze(item);
	}
	return value;
}

function event(text = largeRead, changes = {}) {
	return freeze({
		type: "tool_result", toolName: "read", toolCallId: "read-1",
		input: { path: "unchanged/file.ts", offset: 1 },
		content: [{ type: "text", text }], details: { original: true },
		isError: false, ...changes,
	});
}

async function load(activeTools = ["read", "bash"]) {
	const runtime = host.createExtensionRuntime();
	runtime.getActiveTools = () => activeTools;
	const result = await loadExtensions([extensionPath], process.cwd(), undefined, runtime);
	assert.deepEqual(result.errors, []);
	assert.equal(result.extensions.length, 1);
	const extension = result.extensions[0];
	assert.equal(extension.tools.size, 0);
	assert.deepEqual([...extension.handlers.keys()], ["turn_start", "session_start", "model_select", "tool_result"]);
	const handler = extension.handlers.get("tool_result")[0];
	handler.lifecycle = async (type, ctx = context()) => {
		for (const callback of extension.handlers.get(type)) await callback({ type }, ctx);
	};
	return handler;
}

function context(changes = {}) {
	return { model, getContextUsage: () => usage, ...changes };
}

function assertFits(text, currentUsage = usage, currentModel = model) {
	assert.ok(estimateTokens(text) <= getReadTokenBudget(currentModel, currentUsage));
	if (typeof currentUsage?.tokens === "number" && Number.isFinite(currentUsage.tokens)) {
		assert.ok(currentUsage.tokens + estimateTokens(text) + getOutputTokenBudget(currentModel) + OUTPUT_RESERVE_TOKENS <= currentUsage.contextWindow);
	}
}

test("44k-character read fits 32k context with full response and overhead reserves", async () => {
	assert.equal(largeRead.length, 44000);
	assert.ok(usage.tokens + estimateTokens(largeRead) > model.contextWindow);
	const handler = await load();
	const original = event();
	const copy = structuredClone(original);
	const replacement = await handler(original, context());
	assertFits(replacement.content[0].text);
	assert.match(replacement.content[0].text, /Read trimmed for context/);
	assert.ok(replacement.content[0].text.split("\n").length > 30);
	assert.deepEqual(original, copy);
	assert.notEqual(replacement.content, original.content);
});

test("reserves headroom even if the untrimmed read itself would fit", async () => {
	const handler = await load();
	const currentUsage = { ...usage, tokens: 25000 };
	const text = "small line\n".repeat(1000);
	assert.ok(currentUsage.tokens + estimateTokens(text) < 32768);
	const replacement = await handler(event(text), context({ getContextUsage: () => currentUsage }));
	assertFits(replacement.content[0].text, currentUsage);
});

test("moderate files and targeted ranges that fit are exact no-ops", async () => {
	const handler = await load();
	for (const input of [{ path: "a" }, { path: "a", offset: 400, limit: 80 }]) {
		const original = event("source line\n".repeat(80), { input });
		assert.equal(await handler(original, context()), undefined);
	}
});

test("plain requested offsets are preserved, not reported as first file lines", async () => {
	const handler = await load();
	const replacement = await handler(event(largeRead, { input: { path: "a", offset: 401, limit: 1000 } }), context());
	const text = replacement.content[0].text;
	const source = text.split("\n\n[Read trimmed")[0];
	const count = source.split("\n").length;
	assert.equal(source, Array(count).fill("x".repeat(43)).join("\n"));
	assert.match(text, new RegExp(`segment shown through line ${400 + count}`));
	assert.match(text, new RegExp(`read offset=${401 + count},`));
	assert.doesNotMatch(text, /first .*lines/);
	assertFits(text);
});

test("actual numbered lines and stripped-header ranges survive unchanged", async () => {
	const handler = await load();
	const marker = "1-46: [read: 45-line license/copyright header omitted by read tool]";
	const lines = Array.from({ length: 800 }, (_, i) => `${i + 47}: ${"code".repeat(20)}`);
	const original = event([marker, ...lines].join("\n"));
	const text = (await handler(original, context())).content[0].text;
	const shown = text.split("\n\n[Read trimmed")[0].split("\n");
	assert.equal(shown[0], marker);
	assert.deepEqual(shown.slice(1), lines.slice(0, shown.length - 1));
	assert.match(text, new RegExp(`read offset=${46 + shown.length},`));
	assertFits(text);
});

test("numbered offset segment keeps its actual labels and discards stale core trailer", async () => {
	const handler = await load();
	const lines = Array.from({ length: 900 }, (_, i) => `${701 + i}: ${"z".repeat(50)}`);
	for (const trailer of [
		"[Showing lines 701-1600 of 3000. Use offset=1601 to continue.]",
		"[1400 more lines in file. Use offset=1601 to continue.]",
	]) {
		await handler.lifecycle("turn_start");
		const text = (await handler(event(lines.join("\n") + "\n\n" + trailer, {
			input: { path: "a", offset: 701, limit: 900 },
		}), context())).content[0].text;
		const shown = text.split("\n\n[Read trimmed")[0].split("\n");
		assert.deepEqual(shown, lines.slice(0, shown.length));
		assert.match(text, new RegExp(`offset=${701 + shown.length},`));
		assert.doesNotMatch(text, /offset=1601/);
		assertFits(text);
	}
});

test("unknown usage falls back to a quarter of usable window, not an unlimited result", async () => {
	const handler = await load();
	for (const currentUsage of [undefined, { ...usage, tokens: null }, { ...usage, tokens: NaN }]) {
		await handler.lifecycle("turn_start");
		const text = (await handler(event(), context({ getContextUsage: () => currentUsage }))).content[0].text;
		assertFits(text, currentUsage ?? { ...usage, tokens: null });
		assert.ok(text.length < largeRead.length);
		assert.ok(text.split("\n").length > 30);
	}
	assert.equal(getReadTokenBudget({}, undefined), (32768 - 4096 - 1024) / 4);
	assert.equal(getReadTokenBudget({ contextWindow: 8192 }, undefined), (8192 - 4096 - 1024) / 4);
});

test("tiny budget bounds a huge single line and gives an honest same-line continuation", async () => {
	const handler = await load();
	const smallModel = { ...model, maxTokens: 512 };
	const smallUsage = { ...usage, tokens: 32768 - 512 - 1024 - 64 };
	for (const source of ["440: " + "z".repeat(44000), "z".repeat(44000)]) {
		await handler.lifecycle("turn_start");
		const text = (await handler(event(source, { input: { path: "a", offset: 440, limit: 1 } }), context({
			model: smallModel, getContextUsage: () => smallUsage,
		}))).content[0].text;
		assertFits(text, smallUsage, smallModel);
		assert.match(text, /line 440 is partial/);
		assert.match(text, /offset=440 repeats it \(1-based\)/);
		assert.match(text, /Read cannot split a line/);
		assert.ok(text.startsWith(source.slice(0, 10)));
		assert.doesNotMatch(text, /offset=441/);
	}
});

test("continuation mentions only active tools", async () => {
	for (const [tools, expected, forbidden] of [
		[["read", "bash"], /bash \(rg or grep\)/, /Search with grep/],
		[["read", "grep"], /Search with grep/, /bash|find|rg/],
		[["read"], /read offset=/, /bash|grep|find|rg/],
		[[], /offset=/, /with read|bash|grep|find|rg/],
	]) {
		const handler = await load(tools);
		const text = (await handler(event(), context())).content[0].text;
		assert.match(text, expected);
		assert.doesNotMatch(text, forbidden);
	}
});

test("minimal and exhausted budgets remain bounded", () => {
	const text = "z".repeat(44000);
	const compact = trimReadText(text, 50, 9, ["read"]);
	assert.match(compact, /Read trimmed; read offset=9 \(1-based\)/);
	for (const size of [0, 5, 14, 30, 50, 100, 300]) {
		assert.ok(trimReadText(text, size, 9, ["read"]).length <= size);
	}
	assert.equal(getReadTokenBudget(model, { ...usage, tokens: 32768 }), 0);
});

test("images, mixed content, errors, empty results, and other tools are exact no-ops", async () => {
	const handler = await load();
	const unexpected = () => assert.fail("must not consult usage for these results");
	for (const changes of [
		{ content: [{ type: "image", data: "original", mimeType: "image/png" }] },
		{ content: [{ type: "text", text: largeRead }, { type: "image", data: "original", mimeType: "image/png" }] },
		{ isError: true }, { content: [] }, { toolName: "bash" },
	]) {
		const original = event(largeRead, changes);
		const copy = structuredClone(original);
		assert.equal(await handler(original, context({ getContextUsage: unexpected })), undefined);
		assert.deepEqual(original, copy);
	}
});

test("Ornith family only; unsupported models do not even inspect result or usage", async () => {
	const handler = await load();
	const unexpected = () => assert.fail("unsupported model must do nothing");
	for (const currentModel of [
		{ ...model, provider: "openai" }, { ...model, provider: "anthropic" },
		{ ...model, id: "other-local" }, { ...model, id: "ornithology" }, undefined,
	]) {
		const original = event();
		const copy = structuredClone(original);
		assert.equal(await handler(original, context({ model: currentModel, getContextUsage: unexpected })), undefined);
		assert.equal(await handler(undefined, context({ model: currentModel, getContextUsage: unexpected })), undefined);
		assert.deepEqual(original, copy);
	}
	for (const id of ["ornith", "ORNITH", "ornith_1.5", "Ornith-1.0-35B-UD-Q4_K_M"]) {
		assert.ok(await handler(event(), context({ model: { ...model, id } })));
	}
});

test("multiple text blocks share 1 budget and are not modified in place", async () => {
	const handler = await load();
	const original = event("", { content: [
		{ type: "text", text: largeRead.slice(0, 22000) },
		{ type: "text", text: largeRead.slice(22000) },
	] });
	const copy = structuredClone(original);
	const result = await handler(original, context());
	assertFits(result.content[0].text);
	assert.deepEqual(original, copy);
});

test("installed Pi's tool-result hook sees usage before the current result is persisted", async () => {
	const handler = await load();
	const manager = host.SessionManager.inMemory(process.cwd());
	manager.appendMessage({
		role: "assistant", content: [], api: "openai-completions", provider: model.provider, model: model.id,
		usage: { input: usage.tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: usage.tokens,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse", timestamp: Date.now(),
	});
	const session = Object.create(host.AgentSession.prototype);
	session.sessionManager = manager;
	session._limitsModel = () => model;
	session.settingsManager = { getImageAutoResize: () => false };
	session._extensionRunner = {
		hasHandlers: name => name === "tool_result",
		emitToolResult: async currentEvent => {
			assert.equal(session.getContextUsage().tokens, usage.tokens);
			assert.equal(manager.getBranch().length, 1);
			return handler(currentEvent, context({ getContextUsage: () => session.getContextUsage() }));
		},
	};
	const original = event();
	const result = await session._afterToolCall({
		toolCall: { name: "read", id: original.toolCallId }, args: original.input,
		result: { content: original.content, details: original.details }, isError: false,
	});
	assertFits(result.content[0].text);
	assert.equal(manager.getBranch().length, 1);
	manager.appendMessage({ role: "toolResult", toolCallId: original.toolCallId, toolName: "read",
		content: result.content, isError: false, timestamp: Date.now() });
	assert.ok(session.getContextUsage().tokens > usage.tokens);
});


test("exhausted read budget still warns instead of silently deleting a requested range", async () => {
	const handler = await load();
	const currentUsage = { ...usage, tokens: 32768 - 4096 - 1024 };
	const text = (await handler(event("source", { input: { path: "a", offset: 90, limit: 1 } }),
		context({ getContextUsage: () => currentUsage }))).content[0].text;
	assert.match(text, /Read trimmed; read offset=90 \(1-based\)/);
	assert.ok(text.length <= 64);
	assert.ok(currentUsage.tokens + estimateTokens(text) + getOutputTokenBudget(model) < 32768);
});

test("a tight budget never shows a partial stripped-header marker as source", () => {
	const marker = "1-46: [read: 45-line license/copyright header omitted by read tool]";
	const text = trimReadText(marker + "\n47: " + "z".repeat(44000), 190, 1, ["read", "bash"]);
	assert.ok(text.length <= 190);
	assert.doesNotMatch(text, /line 1 is partial/);
	assert.ok(!text.includes("header omitted") || text.startsWith(marker));
});

test("partial huge Unicode lines do not end in a broken surrogate pair", () => {
	const text = trimReadText("🦜".repeat(44000), 224, 1, ["read", "bash"]);
	const source = text.split("\n\n[Read trimmed")[0];
	assert.ok(source.length > 0);
	assert.doesNotMatch(source, /[\uD800-\uDBFF]$/);
	assert.ok(text.length <= 224);
});


test("numbered content split across text blocks retains real line ranges", async () => {
	const handler = await load();
	const lines = Array.from({ length: 1000 }, (_, i) => `${701 + i}: ${"z".repeat(50)}`);
	const source = lines.join("\n");
	const original = event("", {
		input: { path: "a", offset: 701 },
		content: [{ type: "text", text: source.slice(0, 22000) }, { type: "text", text: source.slice(22000) }],
	});
	const text = (await handler(original, context())).content[0].text;
	const shown = text.split("\n\n[Read trimmed")[0].split("\n");
	assert.deepEqual(shown, lines.slice(0, shown.length));
	assert.match(text, new RegExp(`offset=${701 + shown.length},`));
	assertFits(text);
});


test("parallel reads share a stable pre-batch allowance, including an unchanged first read", async () => {
	const handler = await load();
	const first = event("moderate line\n".repeat(1000), { toolCallId: "read-1" });
	const second = event(largeRead, { toolCallId: "read-2", input: { path: "b", offset: 501 } });
	const firstTokens = estimateTokens(first.content[0].text);
	assert.ok(firstTokens <= getReadTokenBudget(model, usage));
	assert.ok(firstTokens + estimateTokens(largeRead) > getReadTokenBudget(model, usage));
	const [firstResult, secondResult] = await Promise.all([handler(first, context()), handler(second, context())]);
	assert.equal(firstResult, undefined);
	const secondText = secondResult.content[0].text;
	assert.match(secondText, /Read trimmed/);
	assert.ok(firstTokens + estimateTokens(secondText) <= getReadTokenBudget(model, usage));
	assert.ok(usage.tokens + firstTokens + estimateTokens(secondText) + getOutputTokenBudget(model) + OUTPUT_RESERVE_TOKENS <= 32768);
});

test("each turn, session, and supported model change restores the read allowance", async () => {
	for (const lifecycle of ["turn_start", "session_start", "model_select"]) {
		const handler = await load();
		const read = event("moderate line\n".repeat(1000));
		assert.equal(await handler(read, context()), undefined);
		assert.ok(await handler(read, context()));
		await handler.lifecycle(lifecycle);
		assert.equal(await handler(read, context()), undefined, lifecycle);
	}
});

test("increasing live usage that includes prior reads does not charge them twice", async () => {
	const handler = await load();
	const first = event("moderate line\n".repeat(1000));
	const second = event("target line\n".repeat(400));
	const firstTokens = estimateTokens(first.content[0].text);
	const secondTokens = estimateTokens(second.content[0].text);
	assert.equal(await handler(first, context()), undefined);
	const afterFirst = { ...usage, tokens: usage.tokens + firstTokens };
	assert.ok(secondTokens < getReadTokenBudget(model, afterFirst));
	assert.equal(await handler(second, context({ getContextUsage: () => afterFirst })), undefined);
	const afterBoth = { ...usage, tokens: afterFirst.tokens + secondTokens };
	const thirdText = (await handler(event(), context({ getContextUsage: () => afterBoth }))).content[0].text;
	assertFits(thirdText, afterBoth);
	assert.ok(estimateTokens(thirdText) > getReadTokenBudget(model, afterBoth) / 2);
	assert.ok(firstTokens + secondTokens + estimateTokens(thirdText) <= getReadTokenBudget(model, usage));
});

test("smaller live allowance wins when other context grows, even after a read was charged", async () => {
	const handler = await load();
	const first = event("moderate line\n".repeat(1000));
	assert.equal(await handler(first, context()), undefined);
	const currentUsage = { ...usage, tokens: usage.tokens + estimateTokens(first.content[0].text) + 1000 };
	const text = (await handler(event(), context({ getContextUsage: () => currentUsage }))).content[0].text;
	assertFits(text, currentUsage);
});

test("a larger live allowance cannot replenish this turn's read budget", async () => {
	const handler = await load();
	const first = event("moderate line\n".repeat(1000));
	assert.equal(await handler(first, context()), undefined);
	const smallerUsage = { ...usage, tokens: usage.tokens - 1000 };
	const text = (await handler(event(), context({ getContextUsage: () => smallerUsage }))).content[0].text;
	assert.ok(estimateTokens(first.content[0].text) + estimateTokens(text) <= getReadTokenBudget(model, usage));
});

test("unknown usage shares the same conservative fallback across repeated reads", async () => {
	const handler = await load();
	const currentUsage = { ...usage, tokens: null };
	const ctx = context({ getContextUsage: () => currentUsage });
	const first = event("moderate line\n".repeat(1000));
	assert.equal(await handler(first, ctx), undefined);
	const text = (await handler(event(), ctx)).content[0].text;
	assert.ok(estimateTokens(first.content[0].text) + estimateTokens(text) <= getReadTokenBudget(model, currentUsage));
});

test("unsupported lifecycle hooks are exact no-ops and do not replenish the allowance", async () => {
	const handler = await load();
	const first = event("moderate line\n".repeat(1000));
	assert.equal(await handler(first, context()), undefined);
	for (const currentModel of [{ ...model, provider: "openai" }, { ...model, id: "other-local" }, undefined]) {
		const ctx = context({ model: currentModel, getContextUsage: () => assert.fail("must not inspect cloud usage") });
		for (const lifecycle of ["turn_start", "session_start", "model_select"]) {
			assert.equal(await handler.lifecycle(lifecycle, ctx), undefined);
		}
	}
	const text = (await handler(event(), context())).content[0].text;
	assert.ok(estimateTokens(first.content[0].text) + estimateTokens(text) <= getReadTokenBudget(model, usage));
});
