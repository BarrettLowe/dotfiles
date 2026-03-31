-- autocmds.lua
-- All autocommands: treesitter setup, CMake pattern handlers, DAP UI helpers, and config reloading.

-- ============================================================================
-- GLOBAL AUTOCOMMAND GROUP
-- ============================================================================

local main_group = vim.api.nvim_create_augroup('UserConfig', { clear = true })

-- ============================================================================
-- TREESITTER AUTO-START & TEXTOBJECT KEYMAPS
-- ============================================================================

-- Auto-start Treesitter highlighter for supported languages
vim.api.nvim_create_autocmd("FileType", {
    group = main_group,
    pattern = { "c", "cpp" },
    callback = function(args)
        vim.treesitter.start(args.buf)
    end,
})

-- Treesitter textobject navigation keymaps
-- These are independent of the TreesitterTextobjects plugin and use require() on demand
local function setup_textobject_maps()
    local ts_move = require("nvim-treesitter-textobjects.move")
    
    -- Next start
    vim.keymap.set({ "n", "x", "o" }, "]m", function()
        ts_move.goto_next_start("@function.outer", "textobjects")
    end, { desc = "Next function start" })
    
    vim.keymap.set({ "n", "x", "o" }, "]]", function()
        ts_move.goto_next_start("@class.outer", "textobjects")
    end, { desc = "Next class start" })
    
    vim.keymap.set({ "n", "x", "o" }, "]o", function()
        ts_move.goto_next_start({"@loop.inner", "@loop.outer"}, "textobjects")
    end, { desc = "Next loop start" })
    
    vim.keymap.set({ "n", "x", "o" }, "]s", function()
        ts_move.goto_next_start("@local.scope", "locals")
    end, { desc = "Next scope start" })
    
    vim.keymap.set({ "n", "x", "o" }, "]z", function()
        ts_move.goto_next_start("@fold", "folds")
    end, { desc = "Next fold start" })
    
    -- Next end
    vim.keymap.set({ "n", "x", "o" }, "]M", function()
        ts_move.goto_next_end("@function.outer", "textobjects")
    end, { desc = "Next function end" })
    
    vim.keymap.set({ "n", "x", "o" }, "][", function()
        ts_move.goto_next_end("@class.outer", "textobjects")
    end, { desc = "Next class end" })
    
    -- Previous start
    vim.keymap.set({ "n", "x", "o" }, "[m", function()
        ts_move.goto_previous_start("@function.outer", "textobjects")
    end, { desc = "Prev function start" })
    
    vim.keymap.set({ "n", "x", "o" }, "[[", function()
        ts_move.goto_previous_start("@class.outer", "textobjects")
    end, { desc = "Prev class start" })
    
    -- Previous end
    vim.keymap.set({ "n", "x", "o" }, "[M", function()
        ts_move.goto_previous_end("@function.outer", "textobjects")
    end, { desc = "Prev function end" })
    
    vim.keymap.set({ "n", "x", "o" }, "[]", function()
        ts_move.goto_previous_end("@class.outer", "textobjects")
    end, { desc = "Prev class end" })
    
    -- Conditionals (either start or end)
    vim.keymap.set({ "n", "x", "o" }, "]d", function()
        ts_move.goto_next("@conditional.outer", "textobjects")
    end, { desc = "Next conditional" })
    
    vim.keymap.set({ "n", "x", "o" }, "[d", function()
        ts_move.goto_previous("@conditional.outer", "textobjects")
    end, { desc = "Prev conditional" })
end

setup_textobject_maps()

-- ============================================================================
-- CMAKE PATTERN KEYMAPS
-- ============================================================================

vim.api.nvim_create_autocmd("FileType", {
    group = main_group,
    pattern = {"c", "h", "cpp", "hpp", "cmake"},
    callback = function()
        local map = vim.keymap.set
        local opts = { buffer = true, desc = "CMake" }

        map("n", "<leader>cg", "<cmd>CMakeGenerate!<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Generate" }))
        map("n", "<leader>cb", "<cmd>CMakeBuild<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Build" }))
        map("n", "<leader>cB", "<cmd>CMakeBuild!<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Build (force)" }))
        map("n", "<leader>ct", "<cmd>CMakeSelectBuildTarget<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Select target" }))
        map("n", "<leader>cl", "<cmd>CMakeSelectLaunchTarget<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Select launch" }))
        map("n", "<leader>cd", "<cmd>CMakeDebug<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Debug" }))
        map("n", "<leader>cx", "<cmd>CMakeStop<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Stop" }))
        map("n", "<leader>cr", "<cmd>CMakeRun<cr>", vim.tbl_extend('force', opts, { desc = "CMake: Run" }))
    end
})

-- ============================================================================
-- DAP UI HELPERS
-- ============================================================================

-- Close dapui hover windows when cursor moves (avoid accidental text modifications)
vim.api.nvim_create_autocmd("FileType", {
    group = main_group,
    pattern = "dap-float",
    callback = function(args)
        vim.api.nvim_create_autocmd("CursorMoved", {
            buffer = args.buf,
            once = true,
            callback = function()
                vim.api.nvim_win_close(0, true)
            end,
        })
    end,
})

-- ============================================================================
-- CONFIG RELOADING HELPER
-- ============================================================================

function ReloadConfig()
    -- Clear the cache for all custom lua modules
    for name, _ in pairs(package.loaded) do
        -- Reload modules matching config namespace
        if name:match('^config') then
            package.loaded[name] = nil
        end
    end

    -- Reload the init.lua
    dofile(vim.env.MYVIMRC)
    vim.notify("Nvim configuration reloaded!", vim.log.levels.INFO)
end

-- Bind reload to a keymap (registered in keymaps.lua)
if not vim.g.vscode then
    vim.keymap.set('n', '<leader>rs', ReloadConfig, { desc = 'Reload Config' })
end
