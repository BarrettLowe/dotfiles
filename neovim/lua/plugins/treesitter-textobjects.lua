-- treesitter-textobjects.lua
-- Treesitter textobjects: motion support (configured via init in autocmds.lua).

return {
    "nvim-treesitter/nvim-treesitter-textobjects",
    branch = "main",
    init = function()
        -- Disable built-in plugin maps to avoid conflicts
        vim.g.no_plugin_maps = true
    end,
}
