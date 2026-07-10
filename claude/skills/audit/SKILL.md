---
name: audit
version: 1.0.0
description: |
  Architectural audit of existing code. Primary goal is learning — understanding
  how the code works, what decisions were made, and in what context. Critique
  emerges naturally from that understanding. Leads with a sequence diagram of the
  current execution flow, explains decisions neutrally (with a "still valid?" flag),
  then synthesizes friction points and a prioritized change roadmap. Outputs
  ./.claude-artifacts/audit.html. Best run with Opus.
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

# /audit

Generate a learning-first architectural audit. The goal is to understand the code
deeply enough to have an informed opinion — then surface what's hurting and what to do
about it. Barrett is the lead architect on this code. He may not have written it.

## Core Principles (read these every time)

1. **Learn first, critique second.** The sequence diagram and decision explanations
   come before friction. You cannot usefully critique what you don't yet understand.
2. **Neutral stance on decisions.** Don't defend. Don't assume incompetence. Explain
   what was chosen, the context in which it made sense, and flag explicitly where
   that context has changed or the decision was wrong from the start.
3. **Sequence diagram leads.** Same rule as `/teach` — the first visible thing is the
   execution flow. Non-negotiable.
4. **Friction earns its place.** The friction points section comes *after* the
   understanding sections. It synthesizes what you've learned, not what you assumed
   walking in.
5. **Roadmap has two tiers.** High-value changes (impact 4–5, any effort) and quick
   wins (effort 1–2, impact 3+). Quick wins often reduce the cognitive load needed to
   safely make the high-value changes — make that dependency explicit.
6. **Numbers, not adjectives.** Same rule as `/teach` — LOC, Big-O, coupling counts,
   allocation counts. No "this is complex."
7. **No fluff.** No preamble, no summary. Dense, direct.

## What You Must Do When Invoked

### Step 1 — Identify the Files

In order:
1. Explicit file args → use directly.
2. Git state → `git diff --name-only HEAD` and `git status --short`.
3. If still unclear, ask: "Which files should I audit?"

### Step 2 — Read and Map

Read every identified file in full. Also run:
- `git log --oneline -10 -- <files>` — how old is this code, how active is it
- `git log -p -n 3 -- <files>` — see what has changed recently and why
- `grep` for callers of public functions — find the blast radius of any change
- `git blame <file>` on the most suspect sections — understand authorship and age

Build a mental model before writing anything:
- **Execution flow**: what calls what, in what order, with what state changes?
- **State**: what mutable state exists? Who owns it? When does it change?
- **Decisions**: what choices were made? Were they deliberate or accidental?
- **Context**: what was the codebase's age, team, and constraints at the time?
- **Drift**: where has the surrounding codebase or requirements moved on while
  this code stayed still?
- **Failure modes**: what would bite a future maintainer?

### Step 3 — Pick the Right Grain for the Sequence Diagram

Same rules as `/teach`. Pick actors by what illuminates the code best:
- **Classes / objects**: method-level interaction within one module (3–6 collaborating classes)
- **Modules / files / subsystems**: change spans many files, higher-level view needed
- **Threads / async boundaries**: concurrency is the point

State the grain at the top of the diagram. Two diagrams max if both are genuinely needed.

### Step 4 — Scale to the Code

| Scope | Budget | Diagrams | Decisions | Friction pts | Roadmap items | Scenarios |
|---|---|---|---|---|---|---|
| Single function / small class | 5-min | 1 | 2–3 | 2–3 | 3–5 | 2 |
| Multi-file / subsystem | 10-min | 1–2 | 3–5 | 3–5 | 5–8 | 3–4 |
| Module / architectural layer | 20-min | 2–3 | 5–8 | 5–8 | 8–12 | 4–6 |

### Step 5 — Analyze in Detail

Produce structured content for each section:

---

**Sequence Diagram** — current execution flow. Mermaid `sequenceDiagram`.
Caption must say "Current behavior" not "Intended behavior" — this is what the
code actually does, not what it was supposed to do.

---

**Architecture Decisions** — for each decision in the code (2–8 depending on budget):

Each decision gets:
- **What was decided** (one sentence, descriptive not evaluative)
- **Context that made this reasonable** — what was true when this was written that
  made this choice sensible? (team size, performance constraints, library availability,
  deadline, C++ standard in use, etc.) If you can't find a reason, say so honestly:
  "No clear rationale visible in git history."
- **Still valid?** — one of three verdicts:
  - `✓ Holds` — the choice is still reasonable given current conditions
  - `⚠ Aging` — was reasonable, but conditions have shifted; becoming a liability
  - `✗ Revise` — was wrong, or context has changed enough that it's now clearly the wrong call
- **Why** (one sentence for Aging/Revise, citing what changed or what was missed)
- The load-bearing snippet (3–6 lines) that embodies the decision, embedded inline
- File:line reference

Do NOT defend decisions with `✗ Revise`. Explain them, then say why they need to change.

---

**Comparison Table** — at least one. For each decision that has alternatives,
show the current approach vs. alternatives. Unlike `/teach`, the current approach
is NOT automatically highlighted as "chosen and correct" — it is highlighted as
"what exists," with an explicit "better?" column.

Columns: Option | [relevant dimensions] | Currently used? | Better than current?

---

**State / Data Flow** — if state is non-trivial, a second Mermaid diagram
(`stateDiagram-v2`) or custom SVG. Show actual state, including any invalid/surprising
states the current code can reach that it shouldn't be able to.

---

**Predict & Check Scenarios** — 2–6 scenarios. Same format as `/teach` but
bias toward failure modes and edge cases that reveal the current design's weaknesses:
concurrency races, partial failure, resource exhaustion, unexpected input, state
corruption. The question is "what does this code actually do in situation X" —
not "what should it do."

---

**Friction Points** — synthesized *after* the understanding sections. For each (2–8):

```js
{
  id: "F1",                      // short ID for cross-referencing
  category: "coupling|fragility|performance|safety|testability|maintainability|obsolescence",
  title: "Short name for this friction point",
  current: "What the code does today (one sentence, factual)",
  cost: "Concrete cost — N places to change for each X, O(n) where O(1) is achievable, etc.",
  smell: "Named anti-pattern if applicable: God Object, Shotgun Surgery, Primitive Obsession, etc.",
  severity: 1-5,                 // 5 = actively hurting, 1 = cosmetic
  snippet: { language, code, file, line },
  fixDirection: "What architectural move addresses this — one sentence"
}
```

---

**Change Roadmap** — two explicit tiers, each item cross-references friction points by ID:

**High-Value Changes** (impact 4–5):
```js
{
  suggestion: "Prescriptive one-liner: Extract X into Y, Replace Z with W",
  impact: 4-5,
  effort: 1-5,
  verdict: "objectively_right|subjective",
  addresses: ["F1", "F2"],       // friction points this resolves
  blockedBy: ["quick-win-id"],   // quick wins that should happen first
  rejectReasons: ["..."],        // plausible reasons not to do it
  file: "...", line: "..."
}
```

**Quick Wins** (effort 1–2, impact 3+):
```js
{
  id: "qw-1",
  suggestion: "Prescriptive one-liner",
  impact: 3-5,
  effort: 1-2,
  pavesWayFor: "F1",             // which friction point / high-value change this unlocks
  file: "...", line: "..."
}
```

Quick wins should be ordered: do these first, in this sequence. If a quick win
reduces the cognitive overhead of understanding the system well enough to safely
make the high-value change, say that explicitly.

---

**Gotchas** — 1–4 hazards not obvious from a static read. Thread safety, iterator
invalidation, silent no-ops, ordering requirements, implicit global state.

---

**Entry Points** — 1–3 places to start reading. File:line + one-line label.

### Step 6 — Generate the HTML

Write one self-contained HTML5 file. Mermaid loaded from
`https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js` — that CDN only.
Everything else inline.

**Embed all data as a JS object:**

```js
const BRIEF = {
  title: "Auth Middleware Audit",
  summary: "Session validation layer between API gateway and service handlers. ~400 LOC, last touched 2021.",
  files: ["src/auth/middleware.cpp", "include/auth/session.hpp"],
  budget: "10-min",
  actorsGrain: "classes",

  flow: {
    mermaid: `
sequenceDiagram
    autonumber
    participant GW as Gateway
    participant M as Middleware
    participant S as SessionStore
    participant H as Handler
    GW->>M: request + token
    M->>S: validate(token)
    S-->>M: session | null
    alt session null
        M-->>GW: 401
    else session valid
        M->>H: request + session
        H-->>M: response
        M-->>GW: response
    end
`,
    caption: "Current behavior — token validated on every request with no caching."
  },

  decisions: [
    {
      what: "Per-request token validation against SessionStore (no caching)",
      context: "Written when session store was in-process; latency was negligible.",
      verdict: "aging",  // "holds" | "aging" | "revise"
      why: "SessionStore is now a remote Redis call — every request pays ~8ms round-trip.",
      snippet: {
        language: "cpp",
        code: "auto session = store_.validate(token);\nif (!session) return Response{401};",
        file: "src/auth/middleware.cpp",
        line: "34"
      }
    }
  ],

  comparison: {
    title: "Token validation strategies",
    columns: ["Option", "Latency/req", "Cache invalidation", "LOC", "Currently used?", "Better?"],
    rows: [
      ["Per-request DB call", "~8ms", "immediate", "20", "YES", "no — Redis latency"],
      ["Local TTL cache (60s)", "~0ms", "eventual (60s lag)", "45", "no", "yes for most tokens"],
      ["Signed JWT (stateless)", "~0ms", "revocation requires blocklist", "80", "no", "yes if revocation acceptable"]
    ],
    current: 0  // 0-indexed row that is currently in use (highlighted differently from "chosen")
  },

  frictionPoints: [
    {
      id: "F1",
      category: "performance",
      title: "Per-request remote validation",
      current: "Every request hits Redis for token validation, no local cache.",
      cost: "~8ms added to every authenticated request; Redis becomes a hard dependency on the hot path.",
      smell: "Chatty I/O",
      severity: 4,
      snippet: {
        language: "cpp",
        code: "auto session = store_.validate(token);\nif (!session) return Response{401};",
        file: "src/auth/middleware.cpp",
        line: "34"
      },
      fixDirection: "Local TTL cache (60s) with explicit invalidation on logout/revoke."
    }
  ],

  roadmap: {
    highValue: [
      {
        suggestion: "Replace per-request Redis calls with a local TTL cache keyed by token hash.",
        impact: 5,
        effort: 3,
        verdict: "objectively_right",
        addresses: ["F1"],
        blockedBy: ["qw-1"],
        rejectReasons: [
          "Revocation lag (up to 60s) is acceptable only if forced-logout is not a hard requirement."
        ],
        file: "src/auth/middleware.cpp",
        line: "34"
      }
    ],
    quickWins: [
      {
        id: "qw-1",
        suggestion: "Extract token validation into a TokenValidator interface so the store is swappable without touching middleware logic.",
        impact: 3,
        effort: 1,
        pavesWayFor: "F1 — makes swapping in a caching validator a one-liner instead of a surgery.",
        file: "src/auth/middleware.cpp",
        line: "20"
      }
    ]
  },

  scenarios: [
    {
      question: "A user's token is revoked (logout) and they immediately retry the request. What happens?",
      answer: "Today: the next request hits Redis, gets null, returns 401. Correct behavior.\nAfter the caching fix without an invalidation hook: the cached session stays valid for up to 60s after revocation. This is the tradeoff to quantify before committing to the cache approach.",
      file: "src/auth/middleware.cpp",
      line: "34"
    }
  ],

  gotchas: [
    "SessionStore::validate() is NOT thread-safe — the middleware assumes single-threaded dispatch. This assumption is undocumented.",
    "Token expiry is checked in the store, not the middleware — if the store is bypassed (tests, mocks), expiry is silently skipped."
  ],

  entryPoints: [
    { file: "src/auth/middleware.cpp", line: "18", label: "Middleware::process() — entry point for every request" },
    { file: "src/auth/middleware.cpp", line: "34", label: "validate() call — the hot path and the main friction point" }
  ]
};
```

**Layout (sequence diagram leads — non-negotiable):**

```
┌───────────────────────────────────────────────────────────┐
│  Title                       [file1.cpp] [file2.hpp]      │
│  Summary (age, LOC, context)                   10-min     │
├───────────────────────────────────────────────────────────┤
│  ▶ CURRENT EXECUTION FLOW          [actors: classes]      │
│  <mermaid sequence diagram — current behavior>            │
│  Caption: "Current behavior — ..."                        │
│                                                           │
│  ▶ ARCHITECTURE DECISIONS                                 │
│  ▼ Per-request token validation                           │
│    Context: SessionStore was in-process; latency ~0ms.    │
│    ⚠ AGING — SessionStore is now Redis, ~8ms/request      │
│    <snippet>  src/auth/middleware.cpp:34                  │
│                                                           │
│  ▶ COMPARISON                                             │
│  ┌──────────────┬─────────┬──────────────┬──────┬──────┐  │
│  │ Option       │ Latency │ Invalidation │ LOC  │ Btr? │  │
│  │ [CURRENT]    │ ~8ms    │ immediate    │ 20   │ no   │  │  ← current, not "chosen"
│  │ TTL cache    │ ~0ms    │ 60s lag      │ 45   │ yes  │  │
│  │ JWT stateles │ ~0ms    │ blocklist    │ 80   │ yes  │  │
│  └──────────────┴─────────┴──────────────┴──────┴──────┘  │
│                                                           │
│  ▶ PREDICT & CHECK                                        │
│  ❓ User revokes token, immediately retries. What happens? │
│     [click to reveal]                                     │
│                                                           │
│  ▶ FRICTION POINTS                                        │
│  [F1] PERFORMANCE  ████░ 4/5  Chatty I/O                  │
│    Every request → Redis → ~8ms added to hot path         │
│    <snippet>                                              │
│    → Fix: local TTL cache + invalidation hook             │
│                                                           │
│  ▶ CHANGE ROADMAP                                         │
│    QUICK WINS — do these first                            │
│    [qw-1] Extract TokenValidator interface   Impact ███░░ 3  Effort █░░░░ 1
│            → Paves way for: F1 (caching swap becomes trivial)
│                                                           │
│    HIGH-VALUE CHANGES                                     │
│    [OBJ. RIGHT] Local TTL cache             Impact █████ 5  Effort ███░░ 3
│    Addresses: F1  |  Needs: qw-1 first                    │
│    Why not? — revocation lag acceptable only if no forced-logout SLA
│                                                           │
│  ▶ GOTCHAS                                                │
│  ⚠ SessionStore::validate() is NOT thread-safe…           │
│                                                           │
│  ▶ START HERE                                             │
│  → middleware.cpp:18  Middleware::process() — every request entry point
│                                                           │
│  ─────────────────────────────────────────────            │
│  Type "quiz me" to be grilled on the current design's     │
│  tradeoffs and failure modes.                             │
└───────────────────────────────────────────────────────────┘
```

**Visual style** — same as `/teach` with these additions:

Base palette identical to `/teach`:
- Background `#0d1117`, surface `#161b22`, border `#30363d`
- Body `system-ui, -apple-system, sans-serif`, 14px, line-height 1.6
- Text `#e6edf3`, muted `#8b949e`, headings `#f0f6fc`
- Section headers: uppercase, letter-spaced, `#79c0ff`, collapse arrow ▼/▶
- Code blocks: `JetBrains Mono, Menlo, monospace`, 13px, background `#0d1117`
- Mermaid theme: dark

Decision verdict badges:
- `✓ HOLDS` — background `#1a4d2b`, text `#3fb950`
- `⚠ AGING` — background `#3d2b00`, text `#d29922`
- `✗ REVISE` — background `#3d1a1a`, text `#f85149`

Comparison table: current row marked `[CURRENT]` in amber `#d29922`, NOT highlighted
as "chosen." Better alternatives highlighted in green `#1a4d2b` when "Better? = yes."

Friction points: red-orange `#f0883e` left-border, severity as 5-bar score
(filled `#f0883e`, empty `#30363d`), category as a small muted chip.

Roadmap — Quick wins: teal `#56d364` left-border, small `★ QUICK WIN` badge.
Roadmap — High-value: blue `#58a6ff` left-border, impact/effort bars (impact `#3fb950`,
effort `#d29922`), verdict badge same as `/teach` (OBJ. RIGHT / SUBJECTIVE),
`Addresses: F1, F2` in muted chips, `Needs: qw-1 first` in amber if blocked.

**Interactivity — vanilla JS:**
- All section headers click-to-collapse, except CURRENT EXECUTION FLOW (always expanded).
- Scenario answers hidden, click to reveal.
- Mermaid renders on DOMContentLoaded with dark theme.
- CDN failure degrades to `<pre>` source.

```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```

### Step 7 — Write and Report

```bash
mkdir -p ./.claude-artifacts
```

Write to `./.claude-artifacts/audit.html`.

Print exactly this and nothing else:

```
✓ .claude-artifacts/audit.html written — <title>  (<budget>)
  Flow:         sequenceDiagram (<N> actors)
  Decisions:    <N>  (<N> holds, <N> aging, <N> revise)
  Friction:     <N>  (severity avg: <X.X>/5)
  Roadmap:      <N> high-value, <N> quick wins
  Scenarios:    <N>
  Gotchas:      <N>

Open:  xdg-open ./.claude-artifacts/audit.html
Quiz:  type "quiz me" when you're ready to be grilled on the tradeoffs.
```

Do NOT print the HTML source.
Do NOT summarize the artifact in chat — the HTML is the deliverable.

## Quiz Protocol (when the user types "quiz me")

Same structure as `/teach` quiz but questions are calibrated to the audit context.

Read the existing `.claude-artifacts/audit.html`, parse the `BRIEF` object, run the quiz.

One question at a time. Wait for the answer. Don't batch.

Rotate through:

1. **Predict** — "What does the current code do when [edge case from BRIEF.scenarios or a new one]?"
   Correct: confirm in one sentence. Wrong: pinpoint the mistaken assumption, move on.

2. **Explain the decision** — "Why was X done this way? What was the original context?"
   He should cite the context, not just say "it was wrong." Understanding why a decision
   was made in its original context is part of owning the code.

3. **Evaluate the tradeoff** — "If you applied [quick win or high-value change], what breaks
   and what gets better? What's the constraint that makes you hesitate?"
   Grade strictly. "It's better" is not an answer — he must name the specific gain and the
   specific cost or risk.

4. **Sequence a change** — "If you were doing this refactor, what order would you do it in
   and why?" He should be able to cite the `blockedBy` / `pavesWayFor` logic.

Stop when he answers 3 cleanly (one of each type) or says "done" / "stop."

```
✓ You're solid on this. Closing the quiz.
```

If egregiously wrong on a friction point or decision:
```
✗ Re-read [specific section]. Your mental model of [specific thing] doesn't match what the code does.
```

Direct. No participation trophies.
