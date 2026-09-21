import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  formatTeamProgress,
  hasExplicitExtension,
  parseImplementationTeamYaml,
  renderStepPrompt,
  type WorkflowDefinition,
  workItemKey,
} from "./lib/implementationTeamCore.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

interface AgentDefinition {
  name: string;
  description: string;
  tools: string;
  systemPrompt: string;
}

interface AgentResult {
  output: string;
  exitCode: number;
  elapsedMs: number;
}

interface StepProgress {
  agent: string;
  status: "pending" | "running" | "done" | "error";
  elapsedMs: number;
  toolCount: number;
  lastOutput: string;
  output: string;
  outputFile: string;
}

interface TeamRun {
  workflow: string;
  workItemId: string;
  steps: StepProgress[];
}

const GLOBAL_AGENT_DIR = join(homedir(), ".pi", "agent", "agents");
const GLOBAL_WORKFLOW_PATH = join(GLOBAL_AGENT_DIR, "implementation-team.yaml");
const OUTPUT_LIMIT = 8_000;

function parseAgentFile(filePath: string): AgentDefinition | undefined {
  const raw = readFileSync(filePath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return undefined;

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    frontmatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  if (!frontmatter.name) return undefined;

  return {
    name: frontmatter.name,
    description: frontmatter.description ?? "",
    tools: frontmatter.tools ?? "read,grep,find,ls",
    systemPrompt: match[2].trim(),
  };
}

function loadAgents(cwd: string): Map<string, AgentDefinition> {
  const agents = new Map<string, AgentDefinition>();
  const directories = [
    GLOBAL_AGENT_DIR,
    join(cwd, "agents"),
    join(cwd, ".claude", "agents"),
    join(cwd, ".pi", "agents"),
  ];

  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith(".md")) continue;
      try {
        const definition = parseAgentFile(resolve(directory, file));
        if (definition) agents.set(definition.name.toLowerCase(), definition);
      } catch {
        // An unreadable personality should not hide the rest of the team.
      }
    }
  }
  return agents;
}

function loadWorkflows(cwd: string): WorkflowDefinition[] {
  const projectPath = join(cwd, ".pi", "agents", "implementation-team.yaml");
  const workflowPath = existsSync(projectPath) ? projectPath : GLOBAL_WORKFLOW_PATH;
  if (!existsSync(workflowPath)) {
    throw new Error(`Implementation workflow file not found: ${workflowPath}`);
  }
  return parseImplementationTeamYaml(readFileSync(workflowPath, "utf8"));
}

function sessionFile(cwd: string, workItemId: string, agentName: string): string {
  const projectKey = createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 12);
  const directory = join(
    homedir(),
    ".pi",
    "agent",
    "sessions",
    "implementation-team",
    projectKey,
    workItemKey(workItemId),
  );
  mkdirSync(directory, { recursive: true });
  return join(directory, `${workItemKey(agentName)}.jsonl`);
}

function finalOutput(text: string, outputFile: string): string {
  if (text.length <= OUTPUT_LIMIT) return text;
  writeFileSync(outputFile, text, "utf8");
  return `${text.slice(0, OUTPUT_LIMIT)}\n\n... [truncated; full output: ${outputFile}]`;
}

export default function implementationTeam(pi: ExtensionAPI) {
  if (!hasExplicitExtension(process.argv, "implementation-team.ts")) return;

  let workflows: WorkflowDefinition[] = [];
  let agents = new Map<string, AgentDefinition>();
  let activeChild: ChildProcess | undefined;
  let workflowRunning = false;
  let latestRun: TeamRun | undefined;
  let widgetCtx: any;
  let progressTimer: NodeJS.Timeout | undefined;

  function updateWidget() {
    if (!widgetCtx?.hasUI) return;
    if (!latestRun) {
      widgetCtx.ui.setWidget("implementation-team-progress", undefined);
      return;
    }
    widgetCtx.ui.setWidget("implementation-team-progress", (_tui: unknown, theme: any) => {
      const lines = formatTeamProgress(latestRun!);
      return new Text(
        lines.map((line, index) => index === 0 ? theme.fg("accent", line) : theme.fg("muted", line)).join("\n"),
        0,
        1,
      );
    }, { placement: "belowEditor" });
  }

  function lastOutputLine(output: string): string {
    return output.split("\n").filter((line) => line.trim()).at(-1)?.trim() ?? "";
  }

  async function runAgent(
    definition: AgentDefinition,
    prompt: string,
    workItemId: string,
    ctx: any,
    signal: AbortSignal | undefined,
    onProgress: (output: string, toolCount: number) => void,
  ): Promise<AgentResult> {
    const startedAt = Date.now();
    const model = ctx.model
      ? `${ctx.model.provider}/${ctx.model.id}`
      : "openrouter/google/gemini-3.5-flash";
    const agentSession = sessionFile(ctx.cwd, workItemId, definition.name);
    const args = [
      "--mode", "json",
      "--print",
      "--no-extensions",
      "--model", model,
      "--tools", definition.tools,
      "--thinking", pi.getThinkingLevel(),
      "--append-system-prompt", definition.systemPrompt,
      "--session", agentSession,
      prompt,
    ];

    return new Promise((resolveResult) => {
      const child = spawn("pi", args, {
        cwd: ctx.cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      activeChild = child;
      const chunks: string[] = [];
      let stdoutBuffer = "";
      let stderr = "";
      let toolCount = 0;

      const consumeLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
            chunks.push(event.assistantMessageEvent.delta ?? "");
            onProgress(chunks.join(""), toolCount);
          }
          if (event.type === "tool_execution_start") {
            toolCount++;
            onProgress(chunks.join(""), toolCount);
          }
        } catch {
          // JSON mode can still emit non-event diagnostics; stderr is reported on failure.
        }
      };

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) consumeLine(line);
      });
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => { stderr += chunk; });

      const abort = () => child.kill("SIGTERM");
      signal?.addEventListener("abort", abort, { once: true });

      child.on("close", (code) => {
        signal?.removeEventListener("abort", abort);
        if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);
        if (activeChild === child) activeChild = undefined;
        const output = chunks.join("") || stderr.trim();
        onProgress(output, toolCount);
        resolveResult({ output, exitCode: code ?? 1, elapsedMs: Date.now() - startedAt });
      });
      child.on("error", (error) => {
        signal?.removeEventListener("abort", abort);
        if (activeChild === child) activeChild = undefined;
        const output = `Could not start ${definition.name}: ${error.message}`;
        onProgress(output, toolCount);
        resolveResult({
          output,
          exitCode: 1,
          elapsedMs: Date.now() - startedAt,
        });
      });
    });
  }

  pi.registerTool({
    name: "run_implementation",
    label: "Run Implementation Team",
    description: "Run a named implementation workflow for one work item. Steps execute sequentially and the final specialist result returns to the Chief.",
    parameters: Type.Object({
      workflow: Type.String({ description: "Workflow name from implementation-team.yaml, such as implementation or implementation-repair." }),
      work_item_id: Type.String({ description: "Stable issue/task identifier used to isolate specialist sessions." }),
      task: Type.String({ description: "Complete implementation request or repair instructions." }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (workflowRunning) throw new Error("An implementation workflow is already running");
      const workflow = workflows.find((candidate) => candidate.name === params.workflow);
      if (!workflow) {
        throw new Error(`Unknown workflow "${params.workflow}". Available: ${workflows.map((item) => item.name).join(", ")}`);
      }

      workflowRunning = true;
      const progress: StepProgress[] = workflow.steps.map((step) => ({
        agent: step.agent,
        status: "pending",
        elapsedMs: 0,
        toolCount: 0,
        lastOutput: "",
        output: "",
        outputFile: sessionFile(ctx.cwd, params.work_item_id, step.agent).replace(/\.jsonl$/, ".output.txt"),
      }));
      latestRun = { workflow: workflow.name, workItemId: params.work_item_id, steps: progress };
      widgetCtx = ctx;
      updateWidget();
      progressTimer = setInterval(() => updateWidget(), 1_000);

      try {
        const startedAt = Date.now();
        let input = params.task;

        for (let index = 0; index < workflow.steps.length; index++) {
          const step = workflow.steps[index];
          const definition = agents.get(step.agent.toLowerCase());
          if (!definition) throw new Error(`Agent "${step.agent}" was not found`);

          const stage = progress[index];
          const stageStartedAt = Date.now();
          stage.status = "running";
          updateWidget();
          onUpdate?.({
            content: [{ type: "text", text: `${workflow.name}: ${step.agent} is running` }],
            details: { workflow: workflow.name, workItemId: params.work_item_id, progress },
          });

          const result = await runAgent(
            definition,
            renderStepPrompt(step.prompt, params.task, input),
            params.work_item_id,
            ctx,
            signal,
            (output, toolCount) => {
              stage.elapsedMs = Date.now() - stageStartedAt;
              stage.toolCount = toolCount;
              stage.output = output;
              stage.lastOutput = lastOutputLine(output);
              updateWidget();
            },
          );
          stage.elapsedMs = result.elapsedMs;
          stage.status = result.exitCode === 0 ? "done" : "error";
          stage.output = result.output;
          stage.lastOutput = lastOutputLine(result.output);
          writeFileSync(stage.outputFile, result.output, "utf8");
          updateWidget();
          if (result.exitCode !== 0) {
            throw new Error(`${step.agent} failed: ${result.output || `exit code ${result.exitCode}`}`);
          }
          input = result.output;
        }

        const resultPath = sessionFile(ctx.cwd, params.work_item_id, `${workflow.name}-result`)
          .replace(/\.jsonl$/, ".txt");
        return {
          content: [{ type: "text", text: finalOutput(input, resultPath) }],
          details: {
            workflow: workflow.name,
            workItemId: params.work_item_id,
            status: "done",
            elapsedMs: Date.now() - startedAt,
            progress,
          },
        };
      } finally {
        if (progressTimer) clearInterval(progressTimer);
        progressTimer = undefined;
        workflowRunning = false;
      }
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("run_implementation "))
          + theme.fg("accent", args.workflow)
          + theme.fg("dim", ` · ${args.work_item_id}`),
        0,
        0,
      );
    },
    renderResult(result, options, theme) {
      const details = result.details as any;
      if (options.isPartial) return new Text(theme.fg("accent", "● implementation team running"), 0, 0);
      if (!details) {
        const content = result.content[0];
        return new Text(content?.type === "text" ? content.text : "", 0, 0);
      }
      return new Text(
        theme.fg("success", `✓ ${details.workflow}`)
          + theme.fg("dim", ` ${Math.round(details.elapsedMs / 1000)}s`),
        0,
        0,
      );
    },
  });

  pi.registerCommand("implementation-output", {
    description: "Select an implementation stage and view its live or saved output",
    handler: async (args, ctx) => {
      if (!latestRun) {
        ctx.ui.notify("No implementation workflow has run in this session.", "warning");
        return;
      }

      const requestedAgent = args.trim().toLowerCase();
      let stage = requestedAgent
        ? latestRun.steps.find((candidate) => candidate.agent.toLowerCase() === requestedAgent)
        : undefined;
      if (requestedAgent && !stage) {
        ctx.ui.notify(`No stage named "${args.trim()}".`, "error");
        return;
      }
      if (!stage) {
        const choices = latestRun.steps.map((candidate) =>
          `${candidate.agent} — ${candidate.status}`,
        );
        const choice = await ctx.ui.select("View implementation output", choices);
        if (!choice) return;
        stage = latestRun.steps[choices.indexOf(choice)];
      }

      const output = stage.output || (existsSync(stage.outputFile)
        ? readFileSync(stage.outputFile, "utf8")
        : "No output has been received yet.");
      await ctx.ui.editor(`${stage.agent} output`, output);
    },
  });

  pi.on("before_agent_start", () => {
    const catalog = workflows
      .map((workflow) => `- ${workflow.name}: ${workflow.description}`)
      .join("\n");
    return {
      systemPrompt: `You are the Chief of an implementation team. You manage implementation work; you never inspect or modify the codebase directly.

Delegate all implementation through run_implementation. Give it a stable work_item_id and a complete task. Use the implementation workflow for new work. If its reviewer reports \"needs changes\", invoke implementation-repair with the review findings and original requirements. Repeat only until the reviewer approves or a genuine blocker requires user input.

Available workflows:
${catalog}

Rules:
- Do not claim completion unless the final reviewer approves.
- Do not bypass the workflow or perform implementation yourself.
- Preserve the original requirements when requesting repairs.
- Surface ambiguity and blockers instead of inventing requirements.`,
    };
  });

  pi.on("session_start", (_event, ctx) => {
    applyExtensionDefaults(import.meta.url, ctx);
    workflows = loadWorkflows(ctx.cwd);
    agents = loadAgents(ctx.cwd);
    widgetCtx = ctx;
    pi.setActiveTools(["run_implementation"]);
    ctx.ui.setStatus("implementation-team", `Chief · ${workflows.length} workflows`);
    updateWidget();
  });

  pi.on("session_shutdown", () => {
    activeChild?.kill("SIGTERM");
    activeChild = undefined;
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = undefined;
    workflowRunning = false;
    widgetCtx?.ui.setWidget("implementation-team-progress", undefined);
  });
}
