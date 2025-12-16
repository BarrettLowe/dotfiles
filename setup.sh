echo 'Installing oh my zsh and dotfiles'
cd $HOME
mkdir -p $HOME/DevTools
export PATH=$HOME/DevTools/bin:$PATH

ln -s $HOME/dotfiles/.agignore
ln -s $HOME/dotfiles/.ctags
ln -s $HOME/dotfiles/.gitattributes
ln -s $HOME/dotfiles/.gitignore
ln -s $HOME/dotfiles/.gitconfig
ln -s $HOME/dotfiles/.inputrc
ln -s $HOME/dotfiles/.tmux.conf
ln -s $HOME/dotfiles/.vimrc
ln -s $HOME/dotfiles/.zshrc

# Vim setup (minimal)
if [ ! -d "$HOME/.vim" ]; then
	mkdir $HOME/.vim
fi

# create config directory for neovim
mkdir -p $HOME/.config
# link the directory to the nomal .vim folder
if [ ! -d "$HOME/.config/nvim" ]; then
    ln -s $HOME/.vim $HOME/.config/nvim
fi
# linkd the vimrc file to the neovim expected version
ln -sf $HOME/.vimrc $HOME/.config/nvim/init.vim

echo 'You can now install neovim - config directory has been setup'

cd $HOME
if [ ! -d "$HOME/.oh-my-zsh" ]; then
    git clone https://github.com/robbyrussell/oh-my-zsh .oh-my-zsh
fi
