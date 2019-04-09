""""""""""""""""""""""""""""""""""
"" GENERAL ""
"""""""""""""""""""""""""""""""""


execute pathogen#infect()
execute pathogen#helptags()
syntax on
filetype plugin indent on

if !has('nvim')
    set term=xterm-256color
endif
set number
set relativenumber
set nocompatible
set hidden
set ttimeoutlen=50
set mouse=
set completeopt=longest,menuone,noinsert

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

set clipboard=unnamed

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

inoremap {<CR> {<CR>}<ESC>O
vnoremap <C-n> :normal 

" let g:clang_snippet = 1
" let g:clang_snippets_engine = 'clang_complete'
" let g:clang_library_path='/usr/lib/llvm-6.0/lib/libclang.so.1'
"
let g:deoplete#enable_at_startup = 1
" let g:deoplete#sources#clang#executable='/usr/bin/clang'
" let g:deoplete#sources#clang#clang_header='/usr/include/clang/6.0/include'
" call deoplete#custom#source('clang', 'rank', 1000)
"
" call deoplete#custom#var('clangx', 'clang_binary', '/usr/bin/clang')
" call deoplete#custom#var('clangx', 'default_cpp_options', '--std=c++14')


"""""""""""""""""""""""""""""""""""
""" SYNTASTIC ""
""""""""""""""""""""""""""""""""""
"set statusline+=%#warningmsg#
"set statusline+=%{SyntasticStatuslineFlag()}
"set statusline+=%*
"
"let g:syntastic_always_populate_loc_list = 1
"let g:syntastic_auto_loc_list = 1
"let g:syntastic_check_on_open = 1
"let g:syntastic_check_on_wq = 0



""""""""""""""""""""""""""""""""""
"" COMMENTARY ""
"""""""""""""""""""""""""""""""""
autocmd filetype matlab setlocal commentstring=%%s%
autocmd filetype cmake setlocal commentstring=#%s

""""""""""""""""""""""""""""""""""
"" CSCOPE ""
"""""""""""""""""""""""""""""""""
noremap s : cs find s <C-r>=expand("<cword>")<CR><CR>
noremap d : cs find d <C-r>=expand("<cword>")<CR><CR>
noremap c : cs find c <C-r>=expand("<cword>")<CR><CR>
noremap t : cs find t <C-r>=expand("<cword>")<CR><CR>
noremap e : cs find e <C-r>=expand("<cword>")<CR><CR>
noremap f : cs find f <C-r>=expand("<cword>")<CR><CR>
noremap i : cs find i <C-r>=expand("<cword>")<CR><CR>
noremap d : cs find d <C-r>=expand("<cword>")<CR><CR>

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
noremap <leader>rld ma:source ~/.vimrc<cr>'a
noremap <silent><leader>qq :bd<cr>
noremap <silent><leader>rn :set relativenumber!<cr>
noremap <silent><leader>a ggVG
noremap <silent><C-p> %
noremap <silent><leader>ma :make<cr>
noremap <silent>+ ddp
noremap <silent>- dd<Up>P

noremap <silent><leader>m :MakeAsync('make -j26')<cr>
function! OutHandler_Make(job, message)
endfunction
function! ExitHandler_Make(job_message)
    exec 'silent! cb! ' . g:makeBufNum
    let list = getqflist()
    let g:lastMakeTime = strftime("%H:%M")
    let ecount = 0
    for i in list
        if i.lnum != 0
            let ecount+=1
        endif
    endfor
    let g:makeErrorCount = ecount
    exec 'AirlineRefresh'
    exec g:makeBufNum . 'bdelete!'
    if g:makeErrorCount > 0
        exe 'cfirst'
        exe 'cnfile'
    endif
endfunction
function! MakeAsync(cmd)
    mark a
    let cmd = split(a:cmd)
    let currentBuff = bufnr('%')
    let g:makeBufNum = bufnr('make_buffer',1)
    exec g:makeBufNum . 'bufdo %d'
    exec below sb ' . g:makeBufNum
    exec 'resize ' . (winheight(0) * 1/4)
    setlocal filetype='make_buffer'
    " TODO stop the job when the buffer gets closed
    exec WinMove('k')
    let job = job_start(cmd, {'out_io' : 'buffer',
                \'in_io'    :   'null',
                \'err_io'   :   'buffer',
                \'err_name' :   'make_buffer',
                \'out_name' :   'make_buffer',
                \'out_cb'   :   'OutHandler_Make',
                \'exit_cb'  :   'ExitHandler_Make'})
    let g:makeErrorCount = '...'
    exec 'AirlineRefresh'
    'a
endfunction
command! -nargs=1 MakeAsync call MakeAsync(<args>)


""""""""""""""""""""""""""""""""""
"" FUGITIVE MAPPINGS ""
"""""""""""""""""""""""""""""""""
nnoremap <silent><leader>gl :Glog<cr>
nnoremap <silent><leader>gld :call functions#TrunkGitDiff()<cr>
nnoremap <silent><leader>gs :Gstatus<cr>
nnoremap <silent><leader>gd :Gdiff<cr>

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
augroup MATLAB
    autocmd!
    autocmd BufEnter *.m compiler mlint
    autocmd BufEnter *.m nnoremap <silent><space>    :call MSetBreakpoint()<cr>
    autocmd BufEnter *.m nnoremap <silent>d<space>    :call MDelBreakpoint()<cr>
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
"" DENITE MAPPINGS ""
"""""""""""""""""""""""""""""""""
call denite#custom#var('file_rec', 'command', 
            \['ag', '--follow', '--nocolor', '--nogroup', 
            \'--ignore', '*.o', 
            \'--ignore', '*.pbi', 
            \'--ignore', '*.cscope*', '-g', ''])

call denite#custom#var('grep', 'command', ['ag'])
call denite#custom#var('grep', 'default_opts',
		\ ['-i', '--vimgrep'])
call denite#custom#var('grep', 'recursive_opts', [])
call denite#custom#var('grep', 'pattern_opt', [])
call denite#custom#var('grep', 'separator', ['--'])
call denite#custom#var('grep', 'final_opts', [])

call denite#custom#var('grep', 'recursive_opts', [])
call denite#custom#var('grep', 'pattern_opt', [])
call denite#custom#var('grep', 'separator', ['--'])
call denite#custom#var('grep', 'final_opts', [])

call denite#custom#map('insert', '<C-j>', '<denite:move_to_next_line>', 'noremap')
call denite#custom#map('insert', '<C-k>', '<denite:move_to_previous_line>', 'noremap')

call denite#custom#alias('source', 'file/rec/git', 'file/rec')
call denite#custom#var('file/rec/git', 'command',
            \ ['git', 'ls-files', '-c', '--exclude-standard', '--recurse-submodules'])
call denite#custom#source('file/rec/git', 'matchers', ['matcher_substring'])
call denite#custom#source('file/rec', 'matchers', ['matcher_substring'])
call denite#custom#source('line', 'matchers', ['matcher_substring','matcher_fuzzy'])

call denite#custom#source('file_rec', 'sorters', ['sorter_word', 'sorter_cpph'])

call denite#custom#map('insert', '<C-h>', '<denite:do_action:vsplit>', 'noremap')
call denite#custom#map('insert', 'jk', '<denite:enter_mode:normal>', 'noremap')

noremap <silent> <C-n><C-n> :Denite `finddir('.git', ';') != '' ? 'file/rec/git' : 'file_rec'`<cr>
noremap <silent> <C-n><C-b> :Denite buffer<cr>
noremap <silent> <C-n><C-d> :Denite file_rec<cr>
noremap <silent> <C-n><C-g> :Denite grep<cr>
noremap <silent> <C-n><C-r> :Denite -resume<cr>
noremap <silent> <C-n><C-w> :DeniteCursorWord grep<cr>
noremap <silent> <C-n><C-/> :Denite line<cr>
noremap <silent> <C-n>/ :Denite line<cr>
noremap <silent> <C-n><C-o> :Denite outline<cr>
noremap <silent> <C-n>* :DeniteCursorWord line<cr>
noremap <silent> <C-n><C-f> :Denite file_old<cr>

function! FindGetAndSetters(input)
    echom a:input[len(a:input)-1]
    if a:input[len(a:input)-1] == '_'
        let a:input=a:input[0:len(a:input)-2]
    endif
    execute 'Denite -input='.a:input.' line grep'
endfunction

"FSwitch mappings
nnoremap <silent> <Leader>of :FSHere<cr>
nnoremap <silent> <Leader>ol :FSSplitRight<cr>
nnoremap <silent> <Leader>oh :FSSplitLeft<cr>
nnoremap <silent> <Leader>ok :FSSplitAbove<cr>
nnoremap <silent> <Leader>oj :FSSplitBelow<cr>

" augroup Html
"     autocmd!
"     set tabstop=2
"     set shiftwidth=2
" augroup END

" autocmd FileType python nnoremap <leader>p :call VimuxPromptCommand('python '.bufname("%"))<cr>
" augroup Python
"     autocmd!
"     autocmd filetype python nnoremap <leader>p :exec('!tmux split-window -p 15 /apps/anaconda3_4.1.1/bin/python ' . bufname("%"))<cr><cr>
"     let g:jedi#auto_initialization = 0
" augroup END
" let g:jedi#force_py_version = 3

" map <C-@> <C-Space> 
autocmd filetype python inoremap . .<C-x><C-o>

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

" Jedi
" let g:jedi#force_py_version = 3

" define my own mappings for git gutter
let g:gitgutter_map_keys=0
nmap <silent> ]gg <Plug>GitGutterNextHunk
nmap <silent> [gg <Plug>GitGutterPrevHunk
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
let g:ipy_perform_mappings=0
colorscheme solarized
