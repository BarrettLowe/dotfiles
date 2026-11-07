import { readFileSync } from "node:fs";
import { parseStreamingJson, type AssistantMessage } from "@earendil-works/pi-ai";
import {
	AssistantMessageComponent,
	ToolExecutionComponent,
	SessionManager,
	parseSessionEntries,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { ScrollView, Text, matchesKey, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";

export interface SubagentViewItem {
	id: number;
	status: "running" | "done" | "error";
	task: string;
	model: string;
	personality?: string;
	elapsed: number;
	approvalCount: number;
}

export interface SubagentViewSource {
	list(): SubagentViewItem[];
	transcript(id: number): SubagentTranscript;
	reviewApproval(id: number): Promise<void>;
	select(id: number): void;
}

type AssistantRow = { kind: "assistant"; message: AssistantMessage; streaming: boolean };
type ToolRow = {
	kind: "tool";
	id: string;
	name: string;
	args: any;
	complete: boolean;
	result?: { content: any[]; details?: any; isError: boolean; durationMs?: number };
};
type TranscriptRow = AssistantRow | ToolRow | { kind: "notice" | "user"; text: string };

function visibleContent(content: any): any[] {
	if (!Array.isArray(content)) return [];
	return content.flatMap<any>((block) => {
		if (block.type === "text") return [{ type: "text", text: block.text ?? "" }];
		if (block.type === "thinking") return [{ type: "thinking", thinking: block.thinking ?? "" }];
		if (block.type === "toolCall") {
			return [{ type: "toolCall", id: block.id, name: block.name, arguments: structuredClone(block.arguments ?? {}) }];
		}
		return [];
	});
}

function assistantMessage(message: any = {}): AssistantMessage {
	return { ...message, role: "assistant", content: visibleContent(message.content), stopReason: message.stopReason ?? "pending" };
}

function textContent(content: any): string {
	return typeof content === "string" ? content : (content ?? []).filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n");
}

/** Holds child history only in memory; it never owns the child session or process. */
export class SubagentTranscript {
	readonly rows: TranscriptRow[] = [];
	revision = 0;
	cwd = process.cwd();
	private active?: AssistantRow;
	private tools = new Map<string, ToolRow>();
	private argumentFragments = new Map<number, string>();

	constructor(sessionFile: string) {
		// Load raw branch history without opening a file-backed session manager.
		try {
			const entries = parseSessionEntries(readFileSync(sessionFile, "utf8"));
			const session = SessionManager.inMemory(this.cwd, undefined, entries);
			this.cwd = session.getHeader()?.cwd ?? this.cwd;
			for (const entry of session.getBranch()) {
				if (entry.type === "message") this.processEvent({ type: "message_end", message: entry.message });
				else if (entry.type === "compaction") this.addNotice("Context compacted; earlier transcript retained.");
				else if (entry.type === "branch_summary") this.addNotice(entry.summary);
				else if (entry.type === "custom_message" && entry.display) this.addNotice(textContent(entry.content));
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.addNotice(`Cannot read child history: ${String(error)}`);
		}
	}

	addNotice(text: string): void {
		this.rows.push({ kind: "notice", text });
		this.revision++;
	}

	private tool(id: string, name?: string, args?: any): ToolRow {
		let row = this.tools.get(id);
		if (!row) {
			row = { kind: "tool", id, name: name ?? "tool", args: args ?? {}, complete: false };
			this.tools.set(id, row);
			this.rows.push(row);
		}
		if (name) row.name = name;
		if (args !== undefined) row.args = structuredClone(args);
		return row;
	}

	private syncToolCalls(message: AssistantMessage): void {
		for (const block of message.content) {
			if (block.type === "toolCall" && block.id) this.tool(block.id, block.name, block.arguments);
		}
	}

	private begin(message: any = {}): AssistantRow {
		this.active = { kind: "assistant", message: assistantMessage(message), streaming: true };
		this.rows.push(this.active);
		this.argumentFragments.clear();
		return this.active;
	}

	processEvent(event: any): void {
		// Completed messages replace their live preview, not previous turns.
		if (event.type === "message_start" && event.message?.role === "assistant") {
			this.begin(event.message);
			this.syncToolCalls(this.active!.message);
		} else if (event.type === "message_end") {
			const message = event.message;
			if (message?.role === "assistant") {
				const row = this.active ?? this.begin();
				row.message = assistantMessage(message);
				row.streaming = false;
				this.syncToolCalls(row.message);
				this.active = undefined;
				this.argumentFragments.clear();
			} else if (message?.role === "toolResult") {
				const row = this.tool(message.toolCallId, message.toolName);
				row.result = structuredClone({ content: message.content ?? [], details: message.details, isError: !!message.isError });
				row.complete = true;
			} else if (message?.role === "user" || (message?.role === "custom" && message.display)) {
				this.rows.push({ kind: "user", text: textContent(message.content) });
			} else return;
		} else if (event.type === "message_update") {
			this.updateAssistant(event);
		} else if (event.type === "tool_execution_start" || event.type === "tool_execution_update" || event.type === "tool_execution_end") {
			const row = this.tool(event.toolCallId, event.toolName, event.args);
			const result = event.type === "tool_execution_end" ? event.result : event.partialResult;
			if (result) row.result = structuredClone({ ...result, content: result.content ?? [], isError: !!(event.isError ?? result.isError), durationMs: event.durationMs });
			row.complete = event.type === "tool_execution_end";
		} else return;
		this.revision++;
	}

	private updateAssistant(event: any): void {
		const delta = event.assistantMessageEvent;
		if (!delta) return;
		const row = this.active ?? this.begin();

		// SDK snapshots are cumulative; JSON/RPC events carry only indexed deltas.
		const snapshot = event.message ?? delta.partial;
		if (snapshot) row.message = assistantMessage(snapshot);
		else if ((delta.type === "done" && delta.message) || (delta.type === "error" && delta.error)) {
			row.message = assistantMessage(delta.message ?? delta.error);
		} else if (Number.isInteger(delta.contentIndex) && delta.contentIndex >= 0) {
			const index = delta.contentIndex;
			const content = row.message.content;
			while (content.length <= index) content.push({ type: "text", text: "" });
			let block: any = content[index];
			if (delta.type.startsWith("text_") || delta.type.startsWith("thinking_")) {
				const type = delta.type.startsWith("text_") ? "text" : "thinking";
				if (block?.type !== type) block = content[index] = { type, [type]: "" } as any;
				if (delta.type.endsWith("_delta")) block[type] += delta.delta ?? "";
				if (delta.type.endsWith("_end")) block[type] = delta.content ?? "";
			} else if (delta.type.startsWith("toolcall_")) {
				if (delta.type === "toolcall_start") {
					block = content[index] = { type: "toolCall", id: delta.id, name: delta.toolName, arguments: {} };
					this.argumentFragments.set(index, "");
				} else if (delta.type === "toolcall_delta") {
					const fragment = (this.argumentFragments.get(index) ?? "") + (delta.delta ?? "");
					this.argumentFragments.set(index, fragment);
					if (block?.type === "toolCall") block.arguments = parseStreamingJson(fragment);
				} else if (delta.type === "toolcall_end") content[index] = visibleContent([delta.toolCall])[0];
			}
		}
		this.syncToolCalls(row.message);
	}
}

/** A read-only overlay. Closing it has no effect on children or approvals. */
export class SubagentView implements Component {
	private items: SubagentViewItem[] = [];
	private selectedId?: number;
	private viewedId?: number;
	private showThinking = false;
	private expandTools = false;
	private closed = false;
	private disposed = false;
	private reviewing = false;
	private reviewError?: string;
	private contentLines: string[] = [];
	private cachedWidth?: number;
	private cachedTranscript?: SubagentTranscript;
	private cachedRevision = -1;
	private scroll: ScrollView;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private keybindings: KeybindingsManager,
		private done: () => void,
		private source: SubagentViewSource,
		initialId?: number,
		lastSelectedId?: number,
	) {
		this.scroll = new ScrollView({ render: () => this.contentLines, invalidate() {} }, { follow: "end", scrollbar: "hidden" });
		this.items = source.list();
		this.selectedId = this.items.find((item) => item.id === lastSelectedId)?.id ?? this.items[0]?.id;
		const directId = initialId ?? (this.items.length === 1 ? this.items[0]?.id : undefined);
		if (directId !== undefined && this.items.some((item) => item.id === directId)) this.open(directId);
	}

	private open(id: number): void {
		this.viewedId = this.selectedId = id;
		this.reviewError = undefined;
		this.source.select(id);
		this.scroll.scrollToEnd();
		this.invalidate();
	}

	refresh(): void {
		if (this.closed || this.disposed) return;
		this.items = this.source.list();
		if (!this.items.some((item) => item.id === this.viewedId)) this.viewedId = undefined;
		if (!this.items.some((item) => item.id === this.selectedId)) this.selectedId = this.items[0]?.id;
		this.tui.requestRender();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.done();
	}

	render(width: number): string[] {
		// Keep the escape hint outside the scrolling transcript, even on tiny terminals.
		const rows = Math.max(1, this.tui.terminal.rows);
		width = Math.max(0, Math.floor(width));
		if (width === 0) return [""];
		const header = this.theme.fg("accent", "Read-only · Esc back");
		const item = this.items.find((entry) => entry.id === this.viewedId);
		let lines: string[];
		if (!item) {
			const available = Math.max(0, rows - 2); // Header and picker hint stay fixed.
			const selected = Math.max(0, this.items.findIndex((entry) => entry.id === this.selectedId));
			const start = Math.max(0, selected - available + 1);
			lines = [header, this.theme.fg("dim", "Subagents · ↑↓ select · Enter view"), ...this.items.slice(start, start + available).map((entry) => `${entry.id === this.selectedId ? ">" : " "} ${this.label(entry)}`)];
			if (!this.items.length) lines = [header, "No subagents."];
		} else {
			const transcript = this.source.transcript(item.id);
			if (this.cachedWidth !== width || this.cachedTranscript !== transcript || this.cachedRevision !== transcript.revision) {
				this.contentLines = this.renderTranscript(transcript, width);
				this.cachedWidth = width;
				this.cachedTranscript = transcript;
				this.cachedRevision = transcript.revision;
			}
			const fixed = [header, this.label(item), this.theme.fg("dim", `←→ agents · ↑↓/PgUp/PgDn scroll · End live · Ctrl+T thinking ${this.showThinking ? "on" : "off"} · Ctrl+O tools ${this.expandTools ? "expanded" : "compact"} · a approvals`)];
			if (this.reviewError) fixed.push(this.theme.fg("error", this.reviewError));
			this.scroll.updateLayout(this.contentLines.length, Math.max(0, rows - fixed.length), () => {
				if (!this.closed && !this.disposed) this.tui.requestRender();
			});
			fixed[1] += this.scroll.isFollowingEnd ? " · LIVE" : " · scroll (End: live)";
			lines = [...fixed, ...this.scroll.render(width).slice(this.scroll.scrollTop, this.scroll.scrollTop + this.scroll.viewportHeight)];
		}
		return lines.slice(0, rows).map((line) => truncateToWidth(line.replace(/[\r\n]/g, " "), width, ""));
	}

	private label(item: SubagentViewItem): string {
		return `#${item.id} [${item.status}] ${item.personality ? `${item.personality} · ` : ""}${item.model} · ${Math.round(item.elapsed / 1000)}s · ${item.approvalCount} approvals · ${item.task}`;
	}

	private renderTranscript(transcript: SubagentTranscript, width: number): string[] {
		const lines: string[] = [];
		// Render exposed content only, with Pi's own message and tool components.
		for (const row of transcript.rows) {
			let component: Component;
			if (row.kind === "assistant") {
				const assistant = new AssistantMessageComponent(undefined, !this.showThinking, undefined, "Thinking hidden (Ctrl+T)", 0);
				assistant.updateContent(row.message, row.streaming);
				component = assistant;
			} else if (row.kind === "tool") {
				const tool = new ToolExecutionComponent(row.name, row.id, row.args, { showImages: false, outputPad: 0 }, {}, this.tui, transcript.cwd);
				tool.setExpanded(this.expandTools);
				if (row.result) tool.updateResult(row.result, !row.complete);
				component = tool;
			} else component = new Text(this.theme.fg(row.kind === "user" ? "text" : "muted", `${row.kind === "user" ? "User: " : ""}${row.text}`), 0, 0);
			lines.push(...component.render(Math.max(1, width)));
		}
		return lines.length ? lines : ["Waiting for child output…"];
	}

	handleInput(data: string): void {
		if (this.closed || this.disposed) return;
		if (matchesKey(data, "escape") || this.keybindings.matches(data, "tui.select.cancel")) {
			this.close();
			return;
		}
		if (this.viewedId === undefined) {
			let index = this.items.findIndex((item) => item.id === this.selectedId);
			if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, "up")) index--;
			else if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, "down")) index++;
			else if (this.keybindings.matches(data, "tui.select.confirm") || matchesKey(data, "return")) {
				if (this.selectedId !== undefined) this.open(this.selectedId);
			} else return;
			this.selectedId = this.items[Math.max(0, Math.min(this.items.length - 1, index))]?.id;
		} else if (matchesKey(data, "left") || matchesKey(data, "right")) {
			const index = this.items.findIndex((item) => item.id === this.viewedId);
			const next = (index + (matchesKey(data, "right") ? 1 : -1) + this.items.length) % this.items.length;
			if (this.items[next]) this.open(this.items[next].id);
		} else if (matchesKey(data, "ctrl+t")) {
			this.showThinking = !this.showThinking;
			this.invalidate();
		} else if (matchesKey(data, "ctrl+o")) {
			this.expandTools = !this.expandTools;
			this.invalidate();
		} else if (matchesKey(data, "end")) this.scroll.scrollToEnd();
		else if (matchesKey(data, "home")) this.scroll.scrollTo(0, { disableFollow: true });
		else if (matchesKey(data, "up")) this.scroll.scrollTo(this.scroll.scrollTop - 1, { disableFollow: true });
		else if (matchesKey(data, "down")) this.scroll.scrollBy(1);
		else if (matchesKey(data, "pageUp")) this.scroll.scrollTo(this.scroll.scrollTop - Math.max(1, this.scroll.viewportHeight), { disableFollow: true });
		else if (matchesKey(data, "pageDown")) this.scroll.scrollBy(Math.max(1, this.scroll.viewportHeight));
		else if (data === "a") {
			const item = this.items.find((entry) => entry.id === this.viewedId);
			if (item?.approvalCount && !this.reviewing) void this.review(item.id);
		} else return;
		this.tui.requestRender();
	}

	private async review(id: number): Promise<void> {
		this.reviewing = true;
		this.reviewError = undefined;
		// The callback owns its nested approval overlay; leave this view in place.
		try {
			await this.source.reviewApproval(id);
		} catch (error) {
			if (!this.closed && !this.disposed) this.reviewError = `Approval review failed: ${String(error)}`;
		} finally {
			this.reviewing = false;
			this.refresh();
		}
	}

	invalidate(): void {
		this.cachedWidth = undefined;
	}

	dispose(): void {
		this.disposed = true;
		this.contentLines = [];
		this.cachedTranscript = undefined;
	}
}
