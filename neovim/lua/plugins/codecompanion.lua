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
                http = {
                    -- ollama_reasoning = function()
                    --     return require("codecompanion.adapters").extend("ollama", {
                    --         -- env = { url = "http://localhost:11434" },
                    --         env = { url = "http://127.0.0.1:1234" },
                    --         schema = {
                    --             -- model = { default = "qwen2.5-coder:7b" },
                    --             model = { default = "qwen/qwen3.5-9b" },
                    --             num_ctx = { default = 16384 },
                    --         },
                    --     })
                    -- end,
                    -- ollama_fast = function()
                    --     return require("codecompanion.adapters").extend("ollama", {
                    --         env = { url = "http://localhost:11434" },
                    --         schema = {
                    --             model = { default = "codegemma:2b-code" },
                    --             parameters = {
                    --                 temperature = 0,
                    --                 num_predict = 1024,
                    --             }
                    --         }
                    --     })
                    -- end,
                    lmstudio = function()
                        return require("codecompanion.adapters").extend("openai_compatible", {
                            name = "lmstudio",  -- friendly name
                            env = { url = "http://localhost:1234" },  -- LM Studio default port
                            schema = {
                                model = {
                                    default = "",  -- leave empty; it will query /v1/models
                                    num_ctx = { default = 16384 },
                                },
                                temperature = { default = 0.7 },
                                -- no api_key needed (LM Studio ignores it)
                            },
                        })
                    end,
                }
            },
            strategies = {
                chat = {
                    adapter = "lmstudio",
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
                inline = { adapter = "ollama_reasoning" },
            },
            rules = {
                default = {
                    description = "Collection of common files",
                    files = {
                        "~/dotfiles/AGENTS.md",
                        "AGENTS.md",
                        "AGENT.md",
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
                            "~/dotfiles/ai/skills",  -- Single directory (non-recursive)
                            { "~/.ai/skills", recursive = true },  -- Recursive search
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
