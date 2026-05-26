-- themes.lua
-- Dark and light colorschemes. Active theme is determined at startup by
-- ~/.theme ("light" | "dark") and switched live by ~/dotfiles/bin/theme
-- via nvim's RPC socket (see serverstart() in init.lua).

return {
    {
        "bluz71/vim-nightfly-colors",
        name = "nightfly",
        lazy = false,
        priority = 1000,
    },
    {
        "projekt0n/github-nvim-theme",
        name = "github-theme",
        lazy = false,
        priority = 999,
    },
    {
        "cocopon/iceberg.vim",
        name = "iceberg",
        lazy = false,
        priority = 998,
    },
    {
        "rebelot/kanagawa.nvim",
        name = "kanagawa",
        lazy = false,
        priority = 997,
        config = function()
            require("kanagawa").setup({
                compile = false,
                undercurl = true,
                commentStyle = { italic = true },
                functionStyle = {},
                keywordStyle = { italic = true },
                statementStyle = { bold = true },
                typeStyle = {},
                transparent = false,
                dimInactive = false,
                terminalColors = true,
                colors = {
                    palette = {},
                    theme = { wave = {}, lotus = {}, dragon = {}, all = {} },
                },
                overrides = function(colors)
                    return {}
                end,
                theme = "wave",
                background = {
                    dark = "wave",
                    light = "lotus",
                },
            })
        end,
    },
}
