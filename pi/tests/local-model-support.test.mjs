import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { host, loadExtensions } from "./helpers/pi-host.mjs";
import {
	CHARS_PER_TOKEN, OUTPUT_RESERVE_TOKENS, estimateTokens, getOutputTokenBudget, isSupportedModel,
} from "../manual-extensions/local-model-support/shared.ts";

const extensionDir = fileURLToPath(new URL("../manual-extensions/local-model-support/", import.meta.url));
const moduleNames = ["read-guard.ts", "skill-inject.ts", "thinking-budget.ts"];

async function load(t, paths = [join(extensionDir, "index.ts")]) {
	const cwd = mkdtempSync(join(tmpdir(), "pi-local-support-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	const runtime = host.createExtensionRuntime();
	const effects = [];
	Object.assign(runtime, {
		getActiveTools: () => ["read", "bash", "edit", "write", "grep", "find", "ls"],
		getThinkingLevel: () => "medium",
		setThinkingLevel: level => effects.push(["thinking", level]),
		sendUserMessage: (...args) => effects.push(["message", ...args]),
	});
	const result = await loadExtensions(paths, cwd, undefined, runtime);
	assert.deepEqual(result.errors, []);
	return { ...result, cwd, effects };
}

test("1 explicit entry point registers all 3 modules without extra tools", async t => {
	const combined = await load(t);
	assert.equal(combined.extensions.length, 1);
	const extension = combined.extensions[0];
	assert.equal(extension.tools.size, 0);
	const expectedCounts = new Map();
	for (const name of moduleNames) {
		const individual = (await load(t, [join(extensionDir, name)])).extensions[0];
		assert.ok(individual.handlers.size > 0, `${name} registers handlers`);
		for (const [event, handlers] of individual.handlers) {
			expectedCounts.set(event, (expectedCounts.get(event) ?? 0) + handlers.length);
		}
	}
	assert.deepEqual(new Map([...extension.handlers].map(([event, handlers]) => [event, handlers.length])), expectedCounts);
	for (const event of ["tool_result", "before_agent_start", "before_provider_request", "message_update"]) {
		assert.ok(extension.handlers.has(event), `${event} was registered`);
	}
});

test("all registered handlers leave cloud and unrelated local models alone", async t => {
	const { extensions: [extension], cwd, effects } = await load(t);
	for (const model of [
		{ provider: "openai", id: "ornith" },
		{ provider: "anthropic", id: "claude-sonnet" },
		{ provider: "llama.cpp", id: "other-model" },
		undefined,
	]) {
		const unexpected = () => assert.fail("unsupported models must not use session controls or UI");
		const ctx = {
			cwd, model, hasUI: true, mode: "tui", thinkingLevel: "medium",
			getContextUsage: unexpected, abort: unexpected,
			ui: { notify: unexpected, setStatus: unexpected },
		};
		for (const [type, handlers] of extension.handlers) {
			const event = {
				type, reason: "startup", source: "user", model, previousModel: undefined,
				prompt: "read edit and test this file", systemPrompt: "Original system prompt",
				systemPromptOptions: {}, text: "next task",
				toolName: "read", toolCallId: "read-1", input: { path: "file.ts" },
				content: [{ type: "text", text: "very long line\n".repeat(1000) }], isError: false,
				payload: { max_tokens: 16000, chat_template_kwargs: { enable_thinking: true } },
				assistantMessageEvent: { type: "thinking_delta", delta: "thinking".repeat(10000) },
			};
			const original = structuredClone(event);
			for (const handler of handlers) {
				assert.equal(await handler(event, ctx), undefined, `${type} must pass through`);
			}
			assert.deepEqual(event, original, `${type} must not mutate the event`);
		}
	}
	assert.deepEqual(effects, []);
});

test("only llama.cpp Ornith family IDs are supported", () => {
	for (const id of ["ornith", "ORNITH", "ornith_1.0", "ornith_1.5", "Ornith-1.0-35B-UD-Q4_K_M"]) {
		assert.equal(isSupportedModel({ provider: "llama.cpp", id }), true, id);
		assert.equal(isSupportedModel({ provider: "openai", id }), false, id);
	}
	for (const id of ["ornithology", "not-ornith", "my-ornith_1.5", "ornith-fake", "ornith_", "ornith1.5"]) {
		assert.equal(isSupportedModel({ provider: "llama.cpp", id }), false, id);
	}
	assert.equal(isSupportedModel(), false);
});

test("shared defaults cap output without exceeding a smaller advertised limit", () => {
	assert.equal(OUTPUT_RESERVE_TOKENS, 1024);
	assert.equal(CHARS_PER_TOKEN, 3.5);
	for (const maxTokens of [undefined, 0, -1, NaN, Infinity, 8192]) {
		assert.equal(getOutputTokenBudget({ maxTokens }), 4096);
	}
	assert.equal(getOutputTokenBudget(), 4096);
	assert.equal(getOutputTokenBudget({ maxTokens: 512 }), 512);
	for (const [maxTokens, expected] of [[512.9, 512], [4096.9, 4096], [1.9, 1], [0.5, 0]]) {
		const budget = getOutputTokenBudget({ maxTokens });
		assert.equal(budget, expected);
		assert.ok(Number.isInteger(budget) && budget >= 0 && budget <= maxTokens);
	}
	assert.equal(estimateTokens(""), 0);
	assert.equal(estimateTokens("1234567"), 2);
	assert.equal(estimateTokens("12345678"), 3);
});

const zshrc = readFileSync(new URL("../../.zshrc", import.meta.url), "utf8");
const wrapper = zshrc.match(/^# Select profiles[^]*?^fi$/m)?.[0];
const localFunction = zshrc.match(/^pi-local\(\) \{[^]*?^\}$/m)?.[0];

for (const profile of [undefined, "/selected profile/custom"]) {
	test(`pi-local uses the existing wrapper with ${profile ? "an explicit" : "the default"} profile`, t => {
		assert.ok(wrapper, "existing pi profile wrapper found");
		assert.ok(localFunction, "pi-local found");
		const home = mkdtempSync(join(tmpdir(), "pi-local home-"));
		t.after(() => rmSync(home, { recursive: true, force: true }));
		mkdirSync(join(home, ".local/ai"), { recursive: true });
		mkdirSync(join(home, "bin"));
		writeFileSync(join(home, ".local/ai/profiles.conf"), 'PROFILES=(work personal)\nDEFAULT_PROFILE=work\n');
		writeFileSync(join(home, "bin/pi"), `#!${process.execPath}
console.log(JSON.stringify({ args: process.argv.slice(2), profile: process.env.PI_CODING_AGENT_DIR }));
process.exitCode = 23;
`, { mode: 0o755 });
		const env = { ...process.env, HOME: home, PATH: `${join(home, "bin")}:${process.env.PATH}` };
		delete env.PI_CODING_AGENT_DIR;
		if (profile) env.PI_CODING_AGENT_DIR = profile;
		const args = ["--model", "openai/cloud override", "--", "quoted 'prompt' with spaces", "", "*.ts"];
		const output = execFileSync("zsh", ["-f", "-c", `${wrapper}
${localFunction}
pi-local "$@"
result=$?
printf '%s\\n' "$result" "\${PI_CODING_AGENT_DIR-unset}"
`, "test", ...args], { env, encoding: "utf8" }).trimEnd().split("\n");
		assert.deepEqual(JSON.parse(output[0]), {
			args: ["--extension", join(home, "dotfiles/pi/manual-extensions/local-model-support/index.ts"), "--model", "llama.cpp/ornith_1.5", ...args],
			profile: profile ?? join(home, ".pi/profiles/work"),
		});
		assert.equal(output[1], "23", "exit status propagates");
		assert.equal(output[2], profile ?? "unset", "profile env does not change in the caller");
	});
}
