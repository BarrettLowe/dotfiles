# Subagent inspection and permissions

The subagent widget runs each child in Pi's RPC mode. Tasks, model selection,
personalities, session files, and `/subcont` work as before.

## Inspect a child

Press **Alt+Down** to open the subagent picker. If only 1 subagent exists, it opens
directly. `/subview` opens the same picker; `/subview 2` opens agent #2 directly.

The viewer is read-only. It shows earlier turns and streams assistant text,
exposed thinking, tool calls, and tool output.

| Key | Action |
| --- | --- |
| Up / Down, Enter | Choose an agent in the picker |
| Left / Right | Switch agents in the viewer |
| Up / Down, Page Up / Page Down | Scroll the transcript |
| Home | Scroll to the beginning |
| End | Follow live output |
| Ctrl+T | Show or hide thinking |
| Ctrl+O | Expand or collapse tool output |
| a | Review that agent's pending permission |
| Esc | Return to the primary session |

Closing the view does not stop a child, send a message, or deny a permission.
The primary editor draft and transcript stay in place beneath the view.
If the primary session opens its own dialog, the subagent view closes so that
it cannot cover a permission prompt receiving keyboard input.

Thinking starts collapsed. The viewer can only show reasoning text the provider
exposes to Pi; it does not display encrypted reasoning or signatures.

## Review bash permissions

Unknown bash commands pause at the child's existing whitelist check. Its widget
shows that permission is pending; the primary session and other agents continue.

Press **Alt+A** or run `/subapprove` to review the oldest request.
`/subapprove 2` reviews agent #2's request. The dialog shows the agent, task,
working directory, full command, and the whitelist's existing approval choices.
Page Up / Page Down scroll long requests.

The dialog initially selects denial. Enter confirms the selected choice.
**Esc only closes the dialog and leaves the request queued.** If you opened it
from the viewer, another Esc returns to the primary session.

Only 1 request can be reviewed at a time. Allowing a request resumes the original
tool call; it does not retry the command or start another model turn.

- Allow-once applies to that pending whitelist question.
- Remember-for-session applies only to that child process, not sibling agents,
  the primary session, or a later `/subcont` run.
- Permanent approvals still update the profile's bash whitelist.
- Explicit deny rules still block without prompting.
- Parse failures offer only allow-once or denial.
- A parent without UI rejects requests rather than waiting for an unseen dialog.

Removing an agent, clearing agents, navigating the session tree, or ending the
primary session cancels pending requests. Old dialogs cannot approve a later run.
Completed history remains in child session files; live transcript data and
pending approvals are not copied into parent-state snapshots.
