-- treesitter.lua
-- Treesitter: syntax highlighting and textobject support.

return {
    "nvim-treesitter/nvim-treesitter",
    branch = "master",
    build = ":TSUpdate",
    config = function()
        require('nvim-treesitter.configs').setup({
            ensure_installed = { "c", "cpp", "python", "lua", "json", "jsonc", "bash", "yaml", "markdown", "markdown_inline" },
            -- nvim-treesitter master is archived; highlighting is handled by Neovim's
            -- built-in treesitter (0.10+) to avoid nil-node crashes in injection queries
            highlight = { enable = false },
        })

        -- The archived nvim-treesitter master ships queries/markdown/injections.scm
        -- that uses #set-lang-from-info-string! — a custom directive Neovim 0.10+'s
        -- built-in injection engine doesn't support, producing nil nodes → range() crash.
        -- Override with standard @injection.language syntax to fix the crash.
        vim.treesitter.query.set('markdown', 'injections', [[
(fenced_code_block
  (info_string
    (language) @injection.language)
  (code_fence_content) @injection.content)

((html_block) @injection.content
  (#set! injection.language "html")
  (#set! injection.combined)
  (#set! injection.include-children))

((minus_metadata) @injection.content
  (#set! injection.language "yaml")
  (#offset! @injection.content 1 0 -1 0)
  (#set! injection.include-children))

((plus_metadata) @injection.content
  (#set! injection.language "toml")
  (#offset! @injection.content 1 0 -1 0)
  (#set! injection.include-children))

([
  (inline)
  (pipe_table_cell)
] @injection.content
  (#set! injection.language "markdown_inline"))
]])
    end
}
