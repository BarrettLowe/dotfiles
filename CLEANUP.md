# Dotfiles Cleanup Plan

## Goal
Modernize the dotfiles repository to serve as a template for setting up personal preferences on new computers or devcontainers.

## Action Items

### 1. Vim / Neovim
Since you've switched to Neovim in VS Code, we will remove the heavy plugin setup.
- [x] **Remove `vimconfig/` directory**: This contains filetype specific settings that are likely handled by VS Code extensions now.
- [x] **Update `setup.sh`**: Remove the section that installs Pathogen and clones git repositories into `~/.vim/bundle`.
- [x] **Simplify `.vimrc`**: Keep a minimal configuration for those times you do need to edit files in the terminal. Remove plugin-specific settings.

### 2. Tmux
Update configuration to be compatible with modern Tmux versions (>= 2.9).
- [x] **Fix Deprecated Syntax**:
    - Replace `pane-active-border-fg` / `pane-active-border-bg` with `set -g pane-active-border-style fg=colour208,bg=colour238`.
    - Replace `pane-border-fg` with `set -g pane-border-style fg=colour237`.
- [x] **Remove `status-utf8`**: This is no longer necessary and causes errors in newer versions.
- [x] **Fix Hardcoded Paths**: Change `bind R source-file /home/z1113218/.tmux.conf` to use `$HOME` or `~`.

### 3. Zsh
Clean up environment-specific paths.
- [x] **Remove Hardcoded Paths**: Lines like `/apps/matlab_r2015b/bin` and `/apps/gcc_5.3.0/bin` should be removed or made conditional.
- [x] **Review Exports**: Check if `LIGHTSAIL` and `EC2` IP exports are still relevant.
- [x] **Oh-My-Zsh**: Ensure `setup.sh` handles Oh-My-Zsh installation or warns if it's missing.

### 4. Setup Script (`setup.sh`)
Make the script more robust and idempotent.
- [x] **Symlink Safety**: Check if files exist before linking to avoid errors or accidental overwrites (use `ln -sf` or backup existing files).
- [x] **Remove Plugin Installation**: Delete the block starting with `echo 'Trying to install pathogen'`.

## Next Steps
1. Review this plan.
2. Execute the cleanup of `setup.sh` and `vimconfig/`.
3. Apply fixes to `.tmux.conf` and `.zshrc`.
4. Create a minimal `.vimrc`.
