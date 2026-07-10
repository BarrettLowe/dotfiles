-- fugitive.lua
-- Vim fugitive: Git integration commands and mappings.

return {
    "tpope/vim-fugitive",
    config = function()
        local keymap = vim.keymap.set

        -- Resolve the remote's default branch (main/master/whatever) instead of
        -- hardcoding one -- this config runs across repos that disagree on the name.
        local function default_branch()
            local ref = vim.fn.systemlist('git symbolic-ref refs/remotes/origin/HEAD')[1]
            if vim.v.shell_error == 0 and ref and ref ~= '' then
                return ref:gsub('^refs/remotes/', '')
            end
            return 'origin/master'
        end

        -- Build a QF list of files changed vs `ref`.
        -- In the QF window: <CR> opens the diff (matches fugitive's own :G + dv model).
        -- In the diff pane: ]q/[q navigate without returning to QF.
        local function diff_qf(ref)
            -- For ranges like "a..b", Gvdiffsplit only takes a single ref
            local base = ref:match('^(.-)%.%.') or ref

            local root = vim.fn.systemlist('git rev-parse --show-toplevel')[1]
            if vim.v.shell_error ~= 0 then
                vim.notify('Not in a git repo', vim.log.levels.ERROR)
                return
            end

            local all = vim.fn.systemlist('git diff --name-only ' .. vim.fn.shellescape(ref))
            if vim.v.shell_error ~= 0 then
                vim.notify('git diff failed for: ' .. ref, vim.log.levels.ERROR)
                return
            end
            local changed = vim.tbl_filter(function(f) return f ~= '' end, all)

            if #changed == 0 then
                vim.notify('Nothing differs (' .. ref .. ')', vim.log.levels.INFO)
                return
            end

            local items = {}
            for _, f in ipairs(changed) do
                table.insert(items, { filename = root .. '/' .. f, lnum = 1, col = 1, text = 'modified' })
            end
            vim.fn.setqflist({}, 'r', { title = 'diff: ' .. ref, items = items })
            -- Capture id so open_diff reads from this specific list even if
            -- another QF list is pushed on top later.
            local qf_id = vim.fn.getqflist({ id = 0 }).id

            vim.cmd('botright copen')
            vim.cmd('resize ' .. math.floor(vim.o.lines / 3))  -- bottom third

            local function open_diff(idx)
                -- id-scoped read guards against a stacked QF list shadowing ours
                local list = vim.fn.getqflist({ id = qf_id, items = 0 }).items
                local item = list[idx]
                if not item then return end
                local fname = item.filename or vim.fn.bufname(item.bufnr)
                local total = #list

                local qf_win
                for _, win in ipairs(vim.api.nvim_list_wins()) do
                    if vim.fn.win_gettype(win) == 'quickfix' then
                        qf_win = win
                        break
                    end
                end
                if not qf_win then return end

                for _, win in ipairs(vim.api.nvim_list_wins()) do
                    if win ~= qf_win then pcall(vim.api.nvim_win_close, win, true) end
                end

                -- Save window id before Gvdiffsplit grabs focus for the ref pane
                vim.cmd('aboveleft split ' .. vim.fn.fnameescape(fname))
                local file_win = vim.api.nvim_get_current_win()
                vim.cmd('Gvdiffsplit ' .. base)
                vim.api.nvim_set_current_win(file_win)
                -- Review-only: the git-ref pane is nomodifiable by default via fugitive,
                -- lock the working-copy pane the same way so neither side can be edited.
                vim.bo.readonly = true
                vim.bo.modifiable = false

                -- QuickFixCmdPost doesn't fire for :cnext/:cprev, so wire ]q/[q
                -- directly in the diff buffer for navigation without going to QF.
                vim.keymap.set('n', ']q', function()
                    if idx < total then open_diff(idx + 1) end
                end, { buffer = true, desc = 'Next diff file' })
                vim.keymap.set('n', '[q', function()
                    if idx > 1 then open_diff(idx - 1) end
                end, { buffer = true, desc = 'Prev diff file' })
            end

            -- buffer = true is correct here: <CR> is only mapped in the QF buffer,
            -- so vim.fn.line('.') reliably returns the QF entry index.
            --
            -- Deliberately NOT auto-opened on CursorMoved: fugitive's Gvdiffsplit
            -- spawns a git subprocess and reads its output into the buffer, and doing
            -- that from inside a CursorMoved callback silently breaks it (the read
            -- populates 1 blank line instead of the real content) -- textlock-like
            -- restrictions on autocmd contexts. A plain keymap callback works fine.
            vim.keymap.set('n', '<CR>', function()
                open_diff(vim.fn.line('.'))
            end, { buffer = true, desc = 'Open diff for qf entry' })
        end

        keymap('n', '<leader>gdm', function() diff_qf(default_branch() .. '..HEAD') end,
            { desc = 'Git diff vs origin default branch → quickfix' })

        keymap('n', '<leader>gdr', function()
            local ref = vim.fn.input('Diff ref(s): ')
            if ref ~= '' then diff_qf(ref) end
        end, { desc = 'Git diff vs ref → quickfix' })
    end,
}
