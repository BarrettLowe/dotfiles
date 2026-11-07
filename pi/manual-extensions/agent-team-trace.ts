import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const AGENT_TRACE_VERSION = 1;

export type AgentTraceEventType =
	| "session_start"
	| "dispatch_start"
	| "heartbeat"
	| "assistant_stream"
	| "assistant_final"
	| "tool_start"
	| "tool_end"
	| "message_end"
	| "stderr"
	| "dispatch_end"
	| "dispatch_error"
	| "plan_presented"
	| "approval_requested"
	| "approval_granted"
	| "approval_denied";

export interface AgentTraceEvent {
	version: typeof AGENT_TRACE_VERSION;
	sessionId: string;
	runId: string;
	sequence: number;
	timestamp: string;
	type: AgentTraceEventType;
	team: string;
	agent: string;
	payload: Record<string, unknown>;
}

const SENSITIVE_KEY = /(authorization|api[-_]?key|cookie|password|secret|token)/i;
const MAX_STRING_LENGTH = 12_000;

function cleanValue(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
	if (SENSITIVE_KEY.test(key)) return "[redacted]";
	if (typeof value === "string") {
		return value.length > MAX_STRING_LENGTH
			? `${value.slice(0, MAX_STRING_LENGTH)}\n… [truncated]`
			: value;
	}
	if (typeof value === "bigint") return value.toString();
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) return "[circular]";
	seen.add(value);
	if (Array.isArray(value)) return value.slice(0, 200).map(item => cleanValue(item, "", seen));

	const clean: Record<string, unknown> = {};
	for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
		clean[childKey] = cleanValue(childValue, childKey, seen);
	}
	return clean;
}

export function sanitizeTracePayload(payload: Record<string, unknown>): Record<string, unknown> {
	return cleanValue(payload) as Record<string, unknown>;
}

export function createTraceSessionId(now = new Date(), pid = process.pid): string {
	const stamp = now.toISOString().replace(/[:.]/g, "-");
	return `${stamp}-${pid}`;
}

export class AgentTraceWriter {
	readonly sessionId: string;
	readonly traceFile: string;
	private sequence = 0;
	private enabled: boolean;

	constructor(projectCwd: string, enabled = process.env.AGENT_TEAM_TRACE !== "0") {
		this.enabled = enabled;
		this.sessionId = createTraceSessionId();
		const traceDir = join(projectCwd, ".pi", "agent-traces");
		this.traceFile = join(traceDir, `${this.sessionId}.jsonl`);
		if (this.enabled) {
			try {
				mkdirSync(traceDir, { recursive: true });
			} catch {
				// Observability must never prevent the agent team from running.
				this.enabled = false;
			}
		}
	}

	emit(input: {
		runId: string;
		type: AgentTraceEventType;
		team: string;
		agent: string;
		payload?: Record<string, unknown>;
	}): AgentTraceEvent | undefined {
		if (!this.enabled) return undefined;
		const event: AgentTraceEvent = {
			version: AGENT_TRACE_VERSION,
			sessionId: this.sessionId,
			runId: input.runId,
			sequence: ++this.sequence,
			timestamp: new Date().toISOString(),
			type: input.type,
			team: input.team,
			agent: input.agent,
			payload: sanitizeTracePayload(input.payload ?? {}),
		};
		try {
			appendFileSync(this.traceFile, `${JSON.stringify(event)}\n`, "utf-8");
		} catch {
			this.enabled = false;
			return undefined;
		}
		return event;
	}
}
