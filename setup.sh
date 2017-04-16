echo 'Installing oh my zsh and dotfiles'
cd $HOME
git clone http://github.com/robbyrussell/oh-my-zsh .oh-my-zsh
git clone http://github.com/BarrettLowe/dotfiles
ln -s $HOME/dotfiles/.agignore
ln -s $HOME/dotfiles/.ctags
ln -s $HOME/dotfiles/.gitattributes
ln -s $HOME/dotfiles/.gitignore
ln -s $HOME/dotfiles/.inputrc
ln -s $HOME/dotfiles/.tmux.conf
ln -s $HOME/dotfiles/.vimrc
ln -s $HOME/dotfiles/.zshrc

echo 'Trying to install powerline fonts'
mkdir $HOME/build
cd $HOME/build
git clone http://github.com/powerline/fonts powerline_fonts
cd powerline_fonts
sh install.sh
 
echo 'Trying to install pathogen'
vim=$HOME/.vim
cd $vim
git clone http://github.com/tpope/vim-pathogen pathogen
ln -s pathogen/autoload
 
echo 'Installing vim plugins'
mkdir $vim/bundle
cd $vim/bundle
git clone http://github.com/tpope/vim-fugitive futitive
git clone http://github.com/tpope/vim-surround surround
git clone http://github.com/tpope/vim-commentary commentary
git clone http://github.com/tpope/vim-abolish abolish
git clone http://github.com/shougo/denite.nvim denite
# git clone http://github.com/shougo/vimproc vimproc
git clone http://github.com/vim-airline/vim-airline airline
git clone http://github.com/vim-airline/vim-airline-themes airline-themes
git clone http://github.com/edkolev/tmuxline.vim tmuxline
git clone http://github.com/airblade/vim-gitgutter gitgutter
git clone --recursive http://github.com/davidhalter/jedi-vim jedi
git clone http://github.com/BarrettLowe/vim-ipython 
git clone http://github.com/BarrettLowe/vim-fswitch fswitch
git clone http://github.com/BarrettLowe/vim-dirdiff dirdiff
git clone http://github.com/benmills/vimux vimux
git clone http://github.com/vim-scripts/Gundo Gundo
#solarized
