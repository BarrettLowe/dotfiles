# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


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
