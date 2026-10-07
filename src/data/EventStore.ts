import { App, Component, TAbstractFile, TFile } from "obsidian";
import type CalendarNotesPlugin from "../main";
import type { NoteEvent } from "./types";
import { matchCategory, parseEventFrontmatter } from "./eventParser";

/**
 * Keeps an in-memory index of NoteEvents, keyed by file path (each note is its own event —
 * unlike the old daily-note model, many notes can share the same date). Recurrence expansion
 * is deliberately NOT done here; this store only holds the raw per-note events, and
 * `src/data/recurrence.ts` expands them into per-date occurrences at render time.
 */
export class EventStore extends Component {
	private app: App;
	private plugin: CalendarNotesPlugin;
	private events: Map<string, NoteEvent> = new Map();
	private listeners: Set<() => void> = new Set();
	private rebuildTimer: number | null = null;

	constructor(app: App, plugin: CalendarNotesPlugin) {
		super();
		this.app = app;
		this.plugin = plugin;
	}

	onload(): void {
		this.rebuild();
		// On mobile (and on a cold start) the metadata cache is often not ready when the plugin loads, so the
		// first rebuild() sees no frontmatter and indexes nothing. Rebuild again once the layout and the cache
		// are ready; otherwise the calendar stays empty until a note happens to be edited.
		this.app.workspace.onLayoutReady(() => this.rebuild());
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleRebuild()));
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) this.scheduleRebuild();
			})
		);
		this.registerEvent(this.app.metadataCache.on("changed", (file) => this.indexFile(file)));
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile) this.removeFile(file.path);
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.removeFile(oldPath);
				if (file instanceof TFile) {
					this.indexFile(file);
					this.scheduleRebuild();
				}
			})
		);
	}

	/** Debounced rebuild, so a burst of "resolved"/"create" events (e.g. during sync) costs one pass. */
	private scheduleRebuild(): void {
		if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = null;
			this.rebuild();
		}, 300);
	}

	/** Subscribe to index changes; returns an unsubscribe function. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	rebuild(): void {
		this.events.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			this.indexFile(file, { silent: true });
		}
		this.notify();
	}

	private indexFile(file: TAbstractFile, opts: { silent?: boolean } = {}): void {
		if (!(file instanceof TFile)) return;

		const category = matchCategory(file.path, this.plugin.settings.categories);
		if (!category) {
			if (this.events.delete(file.path) && !opts.silent) this.notify();
			return;
		}

		const cache = this.app.metadataCache.getFileCache(file);
		// Cache not built yet for this file: keep any existing entry and wait for "resolved"/"changed".
		if (!cache) return;
		const frontmatter = cache.frontmatter;
		if (typeof frontmatter !== "object" || frontmatter === null) {
			if (this.events.delete(file.path) && !opts.silent) this.notify();
			return;
		}

		const event = parseEventFrontmatter(file.path, category, frontmatter as Record<string, unknown>);
		this.events.set(file.path, event);
		if (!opts.silent) this.notify();
	}

	private removeFile(path: string): void {
		if (this.events.delete(path)) this.notify();
	}

	getAllEvents(): NoteEvent[] {
		return Array.from(this.events.values());
	}
}
