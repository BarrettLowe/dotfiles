-- dev-container.lua
-- Dev container: seamless development inside containers with mounted config.

return {
    "esensar/nvim-dev-container",
    dependencies = 'nvim-treesitter/nvim-treesitter',
    opts = {
        attach_mounts = {
            neovim_config = {
                enabled = true,
                change_mountpoint = true,
            },
            neovim_data = {
                enabled = true,
            }
        }
    }
}
