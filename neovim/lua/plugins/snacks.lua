-- snacks.lua
-- Snacks.nvim: picker, explorer, and related keymaps.

return {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
        picker = { enabled = true },
        explorer = { enabled = true }
    },
    config = function(plugin, opts)
        require("snacks").setup(opts)
        
        -- All snacks keymaps
        if not vim.g.vscode then
            local keymap = vim.keymap.set
            local Snacks = require("snacks")
            
            keymap('n', '<leader>ff', function() Snacks.picker.smart() end, { desc = 'Find Files' })
            keymap('n', '<leader>fg', function() Snacks.picker.grep() end, { desc = 'Live Grep' })
            keymap('n', '<leader>fb', function() Snacks.picker.buffers() end, { desc = 'Buffers' })
            keymap('n', '<leader>fh', function() Snacks.picker.help() end, { desc = 'Help Tags' })
            keymap('n', '<leader>fr', function() Snacks.picker.recent() end, { desc = 'Recent Files' })
            keymap('n', '<leader>fw', function() Snacks.picker.grep_word() end, { desc = 'Find Current Word' })
            keymap('n', '<leader>fl', function() Snacks.picker.lines() end, { desc = 'Find Lines' })
            keymap('n', '<leader>D', function() Snacks.picker.diagnostics() end, { desc = 'Show all Diagnostics' })
            keymap('n', '<leader>ds', function() Snacks.picker.lsp_symbols() end, { desc = 'Document Symbols' })
            keymap('n', '<leader>ws', function() Snacks.picker.lsp_workspace_symbols() end, { desc = 'Workspace Symbols' })
            keymap('n', '<leader>fe', function() Snacks.explorer() end, { desc = 'File Explorer' })
            keymap('n', '<leader>ft', function() Snacks.picker.todo_comments() end, { desc = 'Todo Comments' })
        end
    end
}
