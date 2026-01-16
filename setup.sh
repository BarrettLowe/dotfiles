#!/bin/bash

# Dotfiles Setup Script - 2026 Modern Environment Edition
# Optimized for Headless DevPods/Containers (Zsh + Tmux + Neovim)
# Strategy: Downloads to ~/.build -> Installs to ~/DevTools

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

print_header "Headless Dotfiles Setup Script"
echo "Strategy: Artifacts in ~/.build | Tools in ~/DevTools"
echo "Targeting: CLI Dev Environment (Neovim/LSP/Tmux)"

# Verify we're in the dotfiles directory
if [ ! -f "$PWD/setup.sh" ]; then
    print_error "Please run this script from the dotfiles directory!"
    exit 1
fi

DOTFILES_DIR="$PWD"

# Step 1: Create directory structure
print_header "Step 1: Creating Directory Structure"

# Create build directory for downloads/source/scripts
mkdir -p "$HOME/.build"

# Create DevTools for local installations
mkdir -p "$HOME/DevTools/bin" "$HOME/DevTools/lib" "$HOME/DevTools/lib64" "$HOME/DevTools/share"

# Standard config paths
mkdir -p "$HOME/.config/nvim"
mkdir -p "$HOME/.local/share/nvim"
mkdir -p "$HOME/.local/bin"

print_success "Created ~/.build and ~/DevTools structure"

# Step 2: Create symlinks for dotfiles
print_header "Step 2: Creating Symlinks"

create_symlink() {
    local source="$1"
    local target="$2"
    if [ ! -e "$source" ]; then
        print_error "Source file does not exist: $source"
        return 1
    fi
    ln -sf "$source" "$target"
    print_success "Linked $(basename "$target")"
}

# Core CLI configs
create_symlink "$DOTFILES_DIR/.zshrc" "$HOME/.zshrc"
create_symlink "$DOTFILES_DIR/neovim/init.lua" "$HOME/.config/nvim/init.lua"
create_symlink "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"

# Step 3: Git configuration
print_header "Step 3: Git Configuration"
if [ ! -f "$HOME/.gitconfig" ]; then
    cp "$DOTFILES_DIR/home.gitconfig" "$HOME/.gitconfig" 2>/dev/null || print_warning "No gitconfig template found."
fi

# Step 4: Toolchain Validation
print_header "Step 4: Checking CLI Toolchain"

check_tool() {
    if command -v "$1" &> /dev/null; then
        print_success "$1 is installed"
    else
        print_warning "$1 is missing"
        add_todo "Install $1 ($2)"
    fi
}

check_tool "nvim" "Neovim 0.10+ required"
check_tool "rg" "apt install ripgrep"
check_tool "fd" "apt install fd-find"
check_tool "g++" "apt install build-essential"
check_tool "unzip" "Required for Mason"
check_tool "curl" "Required for downloads"

# Step 5: Provisioning Neovim Python Provider (uv)
print_header "Step 5: Neovim Python Provider (uv)"

# Path update for current session
export PATH="$HOME/.local/bin:$HOME/DevTools/bin:$PATH"

if ! command -v uv &> /dev/null; then
    print_info "Downloading uv installer to ~/.build..."
    curl -LsSf https://astral.sh/uv/install.sh -o "$HOME/.build/uv_install.sh"
    chmod +x "$HOME/.build/uv_install.sh"
    
    print_info "Executing uv installer..."
    # uv installs to ~/.local/bin by default
    sh "$HOME/.build/uv_install.sh"
fi

NVIM_VENV="$HOME/.local/share/nvim/uv-venv"
if [ ! -d "$NVIM_VENV" ]; then
    print_info "Creating provider venv at $NVIM_VENV..."
    uv venv "$NVIM_VENV"
    "$NVIM_VENV/bin/pip" install pynvim
    print_success "Neovim Python provider ready"
else
    print_success "Python provider venv already exists"
fi

# Step 6: Initializing Neovim Plugins
print_header "Step 6: Headless Plugin Sync"
print_info "Bootstrapping lazy.nvim and syncing..."
nvim --headless "+Lazy! sync" +qa 2>/dev/null
print_success "Neovim plugins synchronized"

# Step 7: Local Overrides
if [ ! -f "$HOME/.zshrc_local" ]; then
    touch "$HOME/.zshrc_local"
    print_success "Created empty ~/.zshrc_local"
fi

# Final summary
print_header "Setup Complete! 🎉"

if [ ${#TODO_LIST[@]} -ne 0 ]; then
    print_warning "Manual steps required:"
    for todo in "${TODO_LIST[@]}"; do
        echo -e "${YELLOW}- ${todo}${NC}"
    done
fi

echo -e "\n${GREEN}Run 'source ~/.zshrc' to refresh your environment.${NC}"
