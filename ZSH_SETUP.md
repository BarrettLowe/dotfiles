# Zsh Setup Guide

This guide walks you through setting up zsh with oh-my-zsh and your dotfiles configuration on a new system. Follow these steps in order - they're designed to be executed infrequently so each step is explicit.

## Prerequisites

Before you begin, make sure zsh is installed on your system.

### Check if zsh is installed
```bash
which zsh
# Should output something like: /bin/zsh or /usr/bin/zsh
```

### Install zsh if needed

**macOS:**
```bash
# zsh is pre-installed on modern macOS
# To update to latest version:
brew install zsh
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install zsh
```

**Arch Linux:**
```bash
sudo pacman -S zsh
```

**RHEL/CentOS/Fedora:**
```bash
sudo dnf install zsh
# or on older systems:
sudo yum install zsh
```

## Step 1: Set Zsh as Your Default Shell

```bash
# Check current shell
echo $SHELL

# Set zsh as default shell
chsh -s $(which zsh)

# Log out and log back in, or start a new terminal session
```

**Note:** You might need to enter your password. On some systems, you may need to add zsh to `/etc/shells` first:
```bash
which zsh | sudo tee -a /etc/shells
```

## Step 2: Install Oh-My-Zsh

Oh-My-Zsh is a framework for managing your zsh configuration. The setup script will install it, but you can also install it manually:

```bash
# Via curl
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Or via wget
sh -c "$(wget https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh -O -)"
```

**Important:** If the installer asks to change your default shell, say **NO** if you've already changed it in Step 1.

## Step 3: Run the Dotfiles Setup Script

The setup script will create symlinks for all your configuration files.

```bash
cd ~/dotfiles
bash setup.sh
```

This script:
- Creates `~/DevTools` directory structure
- Symlinks `.zshrc` from `~/dotfiles/.zshrc` to `~/.zshrc`
- Sets up vim/neovim configurations
- Installs oh-my-zsh if not already present

## Step 4: Create Your Local Configuration File

The `.zshrc` is designed to be portable across systems. System-specific settings go in `~/.zshrc_local`.

```bash
# Copy the template to create your local config
cp ~/dotfiles/.zshrc_local_template ~/.zshrc_local

# Edit it with your preferred editor
vim ~/.zshrc_local
# or
code ~/.zshrc_local
# or
nano ~/.zshrc_local
```

## Step 5: Configure System-Specific Settings

Edit `~/.zshrc_local` and uncomment/modify settings based on your system:

### Common Settings to Configure:

#### For Linux Systems
```bash
# Uncomment and adjust library paths
typeset -U LD_LIBRARY_PATH
export LD_LIBRARY_PATH="$HOME/DevTools/lib:$LD_LIBRARY_PATH"
export LD_LIBRARY_PATH="$HOME/DevTools/lib64:$LD_LIBRARY_PATH"
```

#### For macOS Systems
```bash
# Use DYLD_LIBRARY_PATH instead
typeset -U DYLD_LIBRARY_PATH
export DYLD_LIBRARY_PATH="$HOME/DevTools/lib:$DYLD_LIBRARY_PATH"
```

#### Custom Paths
```bash
# Add any custom binary paths
[[ -d "$HOME/my-tools/bin" ]] && export PATH="$HOME/my-tools/bin:$PATH"

# Anaconda/Miniconda
[[ -d "$HOME/anaconda3/bin" ]] && export PATH="$HOME/anaconda3/bin:$PATH"
[[ -d "$HOME/miniconda3/bin" ]] && export PATH="$HOME/miniconda3/bin:$PATH"
```

#### Editor Preference
```bash
# If you prefer neovim over vim
export EDITOR=nvim
alias vim="nvim"
```

#### Manual Pages
```bash
# If you have custom man pages
typeset -U MANPATH
export MANPATH="$HOME/DevTools/share/man:$HOME/DevTools/man:$MANPATH"
```

## Step 6: Install the Required Theme (Optional)

The `.zshrc` uses the "half-life" theme. If this theme isn't available, you have options:

### Option A: Use a Built-in Theme
Edit `~/dotfiles/.zshrc` and change the theme:
```bash
ZSH_THEME="robbyrussell"  # or "agnoster", "powerlevel10k", etc.
```

### Option B: Install the half-life Theme
```bash
# Find and install the half-life theme
# Check if it's in the themes directory
ls ~/.oh-my-zsh/themes/ | grep half

# If not found, you might need to install it manually or use a different theme
```

## Step 7: Reload Your Shell Configuration

```bash
# Reload zsh configuration
source ~/.zshrc

# Or start a new terminal session
```

## Step 8: Verify Everything Works

Run these commands to verify your setup:

```bash
# Check that zsh is running
echo $SHELL
# Should output: /bin/zsh or similar

# Check that oh-my-zsh is loaded
echo $ZSH
# Should output: /home/yourusername/.oh-my-zsh

# Check your PATH
echo $PATH
# Should include your custom paths

# Test tmux integration (if tmux is installed)
tmux ls
# Should show your sessions or "no server running"
```

## Understanding the Configuration

### Main Config Files

**`~/dotfiles/.zshrc`** - The main configuration file
- Portable settings that work everywhere
- General aliases (`gs`, `gdd`, `zrld`, etc.)
- Vi-mode key bindings
- oh-my-zsh configuration
- Automatic tmux attachment

**`~/.zshrc_local`** - Your local machine settings
- System-specific paths
- Private environment variables
- Work-specific settings
- Not tracked in git

### Key Features Enabled

#### Vi Mode
Your shell uses vi keybindings:
- Press `Esc` or type `jk` to enter command mode
- Use `h`, `j`, `k`, `l` for navigation
- Press `i` or `a` to enter insert mode
- Press `v` in command mode to edit the command in vim

#### Automatic Tmux
When you start a terminal, it automatically attaches to tmux sessions:
- First session: "Pasta"
- Second session: "Salad"

To disable this, comment out the tmux section in `.zshrc` or add to `.zshrc_local`:
```bash
# Disable tmux auto-attach
return
```

#### Useful Aliases

Your `.zshrc` includes many useful aliases. Run `alias` in your terminal to see the complete list. Key ones include:
- Config editing: `zc`, `zlc`, `vc`, `tc`
- Git shortcuts: `gs`, `gdd`
- Search: `gi`, `f`, `fin`
- Code navigation: `mktags`, `index`

## Troubleshooting

### Theme Errors
**Problem:** `[oh-my-zsh] theme 'half-life' not found`

**Solution:** Edit `.zshrc` and change to a built-in theme:
```bash
ZSH_THEME="robbyrussell"
```

### Tmux Auto-attach Issues
**Problem:** Tmux starts automatically but you don't want it to

**Solution:** Add this to `~/.zshrc_local`:
```bash
# Disable tmux auto-attach in certain environments
[[ -n "$VSCODE_INJECTION" ]] && return  # Disables in VS Code
```

Or comment out the tmux section in `.zshrc` (lines near the end).

### Path Not Updating
**Problem:** New paths in `~/.zshrc_local` aren't showing up

**Solution:**
1. Make sure the directories exist: `ls -la ~/path/to/dir`
2. Check your syntax: paths should be added conditionally
3. Reload: `source ~/.zshrc`
4. Verify: `echo $PATH`

### Slow Shell Startup
**Problem:** Shell takes a long time to start

**Solution:**
1. Reduce oh-my-zsh plugins in `.zshrc`
2. Profile your startup: `time zsh -i -c exit`
3. Check for slow commands in `.zshrc_local`

### Keybindings Not Working
**Problem:** Vi mode keys aren't responding

**Solution:**
1. Check `KEYTIMEOUT` is set (default is 40ms)
2. Try increasing: `export KEYTIMEOUT=100` in `.zshrc_local`
3. Verify vi mode is enabled: `bindkey -L | grep vicmd`

### Command Not Found: <some-tool>
**Problem:** A tool referenced in aliases isn't installed

**Solution:**
1. Check what's missing: `which <command>`
2. Install it or comment out the related alias/config
3. Common tools to install:
   - `tmux` - Terminal multiplexer
   - `vim` or `nvim` - Text editor
   - `git` - Version control
   - `ag` or `rg` - Code search tools
   - `ctags` - Code indexing

## Next Steps

Once your zsh is configured:
1. Set up Git configuration (see main README.md)
2. Configure Vim/Neovim (see VIM_SETUP.md)
3. Set up Tmux (see TMUX_SETUP.md)
4. Run `alias` to see all available aliases
5. Check your `.zshrc` for custom functions and keybindings
