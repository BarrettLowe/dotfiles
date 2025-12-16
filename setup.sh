#!/bin/bash

# Dotfiles Setup Script
# This script automates the setup of your development environment
# Run this after cloning the dotfiles repository

# Note: We don't use 'set -e' here because we want to handle errors gracefully
# and continue with the setup even if some steps fail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}===================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Track what needs to be done manually
TODO_LIST=()

add_todo() {
    TODO_LIST+=("$1")
}

print_header "Dotfiles Setup Script"
echo "This script will set up your development environment."
echo "Current directory: $(pwd)"
echo "Target home directory: $HOME"

# Verify we're in the dotfiles directory
if [ ! -f "$PWD/setup.sh" ]; then
    print_error "Please run this script from the dotfiles directory!"
    exit 1
fi

DOTFILES_DIR="$PWD"
print_success "Dotfiles directory: $DOTFILES_DIR"

# Step 1: Create directory structure
print_header "Step 1: Creating Directory Structure"

if mkdir -p "$HOME/DevTools/bin" "$HOME/DevTools/lib" "$HOME/DevTools/lib64" 2>/dev/null; then
    print_success "Created $HOME/DevTools structure"
else
    print_error "Failed to create DevTools directories (permission denied?)"
    add_todo "Manually create: mkdir -p $HOME/DevTools/{bin,lib,lib64}"
fi

if mkdir -p "$HOME/.vim/undo" 2>/dev/null; then
    print_success "Created $HOME/.vim directory with undo folder"
else
    print_error "Failed to create .vim/undo directory"
    add_todo "Manually create: mkdir -p $HOME/.vim/undo"
fi

if mkdir -p "$HOME/.config" 2>/dev/null; then
    print_success "Created $HOME/.config directory"
else
    print_error "Failed to create .config directory"
    add_todo "Manually create: mkdir -p $HOME/.config"
fi

# Step 2: Create symlinks for dotfiles
print_header "Step 2: Creating Symlinks"

# Function to create symlink safely
create_symlink() {
    local source="$1"
    local target="$2"
    local filename=$(basename "$source")
    
    # Check if source exists
    if [ ! -e "$source" ]; then
        print_error "Source file does not exist: $source"
        add_todo "Check that $source exists in your dotfiles directory"
        return 1
    fi
    
    # Handle existing target
    if [ -L "$target" ]; then
        print_warning "$filename already exists as symlink, removing old link"
        if ! rm "$target" 2>/dev/null; then
            print_error "Failed to remove existing symlink: $target"
            add_todo "Manually remove: rm $target, then run: ln -sf $source $target"
            return 1
        fi
    elif [ -e "$target" ]; then
        print_warning "$filename already exists, backing up to ${target}.backup"
        if ! mv "$target" "${target}.backup" 2>/dev/null; then
            print_error "Failed to backup existing file: $target"
            add_todo "Manually backup: mv $target ${target}.backup"
            return 1
        fi
    fi
    
    # Create the symlink
    if ln -sf "$source" "$target" 2>/dev/null; then
        print_success "Linked $filename"
        return 0
    else
        print_error "Failed to create symlink: $target -> $source"
        add_todo "Manually link: ln -sf $source $target"
        return 1
    fi
}

# Core config files
create_symlink "$DOTFILES_DIR/.zshrc" "$HOME/.zshrc"
create_symlink "$DOTFILES_DIR/.vimrc" "$HOME/.vimrc"
create_symlink "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"

# Tool config files
create_symlink "$DOTFILES_DIR/.agignore" "$HOME/.agignore"
create_symlink "$DOTFILES_DIR/.ctags" "$HOME/.ctags"
create_symlink "$DOTFILES_DIR/.inputrc" "$HOME/.inputrc"

# Git config files
create_symlink "$DOTFILES_DIR/.gitattributes" "$HOME/.gitattributes"
create_symlink "$DOTFILES_DIR/.gitignore" "$HOME/.gitignore"

# Step 3: Git configuration setup
print_header "Step 3: Git Configuration"

echo "Which git configuration would you like to use?"
echo "  1) Home/Personal (home.gitconfig)"
echo "  2) Work (work.gitconfig)"
echo "  3) Skip (configure manually later)"
read -p "Enter choice [1-3]: " git_choice

case $git_choice in
    1)
        create_symlink "$DOTFILES_DIR/home.gitconfig" "$DOTFILES_DIR/.gitconfig"
        print_success "Using home.gitconfig"
        add_todo "Update your git name/email in ~/dotfiles/home.gitconfig"
        ;;
    2)
        create_symlink "$DOTFILES_DIR/work.gitconfig" "$DOTFILES_DIR/.gitconfig"
        print_success "Using work.gitconfig"
        add_todo "Update your git name/email in ~/dotfiles/work.gitconfig"
        ;;
    3)
        print_info "Skipping git configuration"
        add_todo "Create ~/dotfiles/.gitconfig (symlink to home.gitconfig or work.gitconfig)"
        ;;
    *)
        print_warning "Invalid choice, skipping git configuration"
        add_todo "Create ~/dotfiles/.gitconfig (symlink to home.gitconfig or work.gitconfig)"
        ;;
esac

if [ -f "$DOTFILES_DIR/.gitconfig" ]; then
    create_symlink "$DOTFILES_DIR/.gitconfig" "$HOME/.gitconfig"
fi

# Step 4: Vim/Neovim setup
print_header "Step 4: Vim/Neovim Configuration"

# Link neovim config to vim config for compatibility
if [ ! -L "$HOME/.config/nvim" ]; then
    if [ -d "$HOME/.config/nvim" ]; then
        print_warning "Neovim config directory exists, backing up"
        if ! mv "$HOME/.config/nvim" "$HOME/.config/nvim.backup" 2>/dev/null; then
            print_error "Failed to backup neovim config directory"
            add_todo "Manually backup: mv ~/.config/nvim ~/.config/nvim.backup"
        fi
    fi
    
    if ln -sf "$HOME/.vim" "$HOME/.config/nvim" 2>/dev/null; then
        print_success "Linked neovim config directory to vim"
    else
        print_error "Failed to link neovim config directory"
        add_todo "Manually link: ln -sf ~/.vim ~/.config/nvim"
    fi
else
    print_success "Neovim config directory already linked"
fi

# Link init.vim to .vimrc
if mkdir -p "$HOME/.config/nvim" 2>/dev/null; then
    create_symlink "$HOME/.vimrc" "$HOME/.config/nvim/init.vim"
else
    print_error "Failed to create nvim config directory"
    add_todo "Manually create and link: mkdir -p ~/.config/nvim && ln -sf ~/.vimrc ~/.config/nvim/init.vim"
fi

# Step 5: Oh-My-Zsh installation
print_header "Step 5: Oh-My-Zsh Installation"

if [ -d "$HOME/.oh-my-zsh" ]; then
    print_success "Oh-My-Zsh already installed"
else
    print_info "Installing Oh-My-Zsh..."
    
    # Check if we have curl or wget
    if command -v curl &> /dev/null; then
        if sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended 2>/dev/null; then
            print_success "Oh-My-Zsh installed via curl"
        else
            print_error "Oh-My-Zsh installation failed"
            add_todo "Install Oh-My-Zsh manually: sh -c \"\$(curl -fsSL https://ohmyz.sh/install.sh)\""
        fi
    elif command -v wget &> /dev/null; then
        if sh -c "$(wget https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh -O -)" "" --unattended 2>/dev/null; then
            print_success "Oh-My-Zsh installed via wget"
        else
            print_error "Oh-My-Zsh installation failed"
            add_todo "Install Oh-My-Zsh manually: sh -c \"\$(wget -O- https://ohmyz.sh/install.sh)\""
        fi
    else
        print_error "Neither curl nor wget found. Cannot install Oh-My-Zsh automatically."
        add_todo "Install curl or wget, then install Oh-My-Zsh: https://ohmyz.sh/#install"
    fi
fi

# Step 6: Local configuration
print_header "Step 6: Local Configuration Setup"

if [ ! -f "$HOME/.zshrc_local" ]; then
    if [ -f "$DOTFILES_DIR/.zshrc_local_template" ]; then
        if cp "$DOTFILES_DIR/.zshrc_local_template" "$HOME/.zshrc_local" 2>/dev/null; then
            print_success "Created ~/.zshrc_local from template"
            add_todo "Edit ~/.zshrc_local for system-specific settings"
        else
            print_error "Failed to copy .zshrc_local_template"
            add_todo "Manually copy: cp $DOTFILES_DIR/.zshrc_local_template ~/.zshrc_local"
        fi
    else
        print_error ".zshrc_local_template not found in dotfiles directory"
        add_todo "Create ~/.zshrc_local manually for system-specific settings"
    fi
else
    print_success "~/.zshrc_local already exists"
fi

# Step 7: Check for required tools
print_header "Step 7: Checking Installed Tools"

check_tool() {
    local tool="$1"
    local install_hint="$2"
    
    if command -v "$tool" &> /dev/null; then
        local version=$($tool --version 2>&1 | head -n1)
        print_success "$tool is installed: $version"
        return 0
    else
        print_warning "$tool is not installed"
        add_todo "Install $tool: $install_hint"
        return 1
    fi
}

check_tool "zsh" "macOS: brew install zsh | Linux: apt/yum/pacman install zsh"
check_tool "tmux" "macOS: brew install tmux | Linux: apt/yum/pacman install tmux"
check_tool "vim" "Usually pre-installed | macOS: brew install vim"
check_tool "git" "macOS: brew install git | Linux: apt/yum/pacman install git"

# Optional tools
print_info "Checking optional tools..."
check_tool "nvim" "macOS: brew install neovim | Linux: apt/yum/pacman install neovim" || true
check_tool "ag" "macOS: brew install the_silver_searcher | Linux: apt install silversearcher-ag" || true
check_tool "ctags" "macOS: brew install ctags | Linux: apt install ctags" || true

# Step 8: Shell configuration
print_header "Step 8: Shell Configuration"

current_shell=$(basename "$SHELL")
if [ "$current_shell" != "zsh" ]; then
    print_warning "Current shell is $current_shell, not zsh"
    echo ""
    read -p "Would you like to change your default shell to zsh? [y/N]: " change_shell
    
    if [[ "$change_shell" =~ ^[Yy]$ ]]; then
        zsh_path=$(which zsh 2>/dev/null)
        
        if [ -z "$zsh_path" ]; then
            print_error "Could not find zsh in PATH"
            add_todo "Install zsh first, then run: chsh -s \$(which zsh)"
        else
            # Check if zsh is in /etc/shells
            if ! grep -q "^${zsh_path}$" /etc/shells 2>/dev/null; then
                print_info "Adding zsh to /etc/shells (requires sudo password)"
                
                if echo "$zsh_path" | sudo tee -a /etc/shells > /dev/null 2>&1; then
                    print_success "Added zsh to /etc/shells"
                else
                    print_error "Failed to add zsh to /etc/shells (permission denied or sudo not available)"
                    print_info "Your system administrator may need to do this"
                    add_todo "Ask admin to run: echo $zsh_path | sudo tee -a /etc/shells"
                    add_todo "Then run: chsh -s $zsh_path"
                    # Don't try to change shell if we couldn't update /etc/shells
                    zsh_path=""
                fi
            fi
            
            # Only try to change shell if zsh_path is set and in /etc/shells
            if [ -n "$zsh_path" ]; then
                print_info "Changing default shell to zsh (may require your password)"
                
                if chsh -s "$zsh_path" 2>/dev/null; then
                    print_success "Default shell changed to zsh"
                    print_warning "You need to log out and back in for the change to take effect"
                else
                    print_error "Failed to change default shell"
                    print_info "This can happen if:"
                    print_info "  • You don't have permission to change your shell"
                    print_info "  • Your account is managed by LDAP/AD"
                    print_info "  • chsh is restricted on this system"
                    add_todo "Contact your system administrator to change shell to: $zsh_path"
                    add_todo "Or manually add 'exec zsh' to your current shell's RC file as a workaround"
                fi
            fi
        fi
    else
        add_todo "Change default shell to zsh: chsh -s \$(which zsh)"
    fi
else
    print_success "Already using zsh as default shell"
fi

# Final summary
print_header "Setup Complete! 🎉"

if [ ${#TODO_LIST[@]} -eq 0 ]; then
    print_success "Everything is configured automatically!"
    echo ""
    echo "You can now:"
    echo "  1. Start a new terminal session"
    echo "  2. Or reload your config: source ~/.zshrc"
else
    print_warning "Some steps require manual action"
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}What to do next:${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
    
    for i in "${!TODO_LIST[@]}"; do
        echo -e "${YELLOW}$((i+1)).${NC} ${TODO_LIST[$i]}"
    done
    
    echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
fi

echo ""
print_info "Quick reference:"
echo "  • Zsh config: ~/dotfiles/.zshrc"
echo "  • Local config: ~/.zshrc_local"
echo "  • Vim config: ~/dotfiles/.vimrc"
echo "  • Tmux config: ~/dotfiles/.tmux.conf"
echo "  • Git config: ~/dotfiles/.gitconfig"
echo ""
print_info "Useful aliases (once zsh is loaded):"
echo "  • zc  - Edit zsh config"
echo "  • zlc - Edit local zsh config"
echo "  • vc  - Edit vim config"
echo "  • tc  - Edit tmux config"
echo "  • zrld - Reload zsh config"
echo ""
print_info "For detailed setup guides, see:"
echo "  • ZSH_SETUP.md"
echo "  • VIM_SETUP.md"
echo "  • TMUX_SETUP.md"
echo ""

if [ "$current_shell" != "zsh" ]; then
    print_warning "Don't forget to start a new shell or log out/in for zsh to become default!"
else
    print_success "Ready to go! Start a new terminal or run: source ~/.zshrc"
fi
