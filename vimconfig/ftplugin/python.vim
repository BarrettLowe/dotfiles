func! RunCheckIPy(plug)
    echom 'exec \"normal \'.a:plug.'\"'
    if exists('b:did_ipython')
        exec 'exec \"normal \\'.a:plug.'\"'
        return 1
    else
        return 0
    endif
endfunction
    
nnoremap <leader>i :IPython<cr>
inoremap . .<c-x><c-o>
inoremap <c-space> <c-x><c-o>
nmap <silent><buffer><c-i>r <Plug>(IPython-RunLine)
vmap <silent><buffer><c-i>r <Plug>(IPython-RunLines)
map <silent><buffer><leader>k <Plug>(IPython-OpenPyDoc)
nmap <buffer>sos                <Plug>(IPython-ToggleSendOnSave)
nmap <buffer><leader>p          <Plug>(IPython-RunFile)
" nmap <buffer><leader>p          :exec RunCheckIPy('<Plug>(IPython-RunFile)')


" if !exists('b:did_ipython') || b:did_ipython == 0
"     echom('IPython not running - not connected')
"     finish
" endif


