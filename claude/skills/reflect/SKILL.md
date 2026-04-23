---
name: reflect
description: Review session history (current session by default, or the last N days of sessions for this project if an arg is given) for patterns that could become reusable skills, agents, hooks, keybindings, or memory entries — and give Barrett direct feedback on his own prompting so he can drive Claude more effectively next time. Use at the end of a session, or when Barrett asks "what did we learn."
---

# Session Reflection

You are reviewing session history to find leverage: repeated work, friction, and prompting habits worth reinforcing or fixing. Output is a single terse report with concrete artifacts Barrett can act on.

Barrett wants direct, unvarnished feedback. No hedging. No pep talk. If nothing is worth creating, say so.

## Scope

Default: **current session only**, fast path. Skip the multi-session logic below.

If invoked with an argument that looks like a day count (`7`, `7d`, `week`, `30d`, etc.), run **multi-session mode**:

1. Resolve the project transcript directory: take `pwd`, replace `/` with `-`, prepend `~/.claude/projects/`. Example: `/home/barrett-lowe/Development/armgdn-seeker-sw` → `~/.claude/projects/-home-barrett-lowe-Development-armgdn-seeker-sw/`.
2. List `.jsonl` files in that directory modified within the last N days (`find <dir> -name '*.jsonl' -mtime -N`).
3. **Delegate the scan to a subagent.** Do not read those JSONL files into the main context — they are large and full of tool output noise. Use the `general-purpose` agent. Brief it with the Pass 1 / Pass 2 criteria below and ask for a consolidated findings list with **frequency counts** (how many sessions each pattern appeared in).
4. Scope stays single-project. Do not read other projects' transcripts — Barrett works in docker containers and cross-project noise isn't worth the mess.
5. Also scan the current live session directly (the agent can't see it). Merge results.
6. Drop sessions that look like scratch/test runs: fewer than ~5 user turns, or that ended within a minute of starting. They're noise.
7. When merging, **deduplicate by pattern and prefer cross-session findings**. A friction point that shows up in 4 sessions is a much stronger signal than one that shows up once.

## Pass 1 — Scan for leverage

Walk the session from the top. Note every instance of:

- **Repetition.** Same task shape performed 2+ times (e.g. "render a tree of X files", "summarize a diff in house style", "run this five-step check before committing"). Repetition is the loudest signal a skill belongs there.
- **Friction.** Places where Barrett corrected you, rephrased his request, or had to re-explain context. Each correction is evidence either (a) a skill would have encoded the rule, or (b) Barrett's prompt left room you shouldn't have filled.
- **Multi-step bash sequences.** Any pipeline Barrett ran or asked for that was more than ~3 commands chained by intent. Candidate for a skill or a script.
- **Manual lookups.** Barrett asked you to check the same dashboard, file, or external system twice. Candidate for a `reference` memory or a skill that wraps the lookup.
- **Automations.** Anything Barrett said "from now on when X, do Y" — those require hooks in `settings.json`, not memory. Flag them explicitly.
- **Agent-shaped work.** Long read-heavy tasks you did in the main loop that blew up context and could have been delegated. Candidate for a subagent.
- **Prompting habits worth keeping.** When Barrett's phrasing produced a good result on the first try — note it. The point is to reinforce, not just correct.

Skip anything already captured by an existing skill in `~/.claude/skills/` or rule in `~/.claude/CLAUDE.md`. Check before proposing.

## Pass 2 — Classify each finding

For each item from Pass 1, pick the smallest tool that fits:

| Signal | Artifact |
|--------|----------|
| Repeated multi-step task with clear inputs/outputs | **Skill** (`~/.claude/skills/<name>/SKILL.md`) |
| Long read-only investigation that pollutes main context | **Agent** (subagent type) |
| "Every time X happens, do Y" | **Hook** (`settings.json` via `/update-config`) |
| Keystroke-level friction | **Keybinding** (`~/.claude/keybindings.json`) |
| Stable fact about project, person, or external system | **Memory** (`bd remember` for this project, or `~/.claude/memory/` globally) |
| One-off improvement to existing skill | **Edit** the existing SKILL.md — don't create a new one |

If a finding doesn't fit any of these cleanly, drop it. Not every friction point deserves an artifact.

## Pass 3 — Write the report

Structure:

```
## Scope
<One line: "current session" or "N sessions over the last X days (plus current)">

## Artifacts to create

1. **<name>** — <type: skill | agent | hook | keybinding | memory>
   Why: <one sentence — what pattern triggered this; in multi-session mode include frequency, e.g. "3 of 4 sessions">
   Shape: <one sentence on the interface: invoked as /foo, runs on PostToolUse, etc.>

2. ...

## Edits to existing skills
- `<skill-name>`: <one-line change>

## Feedback on your prompting
- **Keep doing:** <specific phrasing or habit that worked, with one concrete example from the session>
- **Consider changing:** <specific habit that cost time, with one concrete example — and the shorter/clearer version that would have worked>

## Nothing-to-do
<If any category had no findings, say so in one line. Don't pad.>
```

## Rules

- **Be concrete.** Every finding cites a specific moment in the session ("when you asked for the third tree of build outputs…"). Generic advice is useless.
- **Propose, don't create.** This skill produces a report. It does NOT write the new skill files — Barrett decides which ones are worth it, then asks. Creating unrequested files is the exact anti-pattern this skill is meant to surface.
- **No moralizing.** Feedback is mechanical: "this phrasing was ambiguous, this version isn't." Not "you should try to be clearer."
- **One page max.** If the report is longer than a screen, you're padding. Cut to the top three of each category.
- **If nothing qualifies, say "nothing worth creating this session" and stop.** A clean session is a valid outcome.
