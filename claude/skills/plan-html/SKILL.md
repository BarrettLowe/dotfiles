---
name: plan-html
version: 1.0.0
description: |
  Plan a task, feature, or goal and render it as a polished interactive HTML file.
  Collapsible phases, task checklists, milestone badges, risks, and decisions-needed
  sections. Self-contained, no server required. Outputs to ./plan.html.
license: MIT
compatibility: claude-code
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

# /plan-html

Think through a goal and produce a self-contained interactive HTML plan. The HTML
is more scannable than markdown — collapsible phases, live progress bar, visual
structure. Works via file://, no server needed.

## Usage

```
/plan-html                          # infer goal from conversation context
/plan-html "add rate limiting"      # explicit goal
/plan-html spec.md                  # read goal from file
```

## What You Must Do When Invoked

### Step 1 — Gather Input

Check in order:
1. Quoted argument → use it directly as the goal
2. Filename argument → read the file, extract the goal
3. Conversation context → infer the goal from what's been discussed

Ask only if none of the above yields anything: "What's the goal or feature you want a plan for?"

### Step 2 — Check for Existing File

```bash
test -f ./plan.html && echo "EXISTS"
```

If it exists, ask before overwriting: "`./plan.html` already exists — overwrite it?"

### Step 3 — Build the Plan

Think through the work carefully and produce:

**Title** — short, specific (not "Plan" or "Implementation Plan")

**Goal** — one sentence: what done looks like

**Phases** — 2–5 logical groupings. Pick from these or invent appropriate ones:
- Exploration / Research / Spike
- Design / Architecture
- Implementation
- Testing / QA
- Deploy / Rollout

**Tasks** — 2–8 per phase, verb-first, concrete, verifiable by someone else. No vague tasks.

**Milestones** — 1–3 checkpoints. One per major phase transition.

**Risks & Unknowns** — blockers, missing info, external dependencies, things likely to surprise.

**Decisions Needed** — explicit questions that need a human answer before work can proceed. These are not risks — they are gates.

Self-check before generating HTML:
- [ ] Every task starts with an action verb
- [ ] No phase has fewer than 2 tasks
- [ ] At least one milestone exists
- [ ] Risks section has at least one entry (even if small)
- [ ] Decisions section has at least one entry (even if "none identified")
- [ ] Total tasks >= 6

### Step 4 — Generate the HTML

Write one self-contained HTML5 file. No CDN, no external fonts, no remote resources.

**Embed all plan data as a JS object** at the top of the script block:

```js
const PLAN = {
  title: "Add Rate Limiting to the API",
  goal: "Prevent abuse by capping requests per client without breaking existing consumers.",
  phases: [
    {
      id: "phase-1",
      name: "Research",
      color: "#6366f1",
      milestone: "Approach decided, library chosen",
      tasks: [
        "Audit current request volume per endpoint",
        "Survey rate-limiting middleware options",
        "Confirm Redis is available in prod infra",
      ]
    },
  ],
  risks: [
    "Redis may not be provisioned in staging — blocks integration testing",
    "Existing clients may not handle 429 responses gracefully",
  ],
  decisions: [
    "Fixed window vs sliding window algorithm?",
    "Per-user or per-IP limiting for unauthenticated endpoints?",
  ],
};
```

**Layout:**

```
┌──────────────────────────────────────────────┐
│  Plan Title                                  │
│  Goal statement                              │
│  ████████░░░░ 4 / 11 tasks complete          │
├──────────────────────────────────────────────┤
│  ▼ Research                  🏁 milestone    │
│      ☑ Task 1 (dimmed, struck)               │
│      ☐ Task 2                                │
│                                              │
│  ▶ Design       [collapsed]                  │
│                                              │
│  ▼ ⚠ Risks & Unknowns                       │
│      • Redis may not be in staging           │
│                                              │
│  ▼ ? Decisions Needed                        │
│      • Fixed vs sliding window?              │
└──────────────────────────────────────────────┘
```

**Visual style:**
- Background: `#0f1117`, card surface: `#1a1d27`, body font: system-ui stack, 15px
- Each phase card has a unique colored left border (cycle through: `#6366f1 #10b981 #f59e0b #ef4444 #8b5cf6`)
- Phase headers are clickable — toggle collapse with ▶/▼ indicator
- Checked tasks: `text-decoration: line-through`, `opacity: 0.45`
- Milestone badge inline at card bottom: small pill, muted green
- Risks section: amber `#f59e0b` accent, ⚠ icon
- Decisions section: blue `#60a5fa` accent, ? icon
- Progress bar: spans full width below header, updates live on every checkbox change
- Readable at 900px–1400px, not broken narrower

**Interactivity — vanilla JS only:**
- Phase header click → toggle `.collapsed` class, flip arrow
- Checkbox change → recount checked tasks across all phases → update bar width and counter label
- All phases start expanded
- No localStorage, no fetch, no async

### Step 5 — Write and Report

Write to `./plan.html`.

Print this and nothing else after writing:

```
✓ plan.html written
  Title:   <title>
  Phases:  <N>
  Tasks:   <total>

Open: xdg-open ./plan.html
```

Do NOT print the HTML source.
