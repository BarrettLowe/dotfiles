-- lualine.lua
-- Lualine - https://github.com/nvim-lualine/lualine.nvim

return {
    'nvim-lualine/lualine.nvim',
    config = function()
        require('lualine').setup({
            options={
                theme="iceberg_dark"
            }
        })
    end,
    dependencies = {
        'nvim-tree/nvim-web-devicons',
    }
}
