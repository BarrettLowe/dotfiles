#!/usr/bin/env bash
# Syncs shared dotfiles AI config into each harness's expected directory,
# merging in machine-local overrides. Safe to run repeatedly. Converts
# directory symlinks to real dirs on first run.
#
# Shared source:       ~/dotfiles/ai/{skills,agents,rules,commands}/
# Machine-local:       ~/.local/ai/{skills,agents,rules,commands}/
# Machine-local CLAUDE.md append: ~/CLAUDE_MORE.md
# Machine-local pi AGENTS.md append: ~/AGENTS_MORE.md
#
# Skill allow-lists (one name per line, blank/#-comment lines ignored):
#   ~/dotfiles/ai/claude/skills_list.txt -> which skills get linked into Claude Code
#   ~/dotfiles/ai/pi/skills_list.txt     -> which skills get linked into pi agent
#
# pi agent's own config (not shared with Claude): ~/dotfiles/pi/{settings.json,
# keybindings.json,agents,themes,extensions,prompts}. extensions/node_modules is
# gitignored and reinstalled with npm on first sync.
#
# Harnesses synced:
#   Claude Code -> ~/.claude/{skills,agents,rules,commands,CLAUDE.md}
#   pi agent    -> ~/.pi/agent/{AGENTS.md,skills,settings.json,keybindings.json,agents,themes,extensions,prompts}

DOTFILES_AI="${DOTFILES_AI:-$HOME/dotfiles/ai}"
LOCAL_AI="$HOME/.local/ai"

# is_allowed <name> <allow_list_file>
# Returns success if allow_list_file is empty/unset (no filtering) or
# contains <name> as a line (ignoring blank lines and #-comments).
is_allowed() {
    local name="$1" allow_list_file="$2"
    [[ -z "$allow_list_file" ]] && return 0
    [[ ! -f "$allow_list_file" ]] && return 0
    grep -qxF "$name" <(grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$allow_list_file")
}

# sync_dir <type> <target_dir> [allow_list_file]
# Populates target_dir with symlinks to <type>'s items from the shared
# dotfiles dir plus machine-local overrides (local wins on name clash),
# then prunes symlinks whose source no longer exists. If allow_list_file
# is given, only items whose basename is listed in it are linked.
sync_dir() {
    local type="$1" target_dir="$2" allow_list_file="$3"
    [[ -L "$target_dir" ]] && rm "$target_dir"
    mkdir -p "$target_dir"

    if [[ -d "$DOTFILES_AI/$type" ]]; then
        for item in "$DOTFILES_AI/$type"/*; do
            [[ -e "$item" ]] || continue
            is_allowed "$(basename "$item")" "$allow_list_file" || continue
            ln -sfn "$item" "$target_dir/$(basename "$item")"
        done
    fi

    if [[ -d "$LOCAL_AI/$type" ]]; then
        for item in "$LOCAL_AI/$type"/*; do
            [[ -e "$item" ]] || continue
            is_allowed "$(basename "$item")" "$allow_list_file" || continue
            ln -sfn "$item" "$target_dir/$(basename "$item")"
        done
    fi

    find "$target_dir" -maxdepth 1 -type l -exec test ! -e {} \; -delete
}

## --- Claude Code ---
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

# CLAUDE.md: shared base + optional machine-local append
[[ -L "$CLAUDE_DIR/CLAUDE.md" ]] && rm "$CLAUDE_DIR/CLAUDE.md"
if [[ -f "$HOME/CLAUDE_MORE.md" ]]; then
    cat "$DOTFILES_AI/CLAUDE_.md" "$HOME/CLAUDE_MORE.md" > "$CLAUDE_DIR/CLAUDE.md"
else
    cp "$DOTFILES_AI/CLAUDE_.md" "$CLAUDE_DIR/CLAUDE.md"
fi

sync_dir "skills" "$CLAUDE_DIR/skills" "$DOTFILES_AI/claude/skills_list.txt"
for type in agents rules commands; do
    sync_dir "$type" "$CLAUDE_DIR/$type"
done

## --- pi agent ---
PI_AGENT_DIR="$HOME/.pi/agent"
DOTFILES_PI="${DOTFILES_PI:-$HOME/dotfiles/pi}"

sync_dir "skills" "$PI_AGENT_DIR/skills" "$DOTFILES_AI/pi/skills_list.txt"

# AGENTS.md: pi's equivalent of Claude's CLAUDE.md (global instructions, loaded
# every session). Shared base + optional machine-local append.
[[ -L "$PI_AGENT_DIR/AGENTS.md" ]] && rm "$PI_AGENT_DIR/AGENTS.md"
if [[ -f "$HOME/AGENTS_MORE.md" ]]; then
    cat "$DOTFILES_AI/AGENTS.md" "$HOME/AGENTS_MORE.md" > "$PI_AGENT_DIR/AGENTS.md"
else
    cp "$DOTFILES_AI/AGENTS.md" "$PI_AGENT_DIR/AGENTS.md"
fi

# Config files: settings + keybindings (single machine-wide source, no local override)
ln -sfn "$DOTFILES_PI/settings.json" "$PI_AGENT_DIR/settings.json"
ln -sfn "$DOTFILES_PI/keybindings.json" "$PI_AGENT_DIR/keybindings.json"

# Whole-directory symlinks: agents (subagent personas), themes, extensions, prompts
for dir in agents themes extensions prompts; do
    [[ -e "$PI_AGENT_DIR/$dir" && ! -L "$PI_AGENT_DIR/$dir" ]] && rm -rf "$PI_AGENT_DIR/$dir"
    ln -sfn "$DOTFILES_PI/$dir" "$PI_AGENT_DIR/$dir"
done

# Extension deps aren't committed (see pi/extensions/.gitignore); install on first sync
if [[ -f "$DOTFILES_PI/extensions/package.json" && ! -d "$DOTFILES_PI/extensions/node_modules" ]]; then
    (cd "$DOTFILES_PI/extensions" && npm install --silent)
fi
