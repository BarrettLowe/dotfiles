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
├── ai/                   # Shared AI harness configuration (Claude Code + pi agent)
│   ├── CLAUDE_.md        # Source of truth for ~/.claude/CLAUDE.md content
│   ├── skills/           # Custom slash-command skills (one dir per skill with SKILL.md)
│   ├── agents/           # Custom agent definitions (one .md per agent)
│   ├── rules/            # Path-matched auto-rules (C++, Python style conventions)
│   ├── commands/         # Custom slash commands
│   ├── settings.json     # Claude Code settings (permissions, hooks)
│   ├── blocked-dirs.txt  # Hard-blocked paths for the PreToolUse hook
│   ├── sync.sh           # Syncs ai/ (+ ~/.local/ai/ overrides) into each harness's config dir
│   └── AGENTS.md         # Headless agent context (pre-existing, separate from CLAUDE_.md)
└── bin/                  # Utility scripts: devpod-attach, devpod-claude, devpod-workspace-dir
```

`ai/CLAUDE_.md` is the source of truth for global Claude settings — edit it, not `~/.claude/CLAUDE.md` directly, to keep changes tracked in git.

## Conventions & Patterns

### AI Harness Config Changes

After editing any of the following files, run `bash ~/dotfiles/ai/sync.sh`:

- `~/dotfiles/ai/CLAUDE_.md`
- `~/dotfiles/ai/skills/**`
- `~/dotfiles/ai/agents/**`
- `~/dotfiles/ai/rules/**`
- `~/dotfiles/ai/commands/**`
- `~/.local/ai/**`
- `~/CLAUDE_MORE.md`

This rebuilds `~/.claude/` and `~/.pi/agent/skills` from the shared dotfiles plus any machine-local overrides (`~/.local/ai/`). Only `skills/` is synced to pi agent — agents/rules/commands are Claude Code-specific for now. Neovim does this automatically on save; Claude must do it manually after edits.

### Agent/Skill Routing Maintenance

When a skill is converted to an agent (or a new agent is created):
1. Add it to the **Agents** table in `ai/CLAUDE_.md`
2. Remove it from the **Skills** table in `ai/CLAUDE_.md` if it was there
3. Update the "When multiple could apply" section if any routing logic changes

Skills live in `~/.claude/skills/<name>/SKILL.md`. Agents live in `~/.claude/agents/<name>.md`. Keep `ai/CLAUDE_.md` in sync with what's actually on disk — stale routing causes the wrong tool to get invoked.
