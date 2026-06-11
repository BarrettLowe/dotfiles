---
name: wiki
version: 1.0.0
description: |
  Write a GitLab wiki page in Barrett's style — high-level, teaching-focused,
  no implementation details. Covers context/why it exists, an overview, and how
  it works with at least one Mermaid diagram. Output is a Markdown file ready to
  paste into a GitLab wiki.
license: MIT
compatibility: claude-code
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# /wiki

Write a GitLab wiki page that gives a new engineer enough context to ask the right questions.
Not a reference doc, not a runbook — a whiteboard session on paper.

## Usage

```
/wiki                              # infer topic from recent work (plans, completed tasks)
/wiki "data ingestion pipeline"    # explicit topic
/wiki src/ingest/ src/broker/      # files to learn from
```

## Core Principles (read these every time)

1. **Context before everything.** The first paragraph tells the reader where this fits in the
   broader system — what would break or be harder without it. Why does it exist? What
   problem prompted it? A reader should understand the system's role before they understand
   the system.

2. **Teach it, don't document it.** Write like you're whiteboarding to a smart engineer who's
   new to this area. Casual, direct, no jargon. If you use a term of art, define it in one
   clause the first time. The goal is for the reader to leave able to ask better questions,
   not to leave having read a spec.

3. **At least one Mermaid diagram.** Every page must have at least one. Diagrams show
   relationships and flow that prose takes 3x as long to explain and readers skip anyway.
   Default to whichever fits: `flowchart LR` for data/component flow, `sequenceDiagram`
   for lifecycle/event flow. Choose based on what the system actually is.

4. **No implementation details.** The reader can read code. Don't describe how a function
   works — describe what a component does and why. If you feel the urge to mention a class
   name or an internal algorithm, stop and ask if there's a higher-level way to say it.

5. **No code blocks unless there's no other way.** Code references are brittle — they'll be
   wrong before the page is a year old. Use prose and diagrams instead. The only exception:
   a config key or a CLI invocation that a reader needs to orient themselves. Even then, keep
   it to one line.

6. **Medium length.** 400–1000 words of prose (diagrams don't count). Long enough to cover
   the topic. Short enough that someone will actually read it. If you're going over, either
   you're including implementation details (cut them) or the system is complex enough to
   deserve sub-pages.

7. **Links go at the bottom.** Don't interrupt prose with hyperlinks. Collect related pages
   in a "See Also" section at the end. Mention the thing by name inline; link it only once at
   the bottom.

8. **No history, no changelog.** When it was built, who built it, what the old version did —
   none of that. Git is for history. The wiki is for understanding the thing as it is now.

9. **Tone check.** Re-read the draft and ask: does this sound like someone explaining at a
   whiteboard, or does it sound like documentation? Engaging ≠ corny. Avoid "powerful",
   "seamlessly", "robust", "cutting-edge", "at its core", and similar filler adjectives.
   Active voice. Short sentences. Contractions are fine.

## Page Structure

Produce pages in this exact structure. Only omit a section if it genuinely doesn't apply.

```markdown
# <System Name>

<One paragraph: where this fits in the bigger picture. What would be harder or broken without
it. Written in past tense if it was built to solve a specific problem, present tense if it's
an ongoing architectural role. No jargon. No bullets here — this is the hook.>

## Overview

<One tight paragraph: what it is, what it does, its boundary. Think "elevator pitch to an
engineer". What goes in, what comes out, what it doesn't do. This is the narrowest possible
accurate description.>

## How It Works

<Short paragraph framing the architecture — data flow? component ownership? event lifecycle?
Pick the lens that fits. Then the Mermaid diagram. Then prose unpacking the diagram, using
bullets to list components or steps if there are more than two or three. Sub-sections (###)
only if the system has meaningfully distinct subsystems.>

```mermaid
<diagram>
```

<Prose after the diagram. Walk the reader through it. This is where bullets work well —
one bullet per component or step, one sentence each, focused on what it does not how.>

## See Also

- [Related Page Title](link)
- [Another Related Concept](link)
```

## What You Must Do When Invoked

### Step 1 — Identify the Topic

In order:
1. Explicit args (topic string or file paths) → use directly.
2. Recent plan artifact → check `.claude-artifacts/plan.html` for context.
3. Recent beads work → `bd list --status=in_progress` and `bd list --status=closed --limit=5`.
4. Git state → `git diff --name-only HEAD` and `git log --oneline -5` to see what just changed.
5. If still unclear, ask: "What system should I write a wiki page for?"

### Step 2 — Gather Context

Read enough to understand the system at the level of a whiteboard diagram — not the level of
a code review. This usually means:

- If file args: read the files and map the components. Focus on names, types, and how they
  connect — not implementation logic.
- If topic only: grep for relevant modules/directories, read READMEs, skim entry points.
  Stop reading when you can draw the diagram without guessing.
- Check for an existing wiki page: `find . -name "*.md" | xargs grep -l "<topic>" 2>/dev/null`
  to avoid duplicating something that already exists.

Do NOT read deeply into implementation files looking for algorithm details. You don't need
them and they'll pollute the output.

### Step 3 — Draft the Diagram First

Draw the Mermaid diagram before writing any prose. The diagram is the skeleton — if you
can't draw it, you don't understand the system well enough yet. Go back to Step 2.

Pick the diagram type:
- **Data flows through components** → `flowchart LR`
- **Things happen in sequence, triggered by events** → `sequenceDiagram`
- **Components with ownership relationships** → `flowchart TD`
- **State machine behavior** → `stateDiagram-v2`

Keep it clean. Five to ten nodes. If you have more, you're either at the wrong altitude or
the system needs sub-pages.

### Step 4 — Write the Page

Follow the structure above. After drafting, do a pass against the principles:

- [ ] Does the opening paragraph explain *why* this exists, not just *what* it is?
- [ ] Is there at least one Mermaid diagram?
- [ ] Are there any code blocks? If yes, is there truly no other way?
- [ ] Are there any implementation details (how it works internally)?
- [ ] Does it sound like a whiteboard explanation or like documentation?
- [ ] Is it between 400–1000 words of prose?
- [ ] Are all cross-references collected in "See Also" at the bottom?

### Step 5 — Output

Write the file to `.claude-artifacts/wiki-<kebab-case-topic>.md`.

Report back: the file path and a one-line summary of what the page covers. Don't summarize
the page content — the file is right there.
