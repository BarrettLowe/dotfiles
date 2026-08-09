/**
 * bashWhitelistConfig.ts — Load/save the bash whitelist config file.
 *
 * Location: ~/.pi/agent/bash-whitelist.json (via getAgentDir(), so it
 * follows pi's config directory rather than a hardcoded path).
 *
 * Format (v1):
 *   { "version": 1, "whitelist": ["ls", "cat", "rm", "!rm -rf", ...] }
 *
 * A bare JSON array (legacy/hand-authored shape) is also accepted on read
 * as an implied version 0, upgraded in memory — the file itself is only
 * rewritten to the versioned shape the next time we actually save.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { formatWhitelistEntry, parseWhitelistEntry, type WhitelistEntry } from "./bashWhitelistMatch.ts";

export interface WhitelistConfig {
	version: 1;
	whitelist: string[];
}

// Seed for first-run creation — the exact original bare-name list, moved
// verbatim from the old hardcoded WHITELIST array. No deny examples baked
// in by default; those are opt-in via hand-editing the generated file.
export const DEFAULT_WHITELIST: string[] = [
	// Info & read-only utilities
	"ls", "cat", "echo", "grep", "find", "wc", "head", "tail",
	"sort", "uniq", "diff", "file", "stat", "whoami", "pwd",
	"date", "hostname", "uname", "env", "printenv", "tree",
	"du", "df", "free", "ps", "id", "which", "whereis", "man",
	"less", "more", "readlink", "realpath", "dirname", "basename",
	"cut", "sed", "awk", "tr", "tee", "xargs", "printf",
	"test", "true", "false", "yes", "seq", "sleep",

	// Development tools
	"git", "npm", "npx", "yarn", "pip", "pip3", "python", "python3",
	"node", "tsc", "cmake", "make", "cargo", "rustc",
	"gcc", "g++", "clang", "clang++",
	"curl", "wget", "ssh", "scp", "rsync",

	// Process & network (read-only)
	"ping", "nc", "ss", "lsof",

	// Editors
	"vim", "vi", "nano", "nvim", "emacs",

	// Modern CLI alternatives
	"rg", "fd", "bat", "fzf",
];

export function getWhitelistConfigPath(): string {
	return join(getAgentDir(), "bash-whitelist.json");
}

export interface LoadResult {
	config: WhitelistConfig;
	entries: WhitelistEntry[];
	created: boolean;
	warning?: string;
}

export function loadWhitelistConfig(): LoadResult {
	const path = getWhitelistConfigPath();

	if (!existsSync(path)) {
		const config: WhitelistConfig = { version: 1, whitelist: DEFAULT_WHITELIST };
		const saveResult = saveWhitelistConfig(config);
		const entries = parseEntries(config.whitelist);
		return {
			config,
			entries,
			created: true,
			warning: saveResult.success ? undefined : `Could not create ${path}: ${saveResult.error}`,
		};
	}

	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (err) {
		const config: WhitelistConfig = { version: 1, whitelist: DEFAULT_WHITELIST };
		return {
			config,
			entries: parseEntries(DEFAULT_WHITELIST),
			created: false,
			warning: `Could not read ${path}: ${(err as Error).message}. Using built-in defaults for this session.`,
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const config: WhitelistConfig = { version: 1, whitelist: DEFAULT_WHITELIST };
		return {
			config,
			entries: parseEntries(DEFAULT_WHITELIST),
			created: false,
			warning: `${path} is malformed JSON (${(err as Error).message}); using built-in defaults for this session. Fix or delete the file to regenerate it.`,
		};
	}

	let whitelist: string[] | undefined;
	if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
		// Legacy bare-array shape.
		whitelist = parsed as string[];
	} else if (
		parsed &&
		typeof parsed === "object" &&
		Array.isArray((parsed as Record<string, unknown>).whitelist) &&
		(parsed as Record<string, unknown>).whitelist &&
		((parsed as Record<string, unknown>).whitelist as unknown[]).every((x) => typeof x === "string")
	) {
		whitelist = (parsed as { whitelist: string[] }).whitelist;
	}

	if (!whitelist) {
		const config: WhitelistConfig = { version: 1, whitelist: DEFAULT_WHITELIST };
		return {
			config,
			entries: parseEntries(DEFAULT_WHITELIST),
			created: false,
			warning: `${path} does not match the expected shape; using built-in defaults for this session. Fix or delete the file to regenerate it.`,
		};
	}

	const config: WhitelistConfig = { version: 1, whitelist };
	const badLines: string[] = [];
	const entries: WhitelistEntry[] = [];
	for (const line of whitelist) {
		const entry = parseWhitelistEntry(line);
		if (entry) entries.push(entry);
		else badLines.push(line);
	}

	return {
		config,
		entries,
		created: false,
		warning: badLines.length > 0 ? `Ignored ${badLines.length} unparseable whitelist line(s): ${badLines.join(", ")}` : undefined,
	};
}

function parseEntries(lines: string[]): WhitelistEntry[] {
	const entries: WhitelistEntry[] = [];
	for (const line of lines) {
		const entry = parseWhitelistEntry(line);
		if (entry) entries.push(entry);
	}
	return entries;
}

export function saveWhitelistConfig(config: WhitelistConfig): { success: boolean; error?: string } {
	const path = getWhitelistConfigPath();
	try {
		mkdirSync(dirname(path), { recursive: true });
		const tmpPath = `${path}.tmp`;
		writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
		renameSync(tmpPath, path);
		return { success: true };
	} catch (err) {
		return { success: false, error: (err as Error).message };
	}
}

export function addToWhitelistPermanently(entry: WhitelistEntry): {
	success: boolean;
	config: WhitelistConfig;
	entries: WhitelistEntry[];
	error?: string;
} {
	// Re-load fresh from disk to avoid clobbering a concurrent edit with a
	// stale in-memory copy.
	const current = loadWhitelistConfig();
	const formatted = formatWhitelistEntry(entry);

	if (current.config.whitelist.includes(formatted)) {
		return { success: true, config: current.config, entries: current.entries };
	}

	const whitelist = [...current.config.whitelist, formatted];
	const config: WhitelistConfig = { version: 1, whitelist };
	const saveResult = saveWhitelistConfig(config);
	const entries = parseEntries(whitelist);

	return {
		success: saveResult.success,
		config,
		entries,
		error: saveResult.error,
	};
}
