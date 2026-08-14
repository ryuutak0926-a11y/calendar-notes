import { Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { CalendarView } from "./views/CalendarView";
import { CalendarSettingTab, CalendarPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { EventStore } from "./data/EventStore";

export default class CalendarNotesPlugin extends Plugin {
	settings: CalendarPluginSettings = DEFAULT_SETTINGS;
	eventStore!: EventStore;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.eventStore = new EventStore(this.app, this);
		this.addChild(this.eventStore);

		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));

		this.addRibbonIcon("calendar-days", "Open calendar", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-calendar-view",
			name: "Open calendar",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new CalendarSettingTab(this.app, this));
	}

	onunload(): void {
		// EventStore is registered as a child component and unloads automatically.
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async rebuildEventIndex(): Promise<void> {
		this.eventStore.rebuild();
	}

	refreshCalendarViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)) {
			const view = leaf.view;
			if (view instanceof CalendarView) view.render();
		}
	}

	private async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
}
