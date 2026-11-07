import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { host, loadExtensions } from "./helpers/pi-host.mjs";

// Test cases identified:
// - config and global discovery use an alternate agent directory
// - subagent and implementation session/output files stay in that directory
// - project paths and home expansion retain their meaning
// - coms defaults are isolated per agent directory; PI_COMS_DIR still wins
// - bundled teams use portable extension sources

function fixture(t, mode = "absolute") {
	const root = mkdtempSync(join(tmpdir(), "pi-dir-"));
	const cwd = join(root, "project");
	const home = join(root, "home");
	const agentDir = mode === "default" ? join(home, ".pi", "agent")
		: mode === "tilde" ? join(home, "profile") : join(root, "profile");
	const envDir = mode === "default" ? undefined : mode === "tilde" ? "~/profile" : agentDir;
	for (const dir of [agentDir, cwd, home]) mkdirSync(dir, { recursive: true });
	for (const [name, value] of Object.entries({ HOME: home, PI_CODING_AGENT_DIR: envDir, PI_COMS_DIR: undefined })) {
		const previous = process.env[name];
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
		t.after(() => {
			if (previous === undefined) delete process.env[name];
			else process.env[name] = previous;
		});
	}
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const notifications = [];
	const ctx = {
		cwd, hasUI: false, model: { provider: "test", id: "model" },
		getContextUsage: () => undefined,
		ui: {
			notify: (...args) => notifications.push(args), setWidget() {}, setStatus() {},
			setTitle() {}, setFooter() {}, setTheme: () => ({ success: true }),
		},
	};
	return { root, agentDir, cwd, home, ctx, notifications };
}

async function extension(name, cwd) {
	const runtime = host.createExtensionRuntime();
	Object.assign(runtime, {
		getActiveTools: () => [], setActiveTools() {}, getThinkingLevel: () => "low",
		appendEntry() {}, sendMessage() {},
	});
	const path = fileURLToPath(new URL(`../extensions/${name}.ts`, import.meta.url));
	const result = await loadExtensions([path], cwd, undefined, runtime);
	assert.deepEqual(result.errors, []);
	return result.extensions[0];
}

async function event(ext, name, ctx, input = {}) {
	let result;
	for (const handler of ext.handlers.get(name) || []) result = await handler(input, ctx);
	return result;
}

function fakeSpawn(t) {
	const calls = [];
	const mocked = t.mock.method(childProcess, "spawn", (command, args, options) => {
		calls.push({ command, args, options });
		const child = new EventEmitter();
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.kill = () => true;
		setImmediate(() => {
			child.stdout.write(JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "done" } }) + "\n");
			child.emit("close", 0);
		});
		return child;
	});
	syncBuiltinESMExports();
	t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
	return calls;
}

test("model-access-guard loads redirected rules and blocks restricted files", async (t) => {
	const { agentDir, cwd, ctx } = fixture(t);
	writeFileSync(join(agentDir, "model-access.json"), JSON.stringify({
		rules: [{ modelPattern: "test/*", path: cwd, globs: ["**/*.cpp"] }],
	}));
	const ext = await extension("model-access-guard", cwd);
	const result = await event(ext, "tool_call", ctx, { toolName: "read", input: { path: "example.cpp" } });
	assert.equal(result?.block, true);
	assert.match(result.reason, /Blocked by model-access-guard/);
	const editResult = await event(ext, "tool_call", ctx, { toolName: "edit", input: { path: "example.cpp", oldText: "old", newText: "new" } });
	assert.equal(editResult?.block, true);
	const writeResult = await event(ext, "tool_call", ctx, { toolName: "write", input: { path: "example.cpp", content: "blocked" } });
	assert.equal(writeResult?.block, true);
	assert.match(writeResult.reason, /Blocked by model-access-guard/);
	const bashResult = await event(ext, "tool_call", ctx, { toolName: "bash", input: { command: `head ${cwd}/example.cpp` } });
	assert.equal(bashResult?.block, true);
	assert.match(bashResult.reason, /Blocked by model-access-guard/);
});

for (const [name, config] of [
	["missing", undefined],
	["malformed JSON", "{"],
	["missing rules", "{}"],
	["empty rules", '{"rules":[]}'],
	["invalid enabled", '{"enabled":"false","rules":[]}'],
	["invalid rule", '{"rules":[{"modelPattern":"test/*"}]}'],
	["empty globs", '{"rules":[{"modelPattern":"test/*","path":"/repo","globs":[]}]}'],
]) {
	test(`model-access-guard blocks all tools and reports ${name} config`, async (t) => {
		const { agentDir, cwd, home, ctx, notifications } = fixture(t);
		if (config !== undefined) writeFileSync(join(agentDir, "model-access.json"), config);
		else {
			const legacyDir = join(home, ".pi", "agent");
			mkdirSync(legacyDir, { recursive: true });
			writeFileSync(join(legacyDir, "model-access.json"), '{"enabled":false,"rules":[]}');
		}
		const ext = await extension("model-access-guard", cwd);
		for (const toolName of ["read", "bash", "custom-tool"]) {
			const result = await event(ext, "tool_call", ctx, { toolName, input: {} });
			assert.equal(result?.block, true);
			assert.ok(result.reason.includes(join(agentDir, "model-access.json")));
			assert.match(result.reason, /reload/i);
		}
		ctx.hasUI = true;
		await event(ext, "session_start", ctx);
		await ext.commands.get("model-guard").handler("status", ctx);
		assert.equal(notifications.length, 2);
		for (const [message, level] of notifications) {
			assert.match(message, /ERROR/);
			assert.equal(level, "error");
		}
		await ext.commands.get("model-guard").handler("on", ctx);
		assert.match(notifications.at(-1)[0], /ERROR/);
	});
}

test("model-access-guard permits explicitly disabled config", async (t) => {
	const { agentDir, cwd, ctx } = fixture(t);
	writeFileSync(join(agentDir, "model-access.json"), '{"enabled":false,"rules":[]}');
	const ext = await extension("model-access-guard", cwd);
	assert.equal(await event(ext, "tool_call", ctx, { toolName: "read", input: { path: "example.cpp" } }), undefined);
	await ext.commands.get("model-guard").handler("on", ctx);
	assert.equal((await event(ext, "tool_call", ctx, { toolName: "read", input: { path: "example.cpp" } }))?.block, true);
});

test("model-access-guard reports config path and rule count without blocking unrelated files or models", async (t) => {
	const { agentDir, cwd, ctx, notifications } = fixture(t);
	const configPath = join(agentDir, "model-access.json");
	writeFileSync(configPath, JSON.stringify({ rules: [{ modelPattern: "test/*", path: cwd, globs: ["**/*.cpp"] }] }));
	const ext = await extension("model-access-guard", cwd);
	await ext.commands.get("model-guard").handler("status", ctx);
	assert.match(notifications.at(-1)[0], /1 rule/);
	assert.ok(notifications.at(-1)[0].includes(configPath));
	assert.equal(await event(ext, "tool_call", ctx, { toolName: "read", input: { path: "notes.md" } }), undefined);
	ctx.model.provider = "other";
	assert.equal(await event(ext, "tool_call", ctx, { toolName: "read", input: { path: "example.cpp" } }), undefined);
});

test("extensions-list reads redirected global extensions and settings, leaving project discovery local", async (t) => {
	const { agentDir, cwd, home, ctx } = fixture(t);
	for (const dir of [join(agentDir, "extensions"), join(cwd, ".pi", "extensions")]) mkdirSync(dir, { recursive: true });
	writeFileSync(join(agentDir, "extensions", "global-fixture.ts"), "");
	writeFileSync(join(cwd, ".pi", "extensions", "project-fixture.ts"), "");
	writeFileSync(join(agentDir, "custom-fixture.ts"), "");
	writeFileSync(join(home, "home-fixture.ts"), "");
	writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ extensions: ["custom-fixture.ts", "~/home-fixture.ts"] }));
	let items;
	ctx.ui.select = async (_title, choices) => { items = choices; };
	const ext = await extension("extensions-list", cwd);
	await ext.commands.get("extensions").handler("", ctx);
	assert.ok(items.some(line => line.includes(join(agentDir, "extensions", "global-fixture.ts"))));
	assert.ok(items.some(line => line.includes(join(agentDir, "custom-fixture.ts"))));
	assert.ok(items.some(line => line.includes(join(home, "home-fixture.ts"))));
	assert.ok(items.some(line => line.includes(join(cwd, ".pi", "extensions", "project-fixture.ts"))));
	assert.ok(items.some(line => line.includes(`Global (${join(agentDir, "extensions")}/)`)));
});

for (const mode of ["absolute", "default", "tilde"]) {
	test(`subagent-widget discovers personalities and stores sessions (${mode} agent directory)`, async (t) => {
		const { agentDir, cwd, ctx } = fixture(t, mode);
		mkdirSync(join(agentDir, "agents"));
		writeFileSync(join(agentDir, "agents", "fixture.md"), "---\nname: fixture\n---\nFixture personality");
		const calls = fakeSpawn(t);
		const ext = await extension("subagent-widget", cwd);
		await ext.tools.get("subagent_create").definition.execute("call", { task: "test", thinking: "low", agent: "fixture" }, undefined, undefined, ctx);
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(calls.length, 1);
		const args = calls[0].args;
		const session = args[args.indexOf("--session") + 1];
		assert.equal(join(session, ".."), join(agentDir, "sessions", "subagents"));
		assert.equal(args[args.indexOf("--append-system-prompt") + 1], "Fixture personality");
		assert.equal(calls[0].options.env.PI_CODING_AGENT_DIR, process.env.PI_CODING_AGENT_DIR);
		await ext.tools.get("subagent_continue").definition.execute("continue", { id: 1, prompt: "continue", thinking: "low" }, undefined, undefined, ctx);
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(calls.length, 2);
		const continuedArgs = calls[1].args;
		assert.equal(continuedArgs[continuedArgs.indexOf("--session") + 1], session);
		assert.equal(continuedArgs[continuedArgs.indexOf("--append-system-prompt") + 1], "Fixture personality");
	});
}

test("implementation-team loads redirected workflows and agents and stores stage output there", async (t) => {
	const { agentDir, cwd, ctx } = fixture(t);
	mkdirSync(join(agentDir, "agents"));
	writeFileSync(join(agentDir, "agents", "fixture.md"), "---\nname: fixture\n---\nFixture implementation");
	writeFileSync(join(agentDir, "agents", "implementation-team.yaml"), `implementation:
  description: Test workflow
  steps:
    - agent: fixture
      prompt: "{task}"
`);
	const previousArgv = process.argv;
	process.argv = [...process.argv, "-e", "implementation-team.ts"];
	t.after(() => { process.argv = previousArgv; });
	const calls = fakeSpawn(t);
	const ext = await extension("implementation-team", cwd);
	await event(ext, "session_start", ctx);
	await ext.tools.get("run_implementation").definition.execute("call", { workflow: "implementation", work_item_id: "test-item", task: "test" }, undefined, undefined, ctx);
	assert.equal(calls.length, 1);
	const args = calls[0].args;
	const session = args[args.indexOf("--session") + 1];
	assert.ok(session.startsWith(join(agentDir, "sessions", "implementation-team") + "/"));
	assert.equal(readFileSync(session.replace(/\.jsonl$/, ".output.txt"), "utf8"), "done");
	assert.equal(args[args.indexOf("--append-system-prompt") + 1], "Fixture implementation");
	assert.equal(calls[0].options.env.PI_CODING_AGENT_DIR, agentDir);
});

test("manual agent-team displays the active profile's team location", () => {
	const raw = readFileSync(new URL("../manual-extensions/agent-team.ts", import.meta.url), "utf8");
	assert.ok(raw.includes('join(getAgentDir(), "agents", "teams.yaml")'));
	assert.doesNotMatch(raw, /Teams: ~\/\.pi\/agent/);
});

for (const override of [false, true]) {
	test(`coms ${override ? "honors PI_COMS_DIR" : "defaults to redirected agent directory"}`, async (t) => {
		const { root, agentDir, cwd, ctx, notifications } = fixture(t);
		const stateDir = override ? join(root, "override") : join(agentDir, "coms");
		if (override) process.env.PI_COMS_DIR = stateDir;
		const ext = await extension("coms", cwd);
		t.after(() => event(ext, "session_shutdown", ctx));
		await ext.commands.get("coms").handler("on fixture", ctx);
		assert.ok(notifications.some(([message]) => message.includes("coms ready")), JSON.stringify(notifications));
		const registry = join(stateDir, "projects", "default", "agents");
		const files = readdirSync(registry);
		assert.equal(files.length, 1);
		const entry = JSON.parse(readFileSync(join(registry, files[0]), "utf8"));
		if (process.platform !== "win32") assert.ok(entry.endpoint.startsWith(join(stateDir, "sockets") + "/"));
	});
}

test("bundled teams use bare extension sources", () => {
	const raw = readFileSync(new URL("../agents/teams.yaml", import.meta.url), "utf8");
	assert.doesNotMatch(raw, /- ~\/\.pi\/agent\/extensions\//);
	assert.match(raw, /- model-access-guard/);
});
