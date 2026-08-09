/**
 * bashWhitelistMatch.ts — Allow/deny matching DSL for the bash whitelist.
 *
 * Entries are flat strings (no regex library, hand-parseable):
 *   "rm"        -> allow, bare: matches `rm` with ANY args.
 *   "rm -rf"    -> allow, specific: matches `rm` whose argv STARTS WITH
 *                  the token "-rf" (specificity = number of arg tokens).
 *   "!rm -rf"   -> deny, specific: same matching rule, marks a denial.
 *   "!rm"       -> deny, bare: matches `rm` with any args (rare — kept for
 *                  symmetry/explicitness).
 *
 * Resolution: the MOST SPECIFIC matching entry wins (longest arg-token
 * prefix). If the most-specific tier contains both an allow and a deny,
 * deny wins (safe default). No flag-equivalence normalization: "rm -rf"
 * does not match "rm -fr" or "rm -r -f" — list additional spellings as
 * separate entries if you want that coverage. This is an accepted,
 * documented limitation (see extensions/bash-whitelist.ts header comment).
 */

import type { BashInvocation } from "./bashCommandParser.ts";

export interface WhitelistEntry {
	/** true if this entry came from a "!"-prefixed string. */
	deny: boolean;
	/** Bare executable name to match against exeBasename (e.g. "rm"). */
	exe: string;
	/** Ordered argument-prefix tokens (e.g. ["-rf"]); empty = matches any args. */
	argTokens: string[];
}

export type MatchResult = "allow" | "deny" | "unknown";

/**
 * Parse one config/session string into a structured entry. Returns
 * undefined for unparseable lines (empty string, bare "!") so the caller
 * can skip + warn instead of crashing.
 */
export function parseWhitelistEntry(raw: string): WhitelistEntry | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;

	let deny = false;
	let rest = trimmed;
	if (rest.startsWith("!")) {
		deny = true;
		rest = rest.slice(1).trim();
	}
	if (!rest) return undefined;

	const tokens = rest.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return undefined;

	const exe = tokens[0]!;
	const argTokens = tokens.slice(1);

	return { deny, exe, argTokens };
}

/** Inverse of parseWhitelistEntry — used when writing a new entry back to the JSON file. */
export function formatWhitelistEntry(entry: WhitelistEntry): string {
	const parts = [entry.exe, ...entry.argTokens];
	const body = parts.join(" ");
	return entry.deny ? `!${body}` : body;
}

function isArgPrefix(prefix: string[], args: string[]): boolean {
	if (prefix.length > args.length) return false;
	for (let i = 0; i < prefix.length; i++) {
		if (prefix[i] !== args[i]) return false;
	}
	return true;
}

/** Resolve one invocation against the merged (persistent ∪ session) entry list. */
export function matchInvocation(invocation: BashInvocation, entries: WhitelistEntry[]): MatchResult {
	const candidates = entries.filter((e) => e.exe === invocation.exeBasename && isArgPrefix(e.argTokens, invocation.args));

	if (candidates.length === 0) return "unknown";

	const maxSpecificity = Math.max(...candidates.map((e) => e.argTokens.length));
	const winners = candidates.filter((e) => e.argTokens.length === maxSpecificity);

	return winners.some((w) => w.deny) ? "deny" : "allow";
}
