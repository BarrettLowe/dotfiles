-- fugitive.lua
-- Vim fugitive: Git integration commands and mappings.

return {
    "tpope/vim-fugitive",
    config = function()
        local keymap = vim.keymap.set

        -- Diff all changed files vs origin/master, load into quickfix
        keymap('n', '<leader>gdm', ':Git difftool -y origin/master..HEAD<CR>',
            { desc = 'Git diff vs origin/master → quickfix' })

        -- Diff all changed files vs a ref you type, load into quickfix
        keymap('n', '<leader>gdr', function()
            local ref = vim.fn.input('Diff ref(s): ')
            if ref ~= '' then
                vim.cmd('Git difftool -y ' .. ref)
            end
        end, { desc = 'Git diff vs ref → quickfix' })
    end
}
