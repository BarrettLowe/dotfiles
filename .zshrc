# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Basic environment settings
export EDITOR=nvim
export KEYTIMEOUT=40
HISTSIZE=1000000
SAVEHIST=1000000

# PATH configuratioindex() {
#ctags -Rbindkey -M vicmd "L" end-of-line
bindkey -M vicmd "H" beginning-of-line
bindkey "^_" vi-undo-change                      # Ctrl+/
bindkey -M vicmd "ciw" kill-word

# Don't exit shell on Ctrl+D
set -o ignoreeof

## Visual indicator for vi mode
#function zle-line-init zle-keymap-select {cope -bvRb
#}

# ZLE key bindings
bindkey "[6~" history-beginning-search-forward   # Page Down
bindkey "[5~" history-beginning-search-backward  # Page Up
bindkey "^j" history-beginning-search-forward
bindkey "^k" history-beginning-search-backward
bindkey "[3~" delete-char                        # Delete
bindkey -M viins "^?" backward-delete-char       # Backspaces if they exist
typeset -U path
[[ -d "/opt/nvim-linux-x86_64/bin" ]] && path=("/opt/nvim-linux-x86_64/bin" $path)
[[ -d "$HOME/.local/bin" ]] && path=("$HOME/.local/bin" $path)
[[ -d "$HOME/DevTools/bin" ]] && path=("$HOME/DevTools/bin" $path)
[[ -d "/usr/local/bin" ]] && path=("/usr/local/bin" $path)
export PATH
# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
ZSH_THEME="powerlevel10k/powerlevel10k"

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion. Case
# sensitive completion must be off. _ and - will be interchangeable.
HYPHEN_INSENSITIVE="true"

# Uncomment the following line to disable bi-weekly auto-update checks.
DISABLE_AUTO_UPDATE="false"

# Uncomment the following line to change how often to auto-update (in days).
# export UPDATE_ZSH_DAYS=13

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# The optional three formats: "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(themes tmux git)

# User configuration
# Set DEFAULT_USER to hide username@hostname in prompt when you're the default user
DEFAULT_USER=$(whoami)

source $ZSH/oh-my-zsh.sh
# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# ssh
# export SSH_KEY_PATH="~/.ssh/dsa_id"

# The following lines were added by compinstall
zstyle ':completion:*' completer _complete _ignored
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z} r:|[-_./]=** r:|=**' '+l:|=* r:|=*'
# Alternative matcher (commented):
# zstyle ':completion:*' matcher-list 'm:{[:lower:]}={[:upper:]} m:{[:lower:][:upper:]}={[:upper:][:lower:]} r:|[._-]=** r:|=**'
zstyle :compinstall filename "$HOME/.zshrc"

autoload -Uz compinit
compinit
# End of lines added by compinstall



# Set personal aliases, overriding those provided by oh-my-zsh libs,
# plugins, and themes. Aliases can be placed here, though oh-my-zsh
# users are encouraged to define aliases within the ZSH_CUSTOM folder.
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"

# When using remote desktop don't screw up colors
# if [[ -n $SSH_CONNECTION ]]; then
alias tmux="TERM=xterm-256color tmux"
# fi

# Config file shortcuts
alias zc="$EDITOR ~/dotfiles/.zshrc"
alias zlc="$EDITOR ~/.zshrc_local"
alias vc="$EDITOR ~/dotfiles/neovim/init.lua"
alias tc="$EDITOR ~/dotfiles/.tmux.conf"
alias v="$EDITOR"
# Alternative if you prefer neovim:
# alias vim="nvim"
alias zrld="source ~/.zshrc"

# MATLAB (if installed)
alias rmat='matlab -nodesktop -nosplash -nosoftwareopengl'

# Grep with color
alias grep='grep --color=auto'
alias gi='grep -ri'
alias gil='grep -ril'

# Find shortcuts
alias f='find -name'
alias fin='find -iname'

# Git shortcuts
alias gs='git status'
alias gdd='git difftool -d'

# ctags
alias mktags='ctags -R --sort=yes --fields=+iaS --extra=+q .'

# Find utilities
alias findBin="find -type f -executable -exec file -i \'{}\' \; | grep \'charset=binary\'"
alias findExt='find . -type f | perl -ne "print \$1 if m/(\\.[^.\\/]+)\$/" | sort -u'

# Directories
alias dev="cd $HOME/Development"
alias dt="cd $HOME/DevTools"


# Enable vi mode
bindkey -v

# Pipe command output to vim
vt (){
    "$@" | vim -
}

vimDirDiff()
{
    echo "Please wait while vim diffs the files"
    local args=$@
    vim -f "+execute \"DirDiff $args\""
    echo "Thanks for using vimDirDiff"
}

# Index a project with ctags and cscope
index() {
    ctags -R
    cscope -bvRb
}

#ZLE BINDINGS
bindkey "[6~" history-beginning-search-forward
bindkey "[5~" history-beginning-search-backward
bindkey "^j" history-beginning-search-forward
bindkey "" history-beginning-search-backward 
bindkey "[3~" delete-char
bindkey -M viins "" backward-delete-char
bindkey -M vicmd "L" end-of-line
bindkey -M vicmd "H" beginning-of-line
bindkey "" vi-undo-change
bindkey -M vicmd "ciw" kill-word

set -o ignoreeof

function zle-line-init zle-keymap-select {
    RPS1="${${KEYMAP/vicmd/-- CMD --}/(main|viins)/-- INS --}"
    RPS2=$RPS1
    zle reset-prompt
}
zle -N zle-line-init
zle -N zle-keymap-select

# Edit command line in vim with 'v' in normal mode
autoload -U edit-command-line
zle -N edit-command-line
bindkey -M vicmd 'v' edit-command-line
bindkey -M viins "jk" vi-cmd-mode

# Auto-attach to tmux (only for interactive shells)
#if [[ $- == *i* ]] && [[ -z "$TMUX" ]] && command -v tmux >/dev/null 2>&1; then
if [[ "$TERM_PROGRAM" != "vscode" ]] && [[ -z "$TMUX" ]]; then
    if tmux has-session -t Pasta 2>/dev/null; then
        if tmux has-session -t Salad 2>/dev/null; then
            tmux attach-session -d -t Pasta
        else
            tmux new-session -s Salad
        fi
    else 
        tmux new-session -s Pasta
    fi
fi

# Load local configurations (system-specific settings)
if [[ -f "$HOME/.zshrc_local" ]]; then
    source "$HOME/.zshrc_local"
fi

# . "$HOME/.local/bin/env"

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

if [[ -n "$REMOTE_CONTAINERS" || -n "$DEVPOD" || -f /.dockerenv ]]; then
    # Show icon and hostname when in a remote container
    typeset -g POWERLEVEL9K_CONTEXT_DEFAULT_CONTENT_EXPANSION=' %m'
    unset POWERLEVEL9K_CONTEXT_DEFAULT_VISUAL_IDENTIFIER_EXPANSION
fi
