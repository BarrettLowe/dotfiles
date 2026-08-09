/**
 * bashCommandParser.ts — Split a bash command line into individual sub-command
 * invocations so a permission gate can check every executable that would run,
 * not just the first token of the whole line.
 *
 * Parsing is delegated to the `unbash` package (https://github.com/webpro-nl/unbash),
 * a real AST-based bash parser, instead of hand-rolled regex/character
 * scanning. We walk its AST looking for every `Command` node — wherever it
 * appears: pipelines, `&&`/`||` chains, `if`/`for`/`while`/`case`/functions,
 * subshells `(...)`, brace groups `{...}`, command substitution `$(...)`/
 * backticks, process substitution `<(...)`/`>(...)`, arithmetic command
 * substitution, and *unquoted heredoc bodies* (where `$(...)` genuinely
 * executes before the reading command sees its stdin — quoted-delimiter
 * heredocs are correctly left alone since bash performs no expansion there).
 *
 * Leading env-var assignments (`FOO=bar cmd`) and transparent wrapper
 * commands (sudo, env, command, exec, nice, nohup) are unwrapped so the
 * whitelist checks what's *actually* run, not the wrapper. `time` and `!`
 * don't need any special-casing here — unbash parses them as Pipeline
 * modifiers, not literal argv[0] tokens.
 *
 * Dependency handling: this file has ZERO static (value or type) imports of
 * "unbash" — it's loaded exclusively through a guarded `import()` inside
 * `loadUnbash()`, and the AST shapes it needs are mirrored locally as
 * structural types below (not re-exported from the package). This means the
 * extension loads and type-checks fine on a machine where `unbash` hasn't
 * been `npm install`ed yet. In that case, `parseBashCommand()` returns
 * `{ ok: false, unavailable: true, reason: <why> }` instead of throwing or
 * crashing the extension host; see `UNBASH_INSTALL_DIR` for where to run
 * `npm install` to fix it. `extensions/bash-whitelist.ts` is responsible for
 * turning that into a loud, once-per-session, disabled-and-here's-why notice.
 *
 * Deliberately does NOT do flag inspection (e.g. `find -exec`, `xargs cmd`)
 * — see extensions/bash-whitelist.ts header comment for the accepted scope
 * boundary. Also does not follow associative/indexed array assignment
 * indices (`arr[$(cmd)]=val`) — unbash exposes `AssignmentPrefix.index` as a
 * plain string, not a parsed word, so there's nothing structured to walk
 * there. This is an obscure, rarely-used construct; treated as an accepted
 * gap rather than reason to fail closed.
 *
 * Any parse error unbash reports (unterminated quote, unbalanced
 * parens/braces, etc.) fails closed: `ok: false`. Callers MUST treat
 * `ok: false` as "cannot verify, do not silently allow."
 */

import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface BashInvocation {
	/** The sub-command as `exe arg1 arg2 ...`, after env/wrapper stripping and dequoting (for display). */
	raw: string;
	/** The executable token, dequoted — may be a path ("/usr/bin/ls", "./ls") or an unresolved dynamic
	 * expression ("$MYCMD", "$(echo ls)") that will simply never match a whitelist entry by name. */
	exe: string;
	/** path.basename(exe) — what whitelist matching is actually keyed on. */
	exeBasename: string;
	/** Argument list, dequoted. */
	args: string[];
}

export interface ParsedBashCommand {
	/** false => parsing was ambiguous/unsupported (or unbash is unavailable); caller MUST fail-closed. */
	ok: boolean;
	/** One entry per sub-command found. Not deduped — caller's job. */
	invocations: BashInvocation[];
	notes: string[];
	/** Set when ok=false — why we gave up. */
	reason?: string;
	/** true iff parsing wasn't even attempted because the "unbash" dependency
	 * couldn't be loaded. Distinguishes "this one command failed to parse"
	 * from "the parser itself isn't installed" — callers should treat the
	 * latter as a reason to disable themselves entirely, loudly, rather than
	 * fail-closed-forever on every bash call. */
	unavailable?: boolean;
}

/** Where `npm install` needs to be run to provide "unbash" (the directory holding extensions/package.json). */
export const UNBASH_INSTALL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const MAX_NESTING_DEPTH = 20;

const WRAPPER_PREFIXES: Record<string, { flagsWithArg: Set<string>; flagsBare: Set<string> }> = {
	sudo: { flagsWithArg: new Set(["-u", "-g", "-p", "-h"]), flagsBare: new Set(["-E", "-H", "-n", "-S", "-k", "-b", "-i", "-s", "--"]) },
	env: { flagsWithArg: new Set(["-u", "-C", "-S"]), flagsBare: new Set(["-i", "-0", "--"]) },
	command: { flagsWithArg: new Set(), flagsBare: new Set(["-p", "-v", "-V"]) },
	exec: { flagsWithArg: new Set(), flagsBare: new Set(["-a", "-c", "-l"]) },
	nice: { flagsWithArg: new Set(["-n", "--adjustment"]), flagsBare: new Set() },
	nohup: { flagsWithArg: new Set(), flagsBare: new Set() },
};

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

// ---------------------------------------------------------------------------
// Local structural mirror of the slice of unbash's AST we actually consume.
// Deliberately NOT `import type`-ed from "unbash" — see file header. These
// are duck-typed against unbash@^4's dist/*.d.ts; if unbash changes shape,
// TypeScript won't catch it (there's no compile-time link), but the walker
// below will simply stop matching new node kinds and `parseBashCommand`
// falls back to its per-property `?.` guards rather than throwing.
// ---------------------------------------------------------------------------

interface UWord {
	text: string;
	value: string;
	parts?: UWordPart[];
}

type UWordPart =
	| { type: "Literal" | "SingleQuoted" | "AnsiCQuoted" | "SimpleExpansion" | "ParameterExpansion" | "ExtendedGlob" | "BraceExpansion" }
	| { type: "DoubleQuoted" | "LocaleString"; parts: UWordPart[] }
	| { type: "CommandExpansion" | "ProcessSubstitution"; script?: UScript }
	| { type: "ArithmeticExpansion"; expression?: UArithmeticExpression };

type UArithmeticExpression =
	| { type: "ArithmeticBinary"; left: UArithmeticExpression; right: UArithmeticExpression }
	| { type: "ArithmeticUnary"; operand: UArithmeticExpression }
	| { type: "ArithmeticTernary"; test: UArithmeticExpression; consequent: UArithmeticExpression; alternate: UArithmeticExpression }
	| { type: "ArithmeticGroup"; expression: UArithmeticExpression }
	| { type: "ArithmeticWord" }
	| { type: "ArithmeticCommandExpansion"; script?: UScript };

interface UAssignmentPrefix {
	value?: UWord;
	array?: UWord[];
}

interface URedirect {
	target?: UWord;
	body?: UWord;
}

interface UCommand {
	type: "Command";
	name?: UWord;
	prefix: UAssignmentPrefix[];
	suffix: UWord[];
	redirects: URedirect[];
}

interface UCompoundList {
	type: "CompoundList";
	commands: UStatement[];
}

interface UStatement {
	type: "Statement";
	command: UNode;
	redirects: URedirect[];
}

interface UCaseItem {
	pattern: UWord[];
	body: UCompoundList;
}

type UTestExpression =
	| { type: "TestUnary"; operand: UWord }
	| { type: "TestBinary"; left: UWord; right: UWord }
	| { type: "TestLogical"; left: UTestExpression; right: UTestExpression }
	| { type: "TestNot"; operand: UTestExpression }
	| { type: "TestGroup"; expression: UTestExpression };

type UNode =
	| UCommand
	| { type: "Pipeline"; commands: UNode[] }
	| { type: "AndOr"; commands: UNode[] }
	| { type: "If"; clause: UCompoundList; then: UCompoundList; else?: UCompoundList | UNode }
	| { type: "For"; name: UWord; wordlist: UWord[]; body: UCompoundList }
	| { type: "ArithmeticFor"; initialize?: UArithmeticExpression; test?: UArithmeticExpression; update?: UArithmeticExpression; body: UCompoundList }
	| { type: "Select"; name: UWord; wordlist: UWord[]; body: UCompoundList }
	| { type: "While"; clause: UCompoundList; body: UCompoundList }
	| { type: "Function"; name: UWord; body: UNode; redirects: URedirect[] }
	| { type: "Subshell"; body: UCompoundList }
	| { type: "BraceGroup"; body: UCompoundList }
	| UCompoundList
	| { type: "Case"; word: UWord; items: UCaseItem[] }
	| { type: "Coproc"; name?: UWord; body: UNode; redirects: URedirect[] }
	| { type: "TestCommand"; expression: UTestExpression }
	| { type: "ArithmeticCommand"; expression?: UArithmeticExpression }
	| UStatement;

interface UScript {
	type: "Script";
	commands: UStatement[];
}

interface UParseError {
	message: string;
	pos: number;
}

interface UnbashModule {
	parse(source: string): UScript & { errors?: UParseError[] };
}

// ---------------------------------------------------------------------------
// Guarded dependency loading
// ---------------------------------------------------------------------------

let unbashLoadPromise: Promise<{ mod?: UnbashModule; error?: string }> | undefined;

function loadUnbash(): Promise<{ mod?: UnbashModule; error?: string }> {
	if (!unbashLoadPromise) {
		// The specifier is intentionally a plain string literal (not built up
		// dynamically) so bundlers/loaders that DO try to statically resolve
		// dynamic imports still fail gracefully into this try/catch rather
		// than at module-evaluation time.
		unbashLoadPromise = import("unbash")
			.then((mod) => ({ mod: mod as unknown as UnbashModule }))
			.catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));
	}
	return unbashLoadPromise;
}

class NestingLimitError extends Error {}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function parseBashCommand(command: string): Promise<ParsedBashCommand> {
	const { mod, error } = await loadUnbash();
	if (!mod) {
		return {
			ok: false,
			invocations: [],
			notes: [],
			unavailable: true,
			reason: error ?? "unknown error loading \"unbash\"",
		};
	}

	let ast: UScript & { errors?: UParseError[] };
	try {
		ast = mod.parse(command);
	} catch (err) {
		// unbash is documented to never throw and to collect errors instead,
		// but guard anyway — a thrown error must fail closed, not crash the
		// extension host.
		return { ok: false, invocations: [], notes: [], reason: `unbash threw: ${err instanceof Error ? err.message : String(err)}` };
	}

	if (ast.errors && ast.errors.length > 0) {
		return {
			ok: false,
			invocations: [],
			notes: [],
			reason: ast.errors.map((e) => `${e.message} (pos ${e.pos})`).join("; "),
		};
	}

	const invocations: BashInvocation[] = [];
	const walker = new Walker(invocations);
	try {
		walker.walkScript(ast);
	} catch (err) {
		if (err instanceof NestingLimitError) {
			return { ok: false, invocations: [], notes: [], reason: "Command nesting depth exceeds safety limit." };
		}
		throw err;
	}

	return { ok: true, invocations, notes: [] };
}

// ---------------------------------------------------------------------------
// AST walker — collects one BashInvocation per Command node found anywhere
// in the tree (including inside nested scripts from command/process
// substitution and unquoted heredoc bodies).
// ---------------------------------------------------------------------------

class Walker {
	private depth = 0;
	private invocations: BashInvocation[];

	constructor(invocations: BashInvocation[]) {
		this.invocations = invocations;
	}

	walkScript(script: UScript): void {
		for (const stmt of script.commands) this.walkStatement(stmt);
	}

	/** Recurse into a *nested* script (from $()/``/<()/>()/arithmetic command expansion/heredoc), depth-limited. */
	private enterNestedScript(script: UScript): void {
		if (this.depth >= MAX_NESTING_DEPTH) throw new NestingLimitError("nesting too deep");
		this.depth++;
		try {
			this.walkScript(script);
		} finally {
			this.depth--;
		}
	}

	private walkCompoundList(cl: UCompoundList): void {
		for (const stmt of cl.commands) this.walkStatement(stmt);
	}

	private walkStatement(stmt: UStatement): void {
		this.walkNode(stmt.command);
		for (const r of stmt.redirects) this.walkRedirect(r);
	}

	private walkNode(node: UNode): void {
		switch (node.type) {
			case "Command":
				this.walkCommand(node);
				return;
			case "Pipeline":
			case "AndOr":
				for (const c of node.commands) this.walkNode(c);
				return;
			case "If":
				this.walkCompoundList(node.clause);
				this.walkCompoundList(node.then);
				if (node.else) {
					if (node.else.type === "CompoundList") this.walkCompoundList(node.else);
					else this.walkNode(node.else); // `elif` chain: nested If
				}
				return;
			case "For":
				this.walkWord(node.name);
				for (const w of node.wordlist) this.walkWord(w);
				this.walkCompoundList(node.body);
				return;
			case "ArithmeticFor":
				this.walkArithmeticMaybe(node.initialize);
				this.walkArithmeticMaybe(node.test);
				this.walkArithmeticMaybe(node.update);
				this.walkCompoundList(node.body);
				return;
			case "Select":
				this.walkWord(node.name);
				for (const w of node.wordlist) this.walkWord(w);
				this.walkCompoundList(node.body);
				return;
			case "While":
				this.walkCompoundList(node.clause);
				this.walkCompoundList(node.body);
				return;
			case "Function":
				this.walkWord(node.name);
				this.walkNode(node.body);
				for (const r of node.redirects) this.walkRedirect(r);
				return;
			case "Subshell":
			case "BraceGroup":
				this.walkCompoundList(node.body);
				return;
			case "CompoundList":
				this.walkCompoundList(node);
				return;
			case "Case":
				this.walkWord(node.word);
				for (const item of node.items) {
					for (const p of item.pattern) this.walkWord(p);
					this.walkCompoundList(item.body);
				}
				return;
			case "Coproc":
				if (node.name) this.walkWord(node.name);
				this.walkNode(node.body);
				for (const r of node.redirects) this.walkRedirect(r);
				return;
			case "TestCommand":
				this.walkTestExpr(node.expression);
				return;
			case "ArithmeticCommand":
				this.walkArithmeticMaybe(node.expression);
				return;
			case "Statement":
				this.walkStatement(node);
				return;
		}
	}

	private walkTestExpr(expr: UTestExpression): void {
		switch (expr.type) {
			case "TestUnary":
				this.walkWord(expr.operand);
				return;
			case "TestBinary":
				this.walkWord(expr.left);
				this.walkWord(expr.right);
				return;
			case "TestLogical":
				this.walkTestExpr(expr.left);
				this.walkTestExpr(expr.right);
				return;
			case "TestNot":
				this.walkTestExpr(expr.operand);
				return;
			case "TestGroup":
				this.walkTestExpr(expr.expression);
				return;
		}
	}

	private walkArithmeticMaybe(expr: UArithmeticExpression | undefined): void {
		if (!expr) return;
		switch (expr.type) {
			case "ArithmeticBinary":
				this.walkArithmeticMaybe(expr.left);
				this.walkArithmeticMaybe(expr.right);
				return;
			case "ArithmeticUnary":
				this.walkArithmeticMaybe(expr.operand);
				return;
			case "ArithmeticTernary":
				this.walkArithmeticMaybe(expr.test);
				this.walkArithmeticMaybe(expr.consequent);
				this.walkArithmeticMaybe(expr.alternate);
				return;
			case "ArithmeticGroup":
				this.walkArithmeticMaybe(expr.expression);
				return;
			case "ArithmeticWord":
				return; // plain numeric/identifier text — nothing nested
			case "ArithmeticCommandExpansion":
				if (expr.script) this.enterNestedScript(expr.script);
				return;
		}
	}

	private walkRedirect(r: URedirect): void {
		if (r.target) this.walkWord(r.target);
		// Unquoted heredoc body (`<<EOF`, not `<<'EOF'`/`<<"EOF"`): bash
		// expands $()/`` inside it before feeding it to the reading command's
		// stdin, so this genuinely executes. Quoted-delimiter heredocs never
		// get a `.body` from unbash (no expansion happens), so this is a
		// no-op for those — correctly.
		if (r.body) this.walkWord(r.body);
	}

	private walkAssignment(a: UAssignmentPrefix): void {
		if (a.value) this.walkWord(a.value);
		if (a.array) for (const w of a.array) this.walkWord(w);
	}

	/** Walk a Word's structured parts for embedded command/process substitutions — however deep and wherever the word appears (env value, redirect target, heredoc body, case pattern, wordlist entry, etc.). */
	private walkWord(word: UWord): void {
		if (!word.parts) return;
		for (const part of word.parts) this.walkWordPart(part);
	}

	private walkWordPart(part: UWordPart): void {
		switch (part.type) {
			case "CommandExpansion":
			case "ProcessSubstitution":
				if (part.script) this.enterNestedScript(part.script);
				return;
			case "ArithmeticExpansion":
				this.walkArithmeticMaybe(part.expression);
				return;
			case "DoubleQuoted":
			case "LocaleString":
				for (const child of part.parts) this.walkWordPart(child);
				return;
			default:
				return; // Literal, SingleQuoted, AnsiCQuoted, SimpleExpansion, ParameterExpansion, ExtendedGlob, BraceExpansion — no nested executable content
		}
	}

	private walkCommand(cmd: UCommand): void {
		for (const p of cmd.prefix) this.walkAssignment(p);
		for (const r of cmd.redirects) this.walkRedirect(r);
		if (!cmd.name) return; // e.g. a bare assignment/redirect with no command — nothing runs

		this.walkWord(cmd.name);
		for (const s of cmd.suffix) this.walkWord(s);

		let exe = cmd.name.value;
		let args = cmd.suffix.map((s) => s.value);

		// Unwrap transparent wrapper commands so the whitelist checks what's
		// actually run, not the wrapper itself (sudo/env/etc. are never
		// separately whitelist-checked — same accepted behavior as before).
		for (;;) {
			const wrapper = WRAPPER_PREFIXES[basename(exe)];
			if (!wrapper) break;

			let idx = 0;
			while (idx < args.length) {
				const t = args[idx]!;
				if (t === "--") {
					idx++;
					break;
				}
				if (wrapper.flagsWithArg.has(t)) {
					idx += 2;
					continue;
				}
				if (wrapper.flagsBare.has(t)) {
					idx += 1;
					continue;
				}
				if (ENV_ASSIGNMENT_RE.test(t)) {
					idx += 1; // e.g. `env FOO=bar cmd`
					continue;
				}
				if (t.startsWith("-")) {
					idx += 1; // permissive: unrecognized wrapper flag, keep looking for the real command
					continue;
				}
				break;
			}

			if (idx >= args.length) return; // bare wrapper with nothing left to run — nothing to check

			exe = args[idx]!;
			args = args.slice(idx + 1);
		}

		this.invocations.push({
			raw: [exe, ...args].join(" "),
			exe,
			exeBasename: basename(exe),
			args,
		});
	}
}
