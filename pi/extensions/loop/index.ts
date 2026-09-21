import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  findNextLoop,
  formatCountdown,
  formatDuration,
  type LoopDefinition,
  normalizeMissedLoops,
  parseLoopSpec,
  shouldDispatchDueLoops,
} from "./loop-core.ts";

const STATE_ENTRY = "loop-state";
const MESSAGE_TYPE = "loop-prompt";
const STATUS_KEY = "loop-countdown";

interface LoopState {
  version: 1;
  nextId: number;
  footerEnabled: boolean;
  loops: LoopDefinition[];
}

function initialState(): LoopState {
  return { version: 1, nextId: 1, footerEnabled: true, loops: [] };
}

function restoreState(ctx: ExtensionContext): LoopState {
  let restored: LoopState | undefined;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
    const data = entry.data as Partial<LoopState> | undefined;
    if (data?.version !== 1 || !Array.isArray(data.loops)) continue;

    restored = {
      version: 1,
      nextId: typeof data.nextId === "number" ? data.nextId : 1,
      footerEnabled: data.footerEnabled !== false,
      loops: data.loops.filter(
        (loop): loop is LoopDefinition =>
          typeof loop?.id === "number" &&
          typeof loop.intervalMs === "number" &&
          typeof loop.prompt === "string" &&
          typeof loop.enabled === "boolean" &&
          typeof loop.nextRunAt === "number",
      ),
    };
  }

  return restored ?? initialState();
}

function loopLabel(loop: LoopDefinition, now: number): string {
  const status = loop.enabled ? `in ${formatCountdown(loop.nextRunAt - now)}` : "paused";
  const prompt = loop.prompt.replace(/\s+/g, " ");
  const preview = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
  return `#${loop.id} · ${formatDuration(loop.intervalMs)} · ${status} · ${preview}`;
}

export default function loopExtension(pi: ExtensionAPI) {
  let state = initialState();
  let sessionContext: ExtensionContext | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let ticking = false;
  let agentRunActive = false;

  const persist = () => {
    pi.appendEntry(STATE_ENTRY, {
      ...state,
      loops: state.loops.map((loop) => ({ ...loop })),
    });
  };

  const updateFooter = (ctx: ExtensionContext) => {
    const next = findNextLoop(state.loops);
    if (!state.footerEnabled || !next) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    ctx.ui.setStatus(STATUS_KEY, `⟳ #${next.id} in ${formatCountdown(next.nextRunAt - Date.now())}`);
  };

  const dispatch = (loop: LoopDefinition) => {
    pi.sendMessage(
      {
        customType: MESSAGE_TYPE,
        content: `Recurring loop #${loop.id}: ${loop.prompt}`,
        display: true,
        details: { loopId: loop.id, intervalMs: loop.intervalMs },
      },
      { deliverAs: "followUp", triggerTurn: true },
    );
  };

  const tick = () => {
    const ctx = sessionContext;
    if (!ctx || ticking) return;
    ticking = true;

    try {
      const now = Date.now();
      const due = state.loops.filter((loop) => loop.enabled && loop.nextRunAt <= now);
      if (due.length > 0 && !shouldDispatchDueLoops(ctx.isIdle(), agentRunActive)) {
        updateFooter(ctx);
        return;
      }
      if (due.length > 0) {
        for (const loop of due) {
          loop.nextRunAt = now + loop.intervalMs;
        }
        persist();
        for (const loop of due) dispatch(loop);
      }
      updateFooter(ctx);
    } finally {
      ticking = false;
    }
  };

  const restartTicker = (ctx: ExtensionContext) => {
    if (ticker) clearInterval(ticker);
    sessionContext = ctx;
    ticker = setInterval(tick, 1_000);
    updateFooter(ctx);
  };

  const loadSession = (ctx: ExtensionContext) => {
    agentRunActive = false;
    state = restoreState(ctx);
    if (normalizeMissedLoops(state.loops, Date.now())) persist();
    restartTicker(ctx);
  };

  pi.on("session_start", async (_event, ctx) => loadSession(ctx));
  pi.on("session_tree", async (_event, ctx) => loadSession(ctx));
  pi.on("agent_start", async () => {
    agentRunActive = true;
  });
  pi.on("agent_end", async () => {
    agentRunActive = false;
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    sessionContext = undefined;
    agentRunActive = false;
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.registerCommand("loop", {
    description: "Run a recurring prompt: /loop <time> <prompt>",
    handler: async (args, ctx) => {
      let spec;
      try {
        spec = parseLoopSpec(args);
      } catch (error) {
        ctx.ui.notify((error as Error).message, "warning");
        return;
      }

      const loop: LoopDefinition = {
        id: state.nextId++,
        intervalMs: spec.intervalMs,
        prompt: spec.prompt,
        enabled: true,
        nextRunAt: Date.now() + spec.intervalMs,
      };
      state.loops.push(loop);
      persist();
      updateFooter(ctx);
      ctx.ui.notify(`Loop #${loop.id} added; first run in ${formatDuration(loop.intervalMs)}`, "info");
    },
  });

  pi.registerCommand("loop_man", {
    description: "Manage recurring prompts and the loop countdown footer",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/loop_man requires an interactive UI", "warning");
        return;
      }

      const footerLabel = `Countdown footer: ${state.footerEnabled ? "on" : "off"}`;
      const labels = state.loops.map((loop) => loopLabel(loop, Date.now()));
      const choice = await ctx.ui.select("Manage loops", [...labels, footerLabel]);
      if (!choice) return;

      if (choice === footerLabel) {
        state.footerEnabled = !state.footerEnabled;
        persist();
        updateFooter(ctx);
        ctx.ui.notify(`Loop countdown footer ${state.footerEnabled ? "enabled" : "disabled"}`, "info");
        return;
      }

      const loop = state.loops[labels.indexOf(choice)];
      if (!loop) return;

      const toggleAction = loop.enabled ? "Pause" : "Resume";
      const action = await ctx.ui.select(`Loop #${loop.id}`, ["Edit", toggleAction, "Run now", "Delete"]);
      if (!action) return;

      if (action === "Edit") {
        const edited = await ctx.ui.editor(
          `Edit loop #${loop.id}: <time> <prompt>`,
          `${formatDuration(loop.intervalMs)} ${loop.prompt}`,
        );
        if (edited === undefined) return;

        try {
          const spec = parseLoopSpec(edited);
          loop.intervalMs = spec.intervalMs;
          loop.prompt = spec.prompt;
          loop.nextRunAt = Date.now() + spec.intervalMs;
        } catch (error) {
          ctx.ui.notify((error as Error).message, "warning");
          return;
        }
        persist();
        updateFooter(ctx);
        ctx.ui.notify(`Loop #${loop.id} updated`, "info");
        return;
      }

      if (action === toggleAction) {
        loop.enabled = !loop.enabled;
        if (loop.enabled) loop.nextRunAt = Date.now() + loop.intervalMs;
        persist();
        updateFooter(ctx);
        ctx.ui.notify(`Loop #${loop.id} ${loop.enabled ? "resumed" : "paused"}`, "info");
        return;
      }

      if (action === "Run now") {
        dispatch(loop);
        ctx.ui.notify(`Loop #${loop.id} queued`, "info");
        return;
      }

      if (action === "Delete") {
        const confirmed = await ctx.ui.confirm("Delete loop?", loopLabel(loop, Date.now()));
        if (!confirmed) return;
        state.loops = state.loops.filter((candidate) => candidate.id !== loop.id);
        persist();
        updateFooter(ctx);
        ctx.ui.notify(`Loop #${loop.id} deleted`, "info");
      }
    },
  });
}
