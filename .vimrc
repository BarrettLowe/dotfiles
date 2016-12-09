""""""""""""""""""""""""""""""""""
"" GENERAL ""
"""""""""""""""""""""""""""""""""


execute pathogen#infect()
execute pathogen#helptags()
syntax on
filetype plugin indent on

set term=xterm-256color
set number
set relativenumber
set nocompatible
set hidden
set ttimeoutlen=50

set autoread

set viminfo='20,<50,s10

set backspace=indent,eol,start

set list
set listchars=tab:\|\|
set expandtab
set smarttab
set tabstop=4
set softtabstop=4
set shiftwidth=4
set shiftround
set wildmode=list:full
set diffopt=filler,iwhite
set cursorline

set clipboard=unnamed,unnamedplus

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
"let base16colorspace=256
"set t_Co=256

set autoindent
set smartindent
set laststatus=2

""""""""""""""""""""""""""""""""""
"" CSCOPE ""
"""""""""""""""""""""""""""""""""
noremap \s : cs find s <C-r>=expand("<cword>")<CR><CR>
noremap \d : cs find d <C-r>=expand("<cword>")<CR><CR>
noremap \c : cs find c <C-r>=expand("<cword>")<CR><CR>
noremap \t : cs find t <C-r>=expand("<cword>")<CR><CR>
noremap \e : cs find e <C-r>=expand("<cword>")<CR><CR>
noremap \f : cs find f <C-r>=expand("<cword>")<CR><CR>
noremap \i : cs find i <C-r>=expand("<cword>")<CR><CR>
noremap \d : cs find d <C-r>=expand("<cword>")<CR><CR>

" let g:unite_source_outline_ctags_program='$HOME\DevTools\bin\ctags'
set tags-=./tags tags^=./tags;
noremap <c-\> :split<cr> :exec("tag ".expand("<cword>"))<cr>zz

set csto=0
if filereadable('cscope.out')
    cs add cscope.out
elseif filereadable('../cscope.out')
    cs add ../cscope.out
elseif $CSCOPE_DB != ""
    cs add $CSCOPE_DB
endif
set cscopeverbose

"noremap i h 
"noremap I H
"noremap h i
"noremap H I
"noremap j <Left>
"noremap k g<Down>

inoremap jk <esc>
nnoremap n nzz
nnoremap N Nzz
let mapleader = ","

noremap L $
noremap J ^

""""""""""""""""""""""""""""""""""
"" Window Movement Mappings ""
"""""""""""""""""""""""""""""""""
noremap [b :bp<cr>
noremap ]b :bn<cr>

nmap <silent> <C-j> :wincmd j<CR>
nmap <silent> <C-h> :wincmd h<CR>
nmap <silent> <C-k> :wincmd k<CR>
nmap <silent> <C-l> :wincmd l<CR>
map <silent><C-J> :call WinMove('j')<cr>
map <silent><C-H> :call WinMove('h')<cr>
map <silent><C-K> :call WinMove('k')<cr>
map <silent><C-L> :call WinMove('l')<cr>

function! WinMove(key)
    let t:curwin = winnr()
        exec "wincmd ".a:key
        if (t:curwin == winnr())
            if (match(a:key,'[jk]'))
                wincmd v
            else
                wincmd s
            endif
        exec "wincmd ".a:key
    endif
endfunction

""""""""""""""""""""""""""""""""""
"" PERSISTENT UNDO ""
"""""""""""""""""""""""""""""""""
let vimDir = '$HOME/.vim'
let &runtimepath.=','.vimDir
if has ('persistent_undo')
    let myUndoDir = expand(vimDir . '/UNDODIR')
    call system('mkdir ' . vimDir)
    call system('mkdir ' . myUndoDir)
    let &undodir = myUndoDir
    set undofile
endif

""""""""""""""""""""""""""""""""""
"" GENERAL MAPPINGS ""
"""""""""""""""""""""""""""""""""
noremap <leader>s :wq<cr>
noremap <leader>w :w<cr>
noremap <leader>q :q
noremap <leader>cd :cd ..<cr>
noremap <leader>vc :e ~/.vimrc<cr>
noremap <leader><leader>sb :windo :set scrollbind!<cr>
noremap <leader><leader>lw :set wrap!<cr>
noremap <leader>rld :source ~/.vimrc<cr>
noremap <silent><leader>qq :bd<cr>
noremap <silent><leader>rn :set relativenumber!<cr>
noremap <silent><leader>a ggVG
noremap <silent><C-p> %


""""""""""""""""""""""""""""""""""
"" FUGITIVE MAPPINGS ""
"""""""""""""""""""""""""""""""""
nnoremap <silent><leader>gl :Glog<cr>
nnoremap <silent><leader>gld :call functions#TrunkGitDiff()<cr>
nnoremap <silent><leader>gst :Gstatus<cr>
nnoremap <silent><leader>gdi :Gdiff<cr>

""""""""""""""""""""""""""""""""""
"" QUICKFIX MAPPINGS ""
"""""""""""""""""""""""""""""""""
nnoremap <silent>]q :cnext<cr>
nnoremap <silent>[q :cprev<cr>
nnoremap <silent>]Q :cfirst<cr>
nnoremap <silent>[Q :clast<cr>
"nnoremap <silent><leader>qf :botright copen<cr>:set cursorline<cr>
nnoremap <silent><leader>qf :call ToggleQuickFix()<cr>
""autocmd BufReadPost quickfix nnoremap <buffer> <cr> <cr>:execute functions#TrunkGitDiffC()<cr>

let g:quickFixOpen = 0

function! ToggleQuickFix()
    if g:quickFixOpen
        cclose
        let g:quickFixOpen = 0
    else
        copen
        let g:quickFixOpen = 1
    endif
endfunction

""""""""""""""""""""""""""""""""""
"" Glog  MAPPINGS ""
""""""""""""""""""""""""""""""""""
" These will diff previous versions of the file from a git repository
" TODO: make this work only when there is a git repo and when
"       the quickfix list is populated with stuff
nnoremap <silent>]qq :cnext<cr> :windo diffthis<cr>
nnoremap <silent>[qq :cprev<cr> :windo diffthis<cr>
nnoremap <silent>]QQ :cfirst<cr> :windo diffthis<cr>
nnoremap <silent>[QQ :clast<cr> :windo diffthis<cr>

""""""""""""""""""""""""""""""""""
"" Matlab  MAPPINGS ""
""""""""""""""""""""""""""""""""""
augroup matlab
    autocmd!
    autocmd BufEnter *.m compiler mlint
    autocmd BufEnter *.m nnoremap <silent><leader>mb :call MSetBreakpoint()<cr>
    autocmd BufEnter *.m nnoremap <silent><leader>md :call MDelBreakpoint()<cr>
    autocmd BufEnter *.m nnoremap <silent><leader>mda :call VimuxSendText("dbclear all")<cr> :call VimuxSendKeys("Enter")<cr>
    autocmd BufEnter *.m nnoremap <silent><leader>ms :call VimuxSendText("dbstep")<cr> :call VimuxSendKeys("Enter")<cr>
    autocmd BufEnter *.m nnoremap <silent><leader>mc :call VimuxSendText("dbcont")<cr> :call VimuxSendKeys("Enter")<cr>
    autocmd BufEnter *.m nnoremap <silent><leader>mR :call VimuxSendText(expand("%:r"))<cr> :call VimuxSendKeys("Enter")<cr>
    autocmd BufEnter *.m nnoremap <silent><leader>mr :call VimuxSendText(getline("."))<cr> :call VimuxSendKeys("Enter")<cr>
augroup END

function! MDelBreakpoint()
    let t:ln=line(".")
    let t:fn=expand("%:r")
    "let t:theCall="dbstop in " . t:fn . " at " . t:ln
    call VimuxSendText("dbclear in " . t:fn . " at " . t:ln)
    call VimuxSendKeys("Enter")
    "echo t:theCall
endfunction

function! MSetBreakpoint()
    let t:ln=line(".")
    let t:fn=expand("%:r")
    "let t:theCall="dbstop in " . t:fn . " at " . t:ln
    call VimuxSendText("dbstop in " . t:fn . " at " . t:ln)
    call VimuxSendKeys("Enter")
    "echo t:theCall
endfunction


""""""""""""""""""""""""""""""""""
"" MOVEMENT MAPPINGS ""
"""""""""""""""""""""""""""""""""
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
nnoremap <C-n>: normal<space>
vnoremap <C-n>: normal<space>

""""""""""""""""""""""""""""""""""
"" DIFF MAPPINGS ""
"""""""""""""""""""""""""""""""""

""""""""""""""""""""""""""""""""""
"" UNITE MAPPINGS ""
"""""""""""""""""""""""""""""""""
call unite#filters#matcher_default#use(['matcher_fuzzy'])
nnoremap <C-n><C-n> :Unite -start-insert file_rec/git<cr>
nnoremap <C-n><C-d> :UniteWithBufferDir -start-insert file<cr>
nnoremap <C-n><C-r> :Unite -start-insert file_rec<cr>
nnoremap <C-n><C-b> :Unite buffer<cr>
nnoremap <C-n><C-o> :Unite -start-insert outline <cr>
nnoremap <C-n><C-g> :Unite grep -path=$PWD -input=
nnoremap <C-q>      :<Plug>(unite_print_mesage_log)
nnoremap <C-n><C-g>f :Unite -input=<C-R><C-W> <cr>
nnoremap <C-n><C-g>w :Unite grep -path=$PWD -input=<C-R><C-W> <cr>
nnoremap <C-n>* :Unite line -no-start-insert -input=<C-R><C-W> <cr>
nnoremap <C-n>/ :Unite -start-insert line <cr>

let g:unite_options_direction='dynamixbottom'
if executable('ag')
    let g:unite_source_grep_command='ag'
    let g:unite_source_grep_default_opts='--nogroup --nocolor --column -S'
    let g:unite_source_grep_recursive_opt='-r'
    let g:unite_source_rec_async_command=
                \['ag', '--follow', '--nocolor', '--nogroup'
                \'--hidden', '-g', '']
endif
if executable('git')
    let g:unite_source_rec_git_command = 
                \ ['git', 'ls-files', '--exclude-standars']
endif
let g:unite_source_menu_menus = {}
let g:unite_source_menu_menus.git = {
            \ 'description' : 'Git Functions',
            \ }

let g:unite_source_menu_menus.git.command_candidates = {
            \ 'git status'  :   'Gstatus',
            \ 'git diff'    :   'Gdiff :cope',
            \ }

augroup VimrcAutocmds
    autocmd!
    autocmd VimEnter * if exists(':Unite') | call s:UniteSetup() | endif
    autocmd FileType unite call s:UniteSettings()
    "autocmd CursorHold * silent! call unite#sources#history_yahk#_append()
augroup END

func! s:UniteSettings()
    setlocal conceallevel=0
    imap <silent> <buffer> <expr> <C-q> unite#do_action('delete')
                \."\<Plug>(unite_append_enter)"
    nnor <silent> <buffer> <expr> <C-q> unite#do_action('delete')
    imap <silent> <buffer> <expr> <C-d> <SID>UniteTogglePathSearch()."\<Esc>"
                \.'1g0y$Q'.":\<C-u>Unite -buffer-name=buffers/neomru "
    nmap <buffer> <expr> yy unite#do_action('yank').'<Plug>(unite_exit)'
    imap <buffer> <expr> <C-o>v unite#do_action('vsplit')
    imap <buffer> <expr> <C-o><C-v> unite#do_action('vsplit')
    imap <buffer> <expr> <C-o>s unite#do_action('split')
    imap <buffer> <expr> <C-o><C-s> unite#do_action('split')
    imap <buffer> <expr> <C-o>t unite#do_action('tabopen')
    imap <buffer> <expr> <C-o><C-t> unite#do_action('tabopen')
    imap <buffer> <expr> ' <Plug>(unite_exit)
    imap <buffer> <expr> <C-o> <Plug>(unite_choose_action)
    nmap <buffer> <expr> <C-o> <Plug>(unite_choose_action)
    inor <buffer> <C-f> <Esc><C-d>
    inor <buffer> <C-b> <Esc><C-u>
    nmap <buffer> <C-f> <C-d>
    nmap <buffer> <C-b> <C-u>
    imap <buffer> <C-p> <Plug>(unite_narrowing_input_history)
    nmap <buffer> <C-p> <Plug>(unite_narrowing_input_history)
    imap <buffer> <C-j> <Plug>(unite_select_next_line)
    nmap <buffer> <C-k> <Plug>(unite_select_previous_line)
    imap <buffer> <C-c> <Plug>(unite_exit)
    nmap <buffer> <C-c> <Plug>(unite_exit)
    nmap <buffer> m <Plug>(unite_toggle_mark_current_candidate)
    nmap <buffer> M <Plug>(unite_toggle_mark_current_candidate_up)
    nmap <buffer> <F1> <Plug>(unite_quick_help)
    imap <buffer> <F1> <Esc><Plug>(unite_quick_help)
    imap <buffer> <C-Space> <Plug>(unite_toggle_mark_current_candidate)
    inor <buffer> . \.
    inor <buffer> \. .
    inor <buffer> <expr> <BS>
                \ getline('.')[virtcol('.')-3:virtcol('.')-2] == '\.' ? '<BS><BS>' : '<BS>'
    inor <buffer> <C-r>% <C-r>#
    inor <buffer> <expr> <C-r>$ expand('#:t')
    nmap <buffer> S <Plug>(unite_append_end)<Plug>(unite_delete_backward_line)
    nmap <buffer> s <Plug>(unite_append_enter)<BS>
    sil! nunmap <buffer> ?
endfunc

func! s:UniteSetup()
    call unite#filters#matcher_default#use(['matcher_regexp'])
    call unite#custom#default_action('directory', 'cd')
    call unite#custom#profile('default', 'context',
                \ {'start_insert' : 0, 'direction':'dynamicbottom', 'prompt_direction': 'top'})
    call unite#custom#source('file', 'ignore_pattern', '.*\.\(un\~\|mat\|pdf\)$')
    call unite#custom#source('file,file_rec,file_rec/async', 'sorters', 'sorter_rank')
    for source in ['history/yank', 'register', 'grep', 'vimgrep']
        call unite#custom#profile('source\'.source, 'context', {'start_insert': 0})
    endfor
    function! s:action_replace(action, candidates)
        for index in range(0, len(a:candidates) -1)
            if index == 1 | wincmd o | endif
            if index > 0 || len(a:candidates) == 1
                call unite#util#command_with_restore_cursor(
                            \ substitude(a:action, '^split$', 'belowright &', ''))
            endif
            call unite#take_action('open', a:candidates[index])
            if index == 0 | let win = winnr() | endif
        endfor
        silent! execute win . "wincmd w"
    endfunction
    for type in ['split', 'vsplit']
        let replace = {'is_selectable':1, 'description': type . ' replacing current window'}
        execute "function! replace.func(candidates)\n"
                    \ "call s:action_replace('" . type . "', a:candidates)\n" .
                    \ "endfunction"
        call unite#custom#action('openable', type, replace)
    endfor
endfunc


"FSwitch mappings
nnoremap <silent> <Leader>of :FSHere<cr>
nnoremap <silent> <Leader>ol :FSRight<cr>
nnoremap <silent> <Leader>oh :FSLeft<cr>
nnoremap <silent> <Leader>ok :FSAbove<cr>
nnoremap <silent> <Leader>oj :FSBelow<cr>

nnoremap <leader>p :call VimuxRunCommandInDir("python", 1)<cr>

noremap <leader>dp :diffpu<cr>
noremap <leader>dg :diffg<cr>

vnoremap <leader>vs yy:VimuxSendText(@0)<cr>

nnoremap <F5> :GundoToggle<CR>

"Airline
let g:airline_theme = "solarized"
let g:airline_powerline_fonts = 1
let g:extensions = ['tabline', 'tagbar']
let g:tmuxline_theme = 'airline'
let g:airline#extensions#tabline#enabled = 1
let g:airline#extensions#tmuxline#enabled = 1
let g:airline#extensions#tmuxline#snapshot_file = "~/.tmux-statusline-colors.conf"
let g:tmuxline_powerline_separators = 1
let g:tmuxline_preset = 'crosshair'

"MultipleCursor
"let g:multi_cursor_use_default_mapping=0
"let g:multi_cursor_next_key='<c-m>'
"let g:multi_cursor_prev_key='<c-p>'
"let g:multi_cursor_skip_key='<c-x>'
"let g:multi_cursor_quit_key='<Esc>'

autocmd VimEnter * Tmuxline

syntax enable
set background=dark
let g:solarized_termcolors=256 "Uncheck the box in Putty to use 256 colors
let g:solarized_termtrans=1 
colorscheme solarized
