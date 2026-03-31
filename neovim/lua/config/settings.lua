-- settings.lua
-- Core editor settings: indentation, UI, search, clipboard, etc.
-- All vim.opt.*, vim.env.*, and vim.g.* configurations live here.

-- Setup for devcontainers
local nvim_tmp = vim.fn.expand("$HOME/.cache/nvim/tmp")
if vim.fn.isdirectory(nvim_tmp) == 0 then
    vim.fn.mkdir(nvim_tmp, "p")
end
vim.env.TMPDIR = nvim_tmp
vim.env.TMP = nvim_tmp
vim.env.TEMP = nvim_tmp

-- Indentation
vim.opt.expandtab = true
vim.opt.smarttab = true
vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.shiftround = true

-- Line Numbers & Display
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.cursorline = true
vim.opt.signcolumn = "yes:2"
vim.opt.termguicolors = true

-- UI Elements
vim.opt.list = true
vim.opt.listchars = { tab = '||' }
vim.opt.wildmode = { 'list', 'full' }

-- Behavior
vim.opt.hidden = true
vim.opt.autoread = true
vim.opt.ttimeoutlen = 30
vim.opt.mouse = 'a'
vim.opt.clipboard = 'unnamedplus'
vim.opt.autoindent = true
vim.opt.smartindent = true

-- Completion
vim.opt.completeopt = { 'longest', 'menuone', 'noinsert' }

-- Diff & Folding
vim.opt.diffopt:append({ 'filler', 'iwhite' })
vim.opt.foldmethod = 'syntax'
vim.opt.foldnestmax = 4
vim.opt.foldenable = false
vim.opt.foldlevel = 1

-- Search
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.hlsearch = true
vim.opt.incsearch = true
vim.opt.magic = true
vim.opt.showmatch = true
vim.opt.mat = 2

-- Status Line & Messages
vim.opt.laststatus = 2

-- Path handling
vim.opt.path:append({ "src" })
vim.opt.wildignore:append({ "**/build/*", "**/node_modules/*" })

-- Python host
vim.g.python3_host_prog = vim.fn.expand("~/.local/share/nvim/uv-venv/bin/python")

-- Allow directory-specific init.lua setups (e.g., per-project vimrc)
vim.o.exrc = true
