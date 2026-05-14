#!/bin/bash

# Dotfiles Setup Script - macOS
# Installs via Homebrew. Mirrors setup.sh structure.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}===================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================================${NC}\n"
}

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }
print_info()    { echo -e "${BLUE}ℹ${NC} $1"; }

if [ ! -f "$PWD/setup-mac.sh" ] && [ ! -f "$PWD/setup.sh" ]; then
    print_error "Please run this script from the dotfiles directory!"
    exit 1
fi

DOTFILES_DIR="$PWD"

# Step 1: Directory structure
print_header "Step 1: Creating Directory Structure"
mkdir -p "$HOME/.build"
mkdir -p "$HOME/.local/share/nvim"
mkdir -p "$HOME/.local/bin"
print_success "Created local directory structure"

# Step 2: Symlinks
print_header "Step 2: Creating Symlinks"
create_symlink() {
    local source="$1"
    local target="$2"
    if [ ! -e "$source" ]; then
        print_error "Source file does not exist: $source"
        return 1
    fi
    mkdir -p "$(dirname "$target")"
    ln -sf "$source" "$target"
    print_success "Linked $(basename "$target")"
}

create_symlink "$DOTFILES_DIR/.zshrc"    "$HOME/.zshrc"
create_symlink "$DOTFILES_DIR/neovim"    "$HOME/.config/nvim"
create_symlink "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"
create_symlink "$DOTFILES_DIR/.p10k.zsh" "$HOME/.p10k.zsh"

# Claude Code
mkdir -p "$HOME/.claude"
create_symlink "$DOTFILES_DIR/claude/CLAUDE_.md"   "$HOME/.claude/CLAUDE.md"
create_symlink "$DOTFILES_DIR/claude/skills"       "$HOME/.claude/skills"
create_symlink "$DOTFILES_DIR/claude/settings.json" "$HOME/.claude/settings.json"
create_symlink "$DOTFILES_DIR/claude/agents"       "$HOME/.claude/agents"
create_symlink "$DOTFILES_DIR/claude/rules"        "$HOME/.claude/rules"

# GitHub Copilot CLI
mkdir -p "$HOME/.config/github-copilot"
create_symlink "$DOTFILES_DIR/copilot/agents" "$HOME/.config/github-copilot/agents"

# Step 3: Homebrew packages
print_header "Step 3: Provisioning CLI Toolchain (Homebrew)"

if ! command -v brew &>/dev/null; then
    print_error "Homebrew is not installed. Install it from https://brew.sh then re-run."
    exit 1
fi

BREW_PKGS=()
! command -v nvim        &>/dev/null && BREW_PKGS+=(neovim)
! command -v rg          &>/dev/null && BREW_PKGS+=(ripgrep)
! command -v fd          &>/dev/null && BREW_PKGS+=(fd)
! brew list luarocks     &>/dev/null 2>&1 && BREW_PKGS+=(luarocks)
! command -v python3     &>/dev/null && BREW_PKGS+=(python3)

if [[ ${#BREW_PKGS[@]} -gt 0 ]]; then
    print_info "Installing brew packages: ${BREW_PKGS[*]}..."
    brew install "${BREW_PKGS[@]}"
    print_success "Brew packages installed"
else
    print_success "All brew packages already present"
fi

# Step 4: Neovim Python Provider (uv)
print_header "Step 4: Neovim Python Provider (uv)"
if ! command -v uv &>/dev/null; then
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
    uv tool install "cmake-language-server" --with "pygls<2.0.0"
fi

PERSONAL_VENV="$HOME/.local/share/python/venv"
if [ ! -d "$PERSONAL_VENV" ]; then
    print_info "Creating personal venv at $PERSONAL_VENV..."
    uv venv "$PERSONAL_VENV"
fi
if [ -s "$DOTFILES_DIR/python-packages.txt" ]; then
    print_info "Installing personal Python packages..."
    grep -v '^\s*#' "$DOTFILES_DIR/python-packages.txt" | grep -v '^\s*$' | \
        xargs uv pip install --python "$PERSONAL_VENV/bin/python"
    print_success "Personal packages installed"
fi
if [ -s "$DOTFILES_DIR/python-tools.txt" ]; then
    print_info "Installing Python tools..."
    while IFS= read -r pkg; do
        [[ -z "$pkg" || "$pkg" == \#* ]] && continue
        uv tool install "$pkg" &
    done < "$DOTFILES_DIR/python-tools.txt"
    wait
    print_success "Python tools installed"
fi

# Step 5: Neovim plugins
print_header "Step 5: Headless Plugin Sync"
nvim --headless "+Lazy! sync" +qa 2>/dev/null
print_success "Plugins synchronized"

# Step 6: Oh My Zsh + Powerlevel10k
print_header "Step 6: Oh My Zsh and Themes"
if [ -d "$HOME/.oh-my-zsh" ]; then
    print_success "Oh My Zsh already installed"
else
    print_info "Installing Oh My Zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
    print_success "Oh My Zsh installed"
fi
[[ ! -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k" ]] && \
    git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"

# # Step 7: Node.js via nvm + Claude Code CLI
# print_header "Step 7: Node.js and Claude Code CLI"
# if [ ! -d "$HOME/.nvm" ]; then
#     print_info "Installing nvm..."
#     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
#     print_success "nvm installed"
# else
#     print_success "nvm already present"
# fi
#
# export NVM_DIR="$HOME/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
#
# if ! command -v node &>/dev/null; then
#     print_info "Installing Node.js LTS..."
#     nvm install --lts
#     print_success "Node.js $(node --version) installed"
# else
#     print_success "Node.js $(node --version) already present"
# fi

if ! command -v claude &>/dev/null; then
    print_info "Installing Claude Code CLI..."
    curl -fsSL https://claude.ai/install.sh | bash
    print_success "Claude Code installed"
else
    print_success "Claude Code already present"
fi

print_header "Setup Complete!"
echo -e "${GREEN}Run 'source ~/.zshrc' to refresh PATH.${NC}"
