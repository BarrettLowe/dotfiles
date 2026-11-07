---
name: session-review
description: Review Pi sessions from the past week or a specified window. Find recurring habits, overlooked patterns, successful approaches, corrections, and failures; produce an evidence-backed local HTML report with accuracy and prompt-efficiency suggestions.
disable-model-invocation: true
---

Perform an inspection over the pi sessions from the past week. Analyze my requests/prompts, where I asked for more information, corrections I made to the agent, where things went wrong etc. Anything that seems to be consistent themes or motifs across sessions.

Make an html report that shows something like this:

---
## What has been working well
This week you've been following patterns like...
Examples...
This has allowed the agents to...

## Corrections (where things went wrong)
...

## Accuracy suggestions
Here are some things you may change/add/remove to increase output
...

## Prompt efficiency suggestions
You are often asking the agents for X, Y, Z. You can increase your prompt efficiency (type less)
by...
...

---
This is not a rigid design/format. Change as necessary to effectively communicate and demonstrate your findings.

In the suggestions, consider all pi features including skills, agents, prompts, etc.
Consider that pi is highly extensible and can utilize custom extensions.

Do not suggest a new skill, feature, extension etc just to use it - it MUST add value based on what you discover from the sessions.
