---
name: devcontainer-init
description: Generate a .devcontainer.json for an OKSI project by reading docker/dev.sh and docker/build_images.sh. Use when checking out a new project that needs a devcontainer.
tools: ["Read", "Write", "Bash", "Glob", "Grep"]
model: sonnet
---

# Devcontainer Init

Generate a `.devcontainer.json` for the current project. The user uses devcontainers/devpod — the team does not, so this file is personal and lives only on the user's machine.

## Step 1: Gather facts

Run these in parallel:

```bash
basename "$(pwd)"          # project name
cat docker/build_images.sh # image name construction
cat docker/dev.sh          # mounts, env vars, container config
```

## Step 2: Derive devcontainer fields

**Project name** — `basename $(pwd)`.

**Image** — from `build_images.sh`, find `DOCKER_REGISTRY` and `ARCH` lines. Translate shell vars to devcontainer `localEnv` syntax:
- `$GITLAB_URL` → `${localEnv:GITLAB_URL}`
- `$USER` → `${localEnv:USER}`
- `$REPO_FOLDERNAME` → the literal project name (already known)
- Append `:$ARCH` value (usually `amd64`)

Example: `DOCKER_REGISTRY=$GITLAB_URL/common-tools/navigation/nav-ta-$USER` + `ARCH=amd64`
→ `"image": "${localEnv:GITLAB_URL}/common-tools/navigation/nav-ta-${localEnv:USER}:amd64"`

**Prefer `image` over `build`** — the image is already built by `build_images.sh`, so use `image` not `build`.

**Workspace mount + folder** — from `dev.sh`, find the `-v $(pwd):/some-path` line. That `/some-path` is the `workspaceFolder` and the target of `workspaceMount`. Do NOT add this to `mounts` — use `workspaceMount` + `workspaceFolder` instead.

**runArgs** — extract `--privileged`, `--net=host` (translate to `"--network", "host"`). Do not include `-v`, `-e`, `--name`, `-it`, `--rm` — those are handled elsewhere or not needed in devcontainer.

**Extra mounts** — all remaining `-v` lines from `dev.sh` (excluding the workspace mount):
- `$(pwd)/../data:/data` → `source=${localWorkspaceFolder}/../data,target=/data,type=bind,consistency=cached`
- `/oksi:/oksi` → `source=/oksi,target=/oksi,type=bind,consistency=cached`
- Relative source paths use `${localWorkspaceFolder}`, absolute paths are kept literal.

**Always add these personal mounts** (the user's dotfiles — not in dev.sh but always needed):
```
source=${localEnv:HOME}/.config/git,target=/home/${localEnv:USER}/.config/git,type=bind,consistency=cached
source=${localEnv:HOME}/.gnupg,target=/home/${localEnv:USER}/.gnupg,type=bind,consistency=cached
source=${localEnv:HOME}/.claude,target=/home/${localEnv:USER}/.claude,type=bind
source=${localEnv:HOME}/.claude.json,target=/home/${localEnv:USER}/.claude.json,type=bind
```

**containerEnv** — derive from the `-e` flags in `dev.sh` only. Translate each to `${localEnv:VAR}` syntax. Do NOT include vars that aren't in `dev.sh` — different projects pass different sets.

Then always append these two personal entries regardless of what's in `dev.sh`:
```json
"CLAUDE_CONFIG_DIR": "/home/${localEnv:USER}/.claude",
"CLAUDE_CODE_OAUTH_TOKEN": "${localEnv:CLAUDE_CODE_OAUTH_TOKEN}"
```

Do NOT hardcode runtime-computed values — even if `dev.sh` uses `$(git rev-parse HEAD)`, emit `${localEnv:GIT_COMMIT}`. If `dev.sh` hardcodes a literal (e.g., `SERIAL_NUMBER="123"`), still use `${localEnv:SERIAL_NUMBER}`.

**remoteUser** — always `"${localEnv:USER}"`.

**features** — always include the common-utils feature for zsh + oh-my-zsh:
```json
"ghcr.io/devcontainers/features/common-utils:2": {
    "installZsh": true,
    "configureZshAsDefaultShell": true,
    "installOhMyZsh": true,
    "username": "${localEnv:USER}"
}
```

**customizations** — always include:
```json
"vscode": {
    "extensions": ["ms-vscode.cpptools", "ms-azuretools.vscode-docker"]
}
```

## Step 3: Write the file

Write to `.devcontainer.json` in the project root. The output must be **valid JSON** — no comments, no trailing commas. Double-check for these common template artifacts before writing:
- No comment lines (lines starting with `//` or `PREFER...`, `HANDLE...`)
- No trailing commas before `}` or `]`
- All strings properly quoted

## Step 4: Verify

```bash
python3 -m json.tool .devcontainer.json > /dev/null && echo "valid JSON"
```

If that fails, fix the JSON before reporting done.

## Report

```
Created .devcontainer.json for <project>
  image:            <image>
  workspaceFolder:  <path>
  extra mounts:     <count> project-specific + 4 personal dotfile mounts
```
