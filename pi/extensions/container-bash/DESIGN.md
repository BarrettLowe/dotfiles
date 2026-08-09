# container-bash

One extra tool, `container_bash`, that runs a command inside a Docker container.
Everything else — `read`, `write`, `edit`, `grep`, `find`, `ls`, and plain `bash` —
stays on the host and is left completely untouched.

## Why this shape

The project directory is bind-mounted into the container at the **same absolute
path** it has on the host. That single decision does most of the work:

- File tools are already correct on both sides. `/home/me/proj/src/main.cpp` means
  the same file to the host and to the container, so there is nothing to route and
  no path translation layer to write or debug.
- The only thing that genuinely differs between host and container is *process
  execution* — compilers, test runners, interpreters, package managers.

So the extension only has to solve process execution, and the model is left with
exactly one decision, asked only when it is already reaching for a shell:
**is this a build/test/run command, or a git/file command?** That is a question a
small model can answer from the text of the command alone, without tracking any
session state.

Compare against the alternatives: a `/target` mode switch makes correctness depend
on hidden state the model can't see, and a `where: "host"|"container"` parameter
asks the same question on every single call and silently defaults when the model
forgets. Both fail in ways that are hard to notice. This one fails loudly — you
either ran in the container or you didn't, and the tool name is in the transcript.

## Architecture

```
pi (host)
├── read/write/edit/grep/find/ls ──► host FS ──┐
├── bash ─────────────────────────► host shell │  same paths,
└── container_bash ───────────────► docker exec┘  same bytes
                                        │
                                   container, -v $PROJECT:$PROJECT
```

`container_bash` is not a new tool implementation. It is pi's own bash tool with a
different name and a `spawnHook` that wraps the command:

```ts
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";

const def = createBashToolDefinition(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: dockerWrap(command, cwd),
    cwd,
    env,
  }),
});

pi.registerTool({
  ...def,
  name: "container_bash",
  label: "Container",
  description: CONTAINER_BASH_DESCRIPTION,
  promptSnippet: "container_bash - run build/test/run commands inside the dev container",
  promptGuidelines: [
    "Use container_bash for anything that compiles, tests, or runs project code.",
    "Use bash only for git, file inspection, and host tooling.",
  ],
});
```

Spreading the definition means the streaming output, truncation, timeout handling,
and the TUI renderer all come along for free. The extension owns roughly one
function, `dockerWrap`.

### dockerWrap and the quoting problem

Naive string interpolation into `docker exec ... bash -lc "$command"` breaks the
first time the model writes a command containing quotes. A quoted heredoc sidesteps
escaping entirely:

```ts
function dockerWrap(command: string, cwd: string): string {
  return [
    `docker exec -i --workdir ${shellQuote(cwd)}`,
    `--user "$(id -u):$(id -g)"`,
    ...FORWARD_ENV.map((k) => `-e ${k}`),
    `${shellQuote(containerName)} bash -s <<'PI_CMD_EOF'`,
    command,
    `PI_CMD_EOF`,
  ].join(" \\\n") + "\n";
}
```

The command text is passed through literally. The only failure mode is a command
containing a line that is exactly `PI_CMD_EOF`, which is not a real risk — and if
you want it to be zero risk, generate the delimiter with a random suffix.

`--user "$(id -u):$(id -g)"` is not optional. Without it the container writes
root-owned files into your bind mount and you spend an afternoon on `chown`.

`FORWARD_ENV` matters because the `env` a `spawnHook` returns applies to the *host*
`docker` process, not to the process inside the container. Anything the model needs
inside — `PI_SESSION_ID`, `TERM`, project-specific vars — must be forwarded with
explicit `-e` flags.

## Container selection

Resolution order, first hit wins:

1. `--container <name>` CLI flag (`pi.registerFlag`)
2. `PI_CONTAINER` environment variable
3. `.pi/container` file in the project root — one line, the container or compose service name
4. Not configured → do not register the tool at all

That last case is the important one. A tool that is always present but always
errors is worse than no tool for a small model; it will keep trying it. Register
`container_bash` only when a container is actually configured, so its presence in
the tool list is itself the signal that containerized execution is available.

At `session_start`, verify the container exists and is running
(`docker inspect -f '{{.State.Running}}'`). If it isn't, `ctx.ui.notify` a warning
rather than failing silently — and have the tool return a clear error telling the
model to stop and ask the user. **Never fall back to the host shell.** A silent
fallback means a build that "passed" against the wrong toolchain.

Also verify at startup that the project path is actually mounted at the same path
inside the container (`docker exec <c> test -d <cwd>`). If it isn't, the identical-path
assumption the whole design rests on is broken, and you want to know immediately
rather than at the first confusing `No such file or directory`.

## Wording the description

This is the part that determines whether the whole thing works with a small model,
and it deserves more care than the code. Be directive and concrete; small models
follow examples far better than they follow principles.

```
Run a shell command INSIDE the project's dev container. The project directory is
mounted at the same path as on the host, so paths are identical.

ALWAYS use this tool for: building (cmake, make, ninja), running tests, running
the project, and package managers (pip, npm, apt).

NEVER use this tool for: git, gh, glab, or inspecting files. Use `bash` for those.
```

The paired negative in the plain `bash` description is just as important — without
it the model has no reason to move off the tool it already knows:

> Run a shell command on the host. Do NOT use this to build, test, or run the
> project — use `container_bash` for that.

You can't edit the built-in bash description directly, but you can re-register
`bash` from `createBashToolDefinition` with an amended description, or append the
same rule via `promptGuidelines` on `container_bash`. Start with `promptGuidelines`
since it's one line.

## Known limitations

**Orphaned processes on abort.** Killing the host `docker exec` process does not
kill the process inside the container. An aborted or timed-out build keeps burning
CPU. Acceptable for v1; the fix is to move from `spawnHook` to a full
`BashOperations.exec` implementation that spawns `docker` with an argv array, tracks
the container-side PID, and runs a cleanup `docker exec ... kill` on abort. That's
the natural v2 and it drops in behind the same tool.

**No TTY.** `docker exec -i` without `-t` means no interactive programs. This is
correct for an agent, but commands that detect a TTY may change their output format.

**Cold containers.** This design assumes a long-lived warm container (same
assumption the `seeker-dev` skill already makes). Per-command `docker run --rm`
would work but adds startup latency to every call.

## Build order

1. `dockerWrap` + tool registration against a hardcoded container name. Verify a
   build command runs in the container and writes host-owned files.
2. Container resolution (flag / env / `.pi/container`) + conditional registration.
3. Startup preflight: running check, mount-path check, notify on failure.
4. Description and guideline tuning — run a real task with your smallest model and
   count how often it reaches for the wrong shell. This step is the actual work.
5. Optional: show the active container in the footer or status line.

Files: `~/.pi/agent/extensions/container-bash/index.ts` (global, hot-reloadable
with `/reload`).

## What success looks like

Run a normal task with your smallest model — "add a function and make sure the
tests pass" — and check the transcript. Every `cmake`/`ctest` should be
`container_bash`; every `git` should be `bash`. If the model mixes them up, the fix
is almost always description wording, not code.
