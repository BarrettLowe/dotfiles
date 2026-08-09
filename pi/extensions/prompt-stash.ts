/**
 * Prompt Stash
 *
 * Ctrl+S while the editor has text: stash it (clear the editor, remember the text).
 * Ctrl+S again while nothing is stashed... actually: Ctrl+S always toggles between
 * "stash current editor text" and "restore last stashed text", so a single key
 * acts as a pocket for whatever you were mid-typing.
 *
 * If you stash, then submit a *different* prompt (or it runs to completion as a
 * turn), the stashed text is automatically put back into the editor once the
 * agent goes idle again -- it is never auto-submitted, just restored so you can
 * keep editing/send it yourself.
 *
 * Known limitation: built-in/extension slash commands that are fully handled
 * without ever starting an agent turn (e.g. some /commands) don't fire
 * "agent_settled", so auto-restore only reliably triggers after prompts that
 * actually run the agent. You can always press Ctrl+S manually to restore.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function promptStashExtension(pi: ExtensionAPI) {
  let stash: string | undefined;
  let pendingRestore = false;

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus(
      "prompt-stash",
      stash === undefined ? undefined : ctx.ui.theme.fg("accent", "\u{1F4CC} stashed (ctrl+s)"),
    );
  }

  pi.registerShortcut("ctrl+s", {
    description: "Stash / restore the current editor text",
    handler: async (ctx) => {
      if (stash === undefined) {
        const text = ctx.ui.getEditorText();
        if (!text) {
          ctx.ui.notify("Nothing to stash", "info");
          return;
        }
        stash = text;
        pendingRestore = false;
        ctx.ui.setEditorText("");
        updateStatus(ctx);
        ctx.ui.notify("Prompt stashed", "info");
      } else {
        ctx.ui.setEditorText(stash);
        stash = undefined;
        pendingRestore = false;
        updateStatus(ctx);
        ctx.ui.notify("Prompt restored", "info");
      }
    },
  });

  // Any real user-typed submission while something is stashed means we should
  // put the stash back once that run finishes.
  pi.on("input", async (event, _ctx) => {
    if (stash !== undefined && event.source === "interactive") {
      pendingRestore = true;
    }
    return { action: "continue" };
  });

  // Fires once the agent is fully done and won't auto-continue.
  pi.on("agent_settled", async (_event, ctx) => {
    if (!pendingRestore || stash === undefined) return;
    pendingRestore = false;

    const current = ctx.ui.getEditorText();
    if (current) {
      // Don't clobber text the user is already typing; leave it stashed
      // so a manual ctrl+s still works.
      ctx.ui.notify("Prompt still stashed (editor not empty)", "warning");
      return;
    }

    ctx.ui.setEditorText(stash);
    stash = undefined;
    updateStatus(ctx);
    ctx.ui.notify("Auto-restored stashed prompt", "info");
  });

  pi.on("session_start", async (_event, ctx) => {
    stash = undefined;
    pendingRestore = false;
    updateStatus(ctx);
  });
}
