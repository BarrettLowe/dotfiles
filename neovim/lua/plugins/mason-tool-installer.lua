-- mason-tool-installer.lua
-- Mason tool installer: ensure specific tools are installed.

return {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    opts = {
        ensure_installed = {
            "clangd",
            "clang-format",
            "basedpyright",
            "ruff",
            "debugpy",
            "codelldb",
            "tree-sitter-cli"
        },
    },
}
