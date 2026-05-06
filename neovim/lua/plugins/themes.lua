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
}
