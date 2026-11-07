# Agent Team Observatory prototype

This prototype adds durable JSONL traces and a local web dashboard to the manual
`agent-team.ts` extension. It uses only Node.js built-ins.

## Try it

Start Pi with the team extension as usual from the project you want to observe:

```sh
pi -e ~/dotfiles/pi/manual-extensions/agent-team.ts
```

In a second terminal, point the observer at that same project:

```sh
node ~/dotfiles/pi/manual-extensions/agent-team-observer.mjs --project "$PWD"
```

Then open <http://127.0.0.1:7331>. Use `--port PORT` if 7331 is occupied.
The dashboard refreshes once per second and binds only to localhost.

Each dispatcher session creates one trace file and one correlated subagent
session directory using the same trace session ID:

```text
.pi/agent-traces/<trace-session-id>.jsonl
.pi/agent-sessions/<trace-session-id>/<agent>.jsonl
```

Old subagent sessions are retained. Repeated dispatches to the same agent during
one dispatcher session continue that agent's JSONL file.

Set `AGENT_TEAM_TRACE=0` when launching Pi to disable trace capture.

## Captured events

- Dispatcher and specialist dispatch start/end/error, including task, model, tools, thinking level, and duration
- Explicit `assistant_stream` and `assistant_final` output events
- Tool start/end, arguments, result, and error status
- Model usage and observed cost reported by Pi
- Child-process stderr
- Plan presentation and explicit approval request/grant/denial transitions

Dispatcher runs appear as `dispatcher` with a `lead` marker. Their timelines
show the dispatcher's own streamed response and calls to `dispatch_agent`; the
corresponding specialist run is recorded separately with a parent-run link in
the JSONL payload. Implementation approval starts in `planning`; after the
plan is shown, the dispatcher marks it `awaiting approval`. The user runs
`/agents-approve` or `/agents-deny`, and those decisions are recorded in the
trace. `software-engineer` cannot be dispatched until approval is granted.

Potentially sensitive keys such as API keys, authorization headers, passwords,
cookies, secrets, and tokens are redacted. Long strings and collections are
bounded. Tool arguments and results can still contain project source or other
sensitive content, so traces should remain local and should not be committed.

Add this to a project's `.gitignore` if its `.pi` directory is otherwise tracked:

```gitignore
.pi/agent-traces/
```

## Prototype limits

- Live updates use one-second polling rather than SSE or WebSockets.
- The observer reads the newest 30 trace files and returns the newest 50 runs.
- Each run exposes its latest 250 events in the UI.
- Hidden model reasoning is not captured. Only output and metadata Pi emits are available.
- Trace retention and automatic cleanup are not implemented yet.

Those limits keep the experiment small. Feedback should focus on which timeline
details and comparisons are actually useful before adding storage or deployment complexity.
