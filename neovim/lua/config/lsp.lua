-- lsp.lua
-- LSP configuration: on_attach callbacks, server configs (clangd, basedpyright, ruff, cmake),
-- and per-buffer keymaps. Settings are applied via vim.lsp.config() with native 0.11+ API.

-- ============================================================================
-- ON_ATTACH CALLBACK (runs when LSP attaches to a buffer)
-- ============================================================================

local function on_attach(client, bufnr)
    local nmap = function(keys, func, desc)
        vim.keymap.set('n', keys, func, { buffer = bufnr, desc = 'LSP: ' .. desc })
    end

    -- Navigation
    nmap('gd', vim.lsp.buf.definition, '[G]oto [D]efinition')
    
    -- Refactoring
    nmap('<leader>rn', vim.lsp.buf.rename, '[R]e[n]ame')
    nmap('<leader>ca', vim.lsp.buf.code_action, '[C]ode [A]ction')
    
    -- Diagnostics
    vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { buffer = bufnr, desc = 'Show line diagnostics' })

    -- C++ specific: switch between header and source
    if client.name == "clangd" then
        nmap('<leader>o', function()
            local bufnr = vim.api.nvim_get_current_buf()
            local params = { uri = vim.uri_from_bufnr(bufnr) }

            vim.lsp.buf_request(bufnr, 'textDocument/switchSourceHeader', params, function(err, result)
                if err then
                    print("LSP Error: " .. tostring(err))
                elseif result then
                    vim.cmd('edit ' .. vim.uri_to_fname(result))
                else
                    print("No corresponding header/source found.")
                end
            end)
        end, 'Swap to source/header')
    end
end

-- ============================================================================
-- HOVER DOCUMENTATION (Lspsaga hover)
-- ============================================================================

vim.keymap.set('n', 'K', '<cmd>Lspsaga hover_doc<CR>', { desc = 'Hover Documentation' })

-- ============================================================================
-- LSP SERVER CONFIGURATIONS
-- ============================================================================

-- C++ (clangd)
vim.lsp.config('clangd', {
    cmd = { "clangd", "--background-index", "--clang-tidy", "--header-insertion=iwyu" },
    on_attach = on_attach,
    root_markers = { ".clangd", "compile_commands.json", ".git" },
    capabilities = {
        require('blink.cmp').get_lsp_capabilities({
            offsetEncoding = { "utf-16" },
        })
    },
})

-- Python (basedpyright)
vim.lsp.config('basedpyright', {
    on_attach = on_attach,
    capabilities = require('blink.cmp').get_lsp_capabilities(),
    settings = {
        basedpyright = {
            analysis = {
                typeCheckingMode = "basic",
            },
        },
    },
})

-- Python (ruff linter)
vim.lsp.config('ruff', {
    on_attach = on_attach,
})

-- CMake
vim.lsp.config('cmake', {
    on_attach = on_attach,
    capabilities = require('blink.cmp').get_lsp_capabilities(),
})

-- ============================================================================
-- ENABLE LSP SERVERS
-- ============================================================================

vim.lsp.enable('clangd')
vim.lsp.enable('basedpyright')
vim.lsp.enable('ruff')
vim.lsp.enable('cmake')
