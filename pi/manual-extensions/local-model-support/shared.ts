// Arbitrary defaults, not measured Ornith tokenizer or server limits.
export const OUTPUT_RESERVE_TOKENS = 1024;
export const CHARS_PER_TOKEN = 3.5;
const OUTPUT_TOKEN_CAP = 4096; // Arbitrary conservative cap for local responses.

export function isSupportedModel(model?: { provider: string; id: string }): boolean {
	return model?.provider === "llama.cpp" &&
		/^ornith(?:[-_]\d+(?:\.\d+)*(?:[-_][a-z0-9][a-z0-9._-]*)?)?$/i.test(model.id);
}

/** Whole-token cap; a positive limit below 1 leaves no whole tokens available. */
export function getOutputTokenBudget(model?: { maxTokens?: number }): number {
	const maxTokens = model?.maxTokens;
	return typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0
		? Math.floor(Math.min(OUTPUT_TOKEN_CAP, maxTokens))
		: OUTPUT_TOKEN_CAP;
}

/** Rough character-based estimate; this does not use the model's tokenizer. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}
