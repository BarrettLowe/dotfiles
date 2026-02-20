-- Setup for devcontainers
local nvim_tmp = vim.fn.expand("$HOME/.cache/nvim/tmp")
if vim.fn.isdirectory(nvim_tmp) == 0 then
    vim.fn.mkdir(nvim_tmp, "p")
end
vim.env.TMPDIR = nvim_tmp
vim.env.TMP = nvim_tmp
vim.env.TEMP = nvim_tmp

-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
end
vim.opt.rtp:prepend(lazypath)

-- General Settings
vim.g.mapleader = ','
vim.opt.expandtab = true
vim.opt.smarttab = true
vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.shiftround = true
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.hidden = true
vim.opt.ttimeoutlen = 30
vim.opt.mouse = 'a'
vim.opt.completeopt = { 'longest', 'menuone', 'noinsert' }
vim.opt.autoread = true
vim.opt.list = true
vim.opt.listchars = { tab = '||' }
vim.opt.wildmode = { 'list', 'full' }
vim.opt.diffopt:append({ 'filler', 'iwhite' })
vim.opt.cursorline = true
vim.opt.clipboard = 'unnamedplus'
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.hlsearch = true
vim.opt.incsearch = true
vim.opt.magic = true
vim.opt.showmatch = true
vim.opt.mat = 2
vim.opt.autoindent = true
vim.opt.smartindent = true
vim.opt.laststatus = 2

-- Initialize plugins
require("lazy").setup({
  spec = {
    { "bluz71/vim-nightfly-colors", name = "nightfly", lazy = false, priority = 1000 },

    -- 1. LSP & Tool Management
    { "williamboman/mason.nvim", opts = {} },           -- Portable package manager
    { "WhoIsSethDaniel/mason-tool-installer.nvim",
        opts = {
            ensure_installed = {
                "clangd",
                "debugpy",
                "codelldb",
                "tree-sitter-cli",
                "cmake-language-server"
            },
        },
    },
    { "neovim/nvim-lspconfig" },                        -- Core LSP configurations
    
    -- 2. C++ & Python Specifics
    { "Civitasv/cmake-tools.nvim", opts = {} },         -- CMake integration (Build/Debug/Test)
    { "linux-cultist/venv-selector.nvim", opts = {} },  -- Python virtual environment switcher
    
    -- 3. Modern completion (2026 standard)
    {
        "Saghen/blink.cmp",
        version = "*" , 
        build = 'cargo build --release',
        opts = {
            keymap = { 
                preset = 'none',
                ['<C-space>'] = { 'show', 'show_documentation', 'hide_documentation' },
                ['<C-c>'] = { 'cancel', 'fallback' },
                ['<Tab>'] = { 'accept', 'fallback' },

                ['<C-j>'] = { 'select_next', 'fallback' },
                ['<C-k>'] = { 'select_prev', 'fallback' },
            },
            sources = {
                default = { 'lsp', 'path', 'snippets', 'buffer' },
            },
        },
    },

    -- 4. Syntax & UI
    {
        "nvim-treesitter/nvim-treesitter",
        branch = "master", -- This is the stable branch the community actually uses
        build = ":TSUpdate",
        config = function()
            -- The plural 'configs' works here because this branch has the legacy wrapper
            require('nvim-treesitter.configs').setup({
                ensure_installed = { "c", "cpp", "python", "lua", "json", "jsonc", "bash" },
                highlight = { enable = true },
            })
        end
    },
    { "nvim-telescope/telescope.nvim", dependencies = { "nvim-lua/plenary.nvim" } },
    { "folke/which-key.nvim", opts = {} },              -- Shows keybinding popups

    -- 5. File management
    { "stevearc/oil.nvim", opts = {}, dependencies = { "nvim-tree/nvim-web-devicons" } },

    -- 6. Bufferline
    { 
        "akinsho/bufferline.nvim",
        version = "*",
        dependencies = "nvim-tree/nvim-web-devicons",
        config = function()
            require("bufferline").setup({
                options = {
                    mode = "buffers", -- Show open buffers
                    offsets = {
                        {
                            filetype = "NvimTree",
                            text = "File Explorer",
                            text_align = "left",
                            separator = true,
                        }
                    },
                    -- Show LSP error icons directly on the tabs
                    diagnostics = "nvim_lsp",
                }
            })
        end
    },

    -- 7. devcontainer.nvim
    {
        "esensar/nvim-dev-container",
        dependencies = 'nvim-treesitter/nvim-treesitter',
        opts = {
            -- autocommands = true,
            attach_mounts = {
                neovim_config = {
                    enabled = true,
                    change_mountpoint = true,
                },
                neovim_data = {
                    enabled = true,
                }
            }
        }
    },
    -- 8. gitsigns.nvim
    {
        "lewis6991/gitsigns.nvim",
        opts = {
            current_line_blame = true,
            on_attach = function(bufnr)
                local gitsigns = require('gitsigns')
                local function map(mode, l, r, opts)
                    opts = opts or {}
                    opts.buffer = bufnr
                    vim.keymap.set(mode, l, r, opts)
                end
                -- Blame
                map('n', '<leader>gb', function() gitsigns.blame_line{full=true} end, { desc = "Git Line Blame" })
                
                -- Preview
                map('n', '<leader>gp', gitsigns.preview_hunk, { desc = "Git Preview Hunk" })
            end
        }
    },
    -- 9. barbecue
    {
        "utilyre/barbecue.nvim",
        name = "barbecue",
        version = "*",
        dependencies = {
            "SmiteshP/nvim-navic",
            "nvim-tree/nvim-web-devicons", -- optional dependency
        },
        opts = {
        },
    },
    {
        'nvimdev/lspsaga.nvim',
        config = function()
            require('lspsaga').setup({})
        end,
        dependencies = {
            'nvim-treesitter/nvim-treesitter', -- optional
            'nvim-tree/nvim-web-devicons',     -- optional
        }
    },
    { "rcarriga/nvim-dap-ui", dependencies = {"mfussenegger/nvim-dap", "nvim-neotest/nvim-nio"} }
},
})

-- Autogroup to help prevent autocommand from being created twice on reload
local main_group = vim.api.nvim_create_augroup('UserConfig', { clear = true })

-- Auto-start Treesitter highlighter for supported languages
vim.api.nvim_create_autocmd("FileType", {
    group = main_group,
    pattern = { "c", "cpp" },
    callback = function(args)
        vim.treesitter.start(args.buf)
    end,
})


-- Function to switch header/source
local function switch_source_header()
    local bufnr = vim.api.nvim_get_current_buf()
    local params = { uri = vim.uri_from_bufnr(bufnr) }

    vim.lsp.buf_request(bufnr, 'textDocument/switchSourceHeader', params, function(err, result)
        if err then
            print("LSP Error: " .. tostring(err))
        elseif result then
            vim.cmd('edit ' .. vim.uri_to_fname(result))
        else
            print("No corresponding header/source found.")
        end
    end)
end


------------------------------------------------------------------------------------------
---LSP Configs
------------------------------------------------------------------------------------------
-- Modern 2026 LSP Setup (No more lspconfig deprecation)
local on_attach = function(client, bufnr)
  local nmap = function(keys, func, desc)
    vim.keymap.set('n', keys, func, { buffer = bufnr, desc = 'LSP: ' .. desc })
  end

  nmap('gd', vim.lsp.buf.definition, '[G]oto [D]efinition')
  nmap('gr', require('telescope.builtin').lsp_references, '[G]oto [R]eferences')
  nmap('grr', require('telescope.builtin').lsp_references, '[G]oto [R]eferences')
  nmap('gri', require('telescope.builtin').lsp_implementations, '[G]oto [I]Implementations')
  -- nmap('K', vim.lsp.buf.hover, 'Hover Documentation')
  -- nmap('K', '<cmd>Lspsaga hover_doc', 'Hover Documentation')
  nmap('<leader>rn', vim.lsp.buf.rename, '[R]e[n]ame')
  nmap('<leader>ca', vim.lsp.buf.code_action, '[C]ode [A]ction')
  vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Show line diagnostics' })

  if client.name == "clangd" then
    nmap('<leader>o', switch_source_header, "Swap to source/header")
  end
end

vim.keymap.set('n', 'K', '<cmd>Lspsaga hover_doc<CR>')

-- 1. C++ (clangd) using the new native API
vim.lsp.config('clangd', {
  cmd = { "clangd", "--background-index", "--clang-tidy"},
  on_attach = on_attach,
  capabilities = require('blink.cmp').get_lsp_capabilities(),
})

-- 2. Python (basedpyright) using the new native API
vim.lsp.config('basedpyright', {
  on_attach = on_attach,
  capabilities = require('blink.cmp').get_lsp_capabilities(),
  settings = {
    basedpyright = {
      analysis = {
        typeCheckingMode = "basic",
      },
    },
  },
})

-- 3. Ruff for Python Linting
vim.lsp.config('ruff', {
  on_attach = on_attach,
})

vim.lsp.config('cmake', {
    on_attach = on_attach,
    capabilities = require('blink.cmp').get_lsp_capabilities(),
})

-- Enable the configs
vim.lsp.enable('clangd')
vim.lsp.enable('basedpyright')
vim.lsp.enable('ruff')
vim.lsp.enable('cmake')

-- Allow directory specific init.lua setups
vim.o.exrc = true

------------------------------------------------------------------------------------------
---END LSP Configs
------------------------------------------------------------------------------------------


-- Folding
vim.opt.foldmethod = 'syntax'
vim.opt.foldnestmax = 4
vim.opt.foldenable = false
vim.opt.foldlevel = 1

-- Movement Mappings
local keymap = vim.keymap.set

keymap('i', 'jk', '<Esc>')
keymap('n', 'n', 'nzz')
keymap('n', 'N', 'Nzz')
keymap('', 'L', '$')
keymap('', 'H', '^')

-- Leader shortcuts
keymap('n', '<leader>s', ':wq<cr>')
keymap('n', '<leader>w', ':w<cr>')
keymap('n', '<leader>q', ':q')

-- Insert mode movements
local insert_opts = { silent = true }
keymap('i', '<C-j>', '<C-o>j', insert_opts)
keymap('i', '<C-h>', '<C-o>h', insert_opts)
keymap('i', '<C-k>', '<C-o>k', insert_opts)
keymap('i', '<C-l>', '<C-o>l', insert_opts)
keymap('i', '<C-w>', '<C-o>w', insert_opts)
keymap('i', '<C-W>', '<C-o>W', insert_opts)
keymap('i', '<C-b>', '<C-o>b', insert_opts)
keymap('i', '<C-B>', '<C-o>B', insert_opts)
keymap('i', '<C-e>', '<C-o>e', insert_opts)
keymap('i', '<C-E>', '<C-o>E', insert_opts)

-- Have vim append src to the path
vim.opt.path:append({ "src" })
vim.opt.wildignore:append({ "**/build/*", "**/node_modules/*" })

-- VSCode Specific vs Neovim
if vim.g.vscode then
    vim.opt.hlsearch = false
    keymap('n', '<leader>f', "<Cmd>call VSCodeNotify('workbench.action.quickOpen')<CR>")
    keymap('n', '<leader>p', "<Cmd>call VSCodeNotify('workbench.action.showCommands')<CR>")
else
    -- Standard Neovim behavior
    keymap('i', '{<CR>', '{<CR>}<ESC>O')
    keymap('n', '<leader>n', ':normal ')
    keymap('v', '<leader>n', ':normal ')

    vim.keymap.set('n', ']b', '<Cmd>BufferLineCycleNext<CR>', { desc = 'Next Buffer' })
    vim.keymap.set('n', '[b', '<Cmd>BufferLineCyclePrev<CR>', { desc = 'Previous Buffer' })
    vim.keymap.set('n', '<leader>qq', '<Cmd>bdelete<CR>', { desc = 'Close Buffer' })

    -- Quickly edit init.lua
    vim.keymap.set('n', '<leader>vc', '<Cmd>edit $MYVIMRC<CR>', { desc = 'Edit MYVIMRC' })

    -- Reloading the config
    function ReloadConfig()
        -- Clear the cache for all your custom lua modules
        for name, _ in pairs(package.loaded) do
            -- Replace 'user' with the name of your config folder if different
            if name:match('^user') or name:match('^config') then
                package.loaded[name] = nil
            end
        end

        dofile(vim.env.MYVIMRC)
        vim.notify("Nvim configuration reloaded!", vim.log.levels.INFO)
    end
    -- Map it to a key (e.g., <leader>rs for "Reload Source")
    vim.keymap.set('n', '<leader>rs', ReloadConfig, { desc = 'Reload Config' })

    -- vim.highlight.priorities.semantic_tokens = 95

    vim.cmd('colorscheme nightfly') --
end

-- Python Host
vim.g.python3_host_prog = vim.fn.expand("~/.local/share/nvim/uv-venv/bin/python")

-- Telescope Setup
local builtin = require('telescope.builtin')
vim.keymap.set('n', '<leader>ff', builtin.find_files, { desc = 'Telescope find files'})
vim.keymap.set('n', '<leader>fg', builtin.live_grep, { desc = 'Telescope live grep'})
vim.keymap.set('n', '<leader>fb', builtin.buffers, { desc = 'Telescope buffers'})
vim.keymap.set('n', '<leader>fh', builtin.help_tags, { desc = 'Telescope help tags'})
vim.keymap.set('n', '<leader>fr', builtin.resume, { desc = 'Resume last search' })
vim.keymap.set('n', '<leader>ds', function()
    builtin.lsp_document_symbols(
        {
            symbol_width = 50,
        })
    end,
    { desc = 'Document symbols' }
)
vim.keymap.set('n', '<leader>ws', builtin.lsp_workspace_symbols, { desc = 'Workspace symbols' })

vim.keymap.set('n', '<leader>gw', builtin.grep_string, { desc = 'Grep current Word' })
vim.keymap.set('n', '<leader>D', require('telescope.builtin').diagnostics, { desc = 'Show all Diagnostics' })

require('telescope').setup{
    defaults = {
        mappings = {
            i = {
                ['jk'] = 'close', -- Use same escape sequence in telescope too
                ['<C-j>'] = require('telescope.actions').move_selection_next,
                ['<C-k>'] = require('telescope.actions').move_selection_previous,
                ['<C-f>'] = require('telescope.actions').preview_scrolling_down,
                ['<C-b>'] = require('telescope.actions').preview_scrolling_up,
            },
            n = {
                ['jk'] = 'close', -- Use same escape sequence in telescope too
                ['<C-f>'] = require('telescope.actions').preview_scrolling_down,
                ['<C-b>'] = require('telescope.actions').preview_scrolling_up,
            }
        }
    }
}

-- Oil.vim setup
vim.keymap.set('n', '-', "<CMD>Oil<CR>", { desc = "Open parent directory" })

vim.api.nvim_create_autocmd("FileType", {
    pattern = {"c", "h", "cpp", "hpp", "cmake"},
    callback = function()
        local map = vim.keymap.set
        local opts = { buffer = true}

        map("n", "<leader>cg", "<cmd>CMakeGenerate!<cr>", opts)
        map("n", "<leader>cb", "<cmd>CMakeBuild<cr>", opts)
        map("n", "<leader>ccb", "<cmd>CMakeBuild!<cr>", opts)
        map("n", "<leader>ct", "<cmd>CMakeSelectBuildTarget<cr>", opts)
        map("n", "<leader>cl", "<cmd>CMakeSelectLaunchTarget<cr>", opts)
        map("n", "<leader>cd", "<cmd>CMakeDebug<cr>", opts)
        map("n", "<leader>cx", "<cmd>CMakeStop<cr>", opts)
        map("n", "<leader>cr", "<cmd>CMakeRun<cr>", opts)
    end
})


------------------------------------------------------------------------------------------
---DAP Configs
------------------------------------------------------------------------------------------
local dap = require ('dap')
local dapui = require('dapui')
dapui.setup({
    mappings = {
        expand = { "l", "<2-LeftMouse>" },
        open = "o",
        remove = "d",
        edit = "e",
        repl = "r",
        toggle = { "t", "<space>" }
    }
})

dap.adapters.codelldb = {
    type = 'server',
    port = "${port}",
    executable = {
        command = vim.fn.stdpath("data") .. '/mason/bin/codelldb',
        args = {"--port", "${port}"},
    }
}
-- dap.adapters.codelldb = {
--     type = "server",
--     host = "127.0.0.1",
--     port = 13000
-- }

dap.listeners.before.attach.dapui_config = function()
    dapui.open()
end
dap.listeners.before.launch.dapui_config = function()
    dapui.open()
end
-- dap.listeners.before.event_terminated.dapui_config = function()
--     dapui.close()
-- end
dap.listeners.before.event_exited.dapui_config = function()
    dapui.close()
end


dap.configurations.cpp = {
    {
        name = 'Launch file',
        type = 'codelldb',
        request = 'launch',
        program = function()
            return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. '/', 'file')
        end,
        cwd = '${workspaceFolder}',
        stopOnEntry = true,
        console = 'integratedTerminal'
    }
}

vim.keymap.set('n', '<space>', function() require('dap').toggle_breakpoint() end)
vim.keymap.set('n', '<leader>du', function() require('dapui').toggle() end, { desc = "Debug: Toggle DAP UI"})
vim.keymap.set('n', '<leader>de', function() require('dapui').eval() end, { desc = "Debug: Eval Variable"})
vim.keymap.set('n', '<leader>dx', function() require('dapui').close() end, { desc = "Debug: Close UI"})

vim.fn.sign_define('DapBreakpoint', { text='', texthl='DapBreakpoint', linehl='', numhl='' })
vim.fn.sign_define('DapBreakpointCondition', { text='', texthl='DapBreakpoint', linehl='', numhl='' })
vim.fn.sign_define('DapLogPoint', { text='', texthl='DapLogPoint', linehl='', numhl='' })


-- Better handling for the callstack
local function jump_and_center_from_stacks()
  print("Special dap fn")
  local dapui = require("dapui")
  local current_win = vim.api.nvim_get_current_win()

  -- 1. Trigger the standard DAP UI "open" action (jumps to the file)
  dapui.open()

  -- 2. Once jumped, center the line in the newly focused buffer
  vim.cmd("normal! zz")

  -- 3. Return the cursor to the original stacks window
  vim.api.nvim_set_current_win(current_win)
end


local dap = require('dap')
local api = vim.api

local debug_keys = {
  K = function() require('dap.ui.widgets').hover() end,
  n = dap.step_over,
  i = dap.step_into,
  o = dap.step_out,
  c = dap.continue,
  X = dap.terminate,
  C = function() dap.set_breakpoint(vim.fn.input("Condition: ")) end,
}

local global_restore = {}

-- 1. Initialization: Set Globally
dap.listeners.after['event_initialized']['me'] = function()
  global_restore = {}
  
  -- Get all current global normal-mode mappings
  local current_global_maps = api.nvim_get_keymap('n')

  for lhs, callback in pairs(debug_keys) do
    local original_map = nil
    for _, map in pairs(current_global_maps) do
      if map.lhs == lhs then
        original_map = map
        break
      end
    end

    -- Save the original global state
    global_restore[lhs] = original_map or false
    
    -- Set the new global mapping (no 'buffer = buf' here)
    vim.keymap.set('n', lhs, callback, { silent = true, desc = "DAP: " .. lhs })

  end
  
  vim.cmd('highlight StatusLine guibg=#5f0000')
end

-- 2. Termination: Restore Globally
dap.listeners.after['event_terminated']['me'] = function()
  for lhs, original_map in pairs(global_restore) do
    -- Remove the global DAP mapping
    api.nvim_del_keymap('n', lhs)

    -- Restore original if it existed
    if original_map then
      api.nvim_set_keymap('n', lhs, original_map.rhs or "", {
        silent = original_map.silent == 1,
        callback = original_map.callback,
        desc = original_map.desc,
      })
    end
  end
  global_restore = {}
  vim.cmd('highlight StatusLine guibg=NONE')
end

-- vim.api.nvim_create_autocmd("FileType", {
--     pattern = "dapui_stacks",
--     callback = function(args)
--         vim.keymap.set("n", "O", jump_and_center_from_stacks, {
--             buffer = args.buf,
--             desc = "DAP UI: Preview stack frame"
--         })
--     end
-- })

------------------------------------------------------------------------------------------
---END DAP Configs
------------------------------------------------------------------------------------------
