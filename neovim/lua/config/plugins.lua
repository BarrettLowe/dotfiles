-- plugins.lua
-- Lazy.nvim spec loader: requires each plugin's configuration from lua/plugins/*.lua
-- Each plugin file contains its spec, opts, config, and related keymaps/autocmds.

return {
  spec = {
    require("plugins.abolish"),
    require("plugins.ccc"),
    require("plugins.themes"),
    require("plugins.mason"),
    require("plugins.mason-tool-installer"),
    require("plugins.lspconfig"),
    require("plugins.cmake-tools"),
    require("plugins.venv-selector"),
    require("plugins.blink"),
    require("plugins.friendly-snippets"),
    require("plugins.treesitter"),
    require("plugins.treesitter-textobjects"),
    require("plugins.todo-comments"),
    require("plugins.snacks"),
    require("plugins.which-key"),
    require("plugins.barbecue"),
    require("plugins.lspsaga"),
    require("plugins.fugitive"),
    require("plugins.gitsigns"),
    require("plugins.surround"),
    require("plugins.dap-ui"),
    require("plugins.codecompanion"),
    require("plugins.lualine"),
    require("plugins.bufferline"),
  }
}

