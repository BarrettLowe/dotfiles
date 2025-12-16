# Tmux Setup Guide

This guide covers setting up tmux (terminal multiplexer) with your dotfiles configuration. Tmux allows you to run multiple terminal sessions, split windows, and keep processes running when you disconnect.

## What is Tmux?

Tmux (Terminal Multiplexer) lets you:
- **Run multiple terminal sessions** in one window
- **Split your terminal** into panes horizontally and vertically
- **Keep sessions running** even after disconnecting (perfect for SSH)
- **Switch between projects** instantly
- **Pair program** by sharing sessions

## Prerequisites

### Check if Tmux is Installed

```bash
tmux -V
# Should output: tmux 3.x or similar
```

### Install Tmux

**macOS:**
```bash
brew install tmux
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install tmux
```

**Arch Linux:**
```bash
sudo pacman -S tmux
```

**RHEL/CentOS/Fedora:**
```bash
sudo dnf install tmux
# or older systems:
sudo yum install tmux
```

**Important:** Make sure you have **tmux 2.9 or later**. Older versions have incompatible syntax.

## Step 1: Configuration Already Set Up!

If you ran the main `setup.sh` script, your tmux configuration is already linked:

```bash
# Verify the symlink
ls -la ~/.tmux.conf
# Should point to ~/dotfiles/.tmux.conf
```

## Step 2: Understanding Auto-Attach Behavior

Your `.zshrc` is configured to **automatically attach to tmux** when you open a terminal. Here's what happens:

1. **First terminal:** Creates a session called "Pasta"
2. **Second terminal:** Creates a session called "Salad"
3. **Subsequent terminals:** Attaches to "Pasta"

### Disable Auto-Attach (If Desired)

If you don't want automatic tmux attachment:

**Option A:** Comment out the tmux section in `~/.zshrc`:
```bash
# Find this section near the end of .zshrc and comment it out:
# if [[ $- == *i* ]] && [[ -z "$TMUX" ]] && command -v tmux >/dev/null 2>&1; then
#     ...
# fi
```

**Option B:** Disable in VS Code only - add to `~/.zshrc_local`:
```bash
# Disable tmux in VS Code terminal
[[ -n "$VSCODE_INJECTION" ]] && return
```

## Step 3: Basic Tmux Usage

### Starting Tmux Manually

```bash
# Start a new session
tmux

# Start a new session with a name
tmux new -s myproject

# List existing sessions
tmux ls

# Attach to an existing session
tmux attach -t myproject

# Kill a session
tmux kill-session -t myproject
```

### The Prefix Key

**Everything in tmux starts with the prefix key:** `Ctrl+a` (customized in your config, default is `Ctrl+b`)

Press `Ctrl+a`, release, then press the command key. For a full list of bindings, press `Ctrl+a ?` inside tmux.

## Your Custom Configuration

### Key Features Enabled

1. **Prefix Changed:** `Ctrl+a` instead of default `Ctrl+b` (easier to reach)
2. **Vi Mode:** Use vi keys for navigation and copy mode
3. **Mouse Support:** Click to select panes and windows
4. **Visual Improvements:** Better colors and status bar
5. **Better Defaults:** Faster key repeat, larger history
6. **Custom Bindings:** See `.tmux.conf` for all configured keybindings

## Configuration Customization

### Edit Tmux Config

```bash
# Use the alias
tc

# Or edit directly
vim ~/dotfiles/.tmux.conf
```

### Reload Configuration

After making changes:

```bash
# From within tmux:
Ctrl+a r

# Or from terminal:
tmux source-file ~/.tmux.conf
```

## Troubleshooting

### Colors Look Wrong
**Problem:** Colors in tmux don't match normal terminal

**Solution:**
```bash
# Check TERM variable
echo $TERM

# In tmux, should be: screen-256color or tmux-256color
# Add to .tmux.conf:
set -g default-terminal "screen-256color"
# or
set -g default-terminal "tmux-256color"
```

### Vim Colors Wrong in Tmux
Add to `.tmux.conf`:
```bash
set -g default-terminal "screen-256color"
set -ga terminal-overrides ",xterm-256color:Tc"
```

### Copy/Paste Not Working
**Problem:** Can't copy from tmux to system clipboard

**Solutions:**

**macOS:**
```bash
# Install reattach-to-user-namespace
brew install reattach-to-user-namespace

# Add to .tmux.conf:
set-option -g default-command "reattach-to-user-namespace -l zsh"
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "reattach-to-user-namespace pbcopy"
```

**Linux with xclip:**
```bash
# Install xclip
sudo apt install xclip

# Add to .tmux.conf:
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "xclip -selection clipboard"
```

### Mouse Scrolling Not Working
**Problem:** Mouse wheel scrolls terminal history, not tmux buffer

**Solution:** Add to `.tmux.conf`:
```bash
set -g mouse on
```

### Prefix Key Not Working
**Problem:** `Ctrl+a` doesn't work

**Check:**
1. Make sure you're in tmux: `echo $TMUX` (should output something)
2. Verify config is loaded: `tmux show-options -g prefix`
3. Try default prefix: `Ctrl+b`
4. Reload config: `tmux source-file ~/.tmux.conf`

### Session Won't Start
**Problem:** `tmux: error connecting to /tmp/tmux-XXX/default`

**Solution:**
```bash
# Kill tmux server
tmux kill-server

# Start fresh
tmux
```

### Escape Key Lag in Vim
**Problem:** When using vim in tmux, Esc key has delay

**Solution:** Add to `.tmux.conf`:
```bash
set -s escape-time 0
```

## Optional: Tmux Plugins

Consider using **TPM** (Tmux Plugin Manager) for additional functionality:

```bash
# Install TPM
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# Add to end of .tmux.conf:
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'tmux-plugins/tmux-resurrect'  # Save sessions
set -g @plugin 'tmux-plugins/tmux-continuum'  # Auto-save sessions

# Initialize TPM
run '~/.tmux/plugins/tpm/tpm'

# Install plugins: Ctrl+a I (capital i)
```

## Next Steps

Now that tmux is configured:
1. Press `Ctrl+a ?` to see all available keybindings
2. Run `man tmux` for complete documentation
3. Create named sessions for different projects
4. Customize your config as needed in `~/.tmux.conf`
