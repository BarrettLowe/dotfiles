---
name: pickup-work
description: Work a SecondBrain task end-to-end inside a git worktree, behind three human gates. Reads the task note handed off by the /pickup launcher, scopes what to explore, maps the code, then GRILLS Barrett to eliminate every ambiguity and lock a validation plan before writing a line. Builds locally (never pushes), reports inline with a diff walkthrough, and ships only on an explicit second "ship it" — pushing + opening the MR via commit-merge-mr and writing the implementation summary back into the task note. Invoked in a dedicated Claude session whose cwd is the worktree.
---

# Pickup Work — the worker

You are a full interactive Claude session running **inside a git worktree** for one
SecondBrain task. Your cwd is the worktree, so you've inherited the repo's own
`CLAUDE.md` / `.claude/` context — use it.

**Argument**: the absolute path to the task note. Read it first.

Barrett runs you like an intern he trusts with harder work: you own the task, but you
do not guess and you do not push without a green light. There are **three human gates**.
Between them you delegate and grind; at them, you stop and talk to Barrett.

## Read the contract

The task note's `## Pickup` block is your contract with the launcher:
`Repo`, `Worktree`, `Branch`, `Base`, `Phase`, and a `### Mandate`. Confirm your cwd
matches `Worktree`. Derive the vault root from the note path (`<vault>/tasks/<slug>.md`)
— you'll need it for the note and, rarely, the inbox.

If `Phase` is past `explore`, this is a **resume**: read the `### Spec` /
`### Validation Plan` / `### Implementation Summary` already written and pick up there
instead of re-grilling Barrett on settled ground.

## Step 1 — Scope

Settle *what* to explore. The mandate is a starting point, not the whole answer. If
what-to-explore is genuinely unclear, ask Barrett targeted questions now. Otherwise
proceed.

## Step 2 — Explore

Map the code the change will touch — entry points, call flow, the specific
files/functions in play, and whether a submodule is involved (`git submodule status`,
`.gitmodules`). Delegate to the `codebase-explorer` agent to keep your context clean;
come back with a summary, not raw dumps.

## Gate ① — The grill (alignment lock)

**This is not a comprehension quiz. You are not teaching Barrett.** The goal is to
drive every ambiguity to zero so you can build with no guesswork. Present, then
resolve *with* him, one open question at a time:

- **The problem, restated** — what this task actually is (often not what the thin
  ticket said).
- **The proposed approach** — the specific changes, the files, the shape.
- **Every assumption and open decision** — surface each as a concrete question and get
  Barrett's call. Do not paper over a fork by picking silently.
- **Rejected alternatives** — what else you considered and why not.
- **Blast radius** — classify it (LOW / MED / HIGH) per Barrett's doctrine. A submodule
  pointer bump is HIGH. This is where you ask the per-task submodule question: *"this
  needs changes in submodule <C> — want me in there this time?"*
- **The validation plan** — concrete and accepted: build + which tests + any manual
  repro/verify. For MED/HIGH, validation must be against a clean/production-like state,
  not just "it compiled here."

**Hard exit criteria — all must hold before you build:**
1. No open questions remain.
2. A concrete validation plan exists and Barrett accepts it.

Loop until Barrett says you're aligned. Then write `### Spec` (approach, files,
decisions, rejected alternatives, blast tier) and `### Validation Plan` into the note's
`## Pickup` block, and set `Phase: aligned`.

## Step 4 — Build

Implement exactly the locked spec. Use `feature-implementer` / `bug-fixer` sub-agents
where they help, or work directly.

- Commit **locally** on `blowe/<slug>`. **Never push.**
- **Submodule** (only if Barrett green-lit it): branch the submodule `blowe/<slug>`,
  commit the change there locally, then bump the gitlink in the parent and commit that.
  All local, nothing pushed.
- Run `simplifier` on generated code (Barrett's standing rule) — a build step, not a gate.
- **Done-bar — both required before you report:** the repo builds clean, and existing
  tests pass. Then run the agreed validation plan and capture the result.

Set `Phase: built`.

## Gate ② — Report + diff walkthrough (inline)

Report in chat — no artifact (Barrett chose inline):

- **What changed and why** — concise.
- **Guided diff walkthrough** — `git diff` per file, walking him through the flow, not
  just listing hunks.
- **Validation results** — build output, test results, validation-plan outcome.
- **Submodule impact**, if any.

Then wait. If Barrett requests changes → back to Build. If he approves → **hold**.
Approval here is **not** permission to ship.

## Gate ③ — Ship (only on an explicit "ship it")

Two approvals total: reviewing at Gate ② is not shipping. Do nothing below until
Barrett explicitly says to ship.

1. **Push + MR** via the `commit-merge-mr` skill. If a submodule changed, ship it
   **first** — from inside the submodule dir, run commit-merge-mr to push its branch and
   open its MR — then in the parent commit the gitlink bump and run commit-merge-mr for
   the parent, referencing the submodule MR. `commit-merge-mr` resolves the project and
   links the closing issue itself.
2. **Write the implementation summary** into the note's `## Pickup` block as
   `### Implementation Summary`. This is the episodic "how it turned out" record — it
   stays in the task note and is **not** compiled. Keep it out of the MR's territory:
   the MR owns the diff and the reviewer-facing what/why. The summary owns what the MR
   can't hold — the decisions and *why*, what you rejected, the validation outcome, and
   any follow-ups filed. Include the MR link(s).
3. **Reusable learning?** Only if the task surfaced a genuinely reusable, non-code fact
   worth promoting to a concept: also drop an inbox item
   (`<vault>/inbox/YYYY-MM-DD-HHmm-slug.md`, frontmatter `type` / `created` / `domain` /
   `processed: false`). The task body is a dead end for the compiler — inbox/daily are
   the only paths in. Default is to skip this; curation is Barrett's layer.
4. Set frontmatter `status: done` and `Phase: shipped`.
5. Offer to remove the worktree (`git -C <repo> worktree remove <path>`) — don't do it
   unprompted; Barrett may want to keep it.
