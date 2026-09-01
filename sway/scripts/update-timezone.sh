#!/usr/bin/env bash
# Detects timezone from IP geolocation and applies it via timedatectl if it changed.
set -euo pipefail

tz=$(curl -s -m 5 'http://ip-api.com/line/?fields=timezone' || true)

# Bail out quietly on empty/malformed response (offline, API down, rate-limited)
# or if the zone isn't one systemd actually knows about.
[[ -n "$tz" ]] || exit 0
[[ -e "/usr/share/zoneinfo/$tz" ]] || exit 0

current=$(timedatectl show -p Timezone --value)
[[ "$tz" != "$current" ]] || exit 0

timedatectl set-timezone "$tz"
