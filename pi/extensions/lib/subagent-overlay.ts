import type { ExtensionContext, KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@earendil-works/pi-tui";

type OverlayFactory<T> = (tui: TUI, theme: Theme, keys: KeybindingsManager, done: (result: T | undefined) => void) => Component & { dispose?(): void };
type OpenOverlay = { handle?: OverlayHandle; close(): void; closed: boolean };

/** Yields to primary-session dialogs before they can receive unseen input. */
export class SubagentOverlayGroup {
	private entries = new Set<OpenOverlay>();

	private ownsFocus(): boolean {
		return [...this.entries].some(entry => !entry.closed && entry.handle?.isFocused());
	}

	close(): void {
		for (const entry of [...this.entries].reverse()) entry.close();
	}

	async show<T>(ctx: ExtensionContext, factory: OverlayFactory<T>): Promise<T | undefined> {
		const entry: OpenOverlay = { close() {}, closed: false };
		this.entries.add(entry);
		let unsubscribe: (() => void) | undefined;
		try {
			return await ctx.ui.custom<T | undefined>((tui, theme, keys, done) => {
				const finish = (result?: T) => {
					if (entry.closed) return;
					entry.closed = true;
					done(result);
				};
				entry.close = () => finish();
				// A key may arrive after focus changes but before the next render.
				unsubscribe = tui.addInputListener(() => {
					if (entry.handle && !entry.closed && !this.ownsFocus()) {
						this.close();
						return { consume: true };
					}
					return undefined;
				});
				return factory(tui, theme, keys, finish);
			}, {
				overlay: true,
				onHandle: handle => { entry.handle = handle; },
				overlayOptions: {
					width: "100%", maxHeight: "100%", anchor: "center",
					visible: () => {
						if (entry.closed) return false;
						if (!entry.handle || this.ownsFocus()) return true;
						// Let the current render finish before removing our overlays.
						queueMicrotask(() => {
							if (!entry.closed && !this.ownsFocus()) this.close();
						});
						return false;
					},
				},
			});
		} finally {
			entry.closed = true;
			unsubscribe?.();
			this.entries.delete(entry);
		}
	}
}
