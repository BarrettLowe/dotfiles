# excalidraw-diagram skill

Source: https://github.com/coleam00/excalidraw-diagram-skill — copied in manually, not cloned.

## First-time setup

```bash
cd ~/.claude/skills/excalidraw-diagram/references
uv sync
uv run playwright install chromium
```

## Usage

Invoke via `/excalidraw` or tell Claude to create an Excalidraw diagram. Output is a `.excalidraw` JSON file you can open at excalidraw.com or in the VS Code extension.
