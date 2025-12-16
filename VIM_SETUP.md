# Vim/Neovim Setup Guide

This guide covers setting up Vim and Neovim with your dotfiles. The configuration is intentionally minimal, designed for quick edits in the terminal rather than a full IDE replacement.

## Philosophy

This setup assumes:
- You use **VS Code with Neovim extension** for primary development
- You need **basic Vim** for quick terminal edits and server work
- You want a **clean, fast** config without heavy plugins

## Prerequisites

### Check What's Installed

```bash
# Check for vim
vim --version

# Check for neovim
nvim --version
```

### Install Vim

**macOS:**
```bash
# Basic vim (pre-installed)
vim --version

# Or install latest via Homebrew
brew install vim
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install vim
```

**Arch Linux:**
```bash
sudo pacman -S vim
```

### Install Neovim (Optional but Recommended)

**macOS:**
```bash
brew install neovim
```

**Ubuntu/Debian:**
```bash
sudo apt install neovim
```

**Arch Linux:**
```bash
sudo pacman -S neovim
```

**From Source (Latest Version):**
```bash
# See: https://github.com/neovim/neovim/wiki/Installing-Neovim
```

## Step 1: Setup Script Already Configured It!

If you ran the main `setup.sh` script, your vim configuration is already set up:

```bash
# These were already created:
# ~/.vimrc -> ~/dotfiles/.vimrc (symlink)
# ~/.vim/ directory
# ~/.config/nvim/init.vim -> ~/.vimrc (symlink for neovim compatibility)
# ~/.config/nvim -> ~/.vim (directory link)
```

Verify the setup:
```bash
# Check vimrc symlink
ls -la ~/.vimrc

# Check neovim config
ls -la ~/.config/nvim/init.vim
```

## Step 2: Verify Configuration Works

```bash
# Test vim
vim

# You should see vim open. Press :q to quit

# Test neovim
nvim

# Press :q to quit
```

## Understanding the Configuration

The `.vimrc` is kept minimal with essential settings:

### Basic Settings
- **Line numbers** - See what line you're on
- **Syntax highlighting** - Code looks pretty
- **Auto-indentation** - Smart indenting
- **Search highlighting** - Find what you're looking for
- **Tab settings** - 4 spaces, expandtab

### Key Bindings
The config uses standard vim bindings. No crazy remaps to confuse you when you're on a different system.

## Common Use Cases

### Editing Config Files
```bash
# Use the aliases from zsh config
vc    # Edit vim config
zc    # Edit zsh config
tc    # Edit tmux config
```

## VS Code + Neovim Extension Setup

If you use VS Code with the Neovim extension:

### Step 1: Install VS Code Neovim Extension

In VS Code:
1. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (macOS)
2. Search for "VSCode Neovim"
3. Install the extension by asvetliakov

### Step 2: Configure Extension

The extension will use your `~/.config/nvim/init.vim` automatically, which is linked to your `.vimrc`.

**VS Code Settings** (`settings.json`):
```json
{
  "vscode-neovim.neovimExecutablePaths.linux": "/usr/bin/nvim",
  "vscode-neovim.neovimExecutablePaths.darwin": "/usr/local/bin/nvim",
  "vscode-neovim.neovimExecutablePaths.win32": "C:\\Program Files\\Neovim\\bin\\nvim.exe",
  
  // Optional: Enable Ctrl+key bindings
  "vscode-neovim.ctrlKeysForNormalMode": [
    "w",
    "d",
    "u",
    "f",
    "b"
  ],
  
  // Optional: Use VSCode clipboard
  "vscode-neovim.useCtrlKeysForNormalMode": true
}
```

### Step 3: Verify in VS Code

Open a file and:
1. Press `Esc` - Should enter normal mode
2. Type `h`, `j`, `k`, `l` - Should move cursor
3. Type `i` - Should enter insert mode
4. Type `jk` quickly - Should exit insert mode (if configured in your .vimrc)

## Customization

### Add to Your .vimrc

Edit `~/dotfiles/.vimrc` (changes apply to both vim and neovim):

```vim
" Example additions:

" Show cursor line
set cursorline

" Better search
set ignorecase      " Case insensitive search
set smartcase       " Case sensitive if uppercase used

" Persistent undo
set undofile
set undodir=~/.vim/undo

" Mouse support
set mouse=a

" Clipboard integration
set clipboard=unnamed     " macOS
" set clipboard=unnamedplus " Linux
```

### Create Undo Directory

For persistent undo:
```bash
mkdir -p ~/.vim/undo
```

### Neovim-Specific Config (Optional)

If you want neovim-specific settings, create `~/.config/nvim/init.lua`:

```lua
-- Load vimrc first
vim.cmd('source ~/.vimrc')

-- Neovim-specific settings here
vim.opt.termguicolors = true  -- Better colors in terminal
```

## Plugin Setup (Optional)

If you want a few plugins without going overboard:

### Using vim-plug

1. **Install vim-plug:**
```bash
# For vim
curl -fLo ~/.vim/autoload/plug.vim --create-dirs \
    https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim

# For neovim
sh -c 'curl -fLo "${XDG_DATA_HOME:-$HOME/.local/share}"/nvim/site/autoload/plug.vim --create-dirs \
       https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim'
```

2. **Add to `.vimrc`:**
```vim
" Plugins
call plug#begin('~/.vim/plugged')

" Essential plugins
Plug 'tpope/vim-sensible'      " Sensible defaults
Plug 'tpope/vim-commentary'    " Easy commenting (gc)
Plug 'tpope/vim-surround'      " Surround text objects
Plug 'tpope/vim-fugitive'      " Git integration

call plug#end()
```

3. **Install plugins:**
```bash
# Open vim and run:
vim
:PlugInstall
```

## Troubleshooting

### Neovim Can't Find Config
**Problem:** Neovim doesn't load settings

**Solution:**
```bash
# Check if symlink exists
ls -la ~/.config/nvim/init.vim

# Recreate if needed
mkdir -p ~/.config/nvim
ln -sf ~/.vimrc ~/.config/nvim/init.vim
```

### Colors Look Wrong
**Problem:** Syntax highlighting is broken or colors are ugly

**Solution:**
```bash
# Test your terminal colors
echo $TERM

# Should be xterm-256color or similar
# Add to .zshrc_local if needed:
export TERM=xterm-256color
```

### Backspace Doesn't Work
**Problem:** Backspace key doesn't delete in insert mode

**Solution:** Add to `.vimrc`:
```vim
set backspace=indent,eol,start
```

### Clipboard Doesn't Work
**Problem:** Can't copy/paste between vim and system

**Solution:**
```bash
# Check if vim has clipboard support
vim --version | grep clipboard

# Should show +clipboard, not -clipboard
# If negative, install vim-gtk or gvim
# Ubuntu:
sudo apt install vim-gtk3

# macOS (use system vim or):
brew install vim
```

### VS Code Neovim Extension Not Working
**Problem:** Extension installed but vim keybindings don't work

**Solutions:**
1. Check neovim path in VS Code settings
2. Verify neovim is installed: `nvim --version`
3. Check extension is enabled: `Ctrl+Shift+X` → Look for checkmark
4. Reload VS Code: `Ctrl+Shift+P` → "Reload Window"

## Next Steps

Your vim setup is now ready! For learning vim commands, run `vimtutor` in your terminal.
