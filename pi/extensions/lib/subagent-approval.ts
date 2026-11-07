import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { ScrollView, SelectList, Text, matchesKey, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";

/** Shows a queued request without treating Esc as a denial. */
export class SubagentApprovalDialog implements Component {
	private list: SelectList;
	private details: Text;
	private scroll: ScrollView;
	private closed = false;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private keybindings: KeybindingsManager,
		title: string,
		options: string[],
		private done: (choice: string | undefined) => void,
	) {
		this.details = new Text(title, 0, 0);
		this.scroll = new ScrollView(this.details, { scrollbar: "hidden" });
		this.list = new SelectList(options.map(value => ({ value, label: value })), options.length, {
			selectedPrefix: text => theme.fg("accent", text),
			selectedText: text => theme.fg("accent", text),
			description: text => theme.fg("muted", text),
			scrollInfo: text => theme.fg("dim", text),
			noMatch: text => theme.fg("muted", text),
		});
		this.list.setSelectedIndex(options.length - 1);
		this.list.onSelect = item => this.close(item.value);
		this.list.onCancel = () => this.close();
	}

	close(choice?: string): void {
		if (this.closed) return;
		this.closed = true;
		this.done(choice);
	}

	render(width: number): string[] {
		const rows = Math.max(1, this.tui.terminal.rows);
		const choices = this.list.render(Math.max(1, width));
		const details = this.details.render(Math.max(1, width));
		const header = this.theme.fg("warning", "Subagent permission · Esc back (request stays pending)");
		const hint = this.theme.fg("dim", "↑↓ choose · Enter confirm · PgUp/PgDn review full command");
		this.scroll.updateLayout(details.length, Math.max(0, rows - choices.length - 2), () => this.tui.requestRender());
		const visible = this.scroll.render(Math.max(1, width)).slice(this.scroll.scrollTop, this.scroll.scrollTop + this.scroll.viewportHeight);
		return [header, ...visible, ...choices, hint].slice(0, rows).map(line => truncateToWidth(line, Math.max(0, width), ""));
	}

	handleInput(data: string): void {
		if (this.closed) return;
		if (matchesKey(data, "escape") || this.keybindings.matches(data, "tui.select.cancel")) this.close();
		else if (matchesKey(data, "pageUp")) this.scroll.scrollBy(-Math.max(1, this.scroll.viewportHeight));
		else if (matchesKey(data, "pageDown")) this.scroll.scrollBy(Math.max(1, this.scroll.viewportHeight));
		else this.list.handleInput(data);
		this.tui.requestRender();
	}

	invalidate(): void {
		this.details.invalidate();
		this.list.invalidate();
	}
}
