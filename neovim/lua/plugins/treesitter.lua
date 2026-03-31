-- treesitter.lua
-- Treesitter: syntax highlighting and textobject support.

return {
    "nvim-treesitter/nvim-treesitter",
    branch = "master",
    build = ":TSUpdate",
    config = function()
        require('nvim-treesitter.configs').setup({
            ensure_installed = { "c", "cpp", "python", "lua", "json", "jsonc", "bash", "yaml" },
            highlight = { enable = true },
        })
    end
}
