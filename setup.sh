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

if [ ! -d "$HOME/.vim" ]; then
	mkdir $HOME/.vim
fi
 
echo 'Trying to install pathogen'
vim=$HOME/.vim
cd $vim
git clone http://github.com/tpope/vim-pathogen pathogen
ln -s pathogen/autoload autoload
 
echo 'Installing vim plugins'
mkdir $vim/bundle
cd $vim/bundle
git clone http://github.com/tpope/vim-fugitive futitive
git clone http://github.com/tpope/vim-surround surround
git clone http://github.com/tpope/vim-commentary commentary
git clone http://github.com/tpope/vim-abolish abolish
# git clone http://github.com/shougo/denite.nvim denite
# git clone http://github.com/shougo/vimproc vimproc
git clone http://github.com/vim-airline/vim-airline airline
git clone http://github.com/vim-airline/vim-airline-themes airline-themes
git clone http://github.com/edkolev/tmuxline.vim tmuxline
git clone http://github.com/airblade/vim-gitgutter gitgutter
#git clone --recursive http://github.com/davidhalter/jedi-vim jedi
git clone http://github.com/BarrettLowe/vim-ipython 
git clone http://github.com/BarrettLowe/vim-fswitch fswitch
git clone http://github.com/BarrettLowe/vim-dirdiff dirdiff
git clone http://github.com/benmills/vimux vimux
git clone http://github.com/vim-scripts/Gundo Gundo
git clone http://github.com/altercation/vim-colors-solarized

# create config directory for neovim
mkdir -p $HOME/.config
cd $HOME/.config
# link the directory to the nomal .vim folder
ln -s $HOME/.vim $HOME/.config/nvim
# linkd the vimrc file to the neovim expected version
ln -s $HOME/.vimrc $HOME/.config/nvim/init.vim
ln -s $HOME/dotfiles/vimconfig/ftplugin $HOME/.config/nvim/ftplugin
echo 'You can now install neovim - config directory has been setup'

cd $HOME
git clone https://github.com/robbyrussell/oh-my-zsh .oh-my-zsh
