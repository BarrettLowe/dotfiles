import { basename } from "node:path";

export interface WorkflowStep {
  agent: string;
  prompt: string;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      throw new Error(`Invalid quoted value: ${trimmed}`);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseImplementationTeamYaml(raw: string): WorkflowDefinition[] {
  const workflows: WorkflowDefinition[] = [];
  let workflow: WorkflowDefinition | undefined;
  let step: Partial<WorkflowStep> | undefined;

  const finishStep = () => {
    if (!step || !workflow) return;
    if (!step.agent) throw new Error(`Workflow "${workflow.name}" has a step missing an agent`);
    if (!step.prompt) throw new Error(`Workflow "${workflow.name}" has a step missing a prompt`);
    workflow.steps.push({ agent: step.agent, prompt: step.prompt });
    step = undefined;
  };

  const finishWorkflow = () => {
    if (!workflow) return;
    finishStep();
    if (workflow.steps.length === 0) {
      throw new Error(`Workflow "${workflow.name}" has no steps`);
    }
  };

  for (const line of raw.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const workflowMatch = line.match(/^(\S[^:]*):\s*$/);
    if (workflowMatch) {
      finishWorkflow();
      const name = workflowMatch[1].trim();
      if (workflows.some((candidate) => candidate.name === name)) {
        throw new Error(`Duplicate workflow "${name}"`);
      }
      workflow = { name, description: "", steps: [] };
      workflows.push(workflow);
      continue;
    }

    const descriptionMatch = line.match(/^\s+description:\s+(.+)$/);
    if (descriptionMatch && workflow && !step) {
      workflow.description = parseScalar(descriptionMatch[1]);
      continue;
    }

    if (/^\s+steps:\s*$/.test(line)) continue;

    const agentMatch = line.match(/^\s+-\s+agent:\s+(.+)$/);
    if (agentMatch && workflow) {
      finishStep();
      step = { agent: parseScalar(agentMatch[1]) };
      continue;
    }

    const promptMatch = line.match(/^\s+prompt:\s+(.+)$/);
    if (promptMatch && step) {
      step.prompt = parseScalar(promptMatch[1]);
    }
  }

  finishWorkflow();
  if (workflows.length === 0) throw new Error("No workflows found");
  return workflows;
}

export function renderStepPrompt(
  template: string,
  original: string,
  input: string,
): string {
  return template.replaceAll("$ORIGINAL", original).replaceAll("$INPUT", input);
}

export function workItemKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "work-item";
}

export interface TeamProgressStep {
  agent: string;
  status: "pending" | "running" | "done" | "error";
  elapsedMs: number;
  toolCount: number;
  lastOutput: string;
}

export interface TeamProgress {
  workflow: string;
  workItemId: string;
  steps: TeamProgressStep[];
}

export function formatTeamProgress(progress: TeamProgress): string[] {
  const icon = { pending: "○", running: "●", done: "✓", error: "✗" };
  return [
    `${progress.workflow} · ${progress.workItemId}`,
    ...progress.steps.map((step) => {
      if (step.status === "pending") return `${icon.pending} ${step.agent} pending`;
      const seconds = `${Math.round(step.elapsedMs / 1000)}s`;
      const tools = `${step.toolCount} tool${step.toolCount === 1 ? "" : "s"}`;
      const output = step.lastOutput ? ` · ${step.lastOutput}` : "";
      return `${icon[step.status]} ${step.agent} ${seconds} · ${tools}${output}`;
    }),
  ];
}

export function hasExplicitExtension(argv: string[], filename: string): boolean {
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if ((argument === "-e" || argument === "--extension") && index + 1 < argv.length) {
      if (basename(argv[index + 1]) === filename) return true;
    }
    if (argument.startsWith("--extension=")) {
      if (basename(argument.slice("--extension=".length)) === filename) return true;
    }
  }
  return false;
}
