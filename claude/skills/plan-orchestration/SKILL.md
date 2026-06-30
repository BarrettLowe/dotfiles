---
name: plan-orchestration
version: 1.0.0
description: |
  Implement a plan using parallel subagents. User-invoked only — never triggered
  automatically. The user reviews the plan first, then invokes this to execute it.
compatibility: claude-code
disable-model-invocation: true
allowed-tools:
  - Read
  - Agent
  - Bash
---

# /plan-orchestration

Execute an approved plan by decomposing it into parallel subagent work.

## Usage

```
/plan-orchestration          # execute the most recently discussed plan
/plan-orchestration phase 2  # execute only a specific phase
```

## What You Must Do When Invoked

### Step 1 — Locate the Plan

Check in order:
1. Argument names a phase → scope execution to that phase only
2. `./.claude-artifacts/plan.html` exists → treat that as the source of truth
3. Conversation context → reconstruct the plan from what was discussed

If none of the above yields a clear plan, stop and ask: "I don't see a clear plan to execute. Run `/plan-html` first, or describe what you want done."

### Step 2 — Decompose Into Subtasks

If the plan is already broken into concrete subtasks, use them as-is.

If the plan is high-level or abstract, break it down before spawning agents. Each subtask must be:
- **Self-contained** — an agent can execute it with the context you provide
- **Concrete** — a specific file, function, or behavior to change, not "improve X"
- **Bounded** — completable in one agent turn

Do NOT start spawning agents until decomposition is complete.

### Step 3 — Spawn Agents

- Run **independent subtasks in parallel** — send multiple Agent tool calls in a single message
- Run **dependent subtasks sequentially** — wait for blockers before starting dependents
- Use `subagent_type: "haiku"` for straightforward, well-scoped tasks (single file edits, config changes, renaming)
- Use other (select appropriate) for anything requiring judgment, exploration, or multi-file changes
- **Do not edit code yourself.** You are the orchestrator. Agents do the work.
- You may review an agent's output if something looks wrong before continuing

### Step 4 — Report

After all agents complete (or after a single phase if that was requested), report:

1. **What was done** — brief, one line per subtask
2. **Deviations** — listed separately. For each: what the plan said, what actually happened, and why. Never bury this.
3. **What's next** — remaining phases or follow-up work, if any

Keep it tight. Barrett can read diffs.

### Step 5 — "Mark" Done

If the plan was stored in an html file in .claude-artifacts, move it into a directory .claude_artifacts/done. This keeps plans organized if multiple are in work.

## Notes

- If the plan is unclear, contradictory, or too abstract to decompose — stop and say so before doing anything
- If a phase has unresolved decisions (from the plan's Q&A section), surface them before executing that phase
