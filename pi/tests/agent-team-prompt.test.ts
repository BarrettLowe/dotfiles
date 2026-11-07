import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("agent team dispatch does not require implementation approval", () => {
	const source = readFileSync(new URL("../manual-extensions/agent-team.ts", import.meta.url), "utf8");

	assert.doesNotMatch(source, /approval|agents-approve|agents-deny|canDispatchAgent/i);
	assert.match(source, /pi\.setActiveTools\(\["dispatch_agent", "read_open_items", "edit_open_items"\]\)/);
});
