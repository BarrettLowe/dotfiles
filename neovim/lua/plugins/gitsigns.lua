-- gitsigns.lua
-- Gitsigns: git integration with blame and hunk preview keymaps.

return {
    "lewis6991/gitsigns.nvim",
    opts = {
        current_line_blame = true,
        sign_priority = 100,
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
}
