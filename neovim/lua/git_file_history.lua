local M = {}

function M.setup()
  vim.api.nvim_create_user_command("Gfilehistory", function()
    local file = vim.fn.expand("%")
    if file == "" then
      vim.notify("No file in current buffer", vim.log.levels.ERROR)
      return
    end

    -- Get commits affecting this file
    local cmd = string.format("git log --oneline -- %s", vim.fn.shellescape(file))
    local handle = io.popen(cmd)
    if not handle then
      vim.notify("Failed to run git log", vim.log.levels.ERROR)
      return
    end

    local commits = {}
    for line in handle:lines() do
      if line ~= "" then
        table.insert(commits, line)
      end
    end
    handle:close()

    if #commits == 0 then
      vim.notify("No commits found for this file", vim.log.levels.WARN)
      return
    end

    -- Convert to quickfix format
    local qf_list = {}
    for i, commit_line in ipairs(commits) do
      local sha = commit_line:match("^(%S+)")
      table.insert(qf_list, {
        lnum = i,
        col = 1,
        text = commit_line,
        filename = file,
        user_data = {
          commit = sha,
          file = file,
        },
      })
    end

    -- Populate quickfix list and open it
    vim.fn.setqflist(qf_list, "r")
    vim.cmd("copen")

    -- After copen, current buffer is the quickfix buffer — map <CR> to diff
    local qf_bufnr = vim.api.nvim_get_current_buf()
    vim.keymap.set("n", "<CR>", function()
      M.diff_at_quickfix()
    end, { buffer = qf_bufnr, noremap = true, silent = true })
  end, {})

  -- Command to diff at current quickfix position
  vim.api.nvim_create_user_command("GfilehistoryDiff", function()
    M.diff_at_quickfix()
  end, {})
end

function M.diff_at_quickfix()
  local qf_idx = vim.fn.line(".") - 1
  local qf_list = vim.fn.getqflist()

  if qf_idx < 0 or qf_idx >= #qf_list then
    return
  end

  local item = qf_list[qf_idx + 1]
  if not item.user_data or not item.user_data.commit then
    return
  end

  local commit = item.user_data.commit
  local file = item.user_data.file

  -- Close quickfix
  vim.cmd("cclose")

  -- Navigate to the file buffer
  local bufnr = vim.fn.bufnr(file)
  if bufnr == -1 then
    vim.cmd(string.format("edit %s", vim.fn.shellescape(file)))
  else
    vim.cmd(string.format("buffer %d", bufnr))
  end

  -- Vertical diffsplit: working tree on right, commit version on left
  vim.cmd(string.format("Gvdiffsplit %s:%%", commit))
end

return M
