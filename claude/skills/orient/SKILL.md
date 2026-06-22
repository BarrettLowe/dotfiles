---
name: orient
version: 1.0.0
description: |
  Orient Barrett to an unfamiliar architecture (AI-written or inherited) WITHOUT
  making him read it line by line. Stands on graphify's graph as an honest answer
  key, emits a Neovim quickfix trail (orient_<topic>.qf) he walks with :cnext, and
  quizzes him predict-the-owner style so the map sticks by DOING, not reading.
  Lens: what each class is responsible for (SRP) + what it owns. Output is the
  quickfix file + a conversation, never an HTML page.
license: MIT
compatibility: claude-code
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
  - Agent
---

# /orient

Barrett is a slow, deliberate learner who wants to understand **why** a system is
shaped the way it is — and he learns by **doing**, not reading. His specific pain:
when Claude writes a module from scratch (or he inherits one) he has no map of
**what owns what** — "if I want feature X, where do I even look?" Reading it
line by line is exactly the absorption path that doesn't work for him.

`/orient` fixes that by doing three things at once:

1. **Stands on graphify** for the honest, structural map — communities (the
   architectural neighborhoods), god-nodes (coupling hot-spots), and
   `source_location` citations. We do **not** re-extract or hand-roll analysis.
2. **Emits a quickfix trail** (`orient_<topic>.qf`) he loads into Neovim and walks
   with `:cnext` / `:cc N`, landing on the real code as we go. The quickfix list
   *is* the linear walkthrough — native to his editor, no artifact he won't reread.
3. **Quizzes him predict-the-owner** — it asks which class is responsible for a
   behavior, he predicts, then we reveal with a jump to the proving line. The
   inversion (he acts first) is the whole point. This is NOT another explainer
   that talks at him.

The headline lens is **responsibility (SRP) + ownership**, the altitude is the
**architecture** (lead with neighborhoods), and the modality is **static** (how it's
wired, from reading code — not a runtime trace).

## Usage

```
/orient                      # orient on the code just written / changed (topic auto-named)
/orient src/parser/          # orient on a module/dir
/orient src/parser/ auth     # orient on a module, name the topic "auth" → orient_auth.qf
/orient --diff               # orient on what an AI edit just changed (before/after of responsibilities)
"orient me on the cache"     # natural-language trigger
```

The `<topic>` is a short kebab slug. He may orient many times on different slices,
so **every run writes its own `.claude-artifacts/orient_<topic>.qf`** — never
overwrite a previous topic's file. If no topic is given, derive one from the path
(`src/parser/` → `parser`) or the change (`diff` → `orient_diff.qf`).

## Non-negotiable principles

1. **This is a conversation + a quickfix trail. NEVER pre-dump.** Do not pre-write a
   wall of prose or a giant report up front. Orient at the neighborhood level, then quiz.
   If you're tempted to produce headers and bullets explaining everything before he's
   answered anything, you're doing the wrong skill — that's `/teach`. **But terseness is
   not the goal — comprehension is.** The one place to *spend real words* is the **reveal
   after he predicts** (Step 3): that's the teaching moment, where the "why" lands because
   he's primed. A clipped "nope, it's Parser" reveal is a failure, not restraint.
2. **He acts first.** Before you explain what a class does, make him **predict** it.
   Reveal only after he answers. Grade strictly — right class with the wrong reason
   is not a pass (he wants to be grilled, not handed trophies). One question at a time.
3. **Delegate the noisy build; never do it in this context.** The `orient-builder`
   agent ensures the graphify graph and writes the `.qf` — all the graph dumps stay in
   its isolated context. You receive only a digest + the trail. The `.qf` is the answer
   key for the quiz; if a fact isn't on the trail, `grep`/`Read` the real code to
   confirm it — never invent.
4. **Every claim has a receipt.** Each responsibility/ownership statement points to a
   real `file:line` (from graphify's `source_location`, or a grep you ran). The
   quickfix entry IS the receipt — he jumps to it and sees the proof.
5. **Honesty about confidence.** graphify tags edges `EXTRACTED` / `INFERRED` /
   `AMBIGUOUS`. Treat EXTRACTED as fact; flag INFERRED/AMBIGUOUS as inference, not
   truth. Intent / "why" is always inference — say so.
6. **Lead with the neighborhoods.** Communities are the general-architecture view he
   asked for. Show the map first, drill into one neighborhood at a time.

## What you must do when invoked

### Step 1 — Get the trail (delegate the noisy build)

Determine the target (path, the just-changed files, or a diff) and a `<topic>` slug.

**Architecture scale (a module, several files, or whole repo) → spawn the
`orient-builder` agent.** Hand it the target and the topic slug. It ensures/refreshes
the graphify graph, writes `.claude-artifacts/orient_<topic>.qf`, and returns a compact
digest — the neighborhood map, the god-nodes, the trail path. **All the graph noise
stays in the agent's context; you only get the digest.** Do not read `graph.json`
yourself — that defeats the entire point of the split.

- If the agent reports it **bailed** (corpus needs a semantic build, or graphify isn't
  installed), relay that to Barrett and offer to run `/graphify <path>` in the main
  session first — don't try to build it here.

**Small scale (one file or a handful) → skip the agent.** Communities are pointless at
this size and the graph noise is negligible. `Read` the file(s), `grep` for the
class/def lines, and write the `.qf` yourself (same format as below). The agent only
earns its keep when there's a graph to build.

The `.qf` format (what the agent writes, what you write at small scale):
- One jump entry per line, default-errorformat compatible: `ABSOLUTE_PATH:LINE: MESSAGE`
  (so `:cgetfile`/`:cfile` parse `%f:%l: %m`). Absolute paths — jumps must work from any cwd.
- `MESSAGE` = `ClassName — single responsibility` + a short ownership note when it
  matters (`owns conns_`, `borrows Config&`). One line, no embedded newlines.
- Group by community with a non-matching caption: `── Neighborhood ──`.
- Flag god-nodes: `⚠ god-node, N edges`.

```
── Ingest ───────────────────────────────
/Users/barrett/proj/src/reader.py:8: Reader — reads bytes, hands out lines; owns the file handle
── Parsing ──────────────────────────────
/Users/barrett/proj/src/validate.py:40: Validator — owns the structural rules (validation lives here)
── Storage ──────────────────────────────
/Users/barrett/proj/src/order_book.py:12: OrderBook ⚠ god-node, 14 edges — matches orders AND calls Store.write()
```

### Step 2 — Load the trail

**Open with a clear handshake — he must never wonder how to start.** Lead the session
with three short beats, in order:

1. **The map.** The neighborhoods and how they connect (or, for a single file, its
   one-line shape). A few lines — this is his bird's-eye before he dives.
2. **How to load + skim.** The trail is his map; tell him to load it and skim the entries
   as his first pass.
3. **The explicit start.** Say it outright: *"Skim the trail, then say `go` and I'll quiz
   you one at a time — you predict, I reveal with the proof and the why."*

```
:cgetfile .claude-artifacts/orient_parser.qf   " load the trail (:cfile also works)
:copen                                          " see the whole map; community headers are captions
:cnext / :cprev / :cc 5                         " walk it, or jump to a specific entry
```

Don't start quizzing until he says go — the skim is his first pass at the map, and the
handshake is what fixed "I wasn't sure how to start."

### Step 3 — Orient, then quiz (the loop)

Now run the interactive loop. Keep chat and quickfix **welded by entry number** so the
doing happens in his editor, not the terminal.

1. **Orient with real substance — a label is not orientation.** Show the neighborhood
   map (communities + how they connect), 2–6 lines. **For a single file with no
   communities, give a brief but real shape instead of near-silence:** the classes and
   how they relate (who holds/calls/owns whom), 2–4 lines. Then pick one neighborhood (or
   class) to drill.
2. **Predict-the-owner.** Ask one question — "a raw upload arrives and needs validating,
   which file owns that?" Do **not** reveal first. Wait for his answer.
3. **Reveal with substance — spend the words HERE.** Grade strictly, then explain the
   *why* in 2–4 sentences grounded in the actual line: what the class is responsible for,
   *why* that responsibility lives there (the SRP/ownership reasoning), and what it means
   for him going forward. Tell him the entry to jump to (`:cc 3`) so he reads the proof
   himself. This reveal is where his "understand why" need is met — a bare location with
   no reasoning is the failure mode. On a **miss**, give one piece of evidence first and
   let him re-predict before the full why; once it's revealed, actually *teach* it, don't
   just name it.
4. **Use god-nodes as the SRP radar.** When you reach a flagged node, make him predict
   what's tangled in it that probably shouldn't be. The edge count is graphify's number,
   not your opinion — surface the coupling, let him judge whether it's justified.
5. Keep going neighborhood by neighborhood, ~5–8 questions total. Stop when he's got the
   shape; don't pad with trivial getters.

Question types to draw from (all answerable from the graph / real code):
- "Which class is responsible for «behavior»?"
- "Who creates and owns «resource»? Who just borrows it?"
- "You need to change «feature» — which file do you open first?"
- "«ClassA» reaches into «ClassB» here — whose job should that be?" (god-node / coupling)

### Delta mode (`--diff` / "what did the AI change")

Same machinery against a diff. Compare the responsibilities/ownership **before vs after**
(use `git show HEAD:<file>` for the before). Emit `orient_diff.qf` pointing at the changed
seams, and surface the three things that mean "the design moved":
- a responsibility **moved** to a different class,
- an **ownership kind changed** (owned → borrowed: a lifetime shift worth flagging),
- a **new collaborator/edge** appeared.
Then quiz him on the delta, not the whole module.

## Where this sits

- It is **not** `/graphify` — that builds the map and narrates it. `/orient` makes *him*
  produce the answers against that map and walk it in Neovim.
- It is **not** `/explain` — that paces execution *flow* (temporal) in chat. `/orient` is
  *structural*: who's responsible for what, at architecture altitude, with a quickfix trail.
- It is **not** `/teach` — no dense HTML to review later. The trail and the quiz are the artifact.

Use `/orient` first thing on a module Claude wrote or one he inherited, when the question
is "what is responsible for what, and where do I look." Pair with `/explain` afterward if
he then wants to trace one path's execution in detail.
