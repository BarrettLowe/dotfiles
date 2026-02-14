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

# Detect OS and Architecture
OS_TYPE=$(uname -s)
ARCH_TYPE=$(uname -m)

# Normalize architecture names
case "$ARCH_TYPE" in
    x86_64|amd64)
        ARCH="x86_64"
        ;;
    aarch64)
        # Keep as aarch64 for Linux binary compatibility
        ARCH="aarch64"
        ;;
    arm64)
        # Keep as arm64 for macOS binary compatibility
        ARCH="arm64"
        ;;
    *)
        print_error "Unsupported architecture: $ARCH_TYPE"
        exit 1
        ;;
esac

# Set OS-specific variables
case "$OS_TYPE" in
    Linux)
        OS="linux"
        PKG_MANAGER="apt"
        ;;
    Darwin)
        OS="darwin"
        PKG_MANAGER="brew"
        ;;
    *)
        print_error "Unsupported OS: $OS_TYPE"
        exit 1
        ;;
esac

# Track what needs to be done manually
TODO_LIST=()

add_todo() {
    TODO_LIST+=("$1")
}

print_header "Headless Dotfiles Setup Script"
echo "Strategy: Artifacts in ~/.build | Tools in ~/DevTools & /opt"
echo "Targeting: CLI Dev Environment (Neovim/LSP/Tmux)"
echo "Detected OS: $OS_TYPE ($OS) | Architecture: $ARCH_TYPE ($ARCH)"

# Verify we're in the dotfiles directory
if [ ! -f "$PWD/setup.sh" ]; then
    print_error "Please run this script from the dotfiles directory!"
    exit 1
fi

DOTFILES_DIR="$PWD"

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
create_symlink "$DOTFILES_DIR/.p10k.zsh" "$HOME/.p10k.zsh"

# Step 3: Toolchain Installation
print_header "Step 3: Provisioning CLI Toolchain"

# Install python via package manager
if ! command -v python3 &> /dev/null; then
    print_info "Installing python via $PKG_MANAGER..."
    if [ "$PKG_MANAGER" = "apt" ]; then
        sudo apt update && sudo apt install -y python3 python3-venv
    elif [ "$PKG_MANAGER" = "brew" ]; then
        brew install python3
    fi
    print_success "python3 installed via $PKG_MANAGER"
fi

if [ "$PKG_MANAGER" = "apt" ] && ! dpkg -s python3-venv &>/dev/null; then
    print_info "Installing python3-venv via apt..."
    sudo apt update && sudo apt install -y python3-venv
    print_success "python3-venv installed via apt"
fi

# Manual Neovim Install
if ! command -v nvim &> /dev/null; then
    print_info "Installing Neovim to /opt..."
    cd "$HOME/.build"
    
    # Construct the correct download URL based on OS and architecture
    if [ "$OS" = "linux" ]; then
        if [ "$ARCH" = "x86_64" ]; then
            NVIM_FILENAME="nvim-linux-x86_64.tar.gz"
            NVIM_DIR="nvim-linux-x86_64"
        elif [ "$ARCH" = "aarch64" ]; then
            NVIM_FILENAME="nvim-linux-arm64.tar.gz"
            NVIM_DIR="nvim-linux-arm64"
        fi
    elif [ "$OS" = "darwin" ]; then
        if [ "$ARCH" = "arm64" ]; then
            NVIM_FILENAME="nvim-macos-arm64.tar.gz"
            NVIM_DIR="nvim-macos-arm64"
        elif [ "$ARCH" = "x86_64" ]; then
            NVIM_FILENAME="nvim-macos-x86_64.tar.gz"
            NVIM_DIR="nvim-macos-x86_64"
        fi
    fi
    
    # Validate that Neovim filename was determined
    if [[ -z "$NVIM_FILENAME" ]] || [[ -z "$NVIM_DIR" ]]; then
        print_error "Unable to determine Neovim download for OS=$OS, ARCH=$ARCH"
        cd "$DOTFILES_DIR"
        return 1
    fi
    
    NVIM_URL="https://github.com/neovim/neovim/releases/latest/download/$NVIM_FILENAME"
    curl -LO "$NVIM_URL"
    sudo rm -rf "/opt/$NVIM_DIR"
    sudo tar -C /opt -xzf "$NVIM_FILENAME"
    print_success "Neovim installed to /opt/$NVIM_DIR"
    # Set path for nvim
    export PATH="/opt/$NVIM_DIR/bin:$PATH"
    cd "$DOTFILES_DIR"
fi

# Install a clipboard tool for the devcontainer to connect to the host
# wl-clipboard is Linux-specific; macOS has pbcopy/pbpaste built-in
if [ "$OS" = "linux" ] && ! command -v wl-copy &> /dev/null; then
    print_info "Installing wl-clipboard via apt..."
    sudo apt update && sudo apt install -y wl-clipboard
    print_success "wl-clipboard installed via apt"
fi

# # Manual TreeSitter Install
# if ! command -v tree-sitter &> /dev/null; then
#     print_info "Installing tree-sitter to DevTools"
#     mkdir -p "$HOME/.build/tree-sitter"
#     cd "$HOME/.build/tree-sitter"
#     curl -LO https://github.com/tree-sitter/tree-sitter/releases/download/v0.26.3/tree-sitter-linux-x86.gz
#     gunzip tree-sitter-linux-x86.gz
#     cp tree-sitter-linux-x86 "$HOME/DevTools/bin/tree-sitter"
#     chmod +x "$HOME/DevTools/bin/tree-sitter"
#     print_success "Installed tree-sitter"
#     cd "$DOTFILES_DIR"
# fi

# Helper for GH releases (rg, fd)
install_gh_release() {
    local repo=$1
    local bin_name=$2
    
    print_info "Finding latest release for $bin_name ($repo)..."
    
    # Construct pattern based on OS and architecture
    local pattern=""
    if [ "$OS" = "linux" ]; then
        if [ "$ARCH" = "x86_64" ]; then
            pattern="x86_64-unknown-linux-musl.tar.gz"
        elif [ "$ARCH" = "aarch64" ]; then
            pattern="aarch64-unknown-linux-musl.tar.gz"
        fi
    elif [ "$OS" = "darwin" ]; then
        if [ "$ARCH" = "x86_64" ]; then
            pattern="x86_64-apple-darwin.tar.gz"
        elif [ "$ARCH" = "arm64" ]; then
            pattern="aarch64-apple-darwin.tar.gz"
        fi
    fi
    
    # Validate that a pattern was constructed
    if [[ -z "$pattern" ]]; then
        print_error "Unable to determine binary pattern for OS=$OS, ARCH=$ARCH"
        return 1
    fi
    
    local url=$(curl -s "https://api.github.com/repos/$repo/releases/latest" \
        | grep "browser_download_url" \
        | grep -E "$pattern" \
        | head -n 1 \
        | cut -d '"' -f 4)
    
    if [[ -z "$url" ]]; then
        print_error "Could not find download URL for $bin_name with pattern: $pattern"
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

[[ ! $(command -v rg) ]] && install_gh_release "BurntSushi/ripgrep" "rg"
[[ ! $(command -v fd) ]] && install_gh_release "sharkdp/fd" "fd"

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
    uv pip install pynvim --python "$NVIM_VENV/bin/python"
    uv tool install "cmake-language-server" --with "pygls<2.0.0" # cmake-language-server is not compatible with current pygls
fi

# Step 5: Initializing Neovim Plugins
print_header "Step 5: Headless Plugin Sync"
nvim --headless "+Lazy! sync" +qa 2>/dev/null
print_success "Plugins synchronized"

# Step 6: Setup Oh My Zsh and themes
if [ -d "$HOME/.oh-my-zsh" ]; then
    echo "Keep calm and carry on: Oh My Zsh is already installed."
else
    echo "Installing Oh My Zsh..."
    
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

    if [ $? -eq 0 ]; then
        echo "✅ Oh My Zsh installed successfully."
    else
        echo "❌ Oh My Zsh installation failed."
        exit 1
    fi
fi
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"


# Final summary
print_header "Setup Complete! 🎉"
echo -e "${GREEN}Toolchain is now provisioned.${NC}"
echo -e "Note: Neovim is in /opt/nvim-*/bin"
echo -e "Run 'source ~/.zshrc' to refresh PATH."
