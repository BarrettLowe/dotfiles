---
name: Issue Logging
description: Use when you notice a bug in the codebase that is UNRELATED to your current task
---

If you are not sure if this is a bug, spawn a subagent to do a short investigation. If the subagent confirms the bug and it still seems unrelated to the current task, continue and log the bug using a subagent.

Log the bug it in one of the following locations in order by preference (decending):

1. Beads (use `bd` if enabled in this repo)
2. Create a detailed task to fix the issue in ~/Documents/SecondBrain/tasks/
3. Create a markdown file in the project describing the issue - do NOT commit to source control

Since the bug is unrelated, the goal is to log it without growing the session context. Do not launch a full investigation - stay on topic.


## Steps to log:

0. Explain what was being done when this was discovered - helpful for humans to jog their memory when they circle back to this issue.
1. Explain the bug with examples from the code and determine severity of the bug.
2. Determine the bandaid fix (if any).
3. Determine the scope of a "correct" fix without fully plannig it out - if it requires additional research/context, skip this.

Begin now.
