import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = process.env.PI_PACKAGE_DIR || join(
	execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
	"@earendil-works/pi-coding-agent",
);
const cli = join(packageDir, "dist/cli.js");
const whitelistExtension = fileURLToPath(new URL("../extensions/bash-whitelist.ts", import.meta.url));
const deadlineMs = 15_000; // Allow cold CLI/extension startup on slower machines.
const exitDeadlineMs = 5_000; // Shutdown must not wait indefinitely for a dialog.
const options = { timeout: 60_000, skip: process.platform === "win32" && "The marker executable requires a POSIX shell." };
const thinking = "Offline exposed thinking: 中文 \u2028 still one record \u2029 done.";
const prompt = "Run the offline fixture.\u2028Not another JSON line.\u2029No model service.";
const successOutput = "RPC_TOOL_SUCCESS: 中文";
const callId = "offline-bash-call";
const approveOnce = "Yes, just this once";
const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;

function fakeProvider(command) {
	return `
import { AssistantMessageEventStream } from "@earendil-works/pi-ai";

export default function(pi) {
  let calls = 0;
  pi.registerProvider("offline-rpc-test", {
    api: "offline-rpc-api", baseUrl: "http://offline.invalid", apiKey: "offline-only",
    models: [{ id: "synthetic", name: "Offline synthetic", reasoning: true, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 1024 }],
    streamSimple(model, context, options) {
      const stream = new AssistantMessageEventStream();
      const output = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        timestamp: Date.now(), stopReason: "pending" };
      const emit = (event) => stream.push({ ...event, partial: structuredClone(output) });
      try {
        if (options?.signal?.aborted) throw new Error("Request aborted");
        if (++calls > 2) throw new Error("Unexpected extra provider turn");
        emit({ type: "start" });
        const toolResult = context.messages.findLast((message) => message.role === "toolResult");
        if (!toolResult) {
          output.content.push({ type: "thinking", thinking: "", thinkingSignature: "opaque-test-signature" });
          emit({ type: "thinking_start", contentIndex: 0 });
          output.content[0].thinking = ${JSON.stringify(thinking)};
          emit({ type: "thinking_delta", contentIndex: 0, delta: output.content[0].thinking });
          emit({ type: "thinking_end", contentIndex: 0, content: output.content[0].thinking });
          const toolCall = { type: "toolCall", id: ${JSON.stringify(callId)}, name: "bash", arguments: {} };
          output.content.push(toolCall);
          emit({ type: "toolcall_start", contentIndex: 1 });
          toolCall.arguments = { command: ${JSON.stringify(command)} };
          emit({ type: "toolcall_delta", contentIndex: 1, delta: JSON.stringify(toolCall.arguments) });
          emit({ type: "toolcall_end", contentIndex: 1, toolCall: structuredClone(toolCall) });
          output.stopReason = "toolUse";
        } else {
          const text = toolResult.isError ? "Offline final: blocked." : "Offline final: executed.";
          if (!toolResult.isError && !toolResult.content.some((block) => block.text?.includes(${JSON.stringify(successOutput)}))) {
            throw new Error("Real bash output did not reach the provider");
          }
          output.content.push({ type: "text", text: "" });
          emit({ type: "text_start", contentIndex: 0 });
          output.content[0].text = text;
          emit({ type: "text_delta", contentIndex: 0, delta: text });
          emit({ type: "text_end", contentIndex: 0, content: text });
          output.stopReason = "stop";
        }
        stream.push({ type: "done", reason: output.stopReason, message: structuredClone(output) });
      } catch (error) {
        output.stopReason = options?.signal?.aborted ? "aborted" : "error";
        output.errorMessage = String(error);
        stream.push({ type: "error", reason: output.stopReason, error: output });
      }
      stream.end();
      return stream;
    },
  });
}
`;
}

async function fixture(t) {
	assert.ok(existsSync(cli), `Installed Pi CLI not found at ${cli}; set PI_PACKAGE_DIR.`);
	const directory = mkdtempSync(join(tmpdir(), "pi-offline-rpc-"));
	const agentDir = join(directory, "agent");
	const workDir = join(directory, "work");
	const home = join(directory, "home");
	for (const path of [agentDir, workDir, home]) mkdirSync(path);
	let cleanup = async () => {};
	t.after(async () => {
		try { await cleanup(); }
		finally { rmSync(directory, { recursive: true, force: true }); }
	});

	// Isolate settings, credentials, shell startup, and all model activity.
	writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
		compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off",
		enableInstallTelemetry: false, enableAnalytics: false, shellPath: "/bin/bash",
	}));
	writeFileSync(join(agentDir, "auth.json"), "{}");
	const whitelistPath = join(agentDir, "bash-whitelist.json");
	const whitelist = JSON.stringify({ version: 1, whitelist: ["printf", "!rm"] });
	writeFileSync(whitelistPath, whitelist);
	const marker = join(directory, "executions");
	const executable = join(workDir, "unknown-offline-rpc-probe");
	writeFileSync(executable, `#!/bin/sh\nset -eu\nprintf '%s\\n' executed >> "$1"\nprintf '%s\\n' '${successOutput}'\n`, { mode: 0o700 });
	const command = `${quote(executable)} ${quote(marker)}`;
	const extension = join(directory, "fake-provider.ts");
	writeFileSync(extension, fakeProvider(command));
	const networkMarker = join(directory, "network-attempts");
	const preload = join(directory, "no-network.cjs");
	writeFileSync(preload, `
const { appendFileSync } = require("node:fs");
const deny = () => { appendFileSync(${JSON.stringify(networkMarker)}, "attempt\\n"); throw new Error("Network forbidden in offline RPC test"); };
require("node:net").Socket.prototype.connect = deny;
globalThis.fetch = deny;
`);

	const child = spawn(process.execPath, [
		"--require", preload, cli, "--mode", "rpc", "--no-session", "--offline",
		"--no-extensions", "-e", whitelistExtension, "-e", extension,
		"--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve",
		"--tools", "bash", "--provider", "offline-rpc-test", "--model", "synthetic", "--thinking", "low",
	], {
		cwd: workDir,
		env: {
			HOME: home, PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8",
			XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"),
			PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_TELEMETRY: "0",
		},
		stdio: ["pipe", "pipe", "pipe"],
	});
	const records = [];
	const waiting = new Set();
	let buffer = "", stderr = "", failure, exit;
	const notify = () => { for (const check of [...waiting]) check(); };
	const diagnostics = () => `stderr:\n${stderr}\nlast records:\n${JSON.stringify(records.slice(-8), null, 2)}`;
	const exited = new Promise((resolve) => child.once("close", (code, signal) => {
		exit = { code, signal };
		notify();
		resolve(exit);
	}));
	child.on("error", (error) => { failure = error; notify(); });
	child.stdin.on("error", (error) => { failure = error; notify(); });
	child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });

	// Node's stream decoder preserves split UTF-8; only LF delimits records.
	child.stdout.setEncoding("utf8").on("data", (chunk) => {
		buffer += chunk;
		let newline;
		while ((newline = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, newline).replace(/\r$/, "");
			buffer = buffer.slice(newline + 1);
			try {
				const record = JSON.parse(line);
				assert.equal(typeof record.type, "string");
				records.push(record);
				if (record.type === "extension_error" || (record.type === "response" && !record.success)) failure = new Error(JSON.stringify(record));
			} catch (error) {
				failure = new Error(`Invalid RPC JSONL record ${JSON.stringify(line)}: ${error}`);
			}
		}
		notify();
	});

	async function waitExit(timeout = exitDeadlineMs) {
		let timer;
		try {
			return await Promise.race([exited, new Promise((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`RPC child did not exit in ${timeout}ms. ${diagnostics()}`)), timeout);
			})]);
		} finally { clearTimeout(timer); }
	}
	cleanup = async () => {
		// SIGKILL is failure cleanup only, never a successful shutdown result.
		try {
			if (!exit) { child.kill("SIGKILL"); await waitExit(); }
			assert.equal(failure, undefined, diagnostics());
			assert.equal(buffer, "", "RPC stdout ended in an incomplete JSONL record");
			assert.equal(existsSync(networkMarker), false, "The child attempted network access");
			assert.equal(readFileSync(whitelistPath, "utf8"), whitelist, "Approval must not change the permanent whitelist");
		} finally { child.stdin.destroy(); }
	};

	function waitRecord(predicate, description) {
		return new Promise((resolve, reject) => {
			const finish = (error, record) => {
				clearTimeout(timer);
				waiting.delete(check);
				if (error) reject(error); else resolve(record);
			};
			const check = () => {
				if (failure) return finish(new Error(`${failure}\n${diagnostics()}`));
				const record = records.find(predicate);
				if (record) finish(undefined, record);
				else if (exit) finish(new Error(`Child exited before ${description}: ${JSON.stringify(exit)}. ${diagnostics()}`));
			};
			const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${description}. ${diagnostics()}`)), deadlineMs);
			waiting.add(check);
			check();
		});
	}
	const write = (text) => new Promise((resolve, reject) => child.stdin.write(text, (error) => error ? reject(error) : resolve()));
	const send = (record) => write(`${JSON.stringify(record)}\n`);
	const response = (id) => waitRecord((record) => record.type === "response" && record.id === id, `response ${id}`);
	await send({ type: "get_state", id: "ready" });
	const state = (await response("ready")).data;
	assert.equal(state.model.provider, "offline-rpc-test");
	assert.equal(state.model.id, "synthetic");
	assert.equal(state.isStreaming, false);

	return {
		child, records, marker, command, waitRecord, waitExit, send, response,
		async requestApproval() {
			await send({ type: "prompt", id: "run", message: prompt });
			assert.equal((await response("run")).data.disposition, "started");
			const approval = await waitRecord((record) => record.type === "extension_ui_request" && record.method === "select", "whitelist approval (requires installed unbash)");
			assert.ok(approval.id);
			assert.ok(approval.title.includes(command));
			assert.match(approval.title, /Unwhitelisted bash command/);
			assert.match(approval.title, /unknown-offline-rpc-probe/);
			assert.ok(approval.options.includes(approveOnce));
			assert.ok(approval.options.includes("No"));
			assert.equal(existsSync(marker), false, "The command ran before approval");
			assert.equal(records.filter((record) => record.type === "agent_settled").length, 0);
			return approval;
		},
		async answer(approval, value) {
			// Exercise chunked input and CRLF rather than relying on write boundaries.
			const line = JSON.stringify({ type: "extension_ui_response", id: approval.id, value });
			const middle = Math.floor(line.length / 2);
			await write(line.slice(0, middle));
			await write(line.slice(middle) + "\r\n");
		},
		settled: () => waitRecord((record) => record.type === "agent_settled", "agent_settled"),
		async eof() { child.stdin.end(); return waitExit(); },
	};
}

function assertTurn(f, approved) {
	const updates = f.records.filter((record) => record.type === "message_update");
	const thinkingDelta = updates.find((record) => record.assistantMessageEvent.type === "thinking_delta");
	assert.equal(thinkingDelta.assistantMessageEvent.delta, thinking);
	assert.equal(thinkingDelta.assistantMessageEvent.contentIndex, 0);
	for (const update of updates) {
		assert.equal("message" in update, false, "RPC updates must be delta-only");
		assert.equal("partial" in update.assistantMessageEvent, false);
	}
	const call = updates.find((record) => record.assistantMessageEvent.type === "toolcall_start").assistantMessageEvent;
	assert.equal(call.id, callId);
	assert.equal(call.toolName, "bash");
	assert.equal(call.contentIndex, 1);
	const starts = f.records.filter((record) => record.type === "tool_execution_start");
	assert.equal(starts.length, 1);
	assert.equal(starts[0].toolCallId, callId);
	assert.equal(starts[0].args.command, f.command);
	const ends = f.records.filter((record) => record.type === "tool_execution_end");
	assert.equal(ends.length, 1);
	assert.equal(ends[0].toolCallId, callId);
	assert.equal(ends[0].isError, !approved);
	const output = ends[0].result.content.map((block) => block.text ?? "").join("\n");
	assert.match(output, approved ? /RPC_TOOL_SUCCESS: 中文/ : /Blocked by user/);
	const messages = f.records.filter((record) => record.type === "message_end").map((record) => record.message);
	assert.deepEqual(messages.find((message) => message.role === "user").content, [{ type: "text", text: prompt }]);
	assert.equal(messages.filter((message) => message.role === "toolResult" && message.toolCallId === callId).length, 1);
	assert.equal(messages.filter((message) => message.role === "assistant").length, 2);
	assert.equal(messages.at(-1).content[0].text, approved ? "Offline final: executed." : "Offline final: blocked.");
	assert.equal(f.records.filter((record) => record.type === "extension_ui_request" && record.method === "select").length, 1);
	assert.equal(f.records.filter((record) => record.type === "agent_settled").length, 1);
	const approvalIndex = f.records.findIndex((record) => record.type === "extension_ui_request" && record.method === "select");
	const finalIndex = f.records.findLastIndex((record) => record.type === "message_end" && record.message.role === "assistant");
	const agentEndIndex = f.records.findIndex((record) => record.type === "agent_end");
	assert.ok(approvalIndex < f.records.indexOf(ends[0]));
	assert.ok(f.records.indexOf(ends[0]) < finalIndex);
	assert.ok(finalIndex < agentEndIndex);
	assert.ok(agentEndIndex < f.records.findIndex((record) => record.type === "agent_settled"));
}

test("real RPC approval resumes the original bash call exactly once, streams, settles and exits on EOF", options, async (t) => {
	const f = await fixture(t);
	const approval = await f.requestApproval();
	await f.answer(approval, approveOnce);
	assert.equal((await f.settled()).aborted, false);
	assertTurn(f, true);
	const liveOutput = f.records.filter((record) => record.type === "tool_execution_update");
	assert.ok(liveOutput.some((record) => record.toolCallId === callId && JSON.stringify(record.partialResult).includes(successOutput)));
	assert.equal(typeof f.records.find((record) => record.type === "tool_execution_end").durationMs, "number");
	assert.deepEqual(await f.eof(), { code: 0, signal: null });
	assert.equal(readFileSync(f.marker, "utf8"), "executed\n");
});

test("real RPC denial never executes bash and still completes the tool-result turn", options, async (t) => {
	const f = await fixture(t);
	await f.answer(await f.requestApproval(), "No");
	assert.equal((await f.settled()).aborted, false);
	assertTurn(f, false);
	assert.deepEqual(await f.eof(), { code: 0, signal: null });
	assert.equal(existsSync(f.marker), false);
});

test("RPC abort cancels a pending signal-aware whitelist approval without executing it", options, async (t) => {
	const f = await fixture(t);
	await f.requestApproval();
	await f.send({ type: "abort", id: "abort" });
	assert.equal((await f.response("abort")).success, true);
	assert.equal((await f.settled()).aborted, true);
	assert.deepEqual(await f.eof(), { code: 0, signal: null });
	assert.equal(existsSync(f.marker), false);
});

test("deadline failure has an explicit SIGKILL fallback that reaps the pending child", options, async (t) => {
	const f = await fixture(t);
	await f.requestApproval();
	// No shutdown is requested: this short deadline must expire, not pass silently.
	await assert.rejects(f.waitExit(50), /RPC child did not exit/);
	assert.equal(f.child.kill("SIGKILL"), true);
	assert.deepEqual(await f.waitExit(), { code: null, signal: "SIGKILL" });
	assert.equal(existsSync(f.marker), false);
});

for (const shutdown of ["EOF", "SIGTERM"]) {
	test(`${shutdown} exits while a real whitelist approval is pending, without executing it`, options, async (t) => {
		const f = await fixture(t);
		await f.requestApproval();
		await f.send({ type: "get_state", id: "pending" });
		assert.equal((await f.response("pending")).data.isStreaming, true);
		if (shutdown === "EOF") assert.deepEqual(await f.eof(), { code: 0, signal: null });
		else {
			assert.equal(f.child.kill("SIGTERM"), true);
			assert.deepEqual(await f.waitExit(), { code: 143, signal: null });
		}
		assert.equal(existsSync(f.marker), false);
	});
}
