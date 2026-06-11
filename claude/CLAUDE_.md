## Who I Am / My Context
- Name / persona I usually want: Barrett — slightly dry humor, hates fluff, no jargon - talk to me like a human
- Default tone: professional-casual, no corporate-speak, no excessive emojis
- Things I care about most right now: 
  - personal productivity & systems
  - code quality & architecture
  - learning c++ concepts in c++17 and later
- Things that annoy me: 
  - buzzwords and jargon - makes me feel belittled when I don't understand
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
- Concise comments (error on the side of vague rather than verbosely explicit)

---

## Communication Style
When producing reviews, status updates, or architectural feedback: lead with concrete prescriptive recommendations (with code/config examples), not diagnostic observations. Default to plain language; avoid jargon unless asked.

---

## Response Format
- Lead with a **high-level grounding explanation**
- Follow with explanatory **bullet points** for supporting details
- Include a **code example** when it meaningfully supports the explanation

---

## How I Learn Code You Write

I am a 10+ year engineer. I can read code. My specific blocker is **execution flow** — tracing what calls what, in what order, with what state changes. Static reading doesn't give me the temporal picture.

**What convinces me a design is right (in order of weight):**
- **Sequence diagrams** of the main flow — actors over time, showing call order. Lead with this.
- **Quantitative comparison tables** — design pattern alternatives with viability scores, LOC counts, complexity, memory cost. Numbers, not adjectives.
- **Rejected alternatives** — framed as a scored comparison, not as prose.
- **Load-bearing code embedded inline** next to the explanation (3–6 lines).

**How I actually retain it:**
- **Teach-it-back.** Reading alone is insufficient. I don't know it until I've explained it back and been grilled on it. After any teaching artifact, expect me to type `quiz me` — then ask one question at a time (predict / recall reasoning / extend), grade strictly, no participation trophies.

**Diagrams carry the load.** Prose is supplementary. Skip diagrams only when there's truly nothing to draw.

This is why the `/teach` skill exists and why it auto-runs after code generation. See its routing entry below.

---

## Artifacts

When making an artifact (whether by request or offering freely) place it in the .claude-artifacts directory at the root of the current project. Do not overwrite something that is already there but allow the user to request edits.

---

## Agents (Claude Code)

Invoke these with the Agent tool (`subagent_type: "<name>"`). They run in isolated context — hand off a self-contained task and keep working. Best for multi-step, tool-heavy, or parallelizable work.

| Agent | Route when… |
|-------|-------------|
| `architect` | Designing a new subsystem, reviewing existing module for structural debt, choosing between design approaches |
| `bug-fixer` | Have a specific bug fix to apply — from a code review finding, `bug-investigator` output, or clear user instruction |
| `bug-investigator` | Bug reported or test failing — diagnose root cause without touching source; returns a recommended fix |
| `bug-verifier` | After a fix is applied — run the test/reproduction command, report pass/fail, return structured output for another `bug-investigator` round if still failing |
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

### Automatic: teach

After any turn where you generate or substantively modify code, **always run the `/teach` skill** on the same files. This generates `./teach.html` — leads with a sequence diagram of execution flow, then architecture decisions with rejected design patterns scored, comparison tables, load-bearing snippets, and predict-then-reveal scenarios. Run it AFTER simplifier so the HTML reflects the final code. The skill prints a "type 'quiz me' when ready" prompt; do not start the quiz unless Barrett asks. Skip for: documentation-only changes, config edits, trivial one-liners, or when Barrett explicitly says skip.

When Barrett types `quiz me` (or `/teach quiz`), invoke `/teach` in quiz mode — read the existing `./teach.html`, parse its embedded BRIEF object, and grill him conversationally with one question at a time (predict / recall / extend). Be strict on grading — he wants to actually own the design, not get participation trophies.

---

## Skills (Claude Code)

Invoke these with the Skill tool. Best for inline, conversational, or context-dependent tasks. When in doubt, pick the most specific match.

| Alias | Skill | Route when… |
|-------|-------|-------------|
| `/cmake` | cmake-configurator | Touching `CMakeLists.txt`, adding targets, managing dependencies, install rules |
| `/modernize` | modernizer | Code uses `typedef`, raw owning pointers, `NULL`, index loops, `std::bind`, or pre-C++14 patterns |
| `/api` | api-critic | Reviewing a `.hpp` public interface before merge, designing a library API |
| `/conc` | concurrency-architect | Designing threaded systems, auditing mutex/atomic usage, async patterns, deadlock risk |
| `/py` | python-style | Writing or reviewing Python — apply Barrett's style conventions |
| `/cpp` | cpp-style | Writing or reviewing C++ — apply Barrett's style conventions (ownership, nodiscard, IWYU, Doxygen) |
| `/humanize` | humanizer | Producing human-facing text — docs, commit messages, PR/MR descriptions, issues, tasks, release notes, and code comments |
| `/tdd` | tdd-workflow | Adding a feature or fixing a bug test-first — full RED → GREEN → REFACTOR → coverage cycle for Python or C++ |
| `/graphify` | graphify | Whole-codebase knowledge graph — persistent, queryable across sessions, community detection |
| `/plan-html` | plan-html | Planning a task, feature, or goal — produces an interactive HTML file with phases, tasks, milestones, risks, and decisions-needed |
| `/plan-orchestration` | plan-orchestration | Executing an approved plan — user reviews plan first, then invokes this; spawns parallel subagents per phase |
| `/excalidraw` | excalidraw-diagram | Creating an Excalidraw diagram — workflows, architectures, concept maps, anything that benefits from visual argument over prose |
| `/teach` | teach | Teaching brief for code (auto on new, manual on existing) → `teach.html`. Sequence diagram of execution flow first, then decisions with rejected design-patterns scored, comparison tables, load-bearing snippets, predict-then-reveal scenarios. Opt-in chat quiz on "quiz me". |
| `/audit` | audit | Architectural audit of *existing* code you didn't write → `audit.html`. Learn-first: sequence diagram of current behavior, decisions explained neutrally with "still valid?" verdict, then friction points synthesized from that understanding, two-tier change roadmap (quick wins + high-value). Opt-in quiz on "quiz me". |
| `/wiki` | wiki | Write a GitLab wiki page for a system or subsystem — high-level, teaching-focused, Mermaid diagram included. Invoke after completing a task or when documenting how something works for a new engineer. Outputs `.claude-artifacts/wiki-<topic>.md`. |

### When multiple could apply

- **Feature vs. bug**: "implement X", "add Y", "build Z" → `feature-implementer`; "fix", "broken", "regression", known diagnosis → `bug-fixer`
- Build *fails* → `cpp-build-resolver` agent first; switch to `/cmake` only if the root cause is CMake structure
- Code review *and* modernization needed → `/api` first (find what's wrong), `/modernize` second (fix the patterns)
- New concurrent class → `/api` first (design the interface), `/conc` second (design the internals)
- Writing with TDD → `/tdd` (tests before code); adding tests to existing code → `test-generator` (C++) or `test-writer` (other languages)
- Structural design question → `architect` agent; then `/conc` or `/api` for the specific interface/threading details
- Mapping a codebase → `/graphify` when you need a persistent, reusable graph (first encounter with a project, or you'll be querying it repeatedly); `codebase-explorer` agent for one-off lookups where a graph would be overkill
- **Teaching vs. auditing**: `/teach` → code you just wrote or are responsible for (decisions are explained as deliberate); `/audit` → code you inherited, are reviewing as architect, or didn't write (decisions are explained neutrally with "still valid?" verdicts, friction surfaces after understanding)
- **Documenting a system for others** → `/wiki` when the audience is engineers who don't know the system; `/teach` when the audience is you and the goal is to own the design yourself
- **Understanding unfamiliar code** — pick by scope and question:
  - Single file, just opened: `/wtf` command ("what does this file do?")
  - Module/directory, architectural role: `/explore` command ("what is this module's job in the system?")
  - Subsystem dependency + dataflow topology: `/map` command → `map.html`
  - Whole codebase, need to query it across sessions: `/graphify` skill
  - Pre-change internal scan (Claude's own pre-work): `codebase-explorer` agent

