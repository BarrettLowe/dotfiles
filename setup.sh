#!/bin/bash

# Dotfiles Setup Script - 2026 Modern Environment Edition
# Optimized for Headless DevPods/Containers (Zsh + Tmux + Neovim)
# Strategy: Downloads to ~/.build -> Installs to ~/DevTools (except nvim in /opt)

if [[ "$(uname -s)" == "Darwin" ]]; then
    exec "$(dirname "$0")/setup-mac.sh" "$@"
fi

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

# Step 1: Create directory structure
print_header "Step 1: Creating Directory Structure"
mkdir -p "$HOME/.build"
mkdir -p "$HOME/DevTools/bin" "$HOME/DevTools/lib" "$HOME/DevTools/share"
mkdir -p "$HOME/.local/share/nvim"
mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/.config"
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
    ln -sfn "$source" "$target"
    print_success "Linked $(basename "$target")"
}

create_symlink "$DOTFILES_DIR/.zshrc" "$HOME/.zshrc"
create_symlink "$DOTFILES_DIR/neovim" "$HOME/.config/nvim"
create_symlink "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"
create_symlink "$DOTFILES_DIR/.p10k.zsh" "$HOME/.p10k.zsh"

# Wayland desktop: sway compositor + waybar status bar. Both are whole-directory
# symlinks, so scripts/ and style.css come along with the config files.
create_symlink "$DOTFILES_DIR/sway" "$HOME/.config/sway"
create_symlink "$DOTFILES_DIR/waybar" "$HOME/.config/waybar"
create_symlink "$DOTFILES_DIR/mako" "$HOME/.config/mako"

# VS Code colour theme. Packaged and installed rather than symlinked — see the
# comment in vscode/install.sh for why a symlink does not work. No-ops when
# VS Code is not installed on this machine.
bash "$DOTFILES_DIR/vscode/install.sh" || print_info "VS Code theme install skipped"

# VS Code user settings + keybindings. Note: VS Code writes settings.json by
# replacing the file, which can turn these symlinks back into regular files.
# If your settings stop tracking, re-run setup.sh.
if [ -d "$HOME/.config/Code/User" ]; then
    create_symlink "$DOTFILES_DIR/vscode/User/settings.json" "$HOME/.config/Code/User/settings.json"
    create_symlink "$DOTFILES_DIR/vscode/User/keybindings.json" "$HOME/.config/Code/User/keybindings.json"
fi

# Claude Code + pi agent (shared skills/agents/rules/commands live in ai/)
mkdir -p "$HOME/.claude"
bash "$DOTFILES_DIR/ai/sync.sh"
create_symlink "$DOTFILES_DIR/ai/claude/settings.json" "$HOME/.claude/settings.json"
print_success "AI harness config synced"

# GitHub Copilot CLI
mkdir -p "$HOME/.config/github-copilot"
create_symlink "$DOTFILES_DIR/copilot/agents" "$HOME/.config/github-copilot/agents"

# Foot terminal
mkdir -p "$HOME/.config/foot"
create_symlink "$DOTFILES_DIR/foot/foot.ini" "$HOME/.config/foot/foot.ini"
# Seed theme-colors.ini from current ~/.theme (default: dark)
_THEME=$(cat "$HOME/.theme" 2>/dev/null || echo "dark")
ln -sf "$DOTFILES_DIR/foot/colors-$_THEME.ini" "$HOME/.config/foot/theme-colors.ini"
print_success "Foot config linked (theme: $_THEME)"

# AGENTS.md -> ai/CLAUDE_.md (single source of truth for opencode + claude code)
if [ ! -L "$DOTFILES_DIR/AGENTS.md" ]; then
    rm -f "$DOTFILES_DIR/AGENTS.md"
    ln -sf "ai/CLAUDE_.md" "$DOTFILES_DIR/AGENTS.md"
    print_success "Linked AGENTS.md -> ai/CLAUDE_.md"
fi

# Step 3: Toolchain Installation
print_header "Step 3: Provisioning CLI Toolchain"

# Batch all apt installs into a single update + install. No Homebrew here:
# this script now targets root-friendly contexts (a dedicated toolchain Docker
# image, devpods running as root) where apt is simpler and faster than brew's
# Ruby-driven dependency resolution / occasional from-source fallback. Use
# sudo only if we're not already root (and sudo exists) so this still works
# unmodified inside a root-only container.
if [[ $EUID -ne 0 ]] && command -v sudo &>/dev/null; then
    APT_CMD=(sudo apt-get)
else
    APT_CMD=(apt-get)
fi

APT_PKGS=()
! command -v python3 &>/dev/null && APT_PKGS+=(python3)
! dpkg -s python3-venv &>/dev/null 2>&1 && APT_PKGS+=(python3-venv)
! dpkg -s luarocks &>/dev/null 2>&1 && APT_PKGS+=(luarocks)
! command -v wl-copy &>/dev/null && APT_PKGS+=(wl-clipboard)

if [[ ${#APT_PKGS[@]} -gt 0 ]]; then
    print_info "Installing apt packages: ${APT_PKGS[*]}..."
    "${APT_CMD[@]}" update && "${APT_CMD[@]}" install -y "${APT_PKGS[@]}"
    print_success "apt packages installed"
fi

# Manual Neovim Install (static binary from GitHub releases)
if ! command -v nvim &> /dev/null; then
    print_info "Installing Neovim to ~/DevTools..."
    (
        cd "$HOME/.build"
        curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz
        mkdir -p $HOME/DevTools
        rm -rf $HOME/DevTools/nvim-linux-x86_64
        tar -C $HOME/DevTools -xzf nvim-linux-x86_64.tar.gz
    )
    print_success "Neovim installed to $HOME/DevTools/nvim-linux-x86_64"
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

{ [[ ! $(command -v rg) ]] && install_gh_release "BurntSushi/ripgrep" "x86_64-unknown-linux-musl.tar.gz" "rg"; } &
{ [[ ! $(command -v fd) ]] && install_gh_release "sharkdp/fd" "x86_64-unknown-linux-musl.tar.gz" "fd"; } &
wait

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
    uv pip install pynvim --python "$NVIM_VENV/bin/python"
    uv tool install "cmake-language-server" --with "pygls<2.0.0" # cmake-language-server is not compatible with current pygls
fi

# Personal venv for importable packages
PERSONAL_VENV="$HOME/.local/share/python/venv"
if [ ! -d "$PERSONAL_VENV" ]; then
    print_info "Creating personal venv at $PERSONAL_VENV..."
    uv venv "$PERSONAL_VENV"
fi
if [ -s "$DOTFILES_DIR/python-packages.txt" ]; then
    print_info "Installing personal Python packages..."
    grep -v '^\s*#' "$DOTFILES_DIR/python-packages.txt" | grep -v '^\s*$' | \
        xargs -r uv pip install --python "$PERSONAL_VENV/bin/python"
    print_success "Personal packages installed"
fi

# Standalone tools
if [ -s "$DOTFILES_DIR/python-tools.txt" ]; then
    print_info "Installing Python tools..."
    while IFS= read -r pkg; do
        [[ -z "$pkg" || "$pkg" == \#* ]] && continue
        uv tool install "$pkg" &
    done < "$DOTFILES_DIR/python-tools.txt"
    wait
    print_success "Python tools installed"
fi

# Graphify: version-pinned separately so failures are visible (not swallowed by background loop)
_GRAPHIFY_VER=$(cat "$DOTFILES_DIR/ai/skills/graphify/.graphify_version" 2>/dev/null)
_GRAPHIFY_PKG="graphifyy${_GRAPHIFY_VER:+==$_GRAPHIFY_VER}"
if ! command -v graphify &>/dev/null; then
    print_info "Installing graphify${_GRAPHIFY_VER:+ v$_GRAPHIFY_VER}..."
    uv tool install "$_GRAPHIFY_PKG"
    print_success "graphify installed"
else
    print_success "graphify already present"
fi

# Step 5: Initializing Neovim Plugins
print_header "Step 5: Headless Plugin Sync"
nvim --headless "+Lazy! sync" +qa 2>/dev/null
print_success "Plugins synchronized"
# Compile markdown parsers explicitly — Lazy sync runs :TSUpdate for the plugin
# but does not install missing parser binaries. Without these, Neovim 0.10+'s
# built-in injection pipeline hits a nil node on every .md buffer open.
nvim --headless "+TSInstall! markdown markdown_inline" +qa 2>/dev/null
print_success "Treesitter markdown parsers compiled"

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
[[ ! -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k" ]] && \
    git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"


# Step 7: Node.js via nvm and Claude Code CLI
print_header "Step 7: Node.js and Claude Code CLI"

# Install nvm
if [ ! -d "$HOME/.nvm" ]; then
    print_info "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    print_success "nvm installed"
else
    print_success "nvm already present"
fi

# Source nvm for this session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js LTS if not available
if ! command -v node &>/dev/null; then
    print_info "Installing Node.js LTS..."
    nvm install --lts
    print_success "Node.js $(node --version) installed"
else
    print_success "Node.js $(node --version) already present"
fi

# Install Claude Code CLI (opt-in via --with-claude)
if [[ " $* " == *" --with-claude "* ]]; then
    if ! command -v claude &>/dev/null; then
        print_info "Installing Claude Code CLI..."
        curl -fsSL https://claude.ai/install.sh | bash 
        print_success "Claude Code installed"
    else
        print_success "Claude Code $(claude --version 2>/dev/null || echo '') already present"
    fi
else
    print_info "Skipping Claude Code CLI (pass --with-claude to install)"
fi

# Final summary
print_header "Setup Complete! 🎉"
echo -e "${GREEN}Toolchain is now provisioned.${NC}"
echo -e "Note: Neovim/rg/fd are GitHub-release binaries in $HOME/DevTools; python3/luarocks/wl-clipboard are apt packages"
echo -e "Run 'source ~/.zshrc' to refresh PATH."
