import type { ChildProcess } from "node:child_process";
import { join } from "node:path";

function agentKey(agentName: string): string {
	return agentName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}

export function createAgentSessionFile(
	projectCwd: string,
	traceSessionId: string,
	agentName: string,
): string {
	return join(projectCwd, ".pi", "agent-sessions", traceSessionId, `${agentKey(agentName)}.jsonl`);
}

function assistantText(message: any): string | undefined {
	if (message?.role !== "assistant" || !Array.isArray(message.content)) return undefined;
	return message.content
		.filter((part: any) => part?.type === "text" && typeof part.text === "string")
		.map((part: any) => part.text)
		.join("");
}

export class AssistantOutputCollector {
	streamedText = "";
	finalAssistantText = "";

	consume(event: any): { streamedDelta?: string; finalAssistantText?: string } {
		if (event?.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
			const streamedDelta = event.assistantMessageEvent.delta || "";
			this.streamedText += streamedDelta;
			return { streamedDelta };
		}

		let finalAssistantText: string | undefined;
		if (event?.type === "message_end") {
			finalAssistantText = assistantText(event.message);
		} else if (event?.type === "agent_end" && Array.isArray(event.messages)) {
			for (let index = event.messages.length - 1; index >= 0; index--) {
				finalAssistantText = assistantText(event.messages[index]);
				if (finalAssistantText !== undefined) break;
			}
		}

		if (finalAssistantText === undefined) return {};
		this.finalAssistantText = finalAssistantText;
		return { finalAssistantText };
	}
}

export function terminateChildProcess(child: ChildProcess, signal: NodeJS.Signals): void {
	if (child.pid && process.platform !== "win32") {
		try {
			process.kill(-child.pid, signal);
			return;
		} catch {
			// Fall back to the direct child if the process group is already gone.
		}
	}
	try { child.kill(signal); } catch {}
}

export function watchChildAbort(
	signal: AbortSignal | undefined,
	terminate: (signal: NodeJS.Signals) => void,
	onAbortRequested: () => void,
	killDelayMs = 2_000,
): { readonly aborted: boolean; childExited(): void } {
	let aborted = false;
	let disposed = false;
	let killTimer: ReturnType<typeof setTimeout> | undefined;

	const abort = () => {
		if (aborted || disposed) return;
		aborted = true;
		signal?.removeEventListener("abort", abort);
		terminate("SIGTERM");
		killTimer = setTimeout(() => {
			killTimer = undefined;
			terminate("SIGKILL");
		}, killDelayMs);
		killTimer.unref?.();
		onAbortRequested();
	};

	if (signal?.aborted) abort();
	else signal?.addEventListener("abort", abort, { once: true });

	return {
		get aborted() { return aborted; },
		childExited() {
			if (disposed) return;
			disposed = true;
			signal?.removeEventListener("abort", abort);
			if (killTimer) clearTimeout(killTimer);
			killTimer = undefined;
		},
	};
}
