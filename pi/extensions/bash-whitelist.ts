/**
 * Bash Whitelist Extension
 *
 * Intercepts every bash tool call. Splits the full command line into every
 * sub-command it would actually run (handling `;`, `&&`, `||`, `|`, `&`,
 * newlines, `$(...)`, backticks, `(...)` subshells, `{...}` groups,
 * `<(...)`/`>(...)`, `time`/`!` pipeline modifiers, leading env-var
 * assignments, and transparent wrapper commands like
 * `sudo`/`env`/`command`/`exec`/`nice`/`nohup`) and checks EVERY resulting executable — not just the first token of the whole
 * line — against a configurable allow/deny list.
 *
 * Whitelist entries live in ~/.pi/agent/bash-whitelist.json (auto-created
 * with sensible defaults on first run) and support a small hand-editable
 * DSL, matched by executable basename (so /usr/bin/ls and ./ls both match
 * an "ls" entry):
 *
 *   "rm"        allow any `rm` invocation
 *   "rm -rf"    allow only `rm` invocations whose args start with "-rf"
 *   "!rm"       deny any `rm` invocation
 *   "!rm -rf"   deny only `rm` invocations whose args start with "-rf"
 *
 * The most specific matching entry wins (longest matching arg-token
 * prefix); ties go to deny. This lets you whitelist `rm` broadly while
 * still hard-blocking `rm -rf` specifically, by adding both lines to the
 * config file. Deny matches block immediately with no prompt — that's the
 * point of a deny rule: a standing decision you don't want to re-litigate.
 *
 * Unknown (neither allowed nor denied) executables are prompted for, one
 * at a time, per distinct executable in a command line, with four choices:
 * once / remember for this session / add to the whitelist permanently / no.
 *
 * Accepted scope boundaries (documented, not fixed):
 *   - No flag inspection beyond the DSL's own arg-prefix matching: a
 *     whitelisted `find`/`xargs` can still be used to run non-whitelisted
 *     programs via `find -exec`/`-execdir`/`-ok`/`-okdir` or `xargs cmd`.
 *   - Shell aliases and env-var-as-command (`$MYCMD arg`) are invisible to
 *     static parsing; the latter always resolves "unknown" (prompts).
 *   - No arg-token normalization: "rm -rf" does not match "rm -fr" or
 *     "rm -r -f" — list additional spellings as separate entries.
 *   - Subagents run as separate non-interactive `pi --print` processes that
 *     load this extension fresh but have no UI: anything not already in
 *     the persisted whitelist file is hard-blocked for them, with no
 *     prompt surfaced back to the parent session, and no inheritance of
 *     the parent session's in-session ("remember for this session")
 *     approvals.
 *   - No project-local override in this pass. Extension point noted below
 *     at the config-load call site.
 *
 * Parsing is delegated to the `unbash` package (see lib/bashCommandParser.ts).
 * If it isn't installed (missing `npm install` in extensions/), this
 * extension DISABLES ITSELF: it prints one loud error (via ctx.ui.notify
 * when available, and always to stderr, since notify is a no-op in
 * print/json mode) and then stops intercepting bash calls entirely for the
 * rest of the process — every bash command runs UNCHECKED until the
 * dependency is installed and pi is restarted/reloaded. This is a
 * deliberate choice: a missing dev dependency shouldn't silently turn into
 * either a total bash lockout or a permanently-confusing per-command
 * parse-failure prompt; better to fail loudly-and-open with a clear fix.
 *
 * `/yolo` command: a manual, explicit escape hatch that toggles this WHOLE
 * extension on/off for the rest of the current session. When ON, bash calls
 * run completely unchecked — no allow/deny matching, no prompts, deny rules
 * included. It's a deliberate, in-your-face bypass (not a leniency dial),
 * meant for short bursts of "I know what I'm doing, stop asking me" during a
 * single session. It always resets to OFF at the next session_start (fresh
 * session, fresh process, or `/reload` all re-run it) — this is a per-session
 * decision, never a persisted one.
 */

import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { parseBashCommand, UNBASH_INSTALL_DIR } from "./lib/bashCommandParser.ts";
import { addToWhitelistPermanently, getWhitelistConfigPath, loadWhitelistConfig } from "./lib/bashWhitelistConfig.ts";
import { matchInvocation, type WhitelistEntry } from "./lib/bashWhitelistMatch.ts";

let whitelistEntries: WhitelistEntry[] = [];
let sessionApprovedEntries: WhitelistEntry[] = [];
let loaded = false;
let unbashUnavailableWarned = false;
let yoloMode = false;

function warnUnbashUnavailable(reason: string, ctx: { hasUI: boolean; ui: { notify: (msg: string, level: "info" | "warning" | "error") => void } }) {
	if (unbashUnavailableWarned) return;
	unbashUnavailableWarned = true;
	const message =
		`bash-whitelist extension is DISABLED: required dependency "unbash" could not be loaded (${reason}). ` +
		`Run "npm install" in ${UNBASH_INSTALL_DIR} to restore whitelist checks. ` +
		`Until then, ALL bash commands run WITHOUT whitelist checks for the rest of this process.`;
	// console.error always fires, regardless of hasUI/mode, so this is never
	// silently swallowed in print/json/RPC/subagent contexts where ctx.ui
	// methods may be no-ops.
	console.error(`[bash-whitelist] ${message}`);
	if (ctx.hasUI) ctx.ui.notify(message, "error");
}

function ensureLoaded(ctx: { hasUI: boolean; ui: { notify: (msg: string, level: "info" | "warning" | "error") => void } }) {
	if (loaded) return;
	loaded = true;
	// TODO: layer a project-local ${CONFIG_DIR_NAME}/bash-whitelist.json here
	// (see docs/extensions.md's ctx.cwd + CONFIG_DIR_NAME pattern, gated by
	// ctx.isProjectTrusted()) if per-project rules are ever wanted. Skipped
	// for this pass — a project file that could *loosen* the global list is
	// a security-relevant capability that deserves its own deliberate design.
	const result = loadWhitelistConfig();
	whitelistEntries = result.entries;
	if (ctx.hasUI) {
		if (result.created) {
			ctx.ui.notify(`Created default bash whitelist at ${getWhitelistConfigPath()}`, "info");
		}
		if (result.warning) {
			ctx.ui.notify(result.warning, "warning");
		}
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		loaded = false;
		sessionApprovedEntries = [];
		unbashUnavailableWarned = false;
		yoloMode = false;
		ensureLoaded(ctx);
	});

	pi.registerCommand("yolo", {
		description: "Toggle the bash whitelist gate on/off for this session (ON bypasses ALL checks, including deny rules)",
		handler: async (_args, ctx) => {
			yoloMode = !yoloMode;
			if (yoloMode) {
				ctx.ui.notify(
					"⚠️ YOLO mode ON — bash whitelist checks (allow/deny/prompts) are DISABLED for the rest of this session. Run /yolo again to turn it back off.",
					"warning",
				);
			} else {
				ctx.ui.notify("YOLO mode OFF — bash whitelist checks are back on.", "info");
			}
		},
	});

	pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
		if (event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!command || typeof command !== "string") return;

		// User-invoked full bypass — skip loading/parsing entirely.
		if (yoloMode) return;

		ensureLoaded(ctx);

		const parsed = await parseBashCommand(command);

		// The parser itself isn't installed — disable this extension entirely
		// (loudly, once) rather than fail-closed-forever on every bash call.
		if (parsed.unavailable) {
			warnUnbashUnavailable(parsed.reason ?? "unknown error", ctx);
			return;
		}

		// Parsing failed — fail closed. No "remember" options: there's no
		// reliable executable identity to attach a rule to.
		if (!parsed.ok) {
			if (!ctx.hasUI) {
				return {
					block: true,
					reason: `Command could not be parsed for whitelist checking (${parsed.reason ?? "unknown reason"}) and no UI is available for confirmation.`,
				};
			}

			const choice = await ctx.ui.select(
				`⚠️ Could not safely parse this bash command for whitelist checking:\n\n  ${command}\n\nReason: ${parsed.reason ?? "unknown"}\n\nAllow anyway?`,
				["Yes, just this once", "No"],
			);

			if (choice === "Yes, just this once") return;
			return { block: true, reason: "Blocked — command could not be safely parsed and the user did not approve it." };
		}

		const mergedEntries = [...whitelistEntries, ...sessionApprovedEntries];

		// Step 1: any explicit deny match short-circuits everything. No
		// prompt — a deny rule is a standing decision.
		for (const invocation of parsed.invocations) {
			const result = matchInvocation(invocation, mergedEntries);
			if (result === "deny") {
				return {
					block: true,
					reason: `Blocked by explicit deny rule matching "${invocation.exeBasename}${invocation.args.length ? " " + invocation.args.join(" ") : ""}".`,
				};
			}
		}

		// Step 2: collect unknown invocations, deduped by executable basename.
		const seen = new Set<string>();
		const unknown: { exeBasename: string; display: string }[] = [];
		for (const invocation of parsed.invocations) {
			const result = matchInvocation(invocation, mergedEntries);
			if (result === "unknown" && !seen.has(invocation.exeBasename)) {
				seen.add(invocation.exeBasename);
				unknown.push({ exeBasename: invocation.exeBasename, display: invocation.raw });
			}
		}

		if (unknown.length === 0) {
			// Everything resolved to "allow" — let pi execute normally.
			return;
		}

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Command has unwhitelisted executable(s) (${unknown.map((u) => u.exeBasename).join(", ")}) and no UI is available for confirmation.`,
			};
		}

		// Step 3: prompt once per distinct unknown executable, in order of
		// first appearance. First "No" short-circuits the rest.
		for (const item of unknown) {
			const choice = await ctx.ui.select(
				`⚠️ Unwhitelisted bash command:\n\n  ${command}\n\nReviewing: ${item.display}\n\nAllow "${item.exeBasename}"?`,
				[
					"Yes, just this once",
					`Yes, and remember '${item.exeBasename}' for this session`,
					`Yes, add '${item.exeBasename}' to the whitelist permanently`,
					"No",
				],
			);

			if (choice === "Yes, just this once") {
				continue;
			}

			if (choice === `Yes, and remember '${item.exeBasename}' for this session`) {
				sessionApprovedEntries.push({ deny: false, exe: item.exeBasename, argTokens: [] });
				continue;
			}

			if (choice === `Yes, add '${item.exeBasename}' to the whitelist permanently`) {
				const entry: WhitelistEntry = { deny: false, exe: item.exeBasename, argTokens: [] };
				const result = addToWhitelistPermanently(entry);
				whitelistEntries = result.entries;
				if (result.success) {
					ctx.ui.notify(`Added '${item.exeBasename}' to ${getWhitelistConfigPath()}`, "info");
				} else {
					ctx.ui.notify(`Could not save whitelist: ${result.error} — allowing this command anyway.`, "warning");
				}
				continue;
			}

			// "No" or dialog dismissed (undefined).
			return { block: true, reason: `Blocked by user — "${item.exeBasename}" is not whitelisted.` };
		}

		// All unknown items resolved to something other than "No".
		return;
	});
}
