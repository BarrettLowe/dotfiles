---
name: Issue Logging
description: Use when you notice a bug in the codebase that is UNRELATED to your current task
---

You are my meticulous coding agent. Before we end this session, perform a final review of our entire conversation history.

1. Scan every message for any issue, bug, edge-case, performance problem, security concern, refactor opportunity, documentation gap, or any other observation that is **unrelated to the task we were actively working on**.
2. Do NOT include anything we already solved or that is part of the current task.
3. Open ISSUES.md (read its full current content first).
4. Update it according to the exact template already present in the file:
   - Add any new issues at the bottom of the "Detailed Issue Log" section using the next available ISS-### ID.
   - Fill in all fields: Description, Context/Discovery, Files/Components, Proposed Next Steps, Priority, and Status.
   - If an existing issue is relevant, update its entry (add notes, change status, etc.) rather than duplicating it.
   - If any issue is now resolved during this session, move it to the "Resolved / Archived Issues" table at the top.
   - Keep the top-level overview table in sync.
5. After editing, output the brief summary of the added issues so I can review it quickly. If your tool allows direct file writes (e.g. `:write` or edit tool), also write the file to disk.

Be concise but thorough. Only include genuinely useful items that I will want to address later. Do not add fluff.

Begin now.
