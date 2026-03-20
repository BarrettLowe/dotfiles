-- todo-comments.lua
-- Todo comments: highlight and jump between TODO, FIXME, BEL comments.

return {
    "folke/todo-comments.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    opts = {
        signs = true,
        sign_priority = 8,
        keywords = {
            BEL = { icon = "", color = "personal", alt = {} }
        },
        colors = {
            personal = { "Personal", "#6f0880" }
        },
    }
}
