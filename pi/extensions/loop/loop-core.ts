export const MIN_INTERVAL_MS = 30_000;

export interface LoopDefinition {
  id: number;
  intervalMs: number;
  prompt: string;
  enabled: boolean;
  nextRunAt: number;
}

const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function parseLoopSpec(input: string): { intervalMs: number; prompt: string } {
  const match = input.match(/^\s*(\d+)([smhd])\s+([\s\S]*\S)\s*$/i);
  if (!match) {
    throw new Error("Usage: /loop <time, e.g. 5m> <prompt>");
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase() as keyof typeof UNIT_MS;
  const intervalMs = amount * UNIT_MS[unit];
  if (!Number.isSafeInteger(intervalMs)) {
    throw new Error("Loop interval is too large");
  }
  if (intervalMs < MIN_INTERVAL_MS) {
    throw new Error("Loop interval must be at least 30s");
  }

  return { intervalMs, prompt: match[3].trim() };
}

export function formatDuration(durationMs: number): string {
  for (const [unit, unitMs] of [
    ["d", UNIT_MS.d],
    ["h", UNIT_MS.h],
    ["m", UNIT_MS.m],
    ["s", UNIT_MS.s],
  ] as const) {
    if (durationMs % unitMs === 0) {
      return `${durationMs / unitMs}${unit}`;
    }
  }
  return `${Math.ceil(durationMs / UNIT_MS.s)}s`;
}

export function formatCountdown(remainingMs: number): string {
  let seconds = Math.max(1, Math.ceil(remainingMs / 1_000));
  const parts: string[] = [];

  for (const [unit, unitSeconds] of [
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ] as const) {
    const value = Math.floor(seconds / unitSeconds);
    if (value > 0) {
      parts.push(`${value}${unit}`);
      seconds %= unitSeconds;
    }
  }

  return parts.join(" ");
}

export function findNextLoop(loops: LoopDefinition[]): LoopDefinition | undefined {
  return loops
    .filter((loop) => loop.enabled)
    .reduce<LoopDefinition | undefined>(
      (earliest, loop) => (!earliest || loop.nextRunAt < earliest.nextRunAt ? loop : earliest),
      undefined,
    );
}

export function shouldDispatchDueLoops(isIdle: boolean, agentRunActive: boolean): boolean {
  return isIdle || agentRunActive;
}

export function normalizeMissedLoops(loops: LoopDefinition[], now: number): boolean {
  let changed = false;
  for (const loop of loops) {
    if (loop.enabled && loop.nextRunAt <= now) {
      loop.nextRunAt = now + loop.intervalMs;
      changed = true;
    }
  }
  return changed;
}
