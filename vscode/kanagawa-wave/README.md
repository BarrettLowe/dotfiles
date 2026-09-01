# Kanagawa Wave

VS Code colour theme matching the Kanagawa Wave palette used across the rest of
these dotfiles (nvim, foot, tmux, sway, waybar, pi).

Syntax highlighting is defined on two layers:

- **TextMate scopes** (`tokenColors`) — the regex-based layer, used for every
  language and as the fallback when no language server is running.
- **Semantic tokens** (`semanticTokenColors`) — driven by the language server,
  so a parameter, a local variable, a property and a readonly constant each get
  their own colour instead of all rendering as "variable".

## Install

    bash ~/dotfiles/vscode/install.sh

Then pick **Kanagawa Wave** from the theme picker, or set
`"workbench.colorTheme": "Kanagawa Wave"` in your settings.
