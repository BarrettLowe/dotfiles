import assert from "node:assert/strict";
import test from "node:test";

import { parseTeamsYaml, resolveExtensionSource } from "../manual-extensions/agent-team-config.ts";

// Test cases identified:
// - plain members remain supported without extensions
// - mapped members retain their ordered extension list
// - bare extension names resolve from the global extensions directory
// - home-relative extension paths expand against the configured home directory

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
	const home = "/home/tester";
	assert.equal(
		resolveExtensionSource("my-extension", home),
		"/home/tester/.pi/agent/extensions/my-extension.ts",
	);
	assert.equal(
		resolveExtensionSource("~/some/extension.ts", home),
		"/home/tester/some/extension.ts",
	);
});
