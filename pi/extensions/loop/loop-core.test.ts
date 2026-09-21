import assert from "node:assert/strict";
import test from "node:test";

import {
  findNextLoop,
  formatCountdown,
  formatDuration,
  normalizeMissedLoops,
  parseLoopSpec,
  shouldDispatchDueLoops,
} from "./loop-core.ts";

// Test cases identified:
// - duration units parse to milliseconds
// - the 30-second minimum is accepted
// - shorter, fractional, and malformed durations are rejected
// - prompts are required and preserve multiline content
// - duration/countdown display is concise and stable
// - only enabled loops participate in next-run selection
// - missed executions move to one interval after restoration
// - due loops defer during non-agent lifecycle work

test("parseLoopSpec parses supported duration units", () => {
  assert.deepEqual(parseLoopSpec("30s check status"), { intervalMs: 30_000, prompt: "check status" });
  assert.deepEqual(parseLoopSpec("5m review progress"), { intervalMs: 300_000, prompt: "review progress" });
  assert.deepEqual(parseLoopSpec("2h run tests"), { intervalMs: 7_200_000, prompt: "run tests" });
  assert.deepEqual(parseLoopSpec("1d summarize"), { intervalMs: 86_400_000, prompt: "summarize" });
});

test("parseLoopSpec rejects intervals below 30 seconds", () => {
  assert.throws(() => parseLoopSpec("29s too soon"), /at least 30s/);
});

test("parseLoopSpec rejects malformed and fractional durations", () => {
  assert.throws(() => parseLoopSpec("1.5m prompt"), /Usage/);
  assert.throws(() => parseLoopSpec("soon prompt"), /Usage/);
});

test("parseLoopSpec requires a prompt and preserves multiline prompts", () => {
  assert.throws(() => parseLoopSpec("5m"), /Usage/);
  assert.deepEqual(parseLoopSpec("5m first line\nsecond line"), {
    intervalMs: 300_000,
    prompt: "first line\nsecond line",
  });
});

test("formatDuration uses the largest exact unit", () => {
  assert.equal(formatDuration(30_000), "30s");
  assert.equal(formatDuration(300_000), "5m");
  assert.equal(formatDuration(7_200_000), "2h");
  assert.equal(formatDuration(86_400_000), "1d");
});

test("formatCountdown rounds up and includes larger units", () => {
  assert.equal(formatCountdown(1), "1s");
  assert.equal(formatCountdown(61_001), "1m 2s");
  assert.equal(formatCountdown(3_661_000), "1h 1m 1s");
});

test("findNextLoop ignores paused loops", () => {
  const next = findNextLoop([
    { id: 1, intervalMs: 30_000, prompt: "paused", enabled: false, nextRunAt: 100 },
    { id: 2, intervalMs: 60_000, prompt: "later", enabled: true, nextRunAt: 300 },
    { id: 3, intervalMs: 30_000, prompt: "sooner", enabled: true, nextRunAt: 200 },
  ]);

  assert.equal(next?.id, 3);
  assert.equal(findNextLoop([]), undefined);
});

test("shouldDispatchDueLoops defers non-agent busy lifecycle work", () => {
  assert.equal(shouldDispatchDueLoops(true, false), true);
  assert.equal(shouldDispatchDueLoops(false, true), true);
  assert.equal(shouldDispatchDueLoops(false, false), false);
});

test("normalizeMissedLoops schedules missed loops one interval from now", () => {
  const loops = [
    { id: 1, intervalMs: 30_000, prompt: "missed", enabled: true, nextRunAt: 99_000 },
    { id: 2, intervalMs: 60_000, prompt: "future", enabled: true, nextRunAt: 200_000 },
    { id: 3, intervalMs: 30_000, prompt: "paused", enabled: false, nextRunAt: 1 },
  ];

  assert.equal(normalizeMissedLoops(loops, 100_000), true);
  assert.equal(loops[0].nextRunAt, 130_000);
  assert.equal(loops[1].nextRunAt, 200_000);
  assert.equal(loops[2].nextRunAt, 1);
  assert.equal(normalizeMissedLoops(loops, 100_000), false);
});
