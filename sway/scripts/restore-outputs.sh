#!/bin/bash
# Restore Sway output state — safe on startup or post-resume
# Optional arg: seconds to sleep before reconfiguring (lets GPU/outputs settle)
sleep "${1:-0}"

swaymsg output '*' enable
swaymsg output '*' dpms on

# Handle lid state — skip silently on desktops with no lid device
lid_files=(/proc/acpi/button/lid/*/state)
if [[ -f "${lid_files[0]}" ]]; then
    if grep -q closed "${lid_files[0]}"; then
        swaymsg output eDP-1 disable
    fi
fi
