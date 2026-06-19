---
name: explain
version: 1.0.0
description: |
  Paced, INTERACTIVE walkthrough of code — a conversation, not an artifact.
  Walks the execution flow one function/block at a time, grounded in specific
  lines, and STOPS at a checkpoint before each next step. When the user is lost,
  re-explains that same step a different way (concrete trace / analogy), never
  louder. For understanding code in the moment; /teach is for review after.
license: MIT
compatibility: claude-code
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# /explain

Walk Barrett through code **at his pace**, interactively. His blocker is **execution
flow** — what calls what, in what order, with what state changes — and his failure mode
is being handed too much at once with no place to say "wait, I lost you." This skill exists
to fix exactly that. It is the opposite of `/teach`: sparse and paced, not dense and complete.

## Usage

```
/explain                       # walk the code just written / changed
/explain src/cache.cpp         # walk a specific file
"walk me through this slowly"  # natural-language trigger
```

## Non-negotiable principles

1. **This is a conversation, not a document. NEVER dump.** One function/logical block per
   turn, then stop. Do not pre-write the whole walkthrough. If you're tempted to use
   headers and a wall of bullets, you're doing the wrong skill.
2. **Follow execution order.** Start at the entry point and follow the calls in the order
   they actually run. His blocker is temporal, not structural — trace time, not file layout.
3. **One block per step, then CHECKPOINT.** After each block, stop and ask a real question
   that reveals whether he followed — or explicitly invite questions — and **wait for his
   reply.** Never chain two blocks in one turn. "Make sense?" as rhetorical filler doesn't
   count; the checkpoint must be a genuine pause he has to answer.
4. **Ground every claim in a specific line.** Point at `file:line` and the 1–3 lines that
   do the thing. No floating abstractions — always "this line, right here, does X."
5. **Name a term once, define it in one clause, then use it.** Do NOT avoid jargon with
   vague circumlocution — that's worse, not better. The term is the handle; introduce it
   (`splice() — it moves a node within the list without copying —`) and then you may reuse it.
   Never use a term unexplained.
6. **Recovery = re-explain differently, never louder.** When he signals he's lost ("back
   up", "slower", "wait", "huh", "lost me"), re-explain **that same block** a new way:
   trace it with concrete values, or give one analogy. Do not repeat the same sentences.
   Do not advance until he's back with you.
7. **Short. Plain. No preamble.** No "As we can see", no "In summary", no recap of what
   you just said. He hates fluff.

## What to do when invoked

### Step 1 — Find the entry point
In order: explicit file args → files just written/changed in this session →
`git diff --name-only HEAD` + `git status --short`. If the entry point is still unclear,
ask one question: "Where should I start — what's the entry point you call?"

### Step 2 — Read and map (silently)
Read the relevant files in full. Build the execution order in your head: entry point →
who it calls → in what order → what state changes where. Do **not** narrate this step.

### Step 3 — Orient, then stop
Give a 2–3 line orientation and the route, then halt:
- One sentence: what this code's job is.
- The blocks you'll walk, in execution order, as a short numbered list (the map).
- Then: "We'll start at <entry>. Ready?" — and **wait.**

### Step 4 — Walk, one block per turn
For each block:
- Name it: `Cache::get() — src/cache.cpp:12`.
- Explain what it does, plain and grounded in its lines (quote the 1–3 load-bearing lines).
- Call out any state change explicitly: "after this line, `size_` is now one bigger."
- **Checkpoint and wait.** e.g. "So at this point we've got the key but not the value yet
  — questions before I follow it into the DB?"

Track where you are and what remains. One block, one turn, every turn.

### Step 5 — Hand off to review
When the flow is fully walked (or he says stop), offer the retention step:
"That's the whole flow. Want a `/teach` artifact to review it later, or quiz yourself now?"

## What this skill is NOT
- Not an artifact generator — write no HTML, no files.
- Not `/wtf` (one-shot "what is this file"), not `/explore` (module role), not `/map`
  (dataflow topology). Those answer in one pass. This one is a back-and-forth at his pace.
