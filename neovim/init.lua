-- init.lua
-- Main entry point for Neovim configuration.
-- Bootstraps lazy.nvim and loads all modular config files from lua/config/*.lua

-- ============================================================================
-- LUA PACKAGE PATH (for modular config)
-- ============================================================================

-- Add the config directory to Lua's search path so require() can find modules
-- This handles both symlinked ~/.config/nvim and direct path setups
local init_dir = debug.getinfo(1).source:match('@?(.*/)')
local lua_dir = init_dir .. 'lua/'
if not string.find(package.path, vim.pesc(lua_dir), 1, true) then
    package.path = lua_dir .. '?.lua;' .. lua_dir .. '?/init.lua;' .. package.path
end

-- ============================================================================
-- LEADER KEY (must be set before plugin loading)
-- ============================================================================

vim.g.mapleader = ','

-- ============================================================================
-- BOOTSTRAP LAZY.NVIM
-- ============================================================================

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
end
vim.opt.rtp:prepend(lazypath)

-- ============================================================================
-- LOAD MODULAR CONFIG
-- ============================================================================

-- Core settings (vim.opt.*, vim.env.*, etc.)
require("config.settings")

-- Initialize plugins
require("lazy").setup(require("config.plugins"))

-- Global keymaps (movement, leader shortcuts, window navigation)
require("config.keymaps")

-- Autocommands (treesitter, CMake, DAP UI, config reload)
require("config.autocmds")

-- LSP configuration (clangd, basedpyright, ruff, cmake)
require("config.lsp")

-- DAP configuration (debug adapters, UI, keymaps)
require("config.dap")

-- Custom git history command
require("git_file_history").setup()

-- ============================================================================
-- RPC SOCKET
-- ============================================================================

-- Start listening on a predictable socket so external processes (e.g.
-- ~/dotfiles/bin/theme) can send commands to running nvim instances.
-- Socket path: $XDG_RUNTIME_DIR/nvim-<pid>.sock
-- Discovery: glob $XDG_RUNTIME_DIR/nvim-*.sock
do
    local runtime_dir = os.getenv("XDG_RUNTIME_DIR") or "/tmp"
    local sock = runtime_dir .. "/nvim-" .. vim.fn.getpid() .. ".sock"
    local ok = pcall(vim.fn.serverstart, sock)
    if not ok then
        -- XDG_RUNTIME_DIR not writable (e.g. wrong ownership on /run/user/<uid>); fall back to /tmp.
        -- Fix: sudo chown $USER:$USER $XDG_RUNTIME_DIR && sudo chmod 700 $XDG_RUNTIME_DIR
        pcall(vim.fn.serverstart, "/tmp/nvim-" .. vim.fn.getpid() .. ".sock")
    end
end

-- ============================================================================
-- COLORSCHEME
-- ============================================================================

if not vim.g.vscode then
    -- Read ~/.theme to pick the colorscheme. Falls back to dark if absent.
    local theme = "dark"
    local f = io.open(vim.fn.expand("~/.theme"), "r")
    if f then
        theme = f:read("*l") or "dark"
        f:close()
    end

    if theme == "light" then
        vim.cmd("colorscheme github_light")
    else
        vim.cmd("colorscheme nightfly")
    end
end

