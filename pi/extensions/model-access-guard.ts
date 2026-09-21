// Blocks certain models from reading/editing files under specific paths,
// based on rules in ~/.pi/agent/model-access.json.
//
// Config shape:
// {
//   "enabled": true,
//   "rules": [
//     { "modelPattern": "anthropic/*", "path": "/path/to/repo", "globs": ["**/*.cpp", "**/*.hpp"] }
//   ]
// }
//
// Toggle at runtime with /model-guard on|off|status (session-only, does not edit the config file).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "model-access.json");

interface Rule {
  modelPattern: string;
  path: string;
  globs: string[];
}

interface Config {
  enabled: boolean;
  rules: Rule[];
}

function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

function loadConfig(): Config {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return {
      enabled: raw.enabled ?? true,
      rules: Array.isArray(raw.rules) ? raw.rules : [],
    };
  } catch {
    return { enabled: true, rules: [] };
  }
}

// Convert a limited glob syntax (*, **, ?) to a RegExp. Not a full glob
// implementation, but enough for path/extension matching in rules.
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") {
      out += "(?:.*/)?";
      i += 2;
    } else if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i += 1;
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += ".";
    } else if (".+^${}()|[]\\".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

function modelMatches(pattern: string, provider: string, id: string): boolean {
  return globToRegExp(pattern).test(`${provider}/${id}`);
}

interface BlockCheck {
  blocked: boolean;
  reason?: string;
}

function checkPath(absPath: string, provider: string, id: string, rules: Rule[]): BlockCheck {
  for (const rule of rules) {
    if (!modelMatches(rule.modelPattern, provider, id)) continue;

    const ruleRoot = resolve(expandHome(rule.path));
    if (absPath !== ruleRoot && !absPath.startsWith(ruleRoot + sep)) continue;

    const rel = relative(ruleRoot, absPath);
    for (const glob of rule.globs) {
      if (globToRegExp(glob).test(rel)) {
        return {
          blocked: true,
          reason: `Blocked by model-access-guard: model "${provider}/${id}" matches "${rule.modelPattern}" and "${rel}" matches "${glob}" under ${rule.path}. This file is off-limits to this model.`,
        };
      }
    }
  }
  return { blocked: false };
}

// Extract a plain "ext" (no wildcard chars) from a glob's trailing
// ".ext" segment, e.g. "**/*.cpp" -> "cpp". Returns undefined if the
// glob doesn't end in a simple extension.
function extractExtension(glob: string): string | undefined {
  const match = glob.match(/\.([A-Za-z0-9_+-]+)$/);
  return match ? match[1] : undefined;
}

function checkBashCommand(command: string, provider: string, id: string, rules: Rule[]): BlockCheck {
  for (const rule of rules) {
    if (!modelMatches(rule.modelPattern, provider, id)) continue;
    if (!command.includes(rule.path)) continue;

    const extensions = rule.globs.map(extractExtension).filter((e): e is string => !!e);
    if (extensions.some((ext) => command.includes(`.${ext}`))) {
      return {
        blocked: true,
        reason: `Blocked by model-access-guard: command references restricted path "${rule.path}" and a blocked file type for model "${provider}/${id}".`,
      };
    }
  }
  return { blocked: false };
}

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  let runtimeEnabled: boolean | undefined;

  const isEnabled = () => runtimeEnabled ?? config.enabled;

  pi.registerCommand("model-guard", {
    description: "Toggle or check the model-access-guard extension (on|off|status)",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on" || arg === "off") {
        runtimeEnabled = arg === "on";
        ctx.ui.notify(`model-guard: ${arg.toUpperCase()} (this session)`, "info");
        return;
      }
      const override = runtimeEnabled !== undefined ? `, session override active` : "";
      ctx.ui.notify(`model-guard: ${isEnabled() ? "ON" : "OFF"} (config default: ${config.enabled ? "on" : "off"}${override})`, "info");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isEnabled() || config.rules.length === 0) return;
    const provider = ctx.model.provider;
    const id = ctx.model.id;

    if (isToolCallEventType("read", event) || isToolCallEventType("edit", event)) {
      const absPath = isAbsolute(event.input.path) ? event.input.path : join(ctx.cwd, event.input.path);
      const result = checkPath(absPath, provider, id, config.rules);
      if (result.blocked) return { block: true, reason: result.reason };
    }

    if (isToolCallEventType("bash", event)) {
      const result = checkBashCommand(event.input.command, provider, id, config.rules);
      if (result.blocked) return { block: true, reason: result.reason };
    }
  });
}
