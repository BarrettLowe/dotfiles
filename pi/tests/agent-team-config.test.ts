import assert from "node:assert/strict";
import test from "node:test";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./helpers/pi-host.mjs";

const { parseTeamsYaml, loadAgentRuntimeOverrides, resolveAgentRuntime, resolveExtensionSource, scanAgentDirs, loadTeams, loadTeamDispatcherPrompt } =
	await import("../manual-extensions/agent-team-config.ts");

// Test cases identified:
// - plain members remain supported without extensions
// - mapped members retain their ordered extension list
// - bare extension names resolve from the global extensions directory
// - home-relative extension paths expand against the configured home directory

test("project agents retain their runtime settings ahead of profile overrides", t => {
	const root = mkdtempSync(join(tmpdir(), "pi-agent-runtime-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const dir = join(root, "agents");
	const profile = join(root, "profile");
	mkdirSync(dir);
	mkdirSync(join(profile, "agents"), { recursive: true });
	writeFileSync(join(profile, "agents", "legacy.md"), "---\nname: legacy\nmodel: sonnet\nthinking: high\n---\nPrompt");
	writeFileSync(join(profile, "agents", "planner.md"), "---\nname: planner\n---\nProfile prompt");
	writeFileSync(join(profile, "agents", "scout.md"), "---\nname: scout\n---\nProfile prompt");
	writeFileSync(join(dir, "planner.md"), "---\nname: Planner\nmodel: project-model\nthinking: low\n---\nPrompt");
	writeFileSync(join(dir, "scout.md"), "---\nname: scout\n---\nPrompt");
	const agents = scanAgentDirs(root, root, profile);
	const planner = agents.find(agent => agent.name === "Planner")!;
	const scout = agents.find(agent => agent.name === "scout")!;
	const legacy = agents.find(agent => agent.name === "legacy")!;
	assert.deepEqual(resolveAgentRuntime(legacy, {}), { model: "", thinking: "off" });
	assert.deepEqual(resolveAgentRuntime(planner, loadAgentRuntimeOverrides(profile)), { model: "project-model", thinking: "low" });
	assert.deepEqual(resolveAgentRuntime(scout, {}), { model: "", thinking: "off" });
	writeFileSync(join(profile, "agent-team-models.json"), JSON.stringify({
		PLANNER: { model: "profile-model", thinking: "high" },
		scout: { model: "profile-model", thinking: "high" },
		legacy: { model: "profile-model", thinking: "medium" },
	}));
	const overrides = loadAgentRuntimeOverrides(profile);
	assert.deepEqual(resolveAgentRuntime(planner, overrides), { model: "project-model", thinking: "low" });
	assert.deepEqual(resolveAgentRuntime(scout, overrides), { model: "", thinking: "off" });
	assert.deepEqual(resolveAgentRuntime(legacy, overrides), { model: "profile-model", thinking: "medium" });
	writeFileSync(join(profile, "agent-team-models.json"), JSON.stringify({ planner: { thinking: "invalid" } }));
	assert.throws(() => loadAgentRuntimeOverrides(profile), /Invalid runtime settings/);
	writeFileSync(join(profile, "agent-team-models.json"), "{");
	assert.throws(() => loadAgentRuntimeOverrides(profile));
});

test("parseTeamsYaml parses plain and extension-configured members", () => {
	assert.deepEqual(parseTeamsYaml(`team-name:
  - scout:
      extensions:
        - my-extension
        - ~/some/other/full/path/to/an/extension/file.ts
  - planner:
      extensions:
        - extension-a
  - builder
`), {
		"team-name": [
			{
				name: "scout",
				extensions: ["my-extension", "~/some/other/full/path/to/an/extension/file.ts"],
			},
			{ name: "planner", extensions: ["extension-a"] },
			{ name: "builder", extensions: [] },
		],
	});
});

test("resolveExtensionSource resolves bare names and home-relative paths", () => {
	assert.equal(resolveExtensionSource("builtin:llama.cpp"), "builtin:llama.cpp");
	const home = "/home/tester";
	assert.equal(
		resolveExtensionSource("my-extension", home, join(home, ".pi", "agent")),
		"/home/tester/.pi/agent/extensions/my-extension.ts",
	);
	assert.equal(
		resolveExtensionSource("~/some/extension.ts", home),
		"/home/tester/some/extension.ts",
	);
});

// - redirected globals stay separate from home and project paths
// - project definitions, teams, and dispatcher prompts keep their precedence
// - explicit extension paths remain unchanged

test("team configuration uses PI_CODING_AGENT_DIR with project overrides", (t) => {
	const root = mkdtempSync(join(tmpdir(), "pi-config-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(root, "profile");
	t.after(() => {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
	});
	const cwd = join(root, "project");
	const home = join(root, "home");
	const globalDir = join(root, "profile", "agents");
	const projectDir = join(cwd, ".pi", "agents");
	for (const dir of [globalDir, projectDir, join(home, ".claude", "agents")]) {
		mkdirSync(dir, { recursive: true });
	}
	const agent = (name: string, body: string) => `---\nname: ${name}\n---\n${body}`;
	writeFileSync(join(globalDir, "scout.md"), agent("scout", "global scout"));
	writeFileSync(join(globalDir, "builder.md"), agent("builder", "global builder"));
	writeFileSync(join(projectDir, "scout.md"), agent("scout", "local scout"));
	writeFileSync(join(home, ".claude", "agents", "reviewer.md"), "---\nname: reviewer\nmodel: claude-model\nthinking: high\n---\nClaude reviewer");
	writeFileSync(join(globalDir, "teams.yaml"), "shared:\n  - builder\nglobal:\n  - scout\n");
	writeFileSync(join(projectDir, "teams.yaml"), "shared:\n  - scout\n");
	writeFileSync(join(globalDir, "shared.dispatcher.md"), "global prompt");
	writeFileSync(join(root, "profile", "agent-team-models.json"), '{"scout":{"model":"profile-model"}}');
	assert.equal(loadAgentRuntimeOverrides().scout.model, "profile-model");

	const agents = scanAgentDirs(cwd, home);
	assert.deepEqual(agents.map(a => [a.name, a.systemPrompt]).sort(), [
		["builder", "global builder"], ["reviewer", "Claude reviewer"], ["scout", "local scout"],
	]);
	const reviewer = agents.find(a => a.name === "reviewer")!;
	assert.deepEqual(resolveAgentRuntime(reviewer, loadAgentRuntimeOverrides()), { model: "claude-model", thinking: "high" });
	assert.deepEqual(resolveAgentRuntime(reviewer, { reviewer: { model: "profile-model" } }), { model: "profile-model", thinking: "high" });
	assert.deepEqual(loadTeams(cwd), {
		shared: [{ name: "scout", extensions: [] }],
		global: [{ name: "scout", extensions: [] }],
	});
	assert.equal(loadTeamDispatcherPrompt(cwd, "shared"), "global prompt");
	writeFileSync(join(projectDir, "shared.dispatcher.md"), "local prompt");
	assert.equal(loadTeamDispatcherPrompt(cwd, "shared"), "local prompt");
	assert.equal(resolveExtensionSource("guard", home), join(root, "profile", "extensions", "guard.ts"));
	assert.equal(resolveExtensionSource("guard.ts", home), join(root, "profile", "extensions", "guard.ts"));
	assert.equal(resolveExtensionSource("~/guard.ts", home), join(home, "guard.ts"));
	assert.equal(resolveExtensionSource("/elsewhere/guard.ts", home), "/elsewhere/guard.ts");
	assert.equal(resolveExtensionSource("./guard.ts", home), "./guard.ts");
});
