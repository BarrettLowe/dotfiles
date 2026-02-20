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
export PATH="$HOME/.local/bin:$HOME/DevTools/bin:$PATH"

# Step 1: Create directory structure
print_header "Step 1: Creating Directory Structure"
mkdir -p "$HOME/.build"
mkdir -p "$HOME/DevTools/bin" "$HOME/DevTools/lib" "$HOME/DevTools/share"
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

create_symlink "$DOTFILES_DIR/.zshrc" "$HOME/.zshrc"
create_symlink "$DOTFILES_DIR/neovim/init.lua" "$HOME/.config/nvim/init.lua"
create_symlink "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"

# Step 3: Toolchain Installation (Strategy: Build/Download -> DevTools)
print_header "Step 3: Provisioning CLI Toolchain"

# Helper for GH releases
install_gh_release() {
    local repo=$1
    local pattern=$2
    local bin_name=$3
    
    print_info "Installing $bin_name from $repo..."
    # Get latest release download URL via curl/grep
    local url=$(curl -s https://api.github.com/repos/$repo/releases/latest | grep "browser_download_url" | grep "$pattern" | cut -d '"' -f 4)
    local filename=$(basename "$url")
    
    curl -LsSf "$url" -o "$HOME/.build/$filename"
    
    if [[ $filename == *.tar.gz ]]; then
        tar -xzf "$HOME/.build/$filename" -C "$HOME/.build/"
    elif [[ $filename == *.zip ]]; then
        unzip -q "$HOME/.build/$filename" -d "$HOME/.build/"
    fi
    
    # Custom movement logic per tool
    case $bin_name in
        "nvim")
            cp -r "$HOME/.build/nvim-linux64/"* "$HOME/DevTools/"
            ;;
        "rg")
            find "$HOME/.build" -name "rg" -type f -exec cp {} "$HOME/DevTools/bin/" \;
            ;;
        "fd")
            find "$HOME/.build" -name "fd" -type f -exec cp {} "$HOME/DevTools/bin/" \;
            ;;
        "clangd")
            # clangd releases usually have a bin/ folder inside the zip
            local clangd_dir=$(find "$HOME/.build" -name "clangd_*" -type d | head -n 1)
            cp -r "$clangd_dir/"* "$HOME/DevTools/"
            ;;
    esac
    print_success "$bin_name installed to ~/DevTools/bin"
}

# Install missing tools
[[ ! $(command -v nvim) ]] && install_gh_release "neovim/neovim" "nvim-linux64.tar.gz" "nvim"
[[ ! $(command -v rg) ]]   && install_gh_release "BurntSushi/ripgrep" "x86_64-unknown-linux-musl.tar.gz" "rg"
[[ ! $(command -v fd) ]]   && install_gh_release "sharkdp/fd" "x86_64-unknown-linux-musl.tar.gz" "fd"
[[ ! $(command -v clangd) ]] && install_gh_release "clangd/clangd" "linux.zip" "clangd"

# Step 4: Neovim Python Provider (uv)
print_header "Step 4: Neovim Python Provider (uv)"
if ! command -v uv &> /dev/null; then
    print_info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh -o "$HOME/.build/uv_install.sh"
    chmod +x "$HOME/.build/uv_install.sh"
    sh "$HOME/.build/uv_install.sh"
fi

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
echo -e "${GREEN}Toolchain is now provisioned in ~/DevTools/bin${NC}"
echo -e "Run 'source ~/.zshrc' to refresh PATH."
