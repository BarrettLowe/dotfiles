"=============================================================================
" File    : autoload/unite/sources/outline/matlab.vim
" Author  : blowe <barrett.lowe@gmail.com>
" Updated : 06/02/2016
"
"=============================================================================

" Default outline info for Matlab
" Version: 1.1

function! unite#sources#outline#matlab#outline_info() abort
  return s:outline_info
endfunction

let s:Ctags = unite#sources#outline#import('Ctags')
let s:Util  = unite#sources#outline#import('Util')

"-----------------------------------------------------------------------------
" Outline Info

let s:outline_info = {
      \ 'heading_groups': {
      \   'type'     : ['class', 'properties', 'methods', 'enumeration'],
      \   'function' : ['function'],
      \ },
      \
      \ 'not_match_patterns': [
      \   s:Util.shared_pattern('*', 'parameter_list'),
      \   ' => .*',
      \ ],
      \
      \ 'highlight_rules': [
      \   { 'name'   : 'type',
      \     'pattern': '/\S\+\ze\%( #\d\+\)\= : \%(class\|properties\|methods\|enumeration\)/' },
      \   { 'name'   : 'function',
      \     'pattern': '/\S\+\ze\s\+:\s\+function/' },
      \ ],
      \}

function! s:outline_info.extract_headings(context) abort
  return s:Ctags.extract_headings(a:context)
endfunction
