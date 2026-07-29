# explore

Narrates a module's architectural role: what it's accountable for, what it owns, what it takes for granted, and who it talks to. Read-only. No suggestions.

Different from `/wtf` (single-file cold-open) and `/map` (dependency topology). This is the architectural-narrative view of a module's place in the system.

## Usage

```
/explore path/to/module/     # explore a directory as a module
/explore path/to/file.py     # explore a single file (architectural role, not line-by-line)
```

## What You Must Do When Invoked

1. Read the target — all files if a directory, or the single file.
2. Grep for the module name in surrounding code to understand how it's consumed.
3. Write four sections in order. Each is 2-4 sentences of narrative prose — no bullet points.

## The Four Sections

**Responsibilities** — What is this module accountable for? What decisions does it own? State the boundary explicitly: what does it NOT do that you might expect it to?

**Ownership** — What data, state, or resources belong exclusively to this module? What would have to be rewritten if this module disappeared? What does it "know" that nothing else is supposed to know?

**Assumptions** — What does this module take for granted about its callers, its inputs, or its environment? Where would it fail silently or behave incorrectly if those assumptions were violated? Any preconditions that aren't enforced?

**Connections** — What does it talk to, and in what direction? Not an import list — the meaningful relationships: what it reads, what it writes, what it delegates to, what calls it and why.

## Output Format

Four labeled sections (bold header, prose body). End with a single italicized summary line:

*In short, [module name] is the [role] — [one phrase that captures why it exists].*

Do NOT:
- Suggest refactors or improvements
- List every function or import
- Use sub-bullets inside sections
- Write more than 4 sentences per section
