import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTeamProgress,
  hasExplicitExtension,
  parseImplementationTeamYaml,
  renderStepPrompt,
  workItemKey,
} from "../extensions/lib/implementationTeamCore.ts";

// Test cases identified:
// - multiple named workflows preserve their ordered steps
// - quoted descriptions and escaped newlines are decoded
// - workflows without complete steps are rejected
// - prompt placeholders are replaced globally
// - work-item keys are stable and filesystem-safe
// - dispatcher mode activates only when its extension is explicitly selected
// - dashboard rows expose status, elapsed time, tool count, and latest output

test("parseImplementationTeamYaml parses named, ordered workflows", () => {
  const workflows = parseImplementationTeamYaml(`implementation:
  description: "Plan, build, and review"
  steps:
    - agent: planner
      prompt: "Plan: $ORIGINAL"
    - agent: builder
      prompt: "Build from:\\n$INPUT"

implementation-repair:
  description: "Repair and re-review"
  steps:
    - agent: builder
      prompt: "Repair: $ORIGINAL"
`);

  assert.deepEqual(workflows, [
    {
      name: "implementation",
      description: "Plan, build, and review",
      steps: [
        { agent: "planner", prompt: "Plan: $ORIGINAL" },
        { agent: "builder", prompt: "Build from:\n$INPUT" },
      ],
    },
    {
      name: "implementation-repair",
      description: "Repair and re-review",
      steps: [{ agent: "builder", prompt: "Repair: $ORIGINAL" }],
    },
  ]);
});

test("parseImplementationTeamYaml rejects incomplete workflows", () => {
  assert.throws(
    () => parseImplementationTeamYaml("empty:\n  description: nope\n  steps:\n"),
    /has no steps/,
  );
  assert.throws(
    () => parseImplementationTeamYaml("broken:\n  steps:\n    - agent: builder\n"),
    /missing a prompt/,
  );
});

test("renderStepPrompt replaces all input placeholders", () => {
  assert.equal(
    renderStepPrompt("Original=$ORIGINAL; input=$INPUT; again=$INPUT", "task", "plan"),
    "Original=task; input=plan; again=plan",
  );
});

test("workItemKey returns stable filesystem-safe keys", () => {
  assert.equal(workItemKey("Issue #42 / parser"), "issue-42-parser");
  assert.equal(workItemKey("  ___  "), "work-item");
  assert.equal(workItemKey("ABC"), "abc");
});

test("hasExplicitExtension recognizes only explicit extension arguments", () => {
  assert.equal(hasExplicitExtension(["pi"], "implementation-team.ts"), false);
  assert.equal(
    hasExplicitExtension(["pi", "-e", "/tmp/implementation-team.ts"], "implementation-team.ts"),
    true,
  );
  assert.equal(
    hasExplicitExtension(["pi", "--extension=/tmp/implementation-team.ts"], "implementation-team.ts"),
    true,
  );
  assert.equal(
    hasExplicitExtension(["pi", "-e", "/tmp/another-extension.ts"], "implementation-team.ts"),
    false,
  );
});

test("formatTeamProgress renders each stage's live summary", () => {
  assert.deepEqual(formatTeamProgress({
    workflow: "implementation",
    workItemId: "issue-42",
    steps: [
      { agent: "planner", status: "done", elapsedMs: 12_000, toolCount: 2, lastOutput: "Plan complete" },
      { agent: "builder", status: "running", elapsedMs: 3_000, toolCount: 1, lastOutput: "Running tests" },
      { agent: "reviewer", status: "pending", elapsedMs: 0, toolCount: 0, lastOutput: "" },
    ],
  }), [
    "implementation · issue-42",
    "✓ planner 12s · 2 tools · Plan complete",
    "● builder 3s · 1 tool · Running tests",
    "○ reviewer pending",
  ]);
});
