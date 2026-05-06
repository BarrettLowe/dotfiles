---
name: gitlab-ticket
description: Create a GitLab issue in the team-omega-tasks repo (program-families/armgdnfamily/team-omega-tasks). Use whenever Barrett asks to file, open, or create a GitLab ticket/issue, regardless of which project the conversation is about — every task he files goes to this single repo. Pulls the live issue template and labels (project + ancestor group) before writing, runs the description through the humanizer skill, then creates via the GitLab MCP server. Refuses to fall back to any other path if MCP is unavailable.
---

# GitLab Ticket Creator

Create an issue in `program-families/armgdnfamily/team-omega-tasks` on `gitlab.oksi.ai`. This is Barrett's central task repo — all tickets land here, no matter what project the conversation is about. Do not ask which repo; do not infer one from the cwd.

## Hard rules

- **Always use the GitLab MCP server.** Tools to use: `mcp__gitlab__get_file_contents`, `mcp__gitlab__list_labels`, `mcp__gitlab__create_issue`. If any of those calls fails or the server is unreachable, **stop and tell Barrett the server is down** — do not fall back to `gh`, `glab`, `curl`, the web UI, or anything else. Do not retry indefinitely; one clean failure → report → stop.
- **Always run the description body through the `humanizer` skill** before submitting. The title is fine as-is; only the description gets humanized.
- **Always include `Status::0 New`** as a label on creation. The repo's issue template enforces this for new tickets, and we are bypassing the template's quick action by sending the description directly, so the label must be set explicitly via the `labels` parameter.
- **Project ID** for every MCP call: `program-families/armgdnfamily/team-omega-tasks`.

## Procedure

### 1. Pull live context

Before writing anything, fetch the current template and label set in parallel — they change, and stale assumptions are how you mis-label tickets:

- `mcp__gitlab__get_file_contents` with `file_path: .gitlab/issue_templates/default.md` to see the current template structure.
- `mcp__gitlab__list_labels` with `include_ancestor_groups: true` to get project labels **and** inherited `armgdnfamily` group labels in one call.

If either call errors, stop and report. Do not proceed with cached knowledge of the labels — they shift.

### 2. Draft the description

Match whatever sections the template currently uses. As of the last check the template is just `## Description` plus a quick-action label, but **trust the live fetch, not this doc** — if the template has grown more sections, fill them in.

Keep the body tight:
- Lead with the actual problem or ask. No "this ticket exists to..." preamble.
- Concrete acceptance criteria where they're verifiable. Skip the section if you can't write real ones — a vague checklist is worse than none.
- Link to relevant files, commits, or design docs. Don't paste large code blocks; link to the line.
- No author attribution, no dates in the body, no "filed by Claude" markers.

### 3. Humanize the description

Invoke the `humanizer` skill on the drafted description body. Pass the body as the input; take the final humanized version (not the draft) as the description that gets posted. The title does not need humanizing.

### 4. Pick labels

From the labels returned by step 1, choose conservatively. The label scopes you'll typically see:

- **`Status::*`** (project) — always set `Status::0 New`. Don't pre-stage to Backlog/Ready; that's grooming, not filing.
- **`Priority::*`** (project) — only set if Barrett gave a clear signal ("urgent", "low priority", "P0", a deadline). Otherwise leave it for him to set during grooming.
- **`Discipline::*`** (group, from armgdnfamily) — set when the work is unambiguously in one bucket (e.g., FastAPI server work → `Discipline::Software`, shell scripts → `Discipline::Tools`, sim/synthetic data → `Discipline::Simulation`). When it straddles two, pick the one where the bulk of the work lives; don't double-label across disciplines unless the ticket genuinely covers both.
- **`Impact::*`** (group) — only set when scope and consequence are clearly understood. Most filed-during-conversation tickets won't qualify; leave it off.
- **`Blocked`** — only if Barrett explicitly says it's blocked, or the ticket body itself describes a hard external dependency.

When in doubt, omit the label rather than guess. A wrong label is harder to clean up than a missing one.

### 5. Confirm before creating

Show Barrett the title, the humanized description, and the chosen labels in a short preview. Wait for him to approve or edit. Only after approval, call `mcp__gitlab__create_issue`.

This step is not optional — issue creation is a shared-state, externally-visible action and a cheap confirmation prevents typos and mis-labels from going public.

### 6. Create

Call `mcp__gitlab__create_issue` with:
- `project_id`: `program-families/armgdnfamily/team-omega-tasks`
- `title`: the approved title
- `description`: the humanized, approved body
- `labels`: comma-separated list including `Status::0 New` plus any others approved

Report the resulting issue URL back. One line is enough.

## Things this skill does not do

- Does not file to any other GitLab project, even if the conversation is happening inside a different repo's working directory.
- Does not edit existing issues — use the appropriate MCP tools directly for that.
- Does not create the markdown-backlog style ticket from the `ticket` skill. That skill writes to local markdown files; this one writes to GitLab. They share nothing.
- Does not pick assignees, milestones, or iterations unless Barrett names them. Default is unassigned.
