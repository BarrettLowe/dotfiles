import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { host, loadExtensions } from "./helpers/pi-host.mjs";

async function fixture(t, options = {}) {
	const agentDir = mkdtempSync(join(tmpdir(), "pi-subagent-usage-"));
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const children = [];
	if (options.personalities) {
		mkdirSync(join(agentDir, "agents"));
		for (const [name, tools] of Object.entries(options.personalities)) {
			writeFileSync(join(agentDir, "agents", `${name}.md`), `---\nname: ${name}\ntools: ${tools}\n---\n${name} personality`);
		}
	}
	const mocked = t.mock.method(childProcess, "spawn", (command, args, spawnOptions) => {
		if (options.spawnError) throw new Error(options.spawnError);
		const child = new EventEmitter();
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		Object.assign(child, { command, args, options: spawnOptions, signals: [] });
		child.kill = (signal) => {
			child.signals.push(signal);
			if (options.autoCloseOnKill !== false || signal === "SIGKILL") child.emit("close", null, signal);
			return true;
		};
		children.push(child);
		return child;
	});
	syncBuiltinESMExports();
	t.after(() => {
		for (const child of children) child.emit("close", 0);
		mocked.mock.restore();
		syncBuiltinESMExports();
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousDir;
		rmSync(agentDir, { recursive: true, force: true });
	});

	const snapshots = [];
	const messages = [];
	const widgets = new Map();
	const runtime = host.createExtensionRuntime();
	Object.assign(runtime, {
		getThinkingLevel: () => "low",
		appendEntry: (_type, data) => {
			runtime.assertActive();
			snapshots.push(structuredClone(data));
		},
		sendMessage: (message) => {
			runtime.assertActive();
			messages.push(message);
		},
	});
	const result = await loadExtensions([
		fileURLToPath(new URL("../extensions/subagent-widget.ts", import.meta.url)),
	], agentDir, undefined, runtime);
	assert.deepEqual(result.errors, []);
	const ext = result.extensions[0];
	const ctx = {
		cwd: agentDir,
		hasUI: false,
		model: { provider: "test", id: "model" },
		modelRegistry: { find: () => ({ contextWindow: 32000 }) },
		ui: { notify() {}, setWidget: (key, widget) => widgets.set(key, widget) },
	};
	await ext.commands.get("sub").handler(options.task ?? "test usage", ctx);
	return {
		ext, ctx, children, snapshots, messages, runtime, agentDir,
		command: (name, args = "") => ext.commands.get(name).handler(args, ctx),
		tool: (name, args) => ext.tools.get(name).definition.execute("call", args, undefined, undefined, ctx),
		event: async (name, event = {}, context = ctx) => {
			for (const handler of ext.handlers.get(name) ?? []) await handler(event, context);
		},
		emit: (event) => children.at(-1).stdout.write(JSON.stringify(event) + "\n"),
		label: () => widgets.get("sub-1")({}, { fg: (_color, text) => text }).render(200).join("\n"),
	};
}

const update = (totalTokens) => ({
	type: "message_update", usage: { totalTokens },
	assistantMessageEvent: { type: "thinking_delta", delta: "working" },
});
const end = (totalTokens) => ({
	type: "message_end", message: { role: "assistant", usage: { totalTokens } },
});

test("context stays steady during streaming and uses only the latest completed response", async (t) => {
	const f = await fixture(t);
	f.emit(end(12000));
	assert.match(f.label(), /12k \/ 32k context · 38%/);
	f.emit(update(0));
	assert.match(f.label(), /12k \/ 32k context · 38%/);
	f.emit(update(14000));
	f.emit(update(15000));
	f.emit(end(15000));
	assert.match(f.label(), /15k \/ 32k context · 47%/);
	f.emit({ type: "message_end", message: { role: "toolResult" } });
	f.emit({ type: "message_end", message: { role: "assistant" } });
	f.emit(end(0));
	assert.match(f.label(), /15k \/ 32k context · 47%/);
	f.children[0].emit("close", 0);
	assert.equal(f.snapshots.at(-1).agents[0].contextTokens, 15000);
});

test("context survives continuations and restored snapshots without accumulating usage", async (t) => {
	const f = await fixture(t);
	f.emit(end(12000));
	f.children[0].emit("close", 0);
	const snapshot = f.snapshots.at(-1);
	const restoredCtx = {
		...f.ctx,
		sessionManager: { getBranch: () => [{ type: "custom", customType: "subagent-state", data: snapshot }] },
	};
	for (const handler of f.ext.handlers.get("session_tree")) await handler({}, restoredCtx);
	await f.ext.commands.get("subcont").handler("1 continue", restoredCtx);
	f.emit(update(0));
	assert.match(f.label(), /12k \/ 32k context · 38%/);
	f.emit(end(15000));
	assert.match(f.label(), /15k \/ 32k context · 47%/);
	f.children[1].emit("close", 0);
	assert.equal(f.snapshots.at(-1).agents[0].contextTokens, 15000);
});

test("context includes cached input and output when totalTokens is unavailable", async (t) => {
	const f = await fixture(t);
	f.emit({ type: "message_end", message: {
		role: "assistant", usage: { input: 1000, cacheRead: 12000, cacheWrite: 1000, output: 2000, totalTokens: 0 },
	} });
	assert.match(f.label(), /16k \/ 32k context · 50%/);
	f.emit({ type: "message_end", message: { role: "assistant", stopReason: "error", usage: { totalTokens: 31000 } } });
	f.emit({ type: "message_end", message: { role: "assistant", stopReason: "aborted", usage: { totalTokens: 31000 } } });
	assert.match(f.label(), /16k \/ 32k context · 50%/);
});

test("successful compaction replaces pre-compaction context, failed compaction preserves it", async (t) => {
	const f = await fixture(t);
	f.emit(end(28000));
	f.emit({ type: "compaction_end", aborted: true });
	f.emit({ type: "compaction_end", errorMessage: "failed" });
	assert.match(f.label(), /28k \/ 32k context · 88%/);
	f.emit({ type: "compaction_end", result: { estimatedTokensAfter: 8000, usage: { totalTokens: 30000 } }, aborted: false });
	assert.match(f.label(), /8k \/ 32k context · 25%/);
	f.emit(end(10000));
	assert.match(f.label(), /10k \/ 32k context · 31%/);
	f.emit({ type: "compaction_end", result: { summary: "compacted" }, aborted: false });
	assert.match(f.label(), /\? \/ 32k context/);
	f.emit(end(9000));
	assert.match(f.label(), /9k \/ 32k context · 28%/);
});

test("the context limit follows the selected model, including model IDs containing slashes", async (t) => {
	const f = await fixture(t);
	f.emit(end(12000));
	f.children[0].emit("close", 0);
	f.ctx.modelRegistry.find = (provider, id) => {
		assert.equal(provider, "openrouter");
		assert.equal(id, "google/model");
		return { contextWindow: 200000 };
	};
	await f.command("subcont", "1 --model openrouter/google/model continue");
	f.emit(end(78000));
	assert.match(f.label(), /78k \/ 200k context · 39%/);
});

test("unknown usage and unknown model limits are not displayed as zero or a percentage", async (t) => {
	const f = await fixture(t);
	assert.match(f.label(), /\? \/ 32k context/);
	f.emit(end(12000));
	f.children[0].emit("close", 0);
	f.ctx.modelRegistry.find = () => undefined;
	await f.command("subcont", "1 continue");
	assert.match(f.label(), /12k \/ \? context/);
	assert.doesNotMatch(f.label(), /NaN|Infinity|%/);
});

test("old cumulative snapshots recover current context from the child session", async (t) => {
	const f = await fixture(t);
	f.emit(end(12000));
	f.children[0].emit("close", 0);
	const snapshot = structuredClone(f.snapshots.at(-1));
	const state = snapshot.agents[0];
	delete state.contextWindow;
	state.contextTokens = 509000;
	const session = host.SessionManager.open(state.sessionFile);
	session.appendMessage({ ...end(78000).message, content: [], stopReason: "stop", timestamp: Date.now() });
	await f.event("session_tree", {}, {
		...f.ctx,
		sessionManager: { getBranch: () => [{ type: "custom", customType: "subagent-state", data: snapshot }] },
	});
	assert.match(f.label(), /78k \/ 32k context · 244%/);
	assert.doesNotMatch(f.label(), /509k/);
});

test("old snapshots do not reuse pre-compaction usage or summary-generation tokens", async (t) => {
	const f = await fixture(t);
	f.children[0].emit("close", 0);
	const snapshot = structuredClone(f.snapshots.at(-1));
	const state = snapshot.agents[0];
	delete state.contextWindow;
	state.contextTokens = 509000;
	const session = host.SessionManager.open(state.sessionFile);
	session.appendMessage({ ...end(28000).message, content: [], stopReason: "stop", timestamp: Date.now() });
	session.appendCompaction("summary", null, 28000, undefined, false, { totalTokens: 30000 });
	await f.event("session_tree", {}, {
		...f.ctx,
		sessionManager: { getBranch: () => [{ type: "custom", customType: "subagent-state", data: snapshot }] },
	});
	assert.match(f.label(), /\? \/ 32k context/);
});

test("old cumulative snapshots with missing child sessions show unknown context", async (t) => {
	const f = await fixture(t);
	f.children[0].emit("close", 0);
	const snapshot = structuredClone(f.snapshots.at(-1));
	delete snapshot.agents[0].contextWindow;
	snapshot.agents[0].contextTokens = 509000;
	await f.event("session_tree", {}, {
		...f.ctx,
		sessionManager: { getBranch: () => [{ type: "custom", customType: "subagent-state", data: snapshot }] },
	});
	assert.match(f.label(), /\? \/ 32k context/);
});

const assistant = (text, extra = {}) => ({
	type: "message_end",
	message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", ...extra },
});

for (const removal of ["subrm", "subagent_remove", "subclear"]) {
	test(`${removal} cancels without delivering a result or resurrecting state`, async (t) => {
		const f = await fixture(t);
		if (removal === "subagent_remove") await f.tool(removal, { id: 1 });
		else await f.command(removal, removal === "subrm" ? "1" : "");
		assert.deepEqual(f.children[0].signals, ["SIGTERM"]);
		assert.equal(f.messages.length, 0);
		assert.deepEqual(f.snapshots.at(-1).agents, []);
		f.children[0].emit("close", 0);
		f.emit(assistant("late output"));
		assert.equal(f.messages.length, 0);
		assert.deepEqual(f.snapshots.at(-1).agents, []);
	});
}

for (const reason of ["reload", "resume", "new", "fork", "quit"]) {
	test(`shutdown for ${reason} waits for cleanup and tolerates late callbacks`, async (t) => {
		const f = await fixture(t);
		await f.event("session_shutdown", { reason });
		assert.deepEqual(f.children[0].signals, ["SIGTERM"]);
		assert.equal(f.snapshots.at(-1).agents[0].status, "error");
		const count = f.snapshots.length;
		f.runtime.invalidate();
		assert.doesNotThrow(() => {
			f.children[0].emit("close", 0);
			f.emit(assistant("late output"));
			f.children[0].emit("error", new Error("late error"));
		});
		assert.equal(f.snapshots.length, count);
		assert.equal(f.messages.length, 0);
	});
}

test("cancellation waits for exit and escalates even after SIGTERM was sent", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
	const f = await fixture(t, { autoCloseOnKill: false });
	let settled = false;
	const removing = f.command("subrm", "1").then(() => { settled = true; });
	await Promise.resolve();
	assert.equal(settled, false);
	t.mock.timers.tick(5000);
	await removing;
	assert.deepEqual(f.children[0].signals, ["SIGTERM", "SIGKILL"]);
	assert.equal(f.messages.length, 0);
});

test("clear cancels all children before accepting any completion", async (t) => {
	const f = await fixture(t);
	await f.command("sub", "second task");
	await f.command("subclear");
	assert.deepEqual(f.children.map(child => child.signals), [["SIGTERM"], ["SIGTERM"]]);
	assert.equal(f.messages.length, 0);
});

test("tree cleanup retains ownership until children exit and restores running records as interrupted", async (t) => {
	const f = await fixture(t);
	const snapshot = f.snapshots.at(-1);
	await f.event("session_before_tree");
	assert.deepEqual(f.children[0].signals, ["SIGTERM"]);
	await f.event("session_tree", {}, {
		...f.ctx,
		sessionManager: { getBranch: () => [{ type: "custom", customType: "subagent-state", data: snapshot }] },
	});
	assert.match((await f.tool("subagent_list", {})).content[0].text, /ERROR/);
	await f.tool("subagent_continue", { id: 1, prompt: "resume", thinking: "high" });
	assert.equal(f.children.length, 2);
	assert.equal(f.messages.length, 0);
});

test("only authoritative final text is delivered, not previews or stderr", async (t) => {
	const f = await fixture(t);
	f.emit(assistant("I will inspect the files.", { stopReason: "toolUse" }));
	f.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "partial preview" } });
	f.children[0].stderr.write("diagnostic warning");
	f.emit(assistant("Final findings."));
	f.children[0].emit("close", 0);
	assert.match(f.messages[0].content, /Result:\nFinal findings\.$/);
	assert.doesNotMatch(f.messages[0].content, /inspect|preview|diagnostic/);
	assert.equal(f.snapshots.at(-1).agents[0].status, "done");
});

for (const stopReason of ["error", "aborted"]) {
	test(`assistant ${stopReason} fails even with exit code 0`, async (t) => {
		const f = await fixture(t);
		f.emit(assistant("", { stopReason, errorMessage: "API authentication failed" }));
		f.children[0].emit("close", 0);
		assert.equal(f.snapshots.at(-1).agents[0].status, "error");
		assert.match(f.messages[0].content, /API authentication failed/);
		assert.match(f.messages[0].content, /error/);
	});
}

test("a successful retry supersedes an earlier assistant error", async (t) => {
	const f = await fixture(t);
	f.emit(assistant("", { stopReason: "error", errorMessage: "rate limit" }));
	f.emit(assistant("recovered"));
	f.children[0].emit("close", 0);
	assert.equal(f.snapshots.at(-1).agents[0].status, "done");
	assert.match(f.messages[0].content, /recovered/);
	assert.doesNotMatch(f.messages[0].content, /rate limit/);
});

test("nonzero exit reports stderr and missing final messages are failures", async (t) => {
	const f = await fixture(t);
	f.children[0].stderr.write("startup rejected");
	f.children[0].emit("close", 1);
	assert.equal(f.snapshots.at(-1).agents[0].status, "error");
	assert.match(f.messages[0].content, /startup rejected/);
	await f.command("sub", "no output");
	f.children[1].emit("close", 0);
	assert.equal(f.snapshots.at(-1).agents[1].status, "error");
	assert.match(f.messages[1].content, /final assistant message/);
});

test("spawn error and close deliver exactly one failure", async (t) => {
	const f = await fixture(t);
	f.children[0].emit("error", new Error("pi not found"));
	f.children[0].emit("close", -2);
	assert.equal(f.messages.length, 1);
	assert.match(f.messages[0].content, /pi not found/);
	assert.equal(f.snapshots.at(-1).agents[0].status, "error");
});

test("synchronous launch failures are reported without an unhandled rejection", async (t) => {
	const f = await fixture(t, { spawnError: "invalid cwd" });
	assert.equal(f.snapshots.at(-1).agents[0].status, "error");
	assert.equal(f.messages.length, 1);
	assert.match(f.messages[0].content, /invalid cwd/);
});

test("large results retain distinct files across continuations", async (t) => {
	const f = await fixture(t);
	const first = "a".repeat(5000), second = "b".repeat(5000);
	f.emit(assistant(first));
	f.children[0].emit("close", 0);
	await f.command("subcont", "1 next");
	f.emit(assistant(second));
	f.children[1].emit("close", 0);
	const files = f.messages.map(message => message.content.match(/full output saved to ([^)]+)\)/)[1]);
	assert.notEqual(files[0], files[1]);
	assert.equal(readFileSync(files[0], "utf8"), first);
	assert.equal(readFileSync(files[1], "utf8"), second);
});

test("result-file write failures do not escape the child callback", async (t) => {
	const f = await fixture(t);
	f.emit(assistant("a".repeat(5000)));
	rmSync(join(f.agentDir, "sessions", "subagents"), { recursive: true, force: true });
	assert.doesNotThrow(() => f.children[0].emit("close", 0));
	assert.equal(f.snapshots.at(-1).agents[0].status, "error");
	assert.match(f.messages[0].content, /save.*result/i);
});

test("generalists receive editing tools, explicit guards, cwd and resolved snapshot metadata", async (t) => {
	const f = await fixture(t, { task: "--model test/override --thinking high task" });
	const child = f.children[0];
	assert.equal(child.options.cwd, f.ctx.cwd);
	assert.equal(child.args[child.args.indexOf("--tools") + 1], "read,bash,grep,find,ls,edit,write");
	assert.ok(child.args.some(arg => arg.endsWith("/bash-whitelist.ts")));
	assert.ok(child.args.some(arg => arg.endsWith("/model-access-guard.ts")));
	assert.deepEqual({ model: f.snapshots[0].agents[0].model, thinking: f.snapshots[0].agents[0].thinking }, {
		model: "test/override", thinking: "high",
	});
	assert.equal(child.args.at(-2), "--");
});

for (const tools of ["read, edit, write", "[read, edit, write]"]) {
	test(`personality tool declaration ${tools} is honored on create and continue`, async (t) => {
		const f = await fixture(t, { personalities: { swe: tools }, task: "--agent swe task" });
		assert.equal(f.children[0].args[f.children[0].args.indexOf("--tools") + 1], "read,edit,write");
		f.emit(assistant("done"));
		f.children[0].emit("close", 0);
		await f.tool("subagent_continue", { id: 1, prompt: "next", thinking: "high" });
		assert.equal(f.children[1].args[f.children[1].args.indexOf("--tools") + 1], "read,edit,write");
		assert.equal(f.snapshots.at(-1).agents[0].personality, "swe");
		assert.equal(f.snapshots.at(-1).agents[0].thinking, "high");
	});
}

test("empty personality tools disable tools rather than restoring defaults", async (t) => {
	const f = await fixture(t, { personalities: { planner: "[]" }, task: "--agent planner task" });
	assert.ok(f.children[0].args.includes("--no-tools"));
});

test("invalid personality tool names fail explicitly before launch", async (t) => {
	const f = await fixture(t, { personalities: { broken: "read,not-a-tool" }, task: "--agent broken task" });
	assert.equal(f.children.length, 0);
	assert.equal(f.snapshots.at(-1).agents[0].status, "error");
	assert.match(f.messages[0].content, /not-a-tool/);
});

test("child whitelist uses persisted rules and blocks denied and unknown commands without UI", async (t) => {
	const f = await fixture(t);
	writeFileSync(join(f.agentDir, "bash-whitelist.json"), JSON.stringify({ whitelist: ["echo", "!rm"] }));
	const runtime = host.createExtensionRuntime();
	const result = await loadExtensions([
		f.children[0].args.find(arg => arg.endsWith("/bash-whitelist.ts")),
	], f.ctx.cwd, undefined, runtime);
	assert.deepEqual(result.errors, []);
	const whitelist = result.extensions[0];
	for (const handler of whitelist.handlers.get("session_start")) await handler({}, f.ctx);
	const handler = whitelist.handlers.get("tool_call")[0];
	assert.equal(await handler({ toolName: "bash", input: { command: "echo allowed" } }, f.ctx), undefined);
	assert.equal((await handler({ toolName: "bash", input: { command: "rm example" } }, f.ctx)).block, true);
	assert.equal((await handler({ toolName: "bash", input: { command: "unapproved-program" } }, f.ctx)).block, true);
	assert.equal((await handler({ toolName: "bash", input: { command: "echo 'unterminated" } }, f.ctx)).block, true);
});

test("shutdown is idempotent and waits for the child's close event", async (t) => {
	const f = await fixture(t, { autoCloseOnKill: false });
	let finished = false;
	const first = f.event("session_shutdown", { reason: "reload" }).then(() => { finished = true; });
	const second = f.event("session_shutdown", { reason: "reload" });
	await Promise.resolve();
	assert.equal(finished, false);
	assert.deepEqual(f.children[0].signals, ["SIGTERM"]);
	f.children[0].emit("close", null, "SIGTERM");
	await Promise.all([first, second]);
	assert.equal(finished, true);
	assert.equal(f.snapshots.length, 2);
	f.runtime.invalidate();
	await f.event("session_shutdown", { reason: "quit" });
	assert.equal(f.messages.length, 0);
});

test("a new task started while clear waits is not deleted or assigned a reused ID", async (t) => {
	const f = await fixture(t, { autoCloseOnKill: false });
	const clearing = f.command("subclear");
	await f.command("sub", "new task");
	f.children[0].emit("close", null, "SIGTERM");
	await clearing;
	assert.match((await f.tool("subagent_list", {})).content[0].text, /#2 \[RUNNING\]/);
	assert.deepEqual(f.children[1].signals, []);
	await f.command("sub", "another task");
	assert.deepEqual(f.snapshots.at(-1).agents.map(agent => agent.id), [2, 3]);
	assert.equal(f.messages.length, 0);
});

test("final JSON records are decoded across chunks and without a trailing newline", async (t) => {
	const f = await fixture(t);
	const record = JSON.stringify(assistant("complete"));
	f.children[0].stdout.write("not json\n" + record.slice(0, 15));
	f.children[0].stdout.write(record.slice(15));
	f.children[0].emit("close", 0);
	f.children[0].emit("close", 0);
	assert.equal(f.messages.length, 1);
	assert.match(f.messages[0].content, /complete/);
});

test("an unfinished response cannot reuse the preceding assistant message as its final answer", async (t) => {
	const f = await fixture(t);
	f.emit(assistant("intermediate", { stopReason: "toolUse" }));
	f.emit({ type: "message_start", message: { role: "assistant", content: [] } });
	f.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "unfinished" } });
	f.children[0].emit("close", 0);
	assert.equal(f.snapshots.at(-1).agents[0].status, "error");
	assert.match(f.messages[0].content, /final assistant message/);
	assert.doesNotMatch(f.messages[0].content, /intermediate|unfinished/);
});
