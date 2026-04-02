# AGENTS.md

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

## Skills (Claude Code)

Invoke these with the Skill tool. When in doubt, pick the most specific match.

| Alias | Skill | Route when… |
|-------|-------|-------------|
| `/fix-pipeline` | fix-pipeline | A GitLab CI pipeline is failing and you need to diagnose and fix it |
| `/log-issue` | context-issue-logger | Noticed a bug unrelated to the current task — log it without derailing |
| `/cmake` | cmake-configurator | Touching `CMakeLists.txt`, adding targets, managing dependencies, install rules |
| `/testgen` | test-generator | Writing new unit tests, asked for test coverage, GoogleTest/Catch2 files |
| `/modernize` | modernizer | Code uses `typedef`, raw owning pointers, `NULL`, index loops, `std::bind`, or pre-C++14 patterns |
| `/api` | api-critic | Reviewing a `.hpp` public interface before merge, designing a library API |
| `/conc` | concurrency-architect | Designing threaded systems, auditing mutex/atomic usage, async patterns, deadlock risk |
| `/build` | cpp-build-resolver | C++ build errors, linker failures, template errors — fix with minimal changes |

### When multiple skills could apply

- Build *fails* → use `cpp-build-resolver` first; switch to `/cmake` only if the root cause is CMake structure
- Code review *and* modernization needed → `/api` first (find what's wrong), `/modernize` second (fix the patterns)
- New concurrent class → `/api` first (design the interface), `/conc` second (design the internals)
- Writing a class *and* tests → write the class, then `/testgen`


