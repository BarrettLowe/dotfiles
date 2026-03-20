-- keymaps.lua
-- Global keymaps: movement, leader shortcuts, window navigation, buffer management, picker/LSP/DAP shortcuts.
-- Plugin-specific keymaps that require setup are handled in their respective config modules.

local keymap = vim.keymap.set

-- ============================================================================
-- WINDOW NAVIGATION (smart: creates splits at edges)
-- ============================================================================

local function smart_win_nav(dir)
    local cur_win = vim.api.nvim_get_current_win()

    -- Try standard move
    vim.cmd('wincmd ' .. dir)

    -- If window didn't change → we were at edge → create new split
    if vim.api.nvim_get_current_win() == cur_win then
        if dir == 'h' or dir == 'l' then
            vim.cmd('vsplit')  -- vertical split for left/right
        else
            vim.cmd('split')   -- horizontal split for up/down
        end

        -- After creating, move into the new one (direction-aware)
        if dir == 'h' then vim.cmd('wincmd h') end
        if dir == 'l' then vim.cmd('wincmd l') end
        if dir == 'j' then vim.cmd('wincmd j') end
        if dir == 'k' then vim.cmd('wincmd k') end
    end
end

-- hjkl navigation
keymap('n', '<C-h>', function() smart_win_nav('h') end, { silent = true })
keymap('n', '<C-j>', function() smart_win_nav('j') end, { silent = true })
keymap('n', '<C-k>', function() smart_win_nav('k') end, { silent = true })
keymap('n', '<C-l>', function() smart_win_nav('l') end, { silent = true })

-- Arrow key variants
keymap('n', '<C-Left>', function() smart_win_nav('h') end, { silent = true })
keymap('n', '<C-Down>', function() smart_win_nav('j') end, { silent = true })
keymap('n', '<C-Up>', function() smart_win_nav('k') end, { silent = true })
keymap('n', '<C-Right>', function() smart_win_nav('l') end, { silent = true })

-- ============================================================================
-- MOVEMENT MAPPINGS
-- ============================================================================

keymap('i', 'jk', '<Esc>')
keymap('n', 'n', 'nzz')
keymap('n', 'N', 'Nzz')
keymap('', 'L', '$')
keymap('', 'H', '^')

-- ============================================================================
-- LEADER SHORTCUTS
-- ============================================================================

keymap('n', '<leader>s', ':wq<cr>')
keymap('n', '<leader>w', ':w<cr>')
keymap('n', '<leader>q<cr>', ':qall<cr>')

-- ============================================================================
-- INSERT MODE MOVEMENTS
-- ============================================================================

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

-- ============================================================================
-- BUFFER & WINDOW MANAGEMENT (non-VSCode)
-- ============================================================================

if not vim.g.vscode then
    -- Auto-close brace pairs
    keymap('i', '{<CR>', '{<CR>}<ESC>O')

    -- Inline normal command prefix
    keymap('n', '<leader>n', ':normal ')
    keymap('v', '<leader>n', ':normal ')

    -- Buffer cycling (requires bufferline.nvim)
    keymap('n', ']b', '<Cmd>BufferLineCycleNext<CR>', { desc = 'Next Buffer' })
    keymap('n', '[b', '<Cmd>BufferLineCyclePrev<CR>', { desc = 'Previous Buffer' })

    -- Close buffer or split
    keymap('n', '<leader>qq', function()
        if vim.fn.winnr('$') > 1 then
            vim.cmd('close')
        else
            vim.cmd('bd')
        end
    end, { desc = 'Close Buffer/Split' })

    -- Edit and reload config
    keymap('n', '<leader>vc', '<Cmd>edit $MYVIMRC<CR>', { desc = 'Edit MYVIMRC' })
end

-- Snacks picker keymaps are registered in lua/plugins/snacks.lua

-- ============================================================================
-- LSP KEYMAPS (registered per-buffer in lsp.lua on_attach)
-- ============================================================================
-- See: lua/config/lsp.lua for on_attach() function

-- CodeCompanion keymaps are registered in lua/plugins/codecompanion.lua

-- ============================================================================
-- CMAKE KEYMAPS (registered per-buffer in autocmds.lua)
-- ============================================================================
-- See: lua/config/autocmds.lua for CMAKE_* callbacks

-- ============================================================================
-- DAP KEYMAPS (registered dynamically during debugging in dap.lua)
-- ============================================================================
-- See: lua/config/dap.lua for debug_keys setup
-- Global DAP toggle keymaps:

if not vim.g.vscode then
    keymap('n', '<space>', function() require('dap').toggle_breakpoint() end, { desc = "DAP: Toggle Breakpoint" })
    keymap('n', '<leader>du', function() require('dapui').toggle() end, { desc = "Debug: Toggle DAP UI" })
    keymap('n', '<leader>de', function() require('dapui').eval() end, { desc = "Debug: Eval Variable" })
    keymap('n', '<leader>dx', function() require('dapui').close() end, { desc = "Debug: Close UI" })
end
