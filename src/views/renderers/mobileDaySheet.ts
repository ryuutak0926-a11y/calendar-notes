import { App, Modal } from "obsidian";
import type { CalendarPluginSettings } from "../../settings";
import { renderChip, resolveEventColor, type CalendarCallbacks, type OccurrenceInstance } from "./shared";

/** Mobile month-view day tap -> bottom sheet listing that day's occurrences (master-detail pattern). */
export function openDaySheet(
	app: App,
	settings: CalendarPluginSettings,
	date: string,
	occurrences: OccurrenceInstance[],
	callbacks: CalendarCallbacks
): void {
	new DaySheetModal(app, settings, date, occurrences, callbacks).open();
}

class DaySheetModal extends Modal {
	constructor(
		app: App,
		private settings: CalendarPluginSettings,
		private date: string,
		private occurrences: OccurrenceInstance[],
		private callbacks: CalendarCallbacks
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("calendar-notes-day-sheet");
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv({ cls: "calendar-notes-day-sheet-header" });
		header.createSpan({ cls: "calendar-notes-day-sheet-title", text: this.date });
		const addBtn = header.createEl("button", { text: "+ 追加", cls: "calendar-notes-day-sheet-add" });
		addBtn.addEventListener("click", () => {
			this.close();
			this.callbacks.onCreateAt(this.date, null);
		});

		const list = contentEl.createDiv({ cls: "calendar-notes-day-sheet-list" });
		if (this.occurrences.length === 0) {
			list.createDiv({ cls: "calendar-notes-agenda-empty", text: "予定・タスクはありません" });
		}

		const closeAndOpen: CalendarCallbacks = {
			...this.callbacks,
			onOpenEvent: (occ) => {
				this.close();
				this.callbacks.onOpenEvent(occ);
			},
		};

		for (const occ of this.occurrences) {
			const color = resolveEventColor(occ.event, this.settings.categories, this.settings.colorPalette);
			renderChip(list, occ, { color, showTime: true }, closeAndOpen);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
