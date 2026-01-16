#!/bin/bash

# Dotfiles Setup Script - 2026 Modern Environment Edition
# Optimized for Headless DevPods/Containers (Zsh + Tmux + Neovim)
# Strategy: Downloads to ~/.build -> Installs to ~/DevTools (except nvim in /opt)

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
echo "Strategy: Artifacts in ~/.build | Tools in ~/DevTools & /opt"
echo "Targeting: CLI Dev Environment (Neovim/LSP/Tmux)"

# Verify we're in the dotfiles directory
if [ ! -f "$PWD/setup.sh" ]; then
    print_error "Please run this script from the dotfiles directory!"
    exit 1
fi

DOTFILES_DIR="$PWD"
# Update PATH for the current session to include /opt/nvim/bin and DevTools
export PATH="/opt/nvim-linux-x86_64/bin:$HOME/.local/bin:$HOME/DevTools/bin:$PATH"

# Step 1: Create directory structure
print_header "Step 1: Creating Directory Structure"
mkdir -p "$HOME/.build"
mkdir -p "$HOME/DevTools/bin" "$HOME/DevTools/lib" "$HOME/DevTools/share"
mkdir -p "$HOME/.config/nvim"
mkdir -p "$HOME/.local/share/nvim"
mkdir -p "$HOME/.local/bin"
print_success "Created local directory structure"

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

create_symlink "$DOTFILES_DIR/.zshrc" "$HOME/.zshrc"
create_symlink "$DOTFILES_DIR/neovim/init.lua" "$HOME/.config/nvim/init.lua"
create_symlink "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"

# Step 3: Toolchain Installation
print_header "Step 3: Provisioning CLI Toolchain"

# Install clangd via apt for system header reliability
if ! command -v clangd &> /dev/null; then
    print_info "Installing clangd via apt..."
    sudo apt update && sudo apt install -y clangd
    print_success "clangd installed via apt"
fi

# Manual Neovim Install (Your preferred method)
if ! command -v nvim &> /dev/null; then
    print_info "Installing Neovim to /opt..."
    cd "$HOME/.build"
    curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz
    sudo rm -rf /opt/nvim-linux-x86_64
    sudo tar -C /opt -xzf nvim-linux-x86_64.tar.gz
    print_success "Neovim installed to /opt/nvim-linux-x86_64"
    cd "$DOTFILES_DIR"
fi

# Helper for GH releases (rg, fd)
install_gh_release() {
    local repo=$1
    local pattern=$2
    local bin_name=$3
    
    print_info "Finding latest release for $bin_name ($repo)..."
    local url=$(curl -s "https://api.github.com/repos/$repo/releases/latest" \
        | grep "browser_download_url" \
        | grep -E "$pattern" \
        | head -n 1 \
        | cut -d '"' -f 4)
    
    if [[ -z "$url" ]]; then
        print_error "Could not find download URL for $bin_name"
        return 1
    fi

    local filename=$(basename "$url")
    curl -LsSf "$url" -o "$HOME/.build/$filename"
    
    if [[ $filename == *.tar.gz ]]; then
        tar -xzf "$HOME/.build/$filename" -C "$HOME/.build/"
    elif [[ $filename == *.zip ]]; then
        unzip -q -o "$HOME/.build/$filename" -d "$HOME/.build/"
    fi
    
    find "$HOME/.build" -name "$bin_name" -type f -executable -exec cp {} "$HOME/DevTools/bin/" \;
    print_success "$bin_name installed to ~/DevTools/bin"
}

[[ ! $(command -v rg) ]] && install_gh_release "BurntSushi/ripgrep" "x86_64-unknown-linux-musl.tar.gz" "rg"
[[ ! $(command -v fd) ]] && install_gh_release "sharkdp/fd" "x86_64-unknown-linux-musl.tar.gz" "fd"

# Step 4: Neovim Python Provider (uv)
print_header "Step 4: Neovim Python Provider (uv)"
if ! command -v uv &> /dev/null; then
    print_info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh -o "$HOME/.build/uv_install.sh"
    chmod +x "$HOME/.build/uv_install.sh"
    sh "$HOME/.build/uv_install.sh"
fi

export PATH="$HOME/.local/bin:$PATH"
NVIM_VENV="$HOME/.local/share/nvim/uv-venv"
if [ ! -d "$NVIM_VENV" ]; then
    print_info "Creating provider venv at $NVIM_VENV..."
    uv venv "$NVIM_VENV"
    "$NVIM_VENV/bin/pip" install pynvim
fi

# Step 5: Initializing Neovim Plugins
print_header "Step 5: Headless Plugin Sync"
nvim --headless "+Lazy! sync" +qa 2>/dev/null
print_success "Plugins synchronized"

# Final summary
print_header "Setup Complete! 🎉"
echo -e "${GREEN}Toolchain is now provisioned.${NC}"
echo -e "Note: Neovim is in /opt/nvim-linux-x86_64/bin"
echo -e "Run 'source ~/.zshrc' to refresh PATH."
