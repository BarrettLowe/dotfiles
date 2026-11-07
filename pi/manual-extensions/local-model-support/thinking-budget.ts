// Adapted from little-coder 1.20.0 thinking-budget (Copyright 2026 Itay Inbar).
// Apache-2.0; see LICENSE and NOTICE in this directory.
import type { ExtensionAPI, ExtensionContext, InputEvent } from "@earendil-works/pi-coding-agent";
import { estimateTokens, getOutputTokenBudget, isSupportedModel, OUTPUT_RESERVE_TOKENS } from "./shared.ts";

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Matches the text and ordered images that Pi exposes, without retaining input objects. */
function inputKey(text: string, images: readonly { mimeType: string; data: string }[] = []): string {
	return JSON.stringify([text, images.map(image => [image.mimeType, image.data])]);
}

/**
 * Limits local requests without changing the user's session thinking level.
 * Pi exposes no queue ID or delivered input source. Matching assumes later handlers
 * and templates preserve text/images; rewrites cannot be reliably attributed.
 * Known identical mixed-source entries remain unresolved rather than guessing order.
 * Unresolved genuine inputs suppress recovery and cannot reset stopped/off controls;
 * submit fresh genuine input while idle to clear them.
 */
export default function thinkingBudget(pi: ExtensionAPI) {
	let retryUsed = false;
	let forceOff = false;
	let stopped = false;
	let inputGeneration = 0;
	let taskGeneration = 0;
	const queuedInputs: { key: string; source: InputEvent["source"]; generation: number }[] = [];
	let request: {
		model: string;
		generation: number;
		thinkingBudget: number;
		thinkingText: string;
		canDisable: boolean;
		off: boolean;
	} | undefined;

	function resetTask(generation = inputGeneration) {
		retryUsed = false;
		forceOff = false;
		stopped = false;
		taskGeneration = generation;
	}

	function reset() {
		inputGeneration = 0;
		queuedInputs.length = 0;
		resetTask();
		request = undefined;
	}

	function stop(ctx: ExtensionContext, reason: string) {
		stopped = true;
		request = undefined;
		pi.sendMessage({ customType: "thinking-budget", content: reason, display: true }, { triggerTurn: false });
		ctx.ui.notify(reason, "warning");
		ctx.abort();
	}

	pi.on("session_start", reset);
	pi.on("session_shutdown", reset);
	pi.on("input", event => {
		const genuine = event.source === "interactive" || event.source === "rpc";
		if (!genuine && event.source !== "extension") return;
		if (genuine) inputGeneration++;
		// Queuing input does not cancel the current stream or start the next task.
		if (event.streamingBehavior || request) {
			queuedInputs.push({ key: inputKey(event.text, event.images), source: event.source, generation: inputGeneration });
		} else if (genuine) {
			queuedInputs.length = 0;
			resetTask();
		}
	});
	pi.on("message_start", event => {
		const message = event.message;
		if (queuedInputs.length === 0 || message.role !== "user") return;
		const text = typeof message.content === "string" ? message.content :
			message.content.filter(block => block.type === "text").map(block => block.text).join("\n");
		const images = typeof message.content === "string" ? [] : message.content.filter(block => block.type === "image");
		const key = inputKey(text, images);
		const matches = queuedInputs.filter(input => input.key === key);
		if (matches.length === 0 || (matches.some(input => input.source === "extension") &&
			matches.some(input => input.source !== "extension"))) return;
		const delivered = matches[0];
		queuedInputs.splice(queuedInputs.indexOf(delivered), 1);
		if (delivered.source !== "extension") resetTask(delivered.generation);
	});
	pi.on("model_select", () => {
		// Overrides belong to the old model, but switching must not grant another retry.
		request = undefined;
		forceOff = false;
	});

	pi.on("before_provider_request", (event, ctx) => {
		const model = ctx.model;
		request = undefined;
		if (!isSupportedModel(model) || !model || !record(event.payload)) return;
		if (ctx.signal?.aborted || (event.payload.model !== undefined && event.payload.model !== model.id)) return;
		if (stopped) {
			ctx.abort();
			return;
		}
		const payload = event.payload;
		const limits = [payload.max_tokens, payload.max_completion_tokens].filter(
			(value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
		);
		const outputBudget = Math.floor(Math.min(getOutputTokenBudget(model), ...limits));
		if (outputBudget < 1) {
			stop(ctx, "Thinking budget stopped: the output limit leaves no whole tokens for an answer.");
			return;
		}
		const kwargs = payload.chat_template_kwargs;
		const canDisable = model.api === "openai-completions" && model.reasoning === true &&
			record(model.compat) && model.compat.thinkingFormat === "qwen-chat-template" && model.thinkingLevelMap?.off === "off" &&
			record(kwargs) && typeof kwargs.enable_thinking === "boolean";
		if (forceOff && !canDisable) {
			stop(ctx, "Thinking recovery stopped: this request has no verified thinking-off control.");
			return;
		}
		// Half is an arbitrary conservative allowance, not a measured tokenizer budget.
		const thinkingBudget = Math.max(0, Math.min(Math.floor(outputBudget / 2), outputBudget - OUTPUT_RESERVE_TOKENS));
		const off = forceOff || (canDisable && (thinkingBudget === 0 || (record(kwargs) && kwargs.enable_thinking === false)));
		request = { model: model.id, generation: taskGeneration, thinkingBudget, thinkingText: "", canDisable, off };
		const replacement: Record<string, unknown> = { ...payload, max_tokens: outputBudget };
		// Respect a second cap if an earlier extension supplied it; never enlarge either cap.
		if (typeof payload.max_completion_tokens === "number" && payload.max_completion_tokens > 0) {
			replacement.max_completion_tokens = Math.min(payload.max_completion_tokens, outputBudget);
		}
		if (off && record(kwargs)) replacement.chat_template_kwargs = { ...kwargs, enable_thinking: false };
		return replacement;
	});

	pi.on("message_update", (event, ctx) => {
		const message = event.message;
		if (!isSupportedModel(ctx.model) || !request || ctx.signal?.aborted ||
			message.role !== "assistant" || !isSupportedModel({ provider: message.provider, id: message.model }) ||
			message.model !== request.model || ctx.model?.id !== request.model || event.assistantMessageEvent.type !== "thinking_delta") return;
		request.thinkingText += event.assistantMessageEvent.delta;
		if (estimateTokens(request.thinkingText) <= request.thinkingBudget) return;
		// Pi cannot distinguish our abort from a later user cancellation. Never queue work after it.
		stop(ctx, request.off
			? "Thinking recovery failed: thinking-off still emitted excessive thinking. Stopped without another retry."
			: "Thinking budget exceeded; stopped without queuing a retry after abort.");
	});

	pi.on("turn_end", (event, ctx) => {
		const current = request;
		request = undefined;
		const message = event.message;
		if (!isSupportedModel(ctx.model) || !current || current.generation !== inputGeneration ||
			queuedInputs.some(input => input.source !== "extension") || stopped || ctx.signal?.aborted ||
			event.outcome !== "completed" || message.role !== "assistant" ||
			!isSupportedModel({ provider: message.provider, id: message.model }) || message.model !== current.model || ctx.model?.id !== current.model ||
			message.stopReason !== "length") return;
		const hasThinking = message.content.some(block => block.type === "thinking" && block.thinking.length > 0);
		const hasAnswer = message.content.some(block => block.type === "toolCall" || (block.type === "text" && block.text.trim().length > 0));
		if (!hasThinking || hasAnswer) return;
		if (retryUsed || current.off || !current.canDisable) {
			stop(ctx, !current.canDisable
				? "Thinking recovery stopped: no verified thinking-off control; no retry sent."
				: "Thinking recovery failed: response ended without an answer. No further retry sent.");
			return;
		}
		retryUsed = true;
		forceOff = true;
		// A boundary entry avoids sendUserMessage's asynchronous input handlers and stale queued retries.
		return {
			entries: [...event.entries, {
				type: "custom_message" as const, customType: "thinking-budget", display: true,
				content: "[thinking budget exhausted] Finish the requested task or report your findings now. " +
					"Keep the original scope and permissions, including any read-only or review-only restrictions. " +
					"Do not make code changes unless the original request asked for them.",
			}],
			continue: true,
		};
	});
}
