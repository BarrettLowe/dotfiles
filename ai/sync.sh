#!/usr/bin/env bash
# Assemble Pi profiles from tracked sources and machine-local additions.
# No profiles.conf: preserve the legacy ~/.pi/agent destination.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_AI="${DOTFILES_AI:-$SCRIPT_DIR}"
DOTFILES_PI="${DOTFILES_PI:-$(dirname "$DOTFILES_AI")/pi}"
source "$SCRIPT_DIR/profiles.sh"

selected=""
if [[ $# -gt 0 ]]; then
    [[ $# -eq 2 && "$1" == --profile ]] || { echo 'Usage: sync.sh [--profile NAME]' >&2; exit 1; }
    selected="$2"
    require_profile "$selected" || exit 1
fi

# Missing list means no filtering; an empty list enables nothing.
is_allowed() {
    [[ ! -f "$2" ]] || grep -qxF "$1" <(grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$2")
}

# Only remove links owned by sync. Real files and unrelated links are preserved.
sync_resources() {
    local type="$1" target="$2" list="$3" source item link destination
    shift 3
    [[ ! -L "$target" ]] || rm "$target"
    mkdir -p "$target"
    for link in "$target"/*; do
        [[ -L "$link" ]] || continue
        source="$(readlink "$link")"
        case "$source" in
            "$DOTFILES_AI/"*|"$DOTFILES_PI/"*|"$LOCAL_AI/"*) rm "$link" ;;
        esac
    done
    for source in "$@"; do
        for item in "$source/$type"/*; do
            [[ -e "$item" ]] || continue
            is_allowed "$(basename "$item")" "$list" || continue
            destination="$target/$(basename "$item")"
            if [[ -e "$destination" && ! -L "$destination" ]]; then
                echo "Preserving unmanaged resource: $destination" >&2
                continue
            fi
            ln -sfn "$item" "$destination"
        done
    done
}

sync_profile() {
    local name="$1" target local_profile repo_profile memory type list source config
    local -a sources
    if [[ -n "$name" ]]; then
        target="$HOME/.pi/profiles/$name"
        local_profile="$LOCAL_AI/profiles/$name"
        repo_profile="$DOTFILES_AI/profiles/$name"
        memory="$local_profile/AGENTS_MORE.md"
    else
        target="$HOME/.pi/agent"
        local_profile="$LOCAL_AI"
        repo_profile="$DOTFILES_AI/profiles/default"
        memory="$HOME/AGENTS_MORE.md"
    fi
    mkdir -p "$target" "$local_profile"
    chmod 700 "$target"
    for type in skills agents extensions themes prompts hook; do
        sources=("$DOTFILES_PI" "$LOCAL_AI" "$repo_profile" "$local_profile")
        if [[ "$type" == skills ]]; then
            sources=("$DOTFILES_AI" "${sources[@]}")
        fi
        list=""
        [[ "$type" != skills ]] || list="$DOTFILES_AI/pi/skills_list.txt"
        for source in "$LOCAL_AI" "$repo_profile" "$local_profile"; do
            [[ ! -f "$source/${type}_list.txt" ]] || list="$source/${type}_list.txt"
        done
        sync_resources "$type" "$target/$type" "$list" "${sources[@]}"
    done

    # Generate instructions; the memory file itself remains a local source.
    [[ ! -L "$target/AGENTS.md" ]] || rm "$target/AGENTS.md"
    {
        cat "$DOTFILES_AI/AGENTS_.md"
        for source in "$LOCAL_AI" "$repo_profile"; do
            [[ "$source/AGENTS_MORE.md" == "$memory" || ! -f "$source/AGENTS_MORE.md" ]] || { printf '\n'; cat "$source/AGENTS_MORE.md"; }
        done
        if [[ -f "$memory" ]]; then printf '\n'; cat "$memory"; fi
        printf '\n## Profile memory location\n\n'
        printf 'Update `%s` for durable facts in this profile.\n' "$memory"
        if [[ -n "$name" ]]; then
            printf 'Then run `bash %s/sync.sh --profile %s`.\n' "$DOTFILES_AI" "$name"
        else
            printf 'Then run `bash %s/sync.sh`.\n' "$DOTFILES_AI"
        fi
        printf 'Do not edit `%s/AGENTS.md` directly; sync regenerates it.\n' "$target"
    } > "$target/AGENTS.md"

    # Seed writable settings once; explicit source overrides apply on every sync.
    if [[ -L "$target/settings.json" ]]; then
        cp -L "$target/settings.json" "$target/settings.json.tmp"
        rm "$target/settings.json"
        mv "$target/settings.json.tmp" "$target/settings.json"
    fi
    node "$SCRIPT_DIR/sync-settings.mjs" "$target/settings.json" "$DOTFILES_PI/settings.json" \
        "$LOCAL_AI/settings.json" "$repo_profile/settings.json" "$local_profile/settings.json"

    # Profile-local config wins. Auth, sessions, and trust are never managed here.
    for config in keybindings.json models.json mcp.json; do
        source=""
        for item in "$DOTFILES_PI" "$LOCAL_AI" "$repo_profile" "$local_profile"; do
            [[ ! -f "$item/$config" ]] || source="$item/$config"
        done
        if [[ -n "$source" ]]; then
            if [[ ! -e "$target/$config" || -L "$target/$config" ]]; then
                ln -sfn "$source" "$target/$config"
            else
                echo "Preserving unmanaged config: $target/$config" >&2
            fi
        fi
    done
    echo "Synced Pi: $target"
}

if [[ -n "$selected" ]]; then
    sync_profile "$selected"
elif [[ ${#PROFILES[@]} -gt 0 ]]; then
    for profile in "${PROFILES[@]}"; do sync_profile "$profile"; done
else
    sync_profile ""
fi

if [[ -f "$DOTFILES_PI/extensions/package.json" && ! -d "$DOTFILES_PI/extensions/node_modules" ]]; then
    (cd "$DOTFILES_PI/extensions" && npm install --silent)
fi
