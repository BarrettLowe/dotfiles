# Pi profiles

`ai/sync.sh` assembles Pi directories from this repo and machine-local sources. It no longer syncs Claude configuration.

## Enable profiles on a machine

Create `~/.local/ai/profiles.conf`:

```bash
PROFILES=(home work)
DEFAULT_PROFILE=home
```

This is an untracked, trusted shell file (read by Bash sync and zsh). It declares profiles and the default; it should not contain credentials. Names may contain letters, digits, `_`, and `-`, and must start with a letter or digit.

Run:

```bash
bash ~/dotfiles/ai/sync.sh
source ~/.zshrc
pi-home
pi-work
```

Machine-specific shortcuts belong in `~/.zshrc_local`:

```zsh
pi-home() { PI_CODING_AGENT_DIR="$HOME/.pi/profiles/home" command pi "$@"; }
pi-work() { PI_CODING_AGENT_DIR="$HOME/.pi/profiles/work" command pi "$@"; }
```

Shared `.zshrc` contains no named profile shortcuts. Plain `pi` uses the default profile, or keeps the active profile when called from a profile's shell environment. Each launch sets `PI_CODING_AGENT_DIR` for that process. Both profiles can run at once.

Outside zsh, use:

```bash
PI_CODING_AGENT_DIR="$HOME/.pi/profiles/work" pi
```

Sync 1 profile with `bash ~/dotfiles/ai/sync.sh --profile work`.

## Sources and destinations

```text
~/dotfiles/
  ai/AGENTS_.md                  shared instructions
  ai/skills/                     shared skills
  pi/agents/                     shared Pi agents
  pi/extensions/                 shared extension code
  pi/settings.json               initial shared settings
  ai/profiles/work/               tracked work-only additions and overrides

~/.local/ai/
  profiles.conf                  this machine's enabled profiles
  skills/, agents/, extensions/  additions shared by this machine's profiles
  AGENTS_MORE.md                 optional shared machine notes
  settings.json                  optional shared machine settings
  profiles/home/
    AGENTS_MORE.md               home memory
    settings.json               home setting overrides
    models.json                 home endpoints and models
  profiles/work/
    AGENTS_MORE.md               work memory
    skills/, agents/, extensions/  work-only additions
    hook/hooks.yaml             work hooks
    settings.json               work setting overrides

~/.pi/profiles/home/              assembled home Pi directory
~/.pi/profiles/work/              assembled work Pi directory
```

For resources, later sources win when names match:

```text
shared repo → shared machine → repo profile → local profile
```

Profiles also support `themes/`, `prompts/`, `keybindings.json`, and `mcp.json`. Sync links resources and configuration files, but preserves real files already present in a destination. Keep profile-specific tools under the profile source, not the shared machine source.

`skills_list.txt`, `agents_list.txt`, `extensions_list.txt`, `themes_list.txt`, and `prompts_list.txt` select resources by filename or directory name, 1 per line. Blank lines and `#` comments are ignored. The most specific list replaces earlier lists; it is not additive. An empty list enables nothing. Without a list, sync includes all resources. Skills default to `ai/pi/skills_list.txt`.

The tracked work skill list includes `gitlab-ticket`. Its machine-local implementation belongs in `~/.local/ai/profiles/work/skills/gitlab-ticket/`, so other profiles do not load it.

## Instructions and memory

Sync generates each `AGENTS.md` from shared instructions, optional shared machine notes, optional repo profile notes, and that profile's `AGENTS_MORE.md`. It adds the exact memory source and sync command to the generated instructions.

Edit `~/.local/ai/profiles/<name>/AGENTS_MORE.md`, not the generated destination.

## Settings, credentials, and history

Sync seeds a new profile's writable `settings.json` from `pi/settings.json`. It then merges explicit machine and profile overrides on every sync. Objects merge; arrays replace. Other changes made through Pi's `/settings` survive sync. Subsequent shared-default changes do not replace existing settings; put settings you want enforced in an override file. Removing an override does not erase its previous value from the destination.

Authentication, sessions, package caches, and project trust belong directly in the Pi destination. Sync does not copy or overwrite them. Run `/login` separately inside each profile.

The zsh functions only set `PI_CODING_AGENT_DIR` for the Pi process. They do not change other environment variables or source profile environment files. If you later use exported API keys or session-directory overrides, those still apply to both profiles.

Profiles separate configuration, not access to files. Both still run as the same OS user. Project-local `.pi` files and parent-directory instruction files apply independently of these profiles.

## Single-profile machines

A named profile always uses `~/.pi/profiles/<name>/`, even if it is the only enabled profile:

```bash
PROFILES=(home)
DEFAULT_PROFILE=home
```

If `profiles.conf` is absent, sync uses `~/.pi/agent/` and the legacy `~/AGENTS_MORE.md`; plain `pi` remains the original command. Existing credentials and sessions stay where they are; enabling profiles does not migrate them.

