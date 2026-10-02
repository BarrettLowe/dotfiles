#!/usr/bin/env bash
# Profile configuration for sync. This config is trusted local shell code.
LOCAL_AI="${LOCAL_AI:-$HOME/.local/ai}"
PROFILES=()
DEFAULT_PROFILE=""
if [[ -f "$LOCAL_AI/profiles.conf" ]]; then
    source "$LOCAL_AI/profiles.conf"
    [[ ${#PROFILES[@]} -gt 0 ]] || { echo 'profiles.conf needs at least 1 profile' >&2; exit 1; }
    for profile in "${PROFILES[@]}"; do
        [[ "$profile" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || { echo "Invalid profile: $profile" >&2; exit 1; }
    done
    [[ -n "$DEFAULT_PROFILE" ]] || DEFAULT_PROFILE="${PROFILES[0]}"
fi

require_profile() {
    local name="$1" profile
    for profile in "${PROFILES[@]}"; do
        [[ "$profile" == "$name" ]] && return 0
    done
    echo "Profile is not enabled: $name" >&2
    return 1
}

if [[ ${#PROFILES[@]} -gt 0 ]]; then
    require_profile "$DEFAULT_PROFILE" || exit 1
fi
