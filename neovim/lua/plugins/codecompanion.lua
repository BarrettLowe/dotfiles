-- codecompanion.lua
-- CodeCompanion: AI assistant with local LLM adapters and keymaps.

return {
    "olimorris/codecompanion.nvim",
    dependencies = {
        "nvim-lua/plenary.nvim",
        "nvim-treesitter/nvim-treesitter",
        "ravitemer/codecompanion-history.nvim",
        "cairijun/codecompanion-agentskills.nvim",
    },
    config = function()
        require("codecompanion").setup({
            opts = {
                log_level = "DEBUG"
            },
            adapters = {
                acp = {
                    claude_code = function()
                        return require("codecompanion.adapters").extend("claude_code", {})
                    end,
                },
                http = {
                    llama_cpp = function()
                        return require("codecompanion.adapters").extend("openai_compatible", {
                            name = "llama_cpp",  -- friendly name
                            env = { url = "http://localhost:8888" },  -- llama.cpp server default port
                            schema = {
                                model = {
                                    default = "Ornith-1.0-35B-UD-Q4_K_M",  -- leave empty; it will query /v1/models
                                    num_ctx = { default = 16384 },
                                },
                                temperature = { default = 0.7 },
                                -- no api_key needed (llama.cpp ignores it)
                            },
                        })
                    end,
                }
            },
            strategies = {
                chat = {
                    adapter = "claude_code",
                    tools = {
                        groups = {
                            ["read_only"] = {
                                description = "Read-only tools - no file modifications",
                                system_prompt = "I'm giving you access to ${tools} to help you explore and understand the codebase",
                                tools = {
                                    "file_search",
                                    "get_changed_files",
                                    "grep_search",
                                    "list_code_usages",
                                    "read_file",
                                },
                                opts = {
                                    collapse_tools = false,
                                },
                            },
                        },
                    },
                },
                inline = { adapter = "llama_cpp" },
            },
            rules = {
                default = {
                    description = "Collection of common files",
                    files = {
                        "~/dotfiles/ai/AGENTS_.md",
                        "CLAUDE.md",
                        "AGENTS.md",
                    }
                },
            },
            prompt_library = {
                markdown = {
                    dirs = {"~/dotfiles/neovim/ai/prompts"},
                },
            },
            extensions = {
                history = {
                    enabled = true,
                    opts = {
                        picker = "snacks",
                    }
                },
                agentskills = {
                    opts = {
                        paths = {
                            "~/dotfiles/ai/skills",  -- Claude Code skills
                            { "~/.ai/skills", recursive = true },  -- Local overrides
                        }
                    }
                }
            },
        })
        
        -- CodeCompanion keymaps
        if not vim.g.vscode then
            local keymap = vim.keymap.set
            keymap({ "n", "v" }, "<leader>ai", "<cmd>CodeCompanion<cr>", {
                desc = "CodeCompanion: Inline assistant",
                noremap = true,
                silent = true,
            })
            keymap({ "n", "v" }, "<leader>ac", "<cmd>CodeCompanionChat Toggle<cr>", {
                desc = "CodeCompanion: Toggle Chat Window",
                noremap = true,
                silent = true,
            })
        end
    end
}
