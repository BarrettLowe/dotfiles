#!/usr/bin/env bash
# Syncs shared dotfiles Claude config with machine-local overrides.
# Safe to run repeatedly. Converts directory symlinks to real dirs on first run.
#
# Shared source:       ~/dotfiles/claude/{skills,agents,rules,commands}/
# Machine-local:       ~/.local/claude/{skills,agents,rules,commands}/
# Machine-local CLAUDE.md append: ~/CLAUDE_MORE.md

DOTFILES_CLAUDE="${DOTFILES_CLAUDE:-$HOME/dotfiles/claude}"
LOCAL_CLAUDE="$HOME/.local/claude"
CLAUDE_DIR="$HOME/.claude"

mkdir -p "$CLAUDE_DIR"

# CLAUDE.md: shared base + optional machine-local append
[[ -L "$CLAUDE_DIR/CLAUDE.md" ]] && rm "$CLAUDE_DIR/CLAUDE.md"
if [[ -f "$HOME/CLAUDE_MORE.md" ]]; then
    cat "$DOTFILES_CLAUDE/CLAUDE_.md" "$HOME/CLAUDE_MORE.md" > "$CLAUDE_DIR/CLAUDE.md"
else
    cp "$DOTFILES_CLAUDE/CLAUDE_.md" "$CLAUDE_DIR/CLAUDE.md"
fi

# skills / agents / rules / commands: real dirs with per-item symlinks
for type in skills agents rules commands; do
    target_dir="$CLAUDE_DIR/$type"
    [[ -L "$target_dir" ]] && rm "$target_dir"
    mkdir -p "$target_dir"

    # Shared items from dotfiles
    if [[ -d "$DOTFILES_CLAUDE/$type" ]]; then
        for item in "$DOTFILES_CLAUDE/$type"/*; do
            [[ -e "$item" ]] && ln -sfn "$item" "$target_dir/$(basename "$item")"
        done
    fi

    # Machine-local items (overrides shared if same name)
    if [[ -d "$LOCAL_CLAUDE/$type" ]]; then
        for item in "$LOCAL_CLAUDE/$type"/*; do
            [[ -e "$item" ]] && ln -sfn "$item" "$target_dir/$(basename "$item")"
        done
    fi

    # Prune broken symlinks (sources that were deleted from dotfiles/local)
    find "$target_dir" -maxdepth 1 -type l -exec test ! -e {} \; -delete
done
