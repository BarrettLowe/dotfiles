// Live-changeable thinking level (reasoning effort) control.
//
// Adds:
//   /effort [level]   - set or pick the thinking level ("off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max")
//   /effort cycle     - step to the next supported level (wraps around)
//   ctrl+shift+t       - shortcut that cycles the thinking level
//   set_thinking_level - tool so the LLM itself can request a different effort level
//   footer status      - always shows the active thinking level
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

const ALL_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
type Level = (typeof ALL_LEVELS)[number];

function isLevel(x: string): x is Level {
  return (ALL_LEVELS as readonly string[]).includes(x);
}

// Levels that default to supported unless explicitly nulled out in thinkingLevelMap.
const STANDARD_LEVELS: readonly Level[] = ["off", "minimal", "low", "medium", "high"];
// Levels that are opt-in: unsupported unless the map gives them a non-null value.
const EXTENDED_LEVELS: readonly Level[] = ["xhigh", "max"];

/**
 * Levels the *current* model actually supports, in canonical order.
 *
 * Per models.md: an omitted key for a standard level (off..high) means the
 * provider's default mapping applies (i.e. supported); `null` hides it.
 * Extended levels (xhigh, max) are the opposite: unsupported unless the map
 * gives them an explicit non-null value.
 */
function supportedLevels(ctx: ExtensionContext): Level[] {
  const model = ctx.model;
  if (!model?.reasoning) return ["off"];

  const map = model.thinkingLevelMap;
  if (!map) return [...STANDARD_LEVELS];

  const levels: Level[] = STANDARD_LEVELS.filter((lvl) => map[lvl] !== null);
  for (const lvl of EXTENDED_LEVELS) {
    if (map[lvl] !== undefined && map[lvl] !== null) levels.push(lvl);
  }
  return levels;
}

function statusText(level: Level): string {
  return `🧠 effort: ${level}`;
}

export default function (pi: ExtensionAPI) {
  const updateStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus("thinking-level", statusText(pi.getThinkingLevel() as Level));
  };

  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("thinking_level_select", async (event, ctx) => {
    ctx.ui.setStatus("thinking-level", statusText(event.level as Level));
    ctx.ui.notify(`Thinking level: ${event.previousLevel ?? "?"} -> ${event.level}`, "info");
  });

  pi.registerCommand("effort", {
    description: "Show, set, or cycle the model's thinking/effort level",
    getArgumentCompletions: (prefix) => {
      const candidates = [...ALL_LEVELS, "cycle"];
      const filtered = candidates
        .filter((c) => c.startsWith(prefix))
        .map((c) => ({ value: c, label: c }));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      const levels = supportedLevels(ctx);

      if (arg === "cycle") {
        const current = pi.getThinkingLevel() as Level;
        const idx = levels.indexOf(current);
        const next = levels[(idx + 1) % levels.length] ?? levels[0];
        pi.setThinkingLevel(next);
        return;
      }

      if (arg) {
        if (!isLevel(arg)) {
          ctx.ui.notify(`Unknown level "${arg}". Valid: ${ALL_LEVELS.join(", ")}`, "error");
          return;
        }
        pi.setThinkingLevel(arg);
        return;
      }

      // No argument: interactive picker.
      const current = pi.getThinkingLevel();
      const labels = levels.map((lvl) => (lvl === current ? `${lvl} (current)` : lvl));
      const choice = await ctx.ui.select("Select thinking level:", labels);
      if (choice) {
        const picked = levels[labels.indexOf(choice)];
        if (picked) pi.setThinkingLevel(picked);
      }
    },
  });

  pi.registerShortcut("ctrl+shift+t", {
    description: "Cycle thinking/effort level",
    handler: async (ctx) => {
      const levels = supportedLevels(ctx);
      const current = pi.getThinkingLevel() as Level;
      const idx = levels.indexOf(current);
      const next = levels[(idx + 1) % levels.length] ?? levels[0];
      pi.setThinkingLevel(next);
    },
  });

  pi.registerTool({
    name: "set_thinking_level",
    label: "Set Thinking Level",
    description:
      "Change the model's thinking/reasoning effort level live (e.g. to think harder about a hard problem, or go fast for a trivial one).",
    parameters: Type.Object({
      level: StringEnum(ALL_LEVELS, {
        description: "Desired thinking level",
      }),
    }),
    async execute(_toolCallId, params) {
      const before = pi.getThinkingLevel();
      pi.setThinkingLevel(params.level as Level);
      const after = pi.getThinkingLevel();
      return {
        content: [
          {
            type: "text",
            text:
              after === params.level
                ? `Thinking level set to "${after}" (was "${before}").`
                : `Requested "${params.level}", but the active model clamped it to "${after}".`,
          },
        ],
        details: { before, requested: params.level, after },
      };
    },
  });
}
