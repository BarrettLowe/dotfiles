-- codecompanion.lua
-- CodeCompanion: AI assistant with local LLM adapters and keymaps.

return {
    "olimorris/codecompanion.nvim",
    version = "^18.0.0",
    dependencies = {
        "nvim-lua/plenary.nvim",
        "nvim-treesitter/nvim-treesitter",
        "ravitemer/codecompanion-history.nvim",
    },
    config = function()
        require("codecompanion").setup({
            opts = {
                log_level = "DEBUG"
            },
            adapters = {
                http = {
                    ollama_reasoning = function()
                        return require("codecompanion.adapters").extend("ollama", {
                            env = { url = "http://localhost:11434" },
                            schema = {
                                model = { default = "qwen2.5-coder:7b" },
                                num_ctx = { default = 16384 },
                            },
                        })
                    end,
                    ollama_fast = function()
                        return require("codecompanion.adapters").extend("ollama", {
                            env = { url = "http://localhost:11434" },
                            schema = {
                                model = { default = "codegemma:2b-code" },
                                parameters = {
                                    temperature = 0,
                                    num_predict = 1024,
                                }
                            }
                        })
                    end,
                }
            },
            strategies = {
                chat = {
                    adapter = "ollama_reasoning",
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
