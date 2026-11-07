import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { host, loadExtensions } from "./helpers/pi-host.mjs";

const extensionPath = fileURLToPath(new URL("../manual-extensions/local-model-support/thinking-budget.ts", import.meta.url));
const piUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
const agentUrl = pathToFileURL(findPackageJSON("@earendil-works/pi-agent-core", piUrl));
const aiUrl = pathToFileURL(findPackageJSON("@earendil-works/pi-ai", piUrl));
const { Agent } = await import(new URL("./dist/agent.js", agentUrl));
const { createAssistantMessageEventStream } = await import(new URL("./dist/utils/event-stream.js", aiUrl));
const { streamSimple } = await import(new URL("./dist/api/openai-completions.js", aiUrl));
const { clampThinkingLevel, getSupportedThinkingLevels } = await import(new URL("./dist/models.js", aiUrl));

const ornith = {
	id: "ornith_1.5", name: "Ornith", provider: "llama.cpp", api: "openai-completions",
	baseUrl: "http://unused.invalid/v1", reasoning: true,
	thinkingLevelMap: { off: "off", minimal: null, low: null, medium: "medium", high: null, xhigh: null },
	input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 32768, maxTokens: 32768,
	compat: { thinkingFormat: "qwen-chat-template", maxTokensField: "max_tokens", supportsReasoningEffort: false,
		supportsStore: false, supportsDeveloperRole: false, supportsUsageInStreaming: true, supportsStrictMode: false },
};
const cloud = { ...ornith, provider: "openai", id: "cloud-model" };

async function load(t, model = ornith) {
	const cwd = mkdtempSync(join(tmpdir(), "pi-thinking-test-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	const effects = [];
	const runtime = host.createExtensionRuntime();
	Object.assign(runtime, {
		getThinkingLevel: () => "medium",
		setThinkingLevel: level => assert.fail(`must not mutate thinking level: ${level}`),
		sendUserMessage: () => assert.fail("must not queue asynchronous recovery input"),
		sendMessage: (message, options) => effects.push({ message, options }),
	});
	const result = await loadExtensions([extensionPath], cwd, undefined, runtime);
	assert.deepEqual(result.errors, []);
	assert.equal(result.extensions.length, 1);
	let controller = new AbortController();
	const ctx = {
		cwd, model: structuredClone(model), mode: "print", hasUI: false, signal: controller.signal,
		ui: { notify: (text, kind) => effects.push({ notice: text, kind }) },
		abort: () => { effects.push({ abort: true }); controller.abort(); },
	};
	const runner = new host.ExtensionRunner(result.extensions, runtime, cwd, {}, {});
	runner.createContext = () => ctx;
	const errors = [];
	runner.onError(error => errors.push(error));
	async function emit(type, data = {}) {
		let result;
		for (const handler of resultExtension.handlers.get(type) ?? []) result = await handler({ type, ...data }, ctx);
		return result;
	}
	const resultExtension = result.extensions[0];
	const api = {
		ctx, runtime, effects, errors, emit, runner,
		freshSignal() { controller = new AbortController(); ctx.signal = controller.signal; },
		prepare(payload = { model: ctx.model.id, max_tokens: 16000, chat_template_kwargs: { enable_thinking: true, preserve_thinking: true } }) {
			return runner.emitBeforeProviderRequest(payload);
		},
		async delta(chars) {
			return emit("message_update", { message: assistant(ctx.model), assistantMessageEvent: { type: "thinking_delta", delta: "x".repeat(chars) } });
		},
		async finish(stopReason = "length", content = [{ type: "thinking", thinking: "no answer" }], model = ctx.model) {
			return emit("turn_end", { entries: [], outcome: stopReason === "aborted" ? "aborted" : stopReason === "error" ? "error" : "completed",
				message: assistant(model, stopReason, content) });
		},
	};
	return api;
}

function assistant(model = ornith, stopReason = "stop", content = []) {
	return { role: "assistant", provider: model.provider, model: model.id, api: model.api, content, stopReason,
		timestamp: 1, usage: { input: 100, output: 4096, totalTokens: 4196, cacheRead: 0, cacheWrite: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}

async function preparedHttp(t, api, reasoning = "medium") {
	let original;
	let outgoing;
	const stream = streamSimple(api.ctx.model, { messages: [{ role: "user", content: "Review only", timestamp: 1 }] }, {
		apiKey: "test-only", reasoning, maxTokens: 16000, maxRetries: 0,
		onPayload: payload => {
			original = structuredClone(payload);
			return api.runner.emitBeforeProviderRequest(payload).then(replacement => {
				assert.deepEqual(payload, original, "the prepared input must not be mutated");
				return replacement;
			});
		},
		fetch: async (_url, options) => {
			outgoing = JSON.parse(options.body);
			const chunk = { id: "test", object: "chat.completion.chunk", created: 1, model: ornith.id,
				choices: [{ index: 0, delta: { content: "Findings" }, finish_reason: "stop" }] };
			return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
				headers: { "content-type": "text/event-stream" },
			});
		},
	});
	for await (const _event of stream) { /* Consume the mocked provider stream. */ }
	assert.equal((await stream.result()).stopReason, "stop");
	assert.deepEqual(api.errors, []);
	assert.ok(outgoing);
	return { original, outgoing };
}

test("real Pi prepared payload is replaced directly, capped, and not mutated", async t => {
	const api = await load(t);
	const { original, outgoing } = await preparedHttp(t, api);
	assert.equal(original.max_tokens, 16000);
	assert.equal(outgoing.max_tokens, 4096);
	assert.equal(outgoing.payload, undefined, "result is the payload, not a wrapper");
	assert.deepEqual(outgoing.chat_template_kwargs, { enable_thinking: true, preserve_thinking: true });
	for (const key of ["reasoning_effort", "thinking_budget", "reasoning", "enable_thinking"]) assert.equal(outgoing[key], undefined);
});

test("real Pi supports the llama thinking map and off chat-template payload", async t => {
	assert.deepEqual(getSupportedThinkingLevels(ornith), ["off", "medium"]);
	assert.equal(clampThinkingLevel(ornith, "off"), "off");
	const api = await load(t);
	const { outgoing } = await preparedHttp(t, api, "off");
	assert.equal(outgoing.chat_template_kwargs.enable_thinking, false);
});

test("4096 generation cap leaves 2048 estimated tokens for ordinary output", async t => {
	const api = await load(t);
	await api.prepare();
	await api.delta(7168);
	assert.deepEqual(api.effects, []);
	await api.delta(1);
	assert.equal(api.effects.filter(effect => effect.abort).length, 1);
	assert.match(api.effects.find(effect => effect.notice).notice, /budget exceeded/);
	assert.equal(await api.finish("aborted"), undefined);
	assert.ok(api.effects.every(effect => !effect.message || effect.options.triggerTurn === false));
});

test("an advertised 1536 cap leaves the full 1024 reserve", async t => {
	const api = await load(t, { ...ornith, maxTokens: 1536 });
	assert.equal((await api.prepare()).max_tokens, 1536);
	await api.delta(1792);
	assert.deepEqual(api.effects, []);
	await api.delta(1);
	assert.ok(api.effects.some(effect => effect.abort));
});

test("smaller outgoing limits are never enlarged; originals and nested kwargs stay intact", async t => {
	const api = await load(t);
	const payload = { max_tokens: 2048, chat_template_kwargs: { enable_thinking: true, preserve_thinking: true } };
	const original = structuredClone(payload);
	assert.equal((await api.prepare(payload)).max_tokens, 2048);
	assert.deepEqual(payload, original);
	await api.delta(3584);
	assert.deepEqual(api.effects, []);
	await api.delta(1);
	assert.ok(api.effects.some(effect => effect.abort));
});

test("small and unknown model output limits do not throw or exceed the supplied limit", async t => {
	for (const maxTokens of [undefined, NaN, Infinity, 0, -1, 512, 1.5]) {
		const api = await load(t, { ...ornith, maxTokens });
		const payload = { chat_template_kwargs: { enable_thinking: true } };
		const result = await api.prepare(payload);
		assert.equal(result.max_tokens, maxTokens > 0 && Number.isFinite(maxTokens) ? Math.floor(Math.min(maxTokens, 4096)) : 4096);
		if (maxTokens > 0 && maxTokens <= 1024) assert.equal(result.chat_template_kwargs.enable_thinking, false);
		assert.equal(payload.chat_template_kwargs.enable_thinking, true);
	}
});

test("a naturally exhausted thinking-only answer gets 1 review-appropriate boundary retry", async t => {
	const api = await load(t);
	await api.prepare();
	const retry = await api.finish();
	assert.equal(retry.continue, true);
	assert.equal(retry.entries.length, 1);
	assert.match(retry.entries[0].content, /Finish the requested task or report your findings/);
	assert.match(retry.entries[0].content, /read-only or review-only/);
	assert.doesNotMatch(retry.entries[0].content, /commit to an implementation|use your tools|start implementing/);
	await api.emit("agent_start");
	await api.emit("input", { source: "extension", text: "programmatic completion" });
	const { original, outgoing } = await preparedHttp(t, api);
	assert.equal(original.chat_template_kwargs.enable_thinking, true);
	assert.equal(outgoing.chat_template_kwargs.enable_thinking, false);
	assert.equal(outgoing.max_tokens, 4096);
	assert.equal(await api.finish(), undefined);
	assert.match(api.effects.find(effect => effect.notice).notice, /No further retry/);
});

test("off still emitting long thinking aborts and never loops", async t => {
	const api = await load(t);
	await api.prepare();
	assert.ok(await api.finish());
	assert.equal((await api.prepare()).chat_template_kwargs.enable_thinking, false);
	await api.delta(7169);
	assert.match(api.effects.find(effect => effect.notice).notice, /thinking-off still emitted/);
	assert.equal(await api.finish("aborted"), undefined);
	api.freshSignal();
	await api.prepare();
	assert.equal(api.effects.filter(effect => effect.abort).length, 2, "later automatic local requests are stopped too");
});

for (const source of ["interactive", "rpc"]) {
	test(`idle ${source} input resets retry, stopped state, and request-local off`, async t => {
		const api = await load(t);
		await api.prepare();
		assert.ok(await api.finish());
		await api.emit("input", { source, text: "new request" });
		assert.equal((await api.prepare()).chat_template_kwargs.enable_thinking, true);
		assert.ok(await api.finish());
		await api.prepare();
		await api.delta(7169);
		assert.ok(api.effects.some(effect => effect.abort));
		await api.finish("aborted");
		api.freshSignal();
		await api.emit("input", { source, text: "another idle request" });
		assert.equal((await api.prepare()).chat_template_kwargs.enable_thinking, true);
		assert.ok(await api.finish(), "a stopped task must not consume the next task's retry");
	});
}

test("agent_start, turn_start, and extension input never grant a second retry", async t => {
	const api = await load(t);
	await api.prepare();
	await api.finish();
	await api.emit("agent_start");
	await api.emit("turn_start");
	await api.emit("input", { source: "extension" });
	await api.prepare();
	assert.equal(await api.finish(), undefined);
});

for (const unsupported of [
	{ compat: { ...ornith.compat, thinkingFormat: "qwen" } },
	{ thinkingLevelMap: { off: null } },
	{ thinkingLevelMap: undefined },
	{ api: "openai-responses" },
	{ reasoning: false },
]) {
	test(`unsupported off control refuses retry: ${JSON.stringify(unsupported)}`, async t => {
		const api = await load(t, { ...ornith, ...unsupported });
		await api.prepare();
		assert.equal(await api.finish(), undefined);
		assert.match(api.effects.find(effect => effect.notice).notice, /no verified thinking-off/);
	});
}

test("outgoing payload itself must expose a boolean thinking switch", async t => {
	for (const kwargs of [undefined, {}, { enable_thinking: "true" }, []]) {
		const api = await load(t);
		await api.prepare({ max_tokens: 4096, chat_template_kwargs: kwargs });
		assert.equal(await api.finish(), undefined);
		assert.match(api.effects.find(effect => effect.notice).notice, /no verified thinking-off/);
	}
});

test("retry refuses a changed provider contract instead of injecting unsupported fields", async t => {
	const api = await load(t);
	await api.prepare();
	await api.finish();
	const payload = { max_tokens: 10000 };
	const original = structuredClone(payload);
	await api.prepare(payload);
	assert.deepEqual(payload, original);
	assert.match(api.effects.find(effect => effect.notice).notice, /no verified thinking-off/);
});

test("abort, error, answer text, and tool calls never schedule recovery", async t => {
	for (const [reason, content] of [
		["aborted", [{ type: "thinking", thinking: "trace" }]],
		["error", [{ type: "thinking", thinking: "trace" }]],
		["stop", [{ type: "thinking", thinking: "trace" }]],
		["length", [{ type: "text", text: "findings" }, { type: "thinking", thinking: "trace" }]],
		["length", [{ type: "thinking", thinking: "trace" }, { type: "toolCall", id: "1", name: "read", arguments: {} }]],
		["length", []],
	]) {
		const api = await load(t);
		await api.prepare();
		assert.equal(await api.finish(reason, content), undefined);
		assert.deepEqual(api.effects, []);
	}
});

test("user cancellation before a delta or boundary cannot queue recovery", async t => {
	const api = await load(t);
	await api.prepare();
	api.ctx.signal = AbortSignal.abort();
	await api.delta(20000);
	assert.equal(await api.finish(), undefined);
	assert.deepEqual(api.effects, []);
});

test("mixed cloud messages and payloads never cause local recovery", async t => {
	const api = await load(t);
	await api.prepare();
	await api.emit("message_update", { message: assistant(cloud), assistantMessageEvent: { type: "thinking_delta", delta: "x".repeat(20000) } });
	assert.equal(await api.finish("length", [{ type: "thinking", thinking: "trace" }], cloud), undefined);
	const payload = { model: cloud.id, max_tokens: 16000, chat_template_kwargs: { enable_thinking: true } };
	assert.deepEqual(await api.prepare(payload), payload);
	assert.deepEqual(api.effects, []);
});

test("all handlers leave cloud and unrelated local models unchanged", async t => {
	for (const model of [cloud, { ...ornith, id: "other" }, { ...ornith, provider: "anthropic" }]) {
		const api = await load(t, model);
		const payload = { model: model.id, max_tokens: 16000, chat_template_kwargs: { enable_thinking: true } };
		assert.deepEqual(await api.prepare(payload), payload);
		await api.delta(20000);
		assert.equal(await api.finish(), undefined);
		await api.emit("session_start");
		await api.emit("input", { source: "rpc" });
		await api.emit("model_select", { model });
		await api.emit("session_shutdown");
		assert.deepEqual(api.effects, []);
	}
});

test("model switch clears off without granting a second request-wide retry or leaking to cloud", async t => {
	const api = await load(t);
	await api.prepare();
	await api.finish();
	api.ctx.model = cloud;
	await api.emit("model_select", { model: cloud, previousModel: ornith });
	const payload = { model: cloud.id, max_tokens: 16000, chat_template_kwargs: { enable_thinking: true } };
	assert.deepEqual(await api.prepare(payload), payload);
	api.ctx.model = ornith;
	await api.emit("model_select", { model: ornith, previousModel: cloud });
	assert.equal((await api.prepare()).chat_template_kwargs.enable_thinking, true);
	assert.equal(await api.finish(), undefined);
	assert.match(api.effects.find(effect => effect.notice).notice, /No further retry/);
});

test("queued input supersedes recovery but preserves the active thinking counter", async t => {
	const api = await load(t);
	await api.prepare();
	await api.delta(7000);
	await api.emit("input", { source: "interactive", streamingBehavior: "followUp" });
	await api.delta(169);
	assert.equal(await api.finish("aborted"), undefined);
	assert.equal(api.effects.filter(effect => effect.abort).length, 1);
});

test("factory instances and session lifecycles reset independently", async t => {
	const first = await load(t);
	await first.prepare();
	await first.finish();
	const second = await load(t);
	assert.equal((await second.prepare()).chat_template_kwargs.enable_thinking, true);
	assert.ok(await second.finish());
	for (const event of ["session_shutdown", "session_start"]) {
		await first.emit(event);
		assert.equal((await first.prepare()).chat_template_kwargs.enable_thinking, true);
		assert.ok(await first.finish());
	}
});

test("malformed or absent payloads pass through without crashing", async t => {
	const api = await load(t);
	for (const payload of [null, undefined, [], "unknown"]) {
		assert.equal(await api.runner.emitBeforeProviderRequest(payload), payload);
	}
});


test("a second supplied cap also bounds max_tokens and the thinking allowance", async t => {
	const api = await load(t);
	const payload = { max_tokens: 16000, max_completion_tokens: 1536, chat_template_kwargs: { enable_thinking: true } };
	const original = structuredClone(payload);
	const result = await api.prepare(payload);
	assert.equal(result.max_tokens, 1536);
	assert.equal(result.max_completion_tokens, 1536);
	assert.deepEqual(payload, original);
	await api.delta(1793);
	assert.ok(api.effects.some(effect => effect.abort));
});

test("an already disabled request that exhausts output fails instead of retrying off again", async t => {
	const api = await load(t);
	await api.prepare({ max_tokens: 4096, chat_template_kwargs: { enable_thinking: false } });
	assert.equal(await api.finish(), undefined);
	assert.match(api.effects.find(effect => effect.notice).notice, /No further retry/);
});

test("recovery appends a runnable message through the real Pi boundary contract", async t => {
	const api = await load(t);
	await api.prepare();
	const prior = { type: "custom", customType: "peer", data: {} };
	api.runner.extensions[0].handlers.get("turn_end").unshift(() => ({ entries: [prior] }));
	const result = await api.runner.emitBoundary({ type: "turn_end", outcome: "completed", message: assistant(ornith, "length", [{ type: "thinking", thinking: "trace" }]) }, entries => {
		const preview = host.SessionManager.inMemory(api.ctx.cwd);
		for (const entry of entries) {
			if (entry.type === "custom") preview.appendCustomEntry(entry.customType, entry.data);
			else preview.appendCustomMessageEntry(entry.customType, entry.content, entry.display);
		}
		const contextMessages = preview.buildSessionContext().messages;
		return { contextMessages, contextEntries: [], llmMessages: contextMessages, pendingMessages: [],
			canContinue: contextMessages.some(message => message.role === "custom") };
	});
	assert.equal(result.valid, true);
	assert.equal(result.continue, true);
	assert.equal(result.context.canContinue, true);
	assert.equal(result.entries[0], prior);
	assert.equal(result.entries[1].type, "custom_message");
	assert.deepEqual(api.errors, []);
});


test("actual llama provider discovery supplies the verified map and template metadata", async t => {
	const { createLlamaProvider } = await import(new URL("../dist/extensions/llama/provider.js", piUrl));
	const requests = [];
	t.mock.method(globalThis, "fetch", async url => {
		requests.push(String(url));
		if (String(url).endsWith("/models")) return Response.json({ data: [{ id: ornith.id, status: { value: "loaded" }, meta: { n_ctx: 32768 } }] });
		assert.match(String(url), /\/props\?model=ornith_1.5&autoload=false$/);
		return Response.json({ chat_template: "{% if enable_thinking %}thinking{% endif %}" });
	});
	const { provider } = createLlamaProvider();
	await provider.refreshModels({
		allowNetwork: true, signal: new AbortController().signal,
		credential: { type: "api_key", key: "test-only", env: { LLAMA_BASE_URL: "http://unused.invalid" } },
		publish: async ({ update }) => { update(); return true; },
	});
	const model = provider.getModels()[0];
	assert.equal(model.compat.thinkingFormat, "qwen-chat-template");
	assert.equal(model.compat.maxTokensField, "max_tokens");
	assert.equal(model.thinkingLevelMap.off, "off");
	assert.deepEqual(getSupportedThinkingLevels(model), ["off", "medium"]);
	const api = await load(t, model);
	await api.prepare();
	assert.ok(await api.finish());
	const { outgoing } = await preparedHttp(t, api);
	assert.equal(outgoing.chat_template_kwargs.enable_thinking, false);
	assert.equal(outgoing.max_tokens, 4096);
	assert.equal(requests.length, 2, "all discovery was mocked, with no external requests");
});

test("a stopped local request never changes or stops the next cloud request", async t => {
	const api = await load(t);
	await api.prepare();
	await api.delta(7169);
	const effectCount = api.effects.length;
	api.freshSignal();
	api.ctx.model = cloud;
	const payload = { model: cloud.id, max_tokens: 16000, chat_template_kwargs: { enable_thinking: true } };
	assert.deepEqual(await api.prepare(payload), payload);
	assert.equal(api.effects.length, effectCount);
});

test("shutdown before late stream events leaves no delayed recovery", async t => {
	const api = await load(t);
	await api.prepare();
	await api.emit("session_shutdown");
	await api.delta(20000);
	await api.finish();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(api.effects, []);
});


test("a sub-token output limit stops clearly instead of sending an unbounded zero limit", async t => {
	for (const [modelLimit, requestLimit] of [[0.5, 16000], [32768, 0.5]]) {
		const api = await load(t, { ...ornith, maxTokens: modelLimit });
		const payload = { max_tokens: requestLimit };
		await api.prepare(payload);
		assert.equal(api.ctx.signal.aborted, true);
		assert.match(api.effects.find(effect => effect.notice).notice, /no whole tokens/);
		assert.equal(payload.max_tokens, requestLimit);
		assert.equal(await api.finish(), undefined);
	}
});


/** Runs Pi's real input queues and agent loop with a manually driven provider stream. */
async function queuedSession(t, model = ornith) {
	const api = await load(t, model);
	const requests = [];
	const inputs = [];
	api.runner.extensions[0].handlers.get("input").unshift(event => {
		inputs.push({ source: event.source, behavior: event.streamingBehavior });
	});
	let waiting = Promise.withResolvers();
	let agent;
	const session = Object.create(host.AgentSession.prototype);
	Object.assign(session, {
		_extensionRunner: api.runner, _steeringMessages: [], _followUpMessages: [], _eventListeners: [],
		_isAgentRunActive: true,
		_resourceLoader: { getPrompts: () => ({ prompts: [] }), getSkills: () => ({ skills: [] }) },
	});
	agent = new Agent({
		initialState: { model, thinkingLevel: "medium" },
		onPayload: payload => api.runner.emitBeforeProviderRequest(payload),
		finishTurn: async ({ message }) => {
			const result = await api.emit("turn_end", {
				message, entries: [], outcome: message.stopReason === "aborted" ? "aborted" : "completed",
			});
			assert.equal(result, undefined, "superseded and successful requests must not append recovery");
		},
		streamFn: (currentModel, _context, options) => {
			const stream = createAssistantMessageEventStream();
			const message = assistant(currentModel, "stop", [{ type: "thinking", thinking: "" }]);
			let ended = false;
			const finish = reason => {
				if (ended) return;
				ended = true;
				options.signal.removeEventListener("abort", abort);
				message.stopReason = reason;
				if (reason === "aborted") stream.push({ type: "error", reason, error: message });
				else stream.push({ type: "done", reason, message });
				stream.end();
			};
			const abort = () => finish("aborted");
			options.signal.addEventListener("abort", abort, { once: true });
			void (async () => {
				const payload = await options.onPayload({ model: currentModel.id, max_tokens: 16000,
					chat_template_kwargs: { enable_thinking: true } }, currentModel);
				stream.push({ type: "start", partial: message });
				const request = {
					payload, finish, signal: options.signal, userMessage: _context.messages.filter(message => message.role === "user").at(-1),
					async think(chars) {
						const delta = "x".repeat(chars);
						message.content[0].thinking += delta;
						stream.push({ type: "thinking_delta", contentIndex: 0, delta, partial: message });
						await new Promise(resolve => setImmediate(resolve));
					},
				};
				requests.push(request);
				waiting.resolve(request);
				waiting = Promise.withResolvers();
			})();
			return stream;
		},
	});
	session.agent = agent;
	Object.defineProperty(api.ctx, "signal", { get: () => agent.signal, configurable: true });
	api.ctx.isIdle = () => !agent.state.isStreaming;
	api.ctx.abort = () => { api.effects.push({ abort: true }); agent.abort(); };
	agent.subscribe(event => {
		if (event.type === "agent_start") session._isAgentRunActive = true;
		if (event.type === "agent_end") session._isAgentRunActive = false;
		if (event.type !== "turn_end") return session._emitExtensionEvent(event);
	});
	t.after(() => agent.abort());
	return { ...api, session, agent, requests, inputs, nextRequest: () => waiting.promise };
}

for (const [method, source] of [["followUp", "interactive"], ["steer", "rpc"]]) {
	test(`real AgentSession.${method}: queued input keeps the cap and cannot poison the next request`, { timeout: 5000 }, async t => {
		const api = await queuedSession(t);
		const firstReady = api.nextRequest();
		const firstRun = api.agent.prompt("original review");
		const first = await firstReady;
		await first.think(7000);
		assert.equal(await api.session[method]("new task", undefined, { source }), "queued");
		assert.deepEqual(api.inputs.at(-1), { source, behavior: method === "followUp" ? "followUp" : "steer" });
		assert.equal(api.agent.signal.aborted, false, "input queues without canceling the stream");
		await first.think(3000);
		assert.equal(first.signal.aborted, true, "queued input must not remove the active cap");
		await firstRun;
		assert.equal(api.effects.filter(effect => effect.abort).length, 1);
		assert.equal(api.requests.length, 1, "aborted request must not start queued work automatically");
		const nextReady = api.nextRequest();
		const nextRun = api.agent.continue();
		const next = await nextReady;
		assert.equal(next.payload.max_tokens, 4096);
		assert.equal(next.payload.chat_template_kwargs.enable_thinking, true);
		await next.think(7168);
		assert.equal(api.agent.signal.aborted, false, "queued task gets its complete fresh thinking allowance");
		await next.think(1);
		await nextRun;
		assert.equal(api.effects.filter(effect => effect.abort).length, 2);
		assert.deepEqual(api.errors, []);
	});

	test(`real AgentSession.${method}: superseded length response adds no stale retry`, { timeout: 5000 }, async t => {
		const api = await queuedSession(t);
		const firstReady = api.nextRequest();
		const run = api.agent.prompt("original review");
		const first = await firstReady;
		await first.think(100);
		await api.session[method]("new task", undefined, { source });
		const nextReady = api.nextRequest();
		first.finish("length");
		const next = await nextReady;
		assert.equal(next.payload.chat_template_kwargs.enable_thinking, true);
		next.finish("stop");
		await run;
		assert.deepEqual(api.effects, []);
		assert.deepEqual(api.errors, []);
	});

	test(`real AgentSession.${method}: user cancellation does not recover or modify cloud requests`, { timeout: 5000 }, async t => {
		const api = await queuedSession(t);
		const ready = api.nextRequest();
		const run = api.agent.prompt("original review");
		const first = await ready;
		await api.session[method]("new task", undefined, { source });
		api.agent.abort();
		await run;
		assert.deepEqual(api.effects, []);
		api.ctx.model = cloud;
		const payload = { model: cloud.id, max_tokens: 16000, chat_template_kwargs: { enable_thinking: true } };
		assert.deepEqual(await api.prepare(payload), payload);
		assert.deepEqual(api.effects, []);
		assert.deepEqual(api.errors, []);
	});
}


test("each genuine queued message starts with fresh controls, even after an earlier queued task stops", { timeout: 5000 }, async t => {
	const api = await queuedSession(t);
	const ready = api.nextRequest();
	const run = api.agent.prompt("original review");
	const first = await ready;
	await api.session.followUp("queued task 1");
	await api.session.followUp("queued task 2");
	await first.think(10000);
	await run;
	for (let task = 0; task < 2; task++) {
		const ready = api.nextRequest();
		const run = api.agent.continue();
		const request = await ready;
		assert.equal(request.payload.chat_template_kwargs.enable_thinking, true);
		await request.think(7168);
		assert.equal(request.signal.aborted, false);
		await request.think(1);
		await run;
	}
	assert.equal(api.effects.filter(effect => effect.abort).length, 3);
	assert.deepEqual(api.errors, []);
});


for (const sameText of [false, true]) {
	test(`mixed-source real queues match genuine text and images, not extension steering (${sameText ? "same text" : "distinct text"})`, { timeout: 5000 }, async t => {
		const api = await queuedSession(t);
		const text = index => sameText ? "queued task" : `queued task ${index}`;
		const images = index => [{ type: "image", mimeType: "image/png", data: `${index}A==` }];
		const ready = api.nextRequest();
		const run = api.agent.prompt("original review");
		const first = await ready;
		await first.think(100);
		await api.session.followUp(text(1), images(1), { source: "interactive" });
		await api.session.followUp(text(2), images(2), { source: "rpc" });
		await api.session.steer(text(3), images(3), { source: "extension" });
		assert.deepEqual(api.inputs, [
			{ source: "interactive", behavior: "followUp" },
			{ source: "rpc", behavior: "followUp" },
			{ source: "extension", behavior: "steer" },
		]);
		const steeringReady = api.nextRequest();
		first.finish("length");
		const steering = await steeringReady;
		assert.deepEqual(steering.userMessage.content, [{ type: "text", text: text(3) }, ...images(3)]);
		await steering.think(10000);
		assert.equal(steering.signal.aborted, true);
		await run;
		for (const index of [1, 2]) {
			const nextReady = api.nextRequest();
			const nextRun = api.agent.continue();
			const next = await nextReady;
			assert.deepEqual(next.userMessage.content, [{ type: "text", text: text(index) }, ...images(index)]);
			assert.equal(next.signal.aborted, false, "extension thinking failure must not poison a genuine follow-up");
			assert.equal(next.payload.chat_template_kwargs.enable_thinking, true);
			await next.think(7168);
			assert.equal(next.signal.aborted, false);
			await next.think(1);
			await nextRun;
		}
		assert.equal(api.effects.filter(effect => effect.abort).length, 3);
		assert.deepEqual(api.errors, []);
	});
}

test("identical mixed-source queued text and images do not guess provenance or grant a reset", { timeout: 5000 }, async t => {
	const api = await queuedSession(t);
	await api.prepare();
	assert.ok(await api.finish());
	const ready = api.nextRequest();
	const run = api.agent.prompt("original review");
	const first = await ready;
	assert.equal(first.payload.chat_template_kwargs.enable_thinking, false);
	await api.session.followUp("identical", undefined, { source: "interactive" });
	await api.session.steer("identical", undefined, { source: "extension" });
	const steeringReady = api.nextRequest();
	first.finish("stop");
	const steering = await steeringReady;
	assert.equal(steering.payload.chat_template_kwargs.enable_thinking, false, "ambiguous steering cannot reset controls");
	const nextReady = api.nextRequest();
	steering.finish("stop");
	const next = await nextReady;
	assert.equal(next.payload.chat_template_kwargs.enable_thinking, false, "ambiguity must not be guessed on later delivery either");
	next.finish("stop");
	await run;
	await api.emit("input", { source: "interactive", text: "fresh idle task" });
	assert.equal((await api.prepare()).chat_template_kwargs.enable_thinking, true);
	assert.deepEqual(api.errors, []);
});


for (const rewrite of ["text", "images"]) {
	test(`downstream ${rewrite} rewrite stays unmatched rather than resetting an unrelated task`, { timeout: 5000 }, async t => {
		const api = await queuedSession(t);
		await api.prepare();
		assert.ok(await api.finish());
		const image = { type: "image", mimeType: "image/png", data: "AA==" };
		api.runner.extensions[0].handlers.get("input").push(event => ({
			action: "transform", text: rewrite === "text" ? `expanded ${event.text}` : event.text,
			images: rewrite === "images" ? [{ ...image, data: "BA==" }] : event.images,
		}));
		const ready = api.nextRequest();
		const run = api.agent.prompt("original review");
		const first = await ready;
		await api.session.followUp("raw queued task", [image], { source: "interactive" });
		const nextReady = api.nextRequest();
		first.finish("stop");
		const next = await nextReady;
		assert.equal(next.payload.chat_template_kwargs.enable_thinking, false, "unmatched input cannot reset task controls");
		next.finish("length");
		await run;
		await api.runner.emitInput("fresh idle task", undefined, "rpc", undefined);
		assert.equal((await api.prepare()).chat_template_kwargs.enable_thinking, true);
		assert.deepEqual(api.errors, []);
	});
}
