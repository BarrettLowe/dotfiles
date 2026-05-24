---
name: teach
version: 2.0.0
description: |
  Teaching artifact (HTML) tuned to the user's learning style.
  Leads with a sequence diagram of the main execution flow.
  Then: architecture decisions with rejected design patterns side-by-side,
  comparison tables (pattern viability + code size), load-bearing snippets
  embedded inline, predict-then-reveal scenarios. Opt-in chat quiz follows.
  Auto-runs after Claude writes code; also invocable manually on existing code.
  Outputs ./.claude-artifacts/teach.html. Best run with Opus.
license: MIT
compatibility: claude-code
model: opus
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# /teach

Generate a teaching brief that lets the user **independently agree or disagree** with the
architecture — not just understand it. He is a 10+ year engineer. He cannot easily follow
execution flow when Claude generates code. He learns by teaching it back. Diagrams carry
the load; prose is supplementary.

## Usage

```
/teach                            # infer changed files (auto-run mode)
/teach src/cache.cpp              # existing file
/teach src/cache.cpp include/lru.h  # multiple files
```

## Core Principles (read these every time)

1. **Sequence diagram first.** The first thing the user sees must be a sequence diagram of the
   main execution flow. He's said this explicitly. Don't bury it.
2. **Show the rejected design.** A decision without rejected alternatives is a lecture, not
   an argument. List the design patterns considered (Strategy, Visitor, Template Method,
   etc.) with viability scores.
3. **Embed the load-bearing code.** The 3–6 lines that actually carry each decision go
   inline next to the explanation. He should not have to open files to follow.
4. **Numbers, not adjectives.** LOC counts, Big-O, branch counts, allocation counts.
   Comparison tables across options.
5. **Predict-then-reveal.** Each artifact has 2–4 scenarios where the user predicts the
   behavior before clicking to reveal the answer.
6. **No fluff.** No "In summary…", no "As we can see…", no preamble. Dense. Direct.
7. **The artifact is the floor of understanding, not the ceiling.** Mention at the end
   that `/teach quiz` will grill him on it.

## What You Must Do When Invoked

### Step 1 — Identify the Files

In order:
1. Explicit file args → use directly.
2. Auto-run context (post-code-generation) → use the file paths from the most recent
   write/edit tool calls.
3. Git state → `git diff --name-only HEAD` and `git status --short`.
4. If still unclear, ask: "Which files should I explain?"

### Step 2 — Read and Map

Read every identified file in full. Then run any of these you need:
- `git log -p -n 3 -- <files>` to see the change history
- `grep` for callers of new public functions
- `git diff HEAD~1 -- <files>` if this is a fresh commit

Build a mental model:
- **Execution flow**: what happens when the main entry point is called? Who calls whom in what order?
- **State**: what mutable state exists? Who owns it? When does it change?
- **Decisions**: what choices were made that aren't obvious from the code?
- **Patterns**: which named patterns / idioms are present? Which were rejected?
- **Failure modes**: what would surprise a future maintainer?

### Step 3 — Pick the Right Grain for the Sequence Diagram

The "actors" (columns) of the sequence diagram depend on the code:

- **Classes / objects**: when the work is inside one module and method-level interaction
  matters. Use when there are 3–6 collaborating classes.
- **Modules / files / subsystems**: when the change spans many files and you want a
  higher-level view. Use when classes would create too many columns.
- **Threads / async boundaries**: when concurrency is the point — locks, queues, async
  tasks, coroutines. Use whenever non-trivial ordering or synchronization exists.

Pick one. State at the top of the diagram what the actors are. If a second view would
genuinely help (e.g., classes + a thread-level view), include both — but no more than two.

### Step 4 — Scale to the Change

Pick a length budget:

| Change size | Budget | Diagram(s) | Decisions | Snippets | Scenarios |
|---|---|---|---|---|---|
| One function / small fix | 5-min | 1 sequence diagram | 2–3 | 2–3 | 2 |
| Multi-file / subsystem | 10-min | 1 sequence + optional state diagram | 3–5 | 4–6 | 3–4 |
| Architecture-level / new module | 20-min | 2–3 diagrams | 5–8 | 6–10 | 4–6 |

If the change is truly trivial (one-liner, comment fix, config tweak), skip the artifact
entirely and tell the user: "Change was trivial — skipping /teach."

### Step 5 — Analyze the Code in Detail

Produce structured content for the HTML:

**Sequence Diagram** — the main flow. Use Mermaid `sequenceDiagram` syntax. Annotate
arrows with conditions where they matter (`alt`, `loop`, `note over`). Use `Note over` for
side effects (state mutation, allocations).

**Architecture Decisions** — for each (2–8 depending on budget):
- The question: "Why X instead of Y?"
- The choice (one sentence)
- **Rejected patterns** with viability score (1–5) and one-line reason:
  - `Strategy pattern — 3/5 — workable but adds a vtable indirection per call; overkill for two policies`
  - `Visitor pattern — 1/5 — wrong tool, the data is homogeneous`
  - `Template specialization — 2/5 — compile-time-only, blocks runtime selection`
- The load-bearing snippet (3–6 lines) embedded inline.
- File:line reference.

**Comparison Table** — at least one. Columns: the dimensions that matter
(complexity, memory, LOC, allocations, branches, extensibility). Rows: the options that
were considered. Highlight the chosen row.

**State / Data Flow** — if state is non-trivial, a second diagram (Mermaid `stateDiagram-v2`
or custom inline SVG if mermaid can't express it).

**Predict-then-Reveal Scenarios** — 2–6 scenarios depending on budget. Each:
- Question (concrete scenario): "What happens if cache is full and you `put()`?"
- Hidden answer (revealed on click): step-by-step trace of the behavior, ending with the
  final state.
- File:line of where this behavior is implemented.

Scenarios should target the gotchas: concurrency, resource exhaustion, weird inputs,
ownership transfer, invalidation, partial failure.

**Gotchas** — 1–4 hazards that aren't obvious. Thread safety, iterator invalidation,
silent no-ops, ordering requirements.

**Improvements** — 2–6 things that are messy, inconsistent, duplicated, or could be
structurally better. For each:
- The suggestion (one sentence, prescriptive: "Extract X into Y", not "X is bad")
- **Impact** 1–5 (how much better the code gets if you do it)
- **Effort** 1–5 (how much work the change costs)
- **Verdict**: `subjective` (judgment call) or `objectively_right` (no real counter-argument)
- **Reject reasons**: 1–2 plausible reasons not to do it. If `objectively_right`, this can
  be empty or contain non-reasons ("only legitimate reason: you're shipping in 2 hours").
  Be honest — if the suggestion is the obvious right call, label it as such. If it's a
  tradeoff, present both sides.
- File:line reference.

Look for: duplication, SRP violations, inconsistent naming, leaking abstractions, dead
parameters, raw owning pointers, missing const, missing `[[nodiscard]]`, redundant
allocations, magic numbers without comments, error paths that swallow context.

**Entry Points** — 1–3 places to start reading. File:line + one-line label.

### Step 6 — Generate the HTML

Write one self-contained HTML5 file. Mermaid is loaded from
`https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js` — that one CDN is allowed.
Everything else (CSS, fonts, JS) is inline.

**Embed all data as a JS object** at the top of the script block:

```js
const BRIEF = {
  title: "LRU Cache for User Lookups",
  summary: "Write-through cache between handler and DB. O(1) eviction via doubly-linked list + hash map.",
  files: ["src/cache.cpp", "include/cache.hpp"],
  budget: "10-min",
  actorsGrain: "classes",

  flow: {
    mermaid: `
sequenceDiagram
    autonumber
    participant H as Handler
    participant C as Cache
    participant L as LRUList
    participant D as DB
    H->>C: get(id=42)
    C->>L: find(42)
    L-->>C: MISS
    C->>D: query(id=42)
    D-->>C: user
    Note over C: cache full → evict LRU
    C->>L: evict_back()
    C->>L: push_front(42, user)
    C-->>H: user
`,
    caption: "Cache miss path with eviction. Note the order: query happens before eviction is decided, so we don't evict on failure."
  },

  decisions: [
    {
      question: "Why doubly-linked list + hash map instead of std::list alone?",
      choice: "O(1) lookup AND O(1) eviction; the map stores iterators into the list.",
      rejected: [
        { pattern: "std::list alone", score: 2, reason: "O(n) lookup; unacceptable on the hot read path" },
        { pattern: "std::map<K, list::iterator>", score: 4, reason: "O(log n) lookup; viable but slower; uses 3x memory per entry" },
        { pattern: "vector + linear scan (LFU)", score: 1, reason: "wrong policy; LFU not LRU; O(n) eviction" }
      ],
      snippet: {
        language: "cpp",
        code: "auto it = map_.find(key);\nif (it == map_.end()) return std::nullopt;\nlist_.splice(list_.begin(), list_, it->second);\nreturn it->second->value;",
        file: "src/cache.cpp",
        line: "47"
      }
    }
  ],

  comparison: {
    title: "Cache backing options",
    columns: ["Option", "Lookup", "Insert", "Evict", "Memory/entry", "LOC", "Viable?"],
    rows: [
      ["std::list", "O(n)", "O(1)", "O(1)", "1 ptr", "30", "no — hot path"],
      ["std::map + iter", "O(log n)", "O(log n)", "O(1)", "3 ptr", "55", "ok"],
      ["unordered_map + list", "O(1)", "O(1)", "O(1)", "3 ptr", "70", "CHOSEN"],
      ["LFU vector", "O(n)", "O(n)", "O(n)", "1 int+T", "40", "no — wrong policy"]
    ],
    chosen: 2  // 0-indexed row to highlight
  },

  state: {
    mermaid: `
stateDiagram-v2
    [*] --> Empty
    Empty --> Partial: put()
    Partial --> Partial: put() / get()
    Partial --> Full: put() (size == capacity)
    Full --> Full: put() / get()  (evict on put)
    Full --> Partial: clear()
    Partial --> Empty: clear()
`,
    caption: "Cache lifecycle. Note: Full is sticky — once you hit capacity, every put() triggers an eviction."
  },

  scenarios: [
    {
      question: "What happens if you call `put(K, V)` when the cache is at capacity AND K already exists?",
      answer: "1. find(K) hits; node moves to front via splice().\n2. node->value is overwritten with V.\n3. No eviction — the count didn't change.\n4. Returns the old value.\nIf you assumed eviction happens, that's the gotcha.",
      file: "src/cache.cpp",
      line: "62"
    },
    {
      question: "Two threads call `get(K)` concurrently. What can break?",
      answer: "1. list_.splice() mutates the list — concurrent splices race.\n2. unordered_map iterator invalidation is undefined if another thread rehashes.\n3. Result: data corruption, possibly segfault.\nCache is NOT thread-safe. Caller must hold an external lock for the duration of get()/put().",
      file: "src/cache.cpp",
      line: "47"
    }
  ],

  gotchas: [
    "NOT thread-safe. No internal lock — caller synchronizes.",
    "Iterators returned by get() are invalidated by any subsequent put() at capacity.",
    "Copy-construction copies the whole cache eagerly — no COW. Avoid passing by value."
  ],

  improvements: [
    {
      suggestion: "Replace raw `new`/`delete` for nodes with `std::unique_ptr<Node>` inside the list.",
      impact: 5,
      effort: 1,
      verdict: "objectively_right",
      rejectReasons: [
        "None genuine — the raw-pointer version exists only because the original draft predated C++17 cleanup."
      ],
      file: "src/cache.cpp",
      line: "82"
    },
    {
      suggestion: "Extract eviction policy into a `Policy` interface so LRU/LFU/FIFO are pluggable.",
      impact: 2,
      effort: 4,
      verdict: "subjective",
      rejectReasons: [
        "Only one policy is required by current callers — Strategy adds a vtable indirection per access for flexibility that may never be used.",
        "Microbench shows ~8% throughput loss with virtual dispatch on the hot path."
      ],
      file: "src/cache.cpp",
      line: "47"
    },
    {
      suggestion: "Add `[[nodiscard]]` to `get()` — callers can silently drop the looked-up value today.",
      impact: 3,
      effort: 1,
      verdict: "objectively_right",
      rejectReasons: [],
      file: "include/cache.hpp",
      line: "22"
    }
  ],

  entryPoints: [
    { file: "src/cache.cpp", line: "12", label: "Cache::get() — public read path; start here" },
    { file: "src/cache.cpp", line: "38", label: "Cache::put() — write path; triggers eviction" }
  ]
};
```

**Layout (in order — sequence diagram is first, non-negotiable):**

```
┌───────────────────────────────────────────────────────────┐
│  Title                       [file1.cpp] [file2.hpp]      │
│  Summary sentence                            5/10/20-min  │
├───────────────────────────────────────────────────────────┤
│  ▶ EXECUTION FLOW                  [actors: classes]      │
│  ┌──────────────────────────────────────────────┐         │
│  │     <mermaid sequence diagram renders here>  │         │
│  └──────────────────────────────────────────────┘         │
│  Caption: cache miss path with eviction…                  │
│                                                           │
│  ▶ ARCHITECTURE DECISIONS                                 │
│  ▼ Why doubly-linked list + hash map?                     │
│    ✓ Choice: O(1) lookup AND O(1) eviction               │
│    Rejected:                                              │
│      • std::list alone               [▓░░░░] 2/5          │
│        O(n) lookup; unacceptable on hot path              │
│      • std::map<K, list::iterator>   [▓▓▓▓░] 4/5          │
│        viable but slower; 3x memory                       │
│    ┌────────────────────────────────┐ src/cache.cpp:47    │
│    │ auto it = map_.find(key);       │                    │
│    │ if (it == map_.end()) return…   │                    │
│    └────────────────────────────────┘                     │
│                                                           │
│  ▶ COMPARISON                                             │
│  ┌──────────┬─────────┬─────────┬─────────┬──────┬──────┐ │
│  │ Option   │ Lookup  │ Insert  │ Evict   │ LOC  │ ?    │ │
│  ├──────────┼─────────┼─────────┼─────────┼──────┼──────┤ │
│  │ list     │ O(n)    │ O(1)    │ O(1)    │ 30   │  no  │ │
│  │ map+iter │ O(log n)│ O(log n)│ O(1)    │ 55   │  ok  │ │
│  │ umap+list│ O(1)    │ O(1)    │ O(1)    │ 70   │ ★    │ │
│  └──────────┴─────────┴─────────┴─────────┴──────┴──────┘ │
│                                                           │
│  ▶ STATE                                                  │
│  <mermaid state diagram>                                  │
│                                                           │
│  ▶ PREDICT & CHECK                                        │
│  ❓ What happens if you put(K,V) when cache is full       │
│     AND K already exists?                                 │
│     [click to reveal]                                     │
│                                                           │
│  ▶ GOTCHAS                                                │
│  ⚠ NOT thread-safe…                                       │
│                                                           │
│  ▶ IMPROVEMENTS                                           │
│  ▼ Replace raw new/delete with unique_ptr   [OBJ. RIGHT]  │
│    Impact  [▓▓▓▓▓] 5    Effort [▓░░░░] 1                  │
│    Why not? — none genuine                                │
│    src/cache.cpp:82                                       │
│  ▼ Extract eviction policy into Strategy    [subjective]  │
│    Impact  [▓▓░░░] 2    Effort [▓▓▓▓░] 4                  │
│    Why not? — only one policy needed; ~8% perf loss       │
│    src/cache.cpp:47                                       │
│                                                           │
│  ▶ START HERE                                             │
│  → cache.cpp:12   Cache::get() — public read path        │
│                                                           │
│  ─────────────────────────────────────────────            │
│  Type "quiz me" in chat to be grilled on this.            │
└───────────────────────────────────────────────────────────┘
```

**Visual style:**
- Background `#0d1117`, surface `#161b22`, border `#30363d`
- Body `system-ui, -apple-system, sans-serif`, 14px, line-height 1.6
- Text `#e6edf3`, muted `#8b949e`, headings `#f0f6fc`
- Section headers: uppercase, letter-spaced, `#79c0ff`, with collapse arrow ▼/▶
- Decisions: purple left-border `#7c3aed`, choice `✓` in `#3fb950`, rejected `✗` in `#f85149`
- Viability score: 5 small bars, filled = `#79c0ff`, empty = `#30363d`
- Comparison table: chosen row `background: #1a4d2b`, header background `#21262d`
- Code blocks: `JetBrains Mono, Menlo, monospace`, 13px, background `#0d1117`, border `#30363d`, file:line right-aligned in muted color
- Mermaid theme: dark — `{ theme: 'dark', themeVariables: { background: '#161b22' } }`
- Scenario question: cursor pointer, hover underline; answer hidden by default, slides in on click
- Gotchas: amber `#d29922` left-border, `⚠` prefix
- Improvements: cyan `#58a6ff` left-border. Each card collapsible. Header row shows the
  suggestion + a verdict badge: `OBJ. RIGHT` (background `#1a4d2b`, text `#3fb950`) or
  `SUBJECTIVE` (background `#21262d`, text `#8b949e`). Impact / Effort each render as a
  5-bar score (impact bars `#3fb950`, effort bars `#d29922`, empty `#30363d`). When
  `verdict === "objectively_right"` and `rejectReasons` is empty, show "Why not? — no
  legitimate reason." in muted text.
- Entry points: green `#3fb950` left-border, `→` prefix

**Interactivity — vanilla JS:**
- All section headers click-to-collapse, except EXECUTION FLOW (always expanded — that's the lead).
- Scenario answers hidden by `[hidden]`; click question → toggle.
- Mermaid renders on DOMContentLoaded. Use `mermaid.initialize({ startOnLoad: true, theme: 'dark' })`.

**Mermaid loading:**
```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```
If CDN fails (no internet), the diagram should degrade gracefully: render the mermaid
source inside a `<pre>` so it's still readable as text. Wrap the mermaid `<div>` so that
on render-failure, the source is visible.

### Step 7 — Write and Report

Ensure the artifact directory exists, then write the file:

```bash
mkdir -p ./.claude-artifacts
```

Write to `./.claude-artifacts/teach.html`. The directory is git-ignored globally via
`~/.config/git/ignore` — no per-project `.gitignore` edits needed.

Print exactly this (filling in counts) and nothing else after writing:

```
✓ .claude-artifacts/teach.html written — <title>  (<budget>)
  Flow:         sequenceDiagram (<N> actors)
  Decisions:    <N>
  Comparison:   <N> options, chose <name>
  Scenarios:    <N>
  Gotchas:      <N>
  Improvements: <N>  (<N> objectively right, <N> subjective)

Open:  xdg-open ./.claude-artifacts/teach.html
Quiz:  type "quiz me" when you're ready to be grilled.
```

Do NOT print the HTML source.
Do NOT summarize the artifact in chat — the HTML is the deliverable.

## Quiz Protocol (when the user types "quiz me" or "/teach quiz")

When invoked for the quiz phase, do NOT regenerate the HTML. Read the existing
`./.claude-artifacts/teach.html`, parse the `BRIEF` object from the embedded JS, and run the quiz.

**Quiz format:**

Ask **one question at a time.** Wait for the user's answer. Don't batch.

Rotate through these question types in order (one of each, then loop):

1. **Predict** — "What happens if [scenario from BRIEF.scenarios or a new one]?"
   - He answers; you compare to the actual behavior.
   - If correct: confirm in one sentence, move on.
   - If wrong: explain the gap precisely (don't lecture — pinpoint the mistaken
     assumption), then move on.

2. **Recall reasoning** — "Why did we pick X over Y?" (from BRIEF.decisions[].rejected)
   - He answers; you compare to the recorded rejected-reason.
   - Grade strictly. "It's faster" is not enough — he should be able to cite the
     specific reason (O(n) on hot path, memory cost, etc.).

3. **Extend** — "If you needed to add [plausible feature], where would you change the
   code? What would break?"
   - He answers; you check whether he correctly identified the assumptions his
     change would violate.

4. **Evaluate an improvement** — pick one from `BRIEF.improvements` (prefer
   `subjective` ones — those have real tradeoffs to weigh): "Would you accept or reject
   this suggestion? Why?"
   - He answers; you check whether he correctly weighed impact vs effort and identified
     the right reject-reasons (or correctly called it `objectively_right`).
   - Grade strictly: handwaving "yeah, sounds good" is not an answer — he must cite the
     tradeoff.

Continue until the user says "done" / "enough" / "stop", OR until he's answered
3 cleanly (one of each type). At that point, say:

```
✓ You're solid on this. Closing the quiz.
```

If he answered something egregiously wrong, end with:
```
✗ Re-read [specific section]. The mental model you have on [specific point]
  doesn't match what the code does.
```

Be direct. He hates fluff. No "great answer!" — just confirm or correct.
