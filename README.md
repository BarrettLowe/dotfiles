# Dotfiles Repository

Personal configuration files for setting up development environments on new systems. This repository is designed to make it easy to get up and running quickly when setting up a new machine or devcontainer.

## Quick Start

```bash
# Clone this repository
cd ~
git clone https://github.com/BarrettLowe/dotfiles.git

# Run the setup script
cd ~/dotfiles
bash setup.sh

# Create your local configuration files
cp .zshrc_local_template ~/.zshrc_local

# Edit ~/.zshrc_local for system-specific settings
# Reload your shell
source ~/.zshrc
```

## What's Included

This repository contains configuration files for:

- **Zsh** - Shell configuration with oh-my-zsh integration
- **Vim/Neovim** - Minimal text editor configuration
- **Tmux** - Terminal multiplexer configuration
- **Git** - Version control settings (home and work profiles)
- **Ctags** - Code navigation configuration
- **Ag (The Silver Searcher)** - Ignore patterns for code search
- **Inputrc** - Readline configuration for better terminal input

## System Setup Guides

**Read these guides in order when setting up a new system:**

### 🐚 [Zsh Configuration Setup](ZSH_SETUP.md)
Step-by-step guide for:
- Installing zsh and oh-my-zsh
- Running the setup script
- Configuring system-specific settings
- Understanding key features and aliases
- **START HERE** - This is usually your first step

### ✏️ [Vim/Neovim Configuration Setup](VIM_SETUP.md)
Complete walkthrough for:
- Installing vim and neovim
- Understanding the minimal config
- VS Code + Neovim extension setup
- Quick reference for basic commands

### 🪟 [Tmux Configuration Setup](TMUX_SETUP.md)
Comprehensive guide for:
- Installing and configuring tmux
- Learning essential commands
- Understanding auto-attach behavior
- Custom key bindings and workflows

## Files Overview

### Configuration Files
- `.zshrc` - Main zsh configuration (portable)
- `.zshrc_local_template` - Template for system-specific zsh settings
- `.vimrc` - Minimal vim configuration
- `.tmux.conf` - Tmux configuration
- `.gitconfig` - Git configuration (symlinked from home.gitconfig or work.gitconfig)
- `home.gitconfig` - Personal git settings
- `work.gitconfig` - Work git settings
- `.ctags` - Ctags configuration for code navigation
- `.agignore` - Ignore patterns for The Silver Searcher
- `.inputrc` - Readline configuration

### Setup Files
- `setup.sh` - Main setup script that creates symlinks
- `README.md` - This file
- `CLEANUP.md` - Repository modernization notes

## Setup Script Details

The `setup.sh` script does the following:

1. **Creates required directories**
   - `~/DevTools` - For custom binaries and tools

2. **Creates symlinks** for all configuration files from `~/dotfiles` to `~`
   - `.zshrc`
   - `.vimrc`
   - `.tmux.conf`
   - `.gitconfig`
   - And more...

3. **Sets up Vim/Neovim**
   - Creates `~/.vim` directory
   - Links neovim config to vim config for compatibility

4. **Installs oh-my-zsh** (if not already installed)
   - Clones from GitHub
   - Sets up plugin system

## First-Time Setup Checklist

When setting up a new system, follow these steps:

### 1. Prerequisites
```bash
# Install essential tools (varies by OS)

# macOS
brew install zsh tmux vim git

# Ubuntu/Debian
sudo apt install zsh tmux vim git

# Arch Linux
sudo pacman -S zsh tmux vim git
```

### 2. Clone and Run Setup
```bash
cd ~
git clone https://github.com/BarrettLowe/dotfiles.git
cd ~/dotfiles
bash setup.sh
```

### 3. Configure System-Specific Settings
```bash
# Create local config from template
cp ~/.zshrc_local_template ~/.zshrc_local

# Edit with your preferred editor
vim ~/.zshrc_local
```

### 4. Choose Git Configuration
```bash
# For personal machines
ln -sf ~/dotfiles/home.gitconfig ~/dotfiles/.gitconfig

# For work machines
ln -sf ~/dotfiles/work.gitconfig ~/dotfiles/.gitconfig

# Then update the linked file with your details
vim ~/dotfiles/.gitconfig
```

### 5. Optional Tools
Consider installing these additional tools:
- **The Silver Searcher (ag)** - Fast code searching
  ```bash
  # macOS
  brew install the_silver_searcher
  
  # Ubuntu/Debian
  sudo apt install silversearcher-ag
  ```
- **ctags** - Code navigation
  ```bash
  # macOS
  brew install ctags
  
  # Ubuntu/Debian
  sudo apt install universal-ctags
  ```
- **fzf** - Fuzzy finder (great with zsh)
  ```bash
  # Most systems
  git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
  ~/.fzf/install
  ```

### 6. Reload Your Shell
```bash
# If you changed your default shell to zsh
chsh -s $(which zsh)

# Reload configuration
source ~/.zshrc
```

## Customization

### System-Specific Settings

All system-specific settings should go in `~/.zshrc_local`. This file is:
- Not tracked in the repository
- Loaded automatically by `.zshrc`
- Perfect for:
  - Custom PATH entries
  - Work-specific environment variables
  - Machine-specific aliases
  - Private/sensitive configuration

### Modifying Core Configurations

If you want to modify the core configuration files:

1. Edit the files in `~/dotfiles/` (not the symlinks in `~`)
2. Changes are automatically reflected (symlinks point to the git repo)
3. Commit and push your changes to keep them for next time

```bash
cd ~/dotfiles
vim .zshrc  # Make your changes
git add .zshrc
git commit -m "Update zsh configuration"
git push
```

## Troubleshooting

### Symlinks Not Working
If symlinks aren't created properly, the setup script might need to be run with `-f`:
```bash
cd ~/dotfiles
# Manually create symlinks with force flag
ln -sf ~/dotfiles/.zshrc ~/.zshrc
# Repeat for other files as needed
```

### Oh-my-zsh Theme Not Found
The `.zshrc` uses the "half-life" theme. If it's not found:
```bash
# Use a built-in theme temporarily
# Edit .zshrc and change ZSH_THEME to "robbyrussell" or another built-in theme
```

### Tmux Config Errors
If you get errors when starting tmux, you might have an older version:
```bash
# Check tmux version
tmux -V

# Update tmux if needed (version should be >= 2.9)
```

### Path Issues
If commands aren't found:
1. Check that `~/DevTools/bin` and other paths exist
2. Verify your `~/.zshrc_local` has the correct PATH additions
3. Run `echo $PATH` to see what's currently in your PATH

## Repository Structure

```
dotfiles/
├── README.md                    # Main overview and quick start
├── ZSH_SETUP.md                # 🐚 Zsh setup guide (start here!)
├── VIM_SETUP.md                # ✏️  Vim/Neovim setup guide
├── TMUX_SETUP.md               # 🪟 Tmux setup guide
├── CLEANUP.md                  # Repository modernization notes
├── setup.sh                    # Main setup script
├── .zshrc                      # Main zsh config
├── .zshrc_local_template       # Template for local config
├── .vimrc                      # Vim configuration
├── .tmux.conf                  # Tmux configuration
├── home.gitconfig              # Personal git config
├── work.gitconfig              # Work git config
├── .gitconfig                  # Symlink to one of the above
├── .ctags                      # Ctags configuration
├── .agignore                   # Ag ignore patterns
├── .inputrc                    # Readline configuration
├── .gitignore                  # Git ignore patterns
└── .gitattributes              # Git attributes
```

## Contributing

This is a personal dotfiles repository, but feel free to fork it and adapt it to your needs!

## License

Public domain - use as you wish!
