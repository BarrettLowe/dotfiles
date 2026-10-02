# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

The primary entry point is `setup.sh`, which creates symlinks and installs tools:

```bash
bash setup.sh        # symlinks dotfiles, installs Neovim + tools to ~/DevTools and /opt
```

Key symlinks it creates:
- `~/.zshrc` → `dotfiles/.zshrc`
- `~/.config/nvim` → `dotfiles/neovim/`
- `~/.tmux.conf` → `dotfiles/.tmux.conf`
- `~/.p10k.zsh` → `dotfiles/.p10k.zsh`

Machine-specific settings go in `~/.zshrc_local` (not tracked). Copy from `.zshrc_local_template`.

## Architecture

```
dotfiles/
├── setup.sh              # Symlink creator + tool installer (artifacts → ~/.build, tools → ~/DevTools)
├── .zshrc                # Portable zsh config; sources ~/.zshrc_local for machine-specific settings
├── neovim/               # Neovim config → ~/.config/nvim
│   ├── init.lua          # Bootstraps lazy.nvim, sets leader key (,)
│   └── lua/
│       ├── config/       # Core config: settings, keymaps, lsp, dap, autocmds
│       └── plugins/      # One file per plugin (lazy.nvim spec)
├── ai/                   # Pi instructions/skills/profile sources; legacy Claude config retained
│   ├── CLAUDE_.md        # Source of truth for ~/.claude/CLAUDE.md content
│   ├── skills/           # Custom slash-command skills (one dir per skill with SKILL.md)
│   ├── agents/           # Custom agent definitions (one .md per agent)
│   ├── rules/            # Path-matched auto-rules (C++, Python style conventions)
│   ├── commands/         # Custom slash commands
│   ├── settings.json     # Claude Code settings (permissions, hooks)
│   ├── blocked-dirs.txt  # Hard-blocked paths for the PreToolUse hook
│   ├── sync.sh           # Assembles Pi profiles from dotfiles + ~/.local/ai/
│   └── AGENTS.md         # Headless agent context (pre-existing, separate from CLAUDE_.md)
└── bin/                  # Utility scripts: devpod-attach, devpod-claude, devpod-workspace-dir
```

Pi profile layout and launch commands are documented in `ai/PROFILES.md`. Claude files remain in the repo, but `ai/sync.sh` no longer manages Claude configuration.

## Conventions & Patterns

### AI Harness Config Changes

After editing any of the following files, run `bash ~/dotfiles/ai/sync.sh`:

- `~/dotfiles/ai/AGENTS_.md`
- `~/dotfiles/ai/skills/**`
- `~/dotfiles/ai/profiles/**`
- `~/dotfiles/pi/**`
- `~/.local/ai/**`
- `~/AGENTS_MORE.md` (legacy single-profile memory)

This assembles each enabled `~/.pi/profiles/<name>/` directory, or `~/.pi/agent/` without a profiles file. Profile memory sources are `~/.local/ai/profiles/<name>/AGENTS_MORE.md`. Sync preserves authentication and session history. Neovim runs sync automatically on save; agents must run it after edits.

### Agent/Skill Maintenance

Shared Pi agents live in `pi/agents/`; shared skills live in `ai/skills/`. Profile-only resources belong in `ai/profiles/<name>/` or `~/.local/ai/profiles/<name>/`. Update the relevant allow-list when adding or removing a resource. Do not edit generated profile instructions directly.
