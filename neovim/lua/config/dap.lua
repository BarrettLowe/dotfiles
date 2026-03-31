-- dap.lua
-- DAP (Debug Adapter Protocol) configuration: adapters, UI setup, breakpoints, debug keymaps, and state management.

local dap = require('dap')
local dapui = require('dapui')
local api = vim.api

-- ============================================================================
-- DAPUI SETUP
-- ============================================================================

dapui.setup({
    mappings = {
        expand = { "l", "<2-LeftMouse>" },
        open = "o",
        remove = "d",
        edit = "e",
        repl = "r",
        toggle = { "t", "<space>" }
    }
})

-- ============================================================================
-- DAP ADAPTERS
-- ============================================================================

-- CodeLLDB adapter for C++
dap.adapters.codelldb = {
    type = 'server',
    port = "${port}",
    executable = {
        command = vim.fn.stdpath("data") .. '/mason/bin/codelldb',
        args = {"--port", "${port}"},
    }
}

-- ============================================================================
-- DAP LISTENERS (auto open/close UI on debug session events)
-- ============================================================================

dap.listeners.before.attach.dapui_config = function()
    dapui.open()
end

dap.listeners.before.launch.dapui_config = function()
    dapui.open()
end

dap.listeners.before.event_exited.dapui_config = function()
    dapui.close()
end

-- ============================================================================
-- LAUNCH CONFIGURATIONS
-- ============================================================================

dap.configurations.cpp = {
    {
        name = 'Launch file',
        type = 'codelldb',
        request = 'launch',
        program = function()
            return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. '/', 'file')
        end,
        cwd = '${workspaceFolder}',
        stopOnEntry = false,
        console = 'integratedTerminal'
    }
}

-- ============================================================================
-- BREAKPOINT SIGNS
-- ============================================================================

vim.fn.sign_define('DapBreakpoint', { text='', texthl='DapBreakpoint', linehl='', numhl='' })
vim.fn.sign_define('DapBreakpointCondition', { text='', texthl='DapBreakpoint', linehl='', numhl='' })
vim.fn.sign_define('DapLogPoint', { text='', texthl='DapLogPoint', linehl='', numhl='' })

-- ============================================================================
-- DEBUG MODE KEYMAPS (dynamically set during session)
-- ============================================================================

local debug_keys = {
    K = function() require('dap.ui.widgets').hover() end,
    n = dap.step_over,
    i = dap.step_into,
    o = dap.step_out,
    c = dap.continue,
    X = dap.terminate,
    C = function() dap.set_breakpoint(vim.fn.input("Condition: ")) end,
}

local global_restore = {}

-- Store and apply debug keymaps on debug session start
dap.listeners.after['event_initialized']['me'] = function()
    global_restore = {}
    
    -- Get all current global normal-mode mappings
    local current_global_maps = api.nvim_get_keymap('n')

    for lhs, callback in pairs(debug_keys) do
        local original_map = nil
        for _, map in pairs(current_global_maps) do
            if map.lhs == lhs then
                original_map = map
                break
            end
        end

        -- Save the original global state
        global_restore[lhs] = original_map or false
        
        -- Set the new global mapping
        vim.keymap.set('n', lhs, callback, { silent = true, desc = "DAP: " .. lhs })
    end
    
    -- Visual indicator: red status line during debugging
    vim.cmd('highlight StatusLine guibg=#5f0000')
end

-- Restore original keymaps and highlighting on debug session end
dap.listeners.after['event_terminated']['me'] = function()
    for lhs, original_map in pairs(global_restore) do
        -- Remove the global DAP mapping
        api.nvim_del_keymap('n', lhs)

        -- Restore original if it existed
        if original_map then
            api.nvim_set_keymap('n', lhs, original_map.rhs or "", {
                silent = original_map.silent == 1,
                callback = original_map.callback,
                desc = original_map.desc,
            })
        end
    end
    global_restore = {}
    vim.cmd('highlight StatusLine guibg=NONE')
end
