/**
 * /btw extension
 *
 * Ask a one-off side question using the current conversation as context,
 * without interrupting the running turn or adding anything to the session.
 * The question and answer are never appended to the conversation history.
 *
 * Usage: /btw <question>
 */

import { uuidv7 } from "@earendil-works/pi-ai";
import { convertToLlm, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, matchesKey, Text } from "@earendil-works/pi-tui";

const TERSE_INSTRUCTIONS = [
  "You are answering a quick aside (\"by the way\") from the user using the",
  "conversation above as context. This question and your answer will NOT be",
  "added to the conversation and must not influence or interrupt the ongoing",
  "task. Answer as tersely as possible - normally one sentence, rarely more",
  "than a short paragraph. No preamble, no markdown headers, no offers to",
  "help further.",
].join(" ");

export default function (pi: ExtensionAPI) {
  pi.registerCommand("btw", {
    description: "Ask a terse one-off question using current context (not added to conversation)",
    handler: async (args, ctx) => {
      const question = args.trim();
      if (!question) {
        ctx.ui.notify("Usage: /btw <question>", "warning");
        return;
      }

      const model = ctx.model;
      if (!model) {
        ctx.ui.notify("No active model to ask", "warning");
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify("Thinking...", "info");
      }

      const sessionContext = ctx.sessionManager.buildSessionContext();
      const historyMessages = convertToLlm(sessionContext.messages);

      const messages = [
        ...historyMessages,
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: question }],
          timestamp: Date.now(),
        },
      ];

      const systemPrompt = `${ctx.getSystemPrompt()}\n\n${TERSE_INSTRUCTIONS}`;

      let response;
      try {
        response = await ctx.modelRegistry.complete(
          model,
          { systemPrompt, messages },
          {
            reasoningEffort: "low",
            cacheRetention: "none",
            sessionId: uuidv7(),
            signal: ctx.signal,
          },
        );
      } catch (error) {
        ctx.ui.notify(`/btw failed: ${(error as Error).message}`, "error");
        return;
      }

      const answer = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();

      if (!answer) {
        ctx.ui.notify("No answer returned", "warning");
        return;
      }

      if (ctx.mode !== "tui") {
        ctx.ui.notify(answer, "info");
        return;
      }

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const container = new Container();
        const border = new DynamicBorder((s: string) => theme.fg("accent", s));
        const mdTheme = getMarkdownTheme();

        container.addChild(border);
        container.addChild(new Text(theme.fg("accent", theme.bold(`btw: ${question}`)), 1, 0));
        container.addChild(new Markdown(answer, 1, 1, mdTheme));
        container.addChild(new Text(theme.fg("dim", "Press Enter or Esc to close"), 1, 0));
        container.addChild(border);

        return {
          render: (width: number) => container.render(width),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
              done(undefined);
            }
          },
        };
      });
    },
  });
}
