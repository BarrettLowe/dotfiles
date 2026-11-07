---
name: guided-editor
description: "User-invoked exploration of real code through Neovim. Build a quickfix trail and discuss 1 location at a time, with responsibility and ownership as the starting point. Quizzes are optional."
disable-model-invocation: true
---

# Guided editor

Use this skill only when Barrett explicitly invokes it. An ordinary request to explain code is not an invocation. This skill replaces `orient` with an editor-guided conversation rather than a mandatory quiz.

## Usage

```text
/skill:guided-editor src/parser/
/skill:guided-editor src/parser/ auth
/skill:guided-editor --diff
```

Arguments select a file, module, or change and optionally a short topic name. Without arguments, use the code already under discussion or the just-changed files. If the target is unclear, ask 1 question before building a trail.

## Prepare the trail

Read the relevant source and identify the locations needed to answer Barrett's question. Start with responsibility and ownership at the requested scale; include execution steps when the question is about flow. Keep the trail focused rather than cataloging the whole repository.

Every entry must point to a verified source line. Clearly distinguish source facts from inferred intent. An existing graphify graph can help with a large module, but verify its locations against current code. Graphify and helper agents are not prerequisites. Do not install, build, or refresh a graph unless Barrett asks.

Write `.claude-artifacts/guided-editor_<topic>.qf` at the project root. Derive the topic from the target if it was not supplied. Do not overwrite an existing trail unless Barrett requests an update; otherwise choose an unused filename.

Use 1 jump entry per line:

```text
ABSOLUTE_PATH:LINE: ComponentName - responsibility; ownership note if useful
```

Use absolute source paths so jumps work from any working directory. Avoid caption lines so trail entry numbers match Neovim's `:cc N` numbers. For example:

```text
/project/src/reader.py:8: Reader - reads input; owns the file handle
/project/src/parser.py:24: Parser - converts input into records; owns parsing rules
/project/src/store.py:30: Store - saves records; owns persistence
```

For `--diff`, inspect the diff and the previous version. Point to current source lines where responsibility, ownership, or collaboration changed. Explain removed code from the diff rather than inventing a current location for it.

## Start in the editor

Give a short explanation of the target's purpose and relationships. Then provide commands using the actual absolute trail path:

```vim
:cgetfile /absolute/project/.claude-artifacts/guided-editor_parser.qf
:copen
:cc 1
```

Explain that `:cnext` and `:cprev` move through the trail and `:cc N` jumps to an entry. Ask Barrett to load it and say when he is ready. Stop there; do not start the walkthrough before he responds.

## Walk together

At each step, name the trail entry and give the exact jump command, such as `:cc 2`. Explain 1 useful mental model in a short paragraph grounded in that location, then stop for interaction. Refine that model only after the current layer is understood.

Follow Barrett's questions instead of forcing the original trail order. If he is confused, explain the same concept with a different example or model rather than adding detail. Do not descend into a component before its purpose is clear, and do not make every turn a quiz or comprehension check.

Quiz only if Barrett requests it. Ask 1 question, wait for his answer, then discuss the evidence at the relevant entry. Do not grade him or make prediction a requirement for continuing an ordinary walkthrough.

Keep the conversation tied to real editor locations. Do not generate an HTML report, start a separate teaching skill, or modify the code as part of the walkthrough. Stop when Barrett has the understanding he wanted or ends the session.
