---
name: ticket
description: Write tickets into a markdown task backlog file in Barrett's house style (Context / Scope in-out / Acceptance Criteria / Notes, sized 0.5–3 days of junior work). Use ONLY when editing or creating a markdown tasks backlog (e.g. tasks.md, todo.md, backlog.md). Do NOT use for GitLab issues, PR descriptions, or commit messages — those have their own format.
---

# Markdown Task Writer

Write tickets into a markdown task backlog in Barrett's house style. This skill is for **markdown files only** — not for GitLab issues, not for commit messages, not for PR descriptions. If the target is a GitLab issue, stop and tell the user this skill doesn't apply.

## When to invoke

- The target file is markdown.
- The user is adding, reshaping, or promoting items in a task backlog.
- The intent is "make this ready to hand to a junior" — not an off-the-cuff todo list.

If the file exists, read it first and match its existing conventions (priority buckets, index format, status legend). Don't impose a style on a file that already has one.

## Ticket shape

Every ticket has exactly these sections, in this order:

```markdown
### T-NN — Short title

**Context.** Why this exists. What it unblocks. Link back to the design doc or parent decision — don't recapitulate it.

**Scope (in).**
- Concrete work that counts as done.

**Scope (out).**
- Adjacent work this ticket does NOT cover.

**Acceptance Criteria.**
- [ ] Verifiable condition 1.
- [ ] Verifiable condition 2.

**Notes.** Non-obvious gotchas, dependencies on other tickets, decisions deferred to implementation time.
```

## Sizing

- Target: **0.5 to 3 days of junior work.** If it's bigger, split it. If smaller than 0.5 day, roll it into a sibling.
- A ticket shorter than the full template probably isn't ready. Flag that rather than padding.

## Index and priority

If the file has an index with priority buckets (P0/P1/P2) or owner tracks, add the new ticket to the correct bucket with an anchor link. Update the index in place — don't rebuild it.

## Rules

- No effort estimates in hours. "0.5–3 days" is the granularity, full stop.
- No author attribution, no dates, no status field unless the file already uses them — then match.
- Don't re-number existing tickets. Use the next free T-NN.
- Don't invent acceptance criteria you can't actually check. If a criterion needs human judgment, say so.
- Never copy a design doc into the ticket body. Link to the section.
- If the user asks for a ticket and the underlying decision isn't made yet, say so and don't write a ticket for a moving target.
