# path to your oh-my-zsh installation.
export ZSH=$HOME/.oh-my-zsh
typeset -U LD_LIBRARY_PATH
export LD_LIBRARY_PATH=$HOME/DevTools/lib:$LD_LIBRARY_PATH
export LD_LIBRARY_PATH=$HOME/DevTools/lib64:$LD_LIBRARY_PATH
# export LD_LIBRARY_PATH=/apps/gcc_5.3.0/lib:$LD_LIBRARY_PATH
# export LD_LIBRARY_PATH=/apps/gcc_5.3.0/lib64:$LD_LIBRARY_PATH
export PERL5LIB=$HOME/DevTools/lib64/perl5:$PERL5LIB
export EDITOR=vim
export KEYTIMEOUT=40
export ESP_MAKEFILE_LOCATION=$HOME/Documents/Arduino/makeEspArduino
export ESP_ROOT=$HOME/esp8266
export LIGHTSAIL=54.69.196.211
typeset -U MANPATH
export MANPATH=$HOME/DevTools/share/man:$HOME/DevTools/man:$MANPATH
typeset -U path
path=($HOME/anaconda3/bin $path)
export PATH=$HOME/DevTools/bin:$HOME/bin:/usr/local/bin:/apps/matlab_r2015b/bin:/apps/gcc_5.3.0/bin:$PATH
# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
ZSH_THEME="half-life"

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
DEFAULT_USER=$(whoami) # this is to shorten the zsh prompt - may cause issues
export PATH="$HOME/DevTools/bin:/home/$(whoami)/anaconda3/bin:$HOME/bin:/usr/local/bin:$PATH"
# export MANPATH="/usr/local/man:$MANPATH"

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

# zstyle ':completion:*' matcher-list 'm:{[:lower:]}={[:upper:]} m:{[:lower:][:upper:]}={[:upper:][:lower:]} r:|[._-]=** r:|=**'
zstyle :compinstall filename "/home/$(whoami)/.zshrc"

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

# when using remote desktop don't screw up colors
# if [[ -e $SSH_CONNECTION ]]; then
alias tmux="TERM=xterm-256color tmux"
# fi

alias zc="$EDITOR ~/dotfiles/.zshrc"
alias vc="$EDITOR ~/dotfiles/.vimrc"
alias tc="$EDITOR ~/dotfiles/.tmux.conf"
alias v="nvim"
# alias espmake="make -f $ESP_MAKEFILE_LOCATION/makeEspArduino.mk BOARD=nodemcuv2"
alias espmake="make -f $ESP_MAKEFILE_LOCATION/makeEspArduino.mk"

alias zc="vim ~/dotfiles/.zshrc"
alias vc="vim ~/dotfiles/.vimrc"
alias tc="vim ~/dotfiles/.tmux.conf"
alias v="vim"
alias vim="nvim"
alias zrld="source ~/.zshrc"
# alias gi='grep -ri'
# alias gil='grep -ril'
# alias gl='grep -rl'

alias rmat='matlab -nodesktop -nosplash -nosoftwareopengl'

alias grep='grep --color=auto'
alias gi='grep -ri'
alias gil='grep -ril'

alias f='find -name'
alias fin='find -iname'

alias sco='svn checkout'
alias sc='svn commit'
alias ss='svn stat'
alias sd='svn diff'
# alias scp='svn copy'
alias srm='svn remove'
alias sa='svn add'

alias gs='git status'
alias gdd='git difftool -d'

alias mktags='ctags -R --sort=yes --fields=+iaS --extra=+q .'

alias findBin="find -type f -executable -exec file -i \'{}\' \; | grep \'charset=binary\'"
alias findExt='find . -type f | perl -ne "print $1 if m/(\\.[^.\\/]+)$/\" | sort -u'
# function findExt() {
#     find . -type f | perl -ne \'print $1 if m/(\\.[^.\\/]+)$/\' | sort -u
# }

bindkey -v

# vimthis
vt (){
    "$@" | vim -
}

vimDirDiff()
{
    echo "Please wait while vim diffs the files"
    args=$@
    vim -f "+execute \"DirDiff $args\""
    echo "Thanks for using vimDirDiff"
}


# index a project
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

autoload -U edit-command-line
zle -N edit-command-line
bindkey -M vicmd 'v' edit-command-line
bindkey -M viins "jk" vi-cmd-mode

if (tmux has -t Pasta 2> /dev/null) ; then
    tmux attach-session -d -t Pasta
else 
    tmux new-session -s Pasta
fi
