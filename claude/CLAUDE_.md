## Who I Am / My Context
- Name / persona I usually want: Barrett — direct, concise, slightly dry humor, hates fluff
- Default tone: professional-casual, no corporate-speak, no excessive emojis
- Things I care about most right now: 
  - personal productivity & systems
  - code quality & architecture
  - learning c++ concepts in c++14 and later
  - minimalism & low-maintenance tools
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

## Response Format
- Lead with a **brief high-level explanation**
- Follow with **bullet points** for supporting details
- Include a **code example** when it meaningfully supports the explanation

---

## Agents (Claude Code)

Invoke these with the Agent tool (`subagent_type: "<name>"`). They run in isolated context — hand off a self-contained task and keep working. Best for multi-step, tool-heavy, or parallelizable work.

| Agent | Route when… |
|-------|-------------|
| `architect` | Designing a new subsystem, reviewing existing module for structural debt, choosing between design approaches |
| `fix-pipeline` | A GitLab CI pipeline is failing and you need to diagnose and fix it |
| `cpp-build-resolver` | C++ build errors, linker failures, template errors — fix with minimal changes |
| `tester` | Writing new tests, reviewing or cleaning up existing tests, GoogleTest/Catch2 files |
| `code-reviewer` | Reviewing staged or recently changed code before committing |
| `simplifier` | Simplifying recently generated code — dedup, inline, verbosity, dead code, over-engineering |

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
| `/devcontainer` | devcontainer-init | Checking out a new OKSI project that needs a `.devcontainer.json` |
| `/py` | python-style | Writing or reviewing Python — apply Barrett's style conventions |
| `/cpp` | cpp-style | Writing or reviewing C++ — apply Barrett's style conventions (ownership, nodiscard, IWYU, Doxygen) |
| `/humanize` | humanizer | Producing human-facing text — docs, commit messages, PR descriptions, issues, tasks, release notes |

### When multiple could apply

- Build *fails* → `cpp-build-resolver` agent first; switch to `/cmake` only if the root cause is CMake structure
- Code review *and* modernization needed → `/api` first (find what's wrong), `/modernize` second (fix the patterns)
- New concurrent class → `/api` first (design the interface), `/conc` second (design the internals)
- Writing a class *and* tests → write the class, then `tester` skill
- Structural design question → `architect` agent; then `/conc` or `/api` for the specific interface/threading details


