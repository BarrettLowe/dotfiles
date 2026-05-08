# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

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


## Build & Test

_Add your build and test commands here_

```bash
# Example:
# npm install
# npm test
```

## Architecture Overview

_Add a brief overview of your project architecture_

## Conventions & Patterns

### Claude Config Changes

After editing any of the following files, run `bash ~/dotfiles/claude/sync.sh`:

- `~/dotfiles/claude/CLAUDE_.md`
- `~/dotfiles/claude/skills/**`
- `~/dotfiles/claude/agents/**`
- `~/dotfiles/claude/rules/**`
- `~/dotfiles/claude/commands/**`
- `~/.local/claude/**`
- `~/CLAUDE_MORE.md`

This rebuilds `~/.claude/` from the shared dotfiles and any machine-local overrides. Neovim does this automatically on save; Claude must do it manually after edits.

### Agent/Skill Routing Maintenance

When a skill is converted to an agent (or a new agent is created):
1. Add it to the **Agents** table in `claude/CLAUDE_.md`
2. Remove it from the **Skills** table in `claude/CLAUDE_.md` if it was there
3. Update the "When multiple could apply" section if any routing logic changes

Skills live in `~/.claude/skills/<name>/SKILL.md`. Agents live in `~/.claude/agents/<name>.md`. Keep `claude/CLAUDE_.md` in sync with what's actually on disk — stale routing causes the wrong tool to get invoked.
