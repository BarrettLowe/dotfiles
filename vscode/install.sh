#!/usr/bin/env bash
# Package and install the local VS Code colour theme.
#
# VS Code does not scan ~/.vscode/extensions for dropped-in folders any more —
# extensions.json is the manifest of what is installed — so a symlink into the
# dotfiles repo is silently ignored. Packaging a .vsix and installing it is the
# supported path. Re-run this after editing the theme JSON.

set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/kanagawa-wave"
VSIX="$(mktemp -d)/kanagawa-wave.vsix"

if ! command -v code &>/dev/null; then
    echo "VS Code (code) not on PATH — skipping theme install." >&2
    exit 0
fi

npx --yes @vscode/vsce package \
    --allow-missing-repository --skip-license \
    --out "$VSIX" >/dev/null

code --install-extension "$VSIX" --force
rm -rf "$(dirname "$VSIX")"

echo "Installed Kanagawa Wave. Reload VS Code, then it is in the theme picker."
