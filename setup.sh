echo 'Installing oh my zsh and dotfiles'
cd $HOME
mkdir DevTools
mkdir build
cd build
export $PATH=$HOME/DevTools/bin

#ZSH
git clone http://github.com/zsh-users/zsh
cd zsh
./Util/preconfig
./configure --prefix=$HOME/DevTools
make && make check
make install
cd
git clone http://github.com/robbyrussell/oh-my-zsh .oh-my-zsh
git clone http://github.com/BarrettLowe/dotfiles
ln -s $HOME/dotfiles/.agignore
ln -s $HOME/dotfiles/.ctags
ln -s $HOME/dotfiles/.gitattributes
ln -s $HOME/dotfiles/.gitignore
ln -s $HOME/dotfiles/.gitconfig
ln -s $HOME/dotfiles/.inputrc
ln -s $HOME/dotfiles/.tmux.conf
ln -s $HOME/dotfiles/.vimrc
ln -s $HOME/dotfiles/.zshrc

cd $HOME/build
git clone http://github.com/tmux/tmux


#LUA
#requires readline.h file - sudo apt-get install libreadline-dev
curl -R -O http://www.lua.org/ftp/lua-5.3.4.tar.gz
tar zxf lua-5.3.4.tar.gz
cd lua-5.3.4
make linux test INSTALL_TOP=$HOME/DevTools
make linux install INSTALL_TOP=$HOME/DevTools

cd $HOME/build
mkdir luaRocks
cd luaRocks
curl -R -O https://luarocks.org/manifests/gvvaughan/lpeg-1.0.1-1.src.rock
curl -R -O https://luarocks.org/manifests/tarruda/mpack-1.0.6-0.src.rock
curl -R -O https://luarocks.org/manifests/luarocks/luabitop-1.0.2-1.src.rock
curl -R -O 


cd $HOME/build
rm lua-5.3.4.tar.gz

git clone http://github.com/neovim/neovim neovim
git clone http://github.com/barrettlowe/neovim_deps neovim_deps
# needs cmake 2.8.7
# needs makeinfo - sudo apt-get install texinfo
mkdir -p neovim/.deps/build/src
cp -r neovim_deps/src/* neovim/.deps/build/src
cd neovim/.deps/build/src/jemalloc
sh autogen.sh
cd $HOME/build/neovim
git checkout v0.2.0
# just make the dependencies first
make CMAKE_BUILD_TYPE=Release DEPS_CMAKE_FLAGS="-DUSE_EXISTING_SRC_DIR=ON -DUSE_BUNDLED_LUAROCKS=ON -DUSE_BUNDLED_LUAJIT=ON -DUSE_BUNDLED_LUV=OFF" CMAKE_EXTRA_FLAGS=-DCMAKE_INSTALL_PREFIX=$HOME/DevTools deps
# AT THIS POINT, the luarocks have to be installed

make CMAKE_BUILD_TYPE=Release DEPS_CMAKE_FLAGS="-DUSE_EXISTING_SRC_DIR=ON -DUSE_BUNDLED_LUAROCKS=ON -DUSE_BUNDLED_LUAJIT=ON -DUSE_BUNDLED_LUV=OFF" CMAKE_EXTRA_FLAGS=-DCMAKE_INSTALL_PREFIX=$HOME/DevTools
cd $HOME

echo 'Trying to install powerline fonts'
cd $HOME/build
git clone http://github.com/powerline/fonts powerline_fonts
cd powerline_fonts
sh install.sh

if [ ! -d "$HOME/.vim" ]; then
	mkdir $HOME/.vim
fi
 
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
#git clone --recursive http://github.com/davidhalter/jedi-vim jedi
git clone http://github.com/BarrettLowe/vim-ipython 
git clone http://github.com/BarrettLowe/vim-fswitch fswitch
git clone http://github.com/BarrettLowe/vim-dirdiff dirdiff
git clone http://github.com/benmills/vimux vimux
git clone http://github.com/vim-scripts/Gundo Gundo
git clone http://github.com/altercatipn/vim-colors-solarized
#solarized
#
