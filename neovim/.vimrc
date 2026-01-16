""""""""""""""""""""""""""""""""""
"" GENERAL ""
"""""""""""""""""""""""""""""""""

let mapleader = ","
inoremap jk <Esc>
set expandtab
set smarttab
set tabstop=4
set softtabstop=4
set shiftwidth=4
set shiftround
set number
set relativenumber
set nocompatible
set hidden
set ttimeoutlen=50
set mouse=a
set completeopt=longest,menuone,noinsert

set autoread

set viminfo='20,<50,s10

set backspace=indent,eol,start

set list
set listchars=tab:\|\|
set wildmode=list:full
set diffopt=filler,iwhite
set cursorline

set clipboard=unnamedplus

set ttyfast

set foldmethod=syntax
set foldnestmax=4
set nofoldenable
set foldlevel=1

set ignorecase
set smartcase
set hlsearch
set incsearch
set nolazyredraw
set magic
set showmatch
set mat=2

set encoding=utf8
let base16colorspace=256
set t_Co=256

set autoindent
set smartindent
set laststatus=2

noremap <leader>s :wq<cr>
noremap <leader>w :w<cr>
noremap <leader>q :q<cr>


""""""""""""""""""""""""""""""""""
"" MOVEMENT MAPPINGS ""
"""""""""""""""""""""""""""""""""
nnoremap n nzz
nnoremap N Nzz

inoremap <silent> <C-j> <C-o>j
inoremap <silent> <C-h> <C-o>h
inoremap <silent> <C-k> <C-o>k
inoremap <silent> <C-l> <C-o>l
inoremap <silent> <C-w> <C-o>w
inoremap <silent> <C-W> <C-o>W
inoremap <silent> <C-b> <C-o>b
inoremap <silent> <C-B> <C-o>B
inoremap <silent> <C-e> <C-o>e
inoremap <silent> <C-E> <C-o>E

noremap L $
noremap H ^

if exists('g:vscode')
    " Things that apply in vscode
    set nohlsearch
    set noshowmode
    set nocompatible
    
    " VSCode-specific keybindings
    nnoremap <leader>f <Cmd>call VSCodeNotify('workbench.action.quickOpen')<CR>
    nnoremap <leader>p <Cmd>call VSCodeNotify('workbench.action.showCommands')<CR>
else
    syntax on
    filetype plugin indent on

    if !has('nvim')
        set term=xterm-256color
    endif
    inoremap {<CR> {<CR>}<ESC>O
    nnoremap <leader>n :normal<space>
    vnoremap <leader>n :normal<space>
    
    " Basic colorscheme
    try
        colorscheme desert
    catch
    endtry
endif

let g:python3_host_prog = expand("~/.local/share/nvim/uv-venv/bin/python")
