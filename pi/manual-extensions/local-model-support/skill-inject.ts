/*
 * Adapted from little-coder 1.20.0 skill-inject, _shared/inject.ts and tool cards.
 * Copyright 2026 Itay Inbar. Apache-2.0; see LICENSE and NOTICE.
 * Changed: Ornith-only, active Pi tools, corrected schemas, small tail deltas,
 * session deduplication and immediate recovery advice in failed tool results.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { estimateTokens, getOutputTokenBudget, isSupportedModel } from "./shared.ts";

const GUIDANCE_BUDGET = 450; // Arbitrary ceiling for each tail message, including task advice.
const RECENT_TOOLS = 2; // Only the last 2 successful tools influence the next prompt.
const HEADING = "Local tool-use guidance";
const AUDIT = "Stay within the requested task; review, research and explanation do not authorize changes. Separate hypotheses from observed source. Before claiming a race, verify callers and shared-state readers and writers.";
const VERIFY = "When changing code, check that unrelated behavior stays unchanged and run relevant tests/builds; report checks you could not run.";

const CARDS: Record<string, string> = {
	read: "read: {path, offset?, limit?}; paths may be relative or absolute. offset is 1-indexed (default 1). Use bounded ranges. Real on-disk line prefixes such as '42: ' and omitted-header markers are display metadata, not file content; omit them from replacement text.",
	edit: "edit: {path, edits:[{oldText,newText}]}. Use exact, unique oldText with minimal context. All edits match the original file; keep them nonoverlapping, merging nearby changes. Inspect current text before patching; do not replace a whole file to recover a failed match.",
	write: "write: {path, content}; creates parent directories and overwrites existing files. Use for new files or requested complete rewrites, not small patches.",
	bash: "bash: {command, timeout?}; timeout is seconds, with no default. Each command starts in the current working directory; shell state does not persist. Inspect stdout/stderr and exit status. Existing permissions still apply.",
	grep: "grep: {pattern, path?, glob?, ignoreCase?, literal?, context?, limit?}. Searches contents; narrow path/glob and limit matches. Use literal:true for exact strings. File/line prefixes are metadata, not source text.",
	find: "find: {pattern, path?, limit?}; pattern is a file glob, not a content regex. Results are paths relative to the search directory. Narrow the glob and cap results.",
};

/** Select likely tools without treating source discussion as a request to edit it. */
function predictTools(prompt: string): { tools: string[]; readOnly: boolean; changing: boolean } {
	const readOnly = /\b(review|audit|research|explain|explanation|investigate|analy[sz]e)\b/i.test(prompt);
	const changing = !readOnly && /\b(edit|change|modify|fix|update|replace|refactor|implement|add|write|create)\b/i.test(prompt);
	const tools: string[] = [];
	if (/\b(read|show|view|inspect|review|audit|investigate|trace|file|source|code|repo|repository|race)\b/i.test(prompt)) tools.push("read");
	if (/\b(find|locate|files)\b/i.test(prompt)) tools.push("find");
	if (/\b(search|grep|references|callers|find|locate|trace|race|review|audit|investigate)\b/i.test(prompt)) tools.push("grep");
	if (changing) tools.push("edit", "read");
	if (changing && /\b(write|create|implement)\b/i.test(prompt)) tools.push("write");
	if (/\b(bash|run|execute|build|install)\b/i.test(prompt) || (!readOnly && /\b(test|tests|verify)\b/i.test(prompt))) tools.push("bash");
	return { tools, readOnly, changing };
}

/** Give a failed call a short next step without hiding its original error. */
function recovery(tool: string, text: string, active: Set<string>): string {
	if (tool === "edit" && /exact|oldText|unique|overlap|occurrences|edits\[/i.test(text)) {
		const refresh = active.has("read")
			? "Re-read only the relevant range with read offset/limit (1-indexed), not the whole file."
			: "Obtain the current text of only the relevant range before retrying.";
		return `${refresh} Match exact unique oldText against the original file; merge overlapping edits. Remove display line prefixes. Do not recover by rewriting the whole file.`;
	}
	if (tool === "read" && /offset|end of file/i.test(text)) {
		return "read offset is 1-indexed; choose a start within the reported file length and a bounded limit.";
	}
	if (tool === "bash") return "Inspect stdout/stderr and exit status before retrying; adjust the command to the reported failure and honor existing permissions.";
	return "Check the reported path, arguments and permissions before retrying; do not assume the operation succeeded.";
}

export default function (pi: ExtensionAPI) {
	const delivered = new Set<string>();
	let recent: string[] = [];
	let failed: string | undefined;

	function clearSignals() {
		recent = [];
		failed = undefined;
	}

	pi.on("session_start", () => {
		delivered.clear();
		clearSignals();
	});
	pi.on("model_select", () => {
		// Keep session deduplication, but never carry tool signals between models.
		clearSignals();
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (!isSupportedModel(ctx.model)) {
			clearSignals();
			return;
		}
		const active = new Set(pi.getActiveTools());
		const intent = predictTools(event.prompt);
		const candidates = [failed, ...recent, ...intent.tools];
		const additions = new Set<string>();
		const budget = Math.min(GUIDANCE_BUDGET, getOutputTokenBudget(ctx.model));
		let content = HEADING;
		const add = (key: string, text: string) => {
			if (delivered.has(key) || additions.has(key)) return;
			const next = `${content}\n${text}`;
			if (estimateTokens(next) > budget) return;
			content = next;
			additions.add(key);
		};
		const eligible = candidates.filter((name): name is string =>
			!!name && active.has(name) && Object.hasOwn(CARDS, name) &&
			!(intent.readOnly && (name === "edit" || name === "write")));
		if (!eligible.length) return;
		add("audit", AUDIT);
		if (intent.changing) add("verify", VERIFY);
		for (const name of eligible) {
			add(name, CARDS[name]);
			if (name === "edit" && active.has("read")) {
				add("edit-range", "On an edit mismatch, re-read only the relevant range with read offset/limit, not the whole file.");
			}
			if (name === "bash" && active.has("read")) {
				add("bash-read", "Use read to examine files rather than shell file-dump commands.");
			}
		}
		if (!additions.size) return;
		for (const key of additions) delivered.add(key);
		return { message: { customType: "local-tool-guidance", content, display: false } };
	});

	pi.on("tool_result", (event, ctx) => {
		if (!isSupportedModel(ctx.model)) {
			clearSignals();
			return;
		}
		const active = new Set(pi.getActiveTools());
		const name = event.toolName;
		if (!active.has(name) || !Object.hasOwn(CARDS, name)) return;
		if (!event.isError) {
			recent = [name, ...recent.filter(tool => tool !== name)].slice(0, RECENT_TOOLS);
			if (failed === name) failed = undefined;
			return;
		}
		failed = name;
		const text = event.content.filter(item => item.type === "text").map(item => item.text).join("\n");
		const warning = `[Local recovery: ${recovery(name, text, active)}]`;
		if (estimateTokens(warning) > Math.min(GUIDANCE_BUDGET, getOutputTokenBudget(ctx.model))) return;
		return {
			content: [...event.content, { type: "text", text: warning }],
			structuredContent: event.structuredContent,
		};
	});
}
