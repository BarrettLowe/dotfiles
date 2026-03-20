-- blink.lua
-- Blink completion engine: keymaps and configuration.

return {
    "Saghen/blink.cmp",
    version = "*",
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
}
