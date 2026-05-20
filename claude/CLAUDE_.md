## Who I Am / My Context
- Name / persona I usually want: Barrett — direct, concise, slightly dry humor, hates fluff
- Default tone: professional-casual, no corporate-speak, no excessive emojis
- Things I care about most right now: 
  - personal productivity & systems
  - code quality & architecture
  - learning c++ concepts in c++17 and later
- Things that annoy me: 
  - long introductions / preambles
  - suggesting Obsidian plugins I already rejected
  - assuming I'm on Windows
  - moralizing answers
  - final summary documents
  - git commits indicating that an agent made it

---

## Environment
- OS: Linux
- Primary editor: Neovim (with plugins)
- Secondary editor: VSCode (occasional)

---

## Code Style
- Clever code is encouraged, but **must be commented** — cleverness without explanation is a bug waiting to happen
- Follow the **single responsibility principle** — one function/class/module does one thing
- If intent is unclear, **ask before proceeding** — don't assume and barrel forward
- When using a raw number for anything other than +/-1 in bounds checking **always** include a comment describing the number

---

## Communication Style
When producing reviews, status updates, or architectural feedback: lead with concrete prescriptive recommendations (with code/config examples), not diagnostic observations. Default to plain language; avoid jargon unless asked.

---

## Response Format
- Lead with a **brief high-level explanation**
- Follow with explanatory **bullet points** for supporting details
- Include a **code example** when it meaningfully supports the explanation

---

## Commands (Claude Code)

User-invoked slash commands. Type directly in the prompt. Claude executes the `.md` file — no Skill tool involved.

| Command | What it does |
|---------|-------------|
| `/wtf` | Plain-English explanation of a file you just opened cold — what it's *for*, not how it works line by line |
| `/explore` | Architectural narrative of a module — responsibilities, ownership, assumptions, connections |
| `/map` | Subsystem dependency + dataflow topology → `map.html` (who calls what, shared state, implicit ordering) |

---

## Agents (Claude Code)

Invoke these with the Agent tool (`subagent_type: "<name>"`). They run in isolated context — hand off a self-contained task and keep working. Best for multi-step, tool-heavy, or parallelizable work.

| Agent | Route when… |
|-------|-------------|
| `architect` | Designing a new subsystem, reviewing existing module for structural debt, choosing between design approaches |
| `bug-fixer` | Have a specific bug fix to apply — from a code review finding, `bug-investigator` output, or clear user instruction |
| `bug-investigator` | Bug reported or test failing — diagnose root cause without touching source; returns a recommended fix |
| `feature-implementer` | Adding new capabilities, building a new module, or implementing a spec from scratch |
| `code-reviewer` | Reviewing staged or recently changed code before committing |
| `codebase-explorer` | Mapping structure, finding call sites, dependencies, and patterns BEFORE planning a refactor or feature (internal, pre-change) |
| `dependency-mapper` | Backs `/map` — analyzes call topology, shared state, implicit ordering, and data flow for a specific subsystem |
| `cpp-build-resolver` | C++ build errors, linker failures, template errors — fix with minimal changes |
| `fix-pipeline` | A GitLab CI pipeline is failing and you need to diagnose and fix it |
| `simplifier` | Simplifying recently generated code — dedup, inline, verbosity, dead code, over-engineering |
| `test-generator` | Writing new C++ tests, reviewing or cleaning up existing tests, GoogleTest/Catch2 files |
| `test-writer` | Writing tests in any other language (Python, etc.) — behavior-focused, happy path + edge cases |

### Architect output

When the `architect` agent returns, relay its full output verbatim — do not summarize or paraphrase. The structured tags (`[SRP]`, `[COUPLING]`, `[ABSTRACTION]`, `[READABILITY]`, `[PATTERN]`) and the opening verdict line are the deliverable.

### Automatic: simplifier

After any turn where you generate or substantively modify code (more than a trivial one-liner), **always run the `simplifier` agent** on the generated files before reporting the task complete. Pass the file paths as context. Do not run it for: documentation-only changes, config edits, single-line fixes, or when the user explicitly skips it.

---

## Skills (Claude Code)

Invoke these with the Skill tool. Best for inline, conversational, or context-dependent tasks. When in doubt, pick the most specific match.

| Alias | Skill | Route when… |
|-------|-------|-------------|
| `/log-issue` | context-issue-logger | Noticed a bug unrelated to the current task — log it without derailing |
| `/cmake` | cmake-configurator | Touching `CMakeLists.txt`, adding targets, managing dependencies, install rules |
| `/modernize` | modernizer | Code uses `typedef`, raw owning pointers, `NULL`, index loops, `std::bind`, or pre-C++14 patterns |
| `/api` | api-critic | Reviewing a `.hpp` public interface before merge, designing a library API |
| `/conc` | concurrency-architect | Designing threaded systems, auditing mutex/atomic usage, async patterns, deadlock risk |
| `/py` | python-style | Writing or reviewing Python — apply Barrett's style conventions |
| `/cpp` | cpp-style | Writing or reviewing C++ — apply Barrett's style conventions (ownership, nodiscard, IWYU, Doxygen) |
| `/humanize` | humanizer | Producing human-facing text — docs, commit messages, PR descriptions, issues, tasks, release notes |
| `/tdd` | tdd-workflow | Adding a feature or fixing a bug test-first — full RED → GREEN → REFACTOR → coverage cycle for Python or C++ |
| `/graphify` | graphify | Whole-codebase knowledge graph — persistent, queryable across sessions, community detection |
| `/plan-html` | plan-html | Planning a task, feature, or goal — produces an interactive HTML file with phases, tasks, milestones, risks, and decisions-needed |

### When multiple could apply

- **Feature vs. bug**: "implement X", "add Y", "build Z" → `feature-implementer`; "fix", "broken", "regression", known diagnosis → `bug-fixer`
- Build *fails* → `cpp-build-resolver` agent first; switch to `/cmake` only if the root cause is CMake structure
- Code review *and* modernization needed → `/api` first (find what's wrong), `/modernize` second (fix the patterns)
- New concurrent class → `/api` first (design the interface), `/conc` second (design the internals)
- Writing with TDD → `/tdd` (tests before code); adding tests to existing code → `test-generator` (C++) or `test-writer` (other languages)
- Structural design question → `architect` agent; then `/conc` or `/api` for the specific interface/threading details
- Mapping a codebase → `/graphify` when you need a persistent, reusable graph (first encounter with a project, or you'll be querying it repeatedly); `codebase-explorer` agent for one-off lookups where a graph would be overkill
- **Understanding unfamiliar code** — pick by scope and question:
  - Single file, just opened: `/wtf` command ("what does this file do?")
  - Module/directory, architectural role: `/explore` command ("what is this module's job in the system?")
  - Subsystem dependency + dataflow topology: `/map` command → `map.html`
  - Whole codebase, need to query it across sessions: `/graphify` skill
  - Pre-change internal scan (Claude's own pre-work): `codebase-explorer` agent

