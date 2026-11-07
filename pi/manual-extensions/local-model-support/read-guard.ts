/**
 * Adapted from little-coder 1.20.0 .pi/extensions/read-guard/index.ts.
 * Copyright 2026 Itay Inbar. Apache-2.0; see LICENSE and NOTICE.
 * Changed to guard only Ornith, reserve response space, and retain requested ranges.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	CHARS_PER_TOKEN, OUTPUT_RESERVE_TOKENS, estimateTokens,
	getOutputTokenBudget, isSupportedModel,
} from "./shared.ts";

const DEFAULT_CONTEXT_WINDOW = 32768; // Unmeasured fallback when no window is advertised.
const MIN_NOTICE_CHARS = 64; // Exhausted read budgets borrow a short notice from the overhead reserve.
const FALLBACK_FRACTION = 0.25; // Unknown history: allow reads a quarter of usable context per turn.

/** Budget the new result, including its notice, without spending response headroom. */
export function getReadTokenBudget(
	model: { contextWindow?: number; maxTokens?: number },
	usage?: { contextWindow: number; tokens: number | null },
): number {
	const valid = (value: number | undefined): value is number =>
		typeof value === "number" && Number.isFinite(value) && value > 0;
	const window = valid(usage?.contextWindow) ? usage.contextWindow
		: valid(model.contextWindow) ? model.contextWindow : DEFAULT_CONTEXT_WINDOW;
	const usable = window - getOutputTokenBudget(model) - OUTPUT_RESERVE_TOKENS;
	const known = typeof usage?.tokens === "number" && Number.isFinite(usage.tokens) && usage.tokens >= 0;
	return Math.max(0, Math.floor(known ? usable - usage.tokens! : usable * FALLBACK_FRACTION));
}

/** Keep a prefix of the returned segment; numbered source and header ranges stay intact. */
export function trimReadText(text: string, maxChars: number, offset: number, activeTools: string[]): string {
	// Core read trailers describe the old endpoint, not the shortened segment.
	const source = text.replace(/\n\n\[(?:Showing lines |\d+ more lines in file\.)[^\n]*\]$/, "");
	const lines = source.split("\n");
	if (lines.at(-1) === "") lines.pop();
	const numbered = lines.length > 0 && lines.every(line => /^\d+(?:-\d+)?: /.test(line));
	const ranges = lines.map((line, index) => {
		const match = numbered ? line.match(/^(\d+)(?:-(\d+))?: /) : null;
		return match ? [Number(match[1]), Number(match[2] ?? match[1])] : [offset + index, offset + index];
	});
	const search = activeTools.includes("grep") ? " Search with grep."
		: activeTools.includes("bash") ? " Search via bash (rg or grep)." : "";
	const read = activeTools.includes("read") ? "read " : "";
	const notice = (line: number, partial: boolean, end?: number) => partial
		? `[Read trimmed for context; line ${line} is partial. ${read ? "Read cannot split a line; " : ""}offset=${line} repeats it (1-based).${search}]`
		: `[Read trimmed for context; ${end === undefined ? "no source lines fit" : `requested segment shown through line ${end}`}. Continue with ${read}offset=${line}, smaller limit (offset is 1-based).${search}]`;
	let head = "";
	let result = "";
	for (let index = 0; index < lines.length; index++) {
		const candidate = head + (index ? "\n" : "") + lines[index];
		const next = ranges[index + 1]?.[0] ?? ranges[index][1] + 1;
		const combined = candidate + "\n\n" + notice(next, false, ranges[index][1]);
		if (combined.length > maxChars) break;
		head = candidate;
		result = combined;
	}
	if (result) return result;

	const firstLine = ranges[0]?.[0] ?? offset;
	const partialNotice = notice(firstLine, true);
	const prefixSize = numbered ? (lines[0].match(/^\d+(?:-\d+)?: /)?.[0].length ?? 0) : 0;
	const room = maxChars - partialNotice.length - "\n\n".length;
	const omittedHeader = /^\d+(?:-\d+)?: \[read: .*header omitted by read tool\]/.test(lines[0] ?? "");
	if (!omittedHeader && room > prefixSize && lines[0]?.length > room) {
		let partial = lines[0].slice(0, room);
		// Do not cut a UTF-16 surrogate pair in half.
		if (/[\uD800-\uDBFF]$/.test(partial)) partial = partial.slice(0, -1);
		return partial + "\n\n" + partialNotice;
	}
	const emptyNotice = notice(firstLine, false);
	if (emptyNotice.length <= maxChars) return emptyNotice;
	const compactNotice = `[Read trimmed; ${read}offset=${firstLine} (1-based).]`;
	if (compactNotice.length <= maxChars) return compactNotice;
	const minimalNotice = "[Read trimmed]";
	return minimalNotice.length <= maxChars ? minimalNotice : "";
}

export default function (pi: ExtensionAPI) {
	let batchRemaining: number | undefined;
	const reset = (_event: unknown, ctx: ExtensionContext) => {
		if (!isSupportedModel(ctx.model)) return;
		batchRemaining = undefined;
	};
	pi.on("turn_start", reset);
	pi.on("session_start", reset);
	pi.on("model_select", reset);
	pi.on("tool_result", (event, ctx) => {
		if (!isSupportedModel(ctx.model)) return;
		if (event.toolName !== "read" || event.isError || event.content.length === 0) return;
		if (event.content.some(item => item.type !== "text")) return;
		const text = event.content.map(item => item.type === "text" ? item.text : "").join("");
		// Installed Pi calls this hook before persisting the result: usage excludes this read.
		const liveRemaining = getReadTokenBudget(ctx.model!, ctx.getContextUsage());
		// Take the smaller allowance; live usage may already count previous reads.
		const budget = Math.min(liveRemaining, batchRemaining ?? liveRemaining);
		if (estimateTokens(text) <= budget) {
			batchRemaining = budget - estimateTokens(text);
			return;
		}
		const offset = typeof event.input.offset === "number" && Number.isSafeInteger(event.input.offset) && event.input.offset > 0
			? event.input.offset : 1;
		const trimmed = trimReadText(text, Math.max(MIN_NOTICE_CHARS, Math.floor(budget * CHARS_PER_TOKEN)), offset, pi.getActiveTools());
		batchRemaining = Math.max(0, budget - estimateTokens(trimmed));
		return { content: [{ type: "text", text: trimmed }] };
	});
}
