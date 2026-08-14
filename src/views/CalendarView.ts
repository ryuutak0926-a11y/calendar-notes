import { ItemView, Platform, TFile, WorkspaceLeaf, moment } from "obsidian";
import type CalendarNotesPlugin from "../main";
import { MOBILE_NARROW_BREAKPOINT_PX, VIEW_TYPE_CALENDAR } from "../constants";
import type { NoteEvent, OccurrenceInstance } from "../data/types";
import { openEventNote, toggleEventCompletion, updateEventFields } from "../data/eventNotes";
import { QuickAddModal } from "../modals/QuickAddModal";
import { renderMonthView } from "./renderers/monthView";
import { renderWeekView } from "./renderers/weekView";
import { renderDayView } from "./renderers/dayView";
import { renderAgendaView } from "./renderers/agendaView";
import { openDaySheet } from "./renderers/mobileDaySheet";
import { buildOccurrences, computeVisibleRange, type CalendarCallbacks, type RenderContext, type ViewMode } from "./renderers/shared";

function toMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

function fromMinutes(minutes: number): string {
	const clamped = Math.min(23 * 60 + 59, Math.max(0, minutes));
	const h = Math.floor(clamped / 60);
	const m = clamped % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = { month: "月", week: "週", day: "日", agenda: "アジェンダ" };

export class CalendarView extends ItemView {
	private plugin: CalendarNotesPlugin;
	private cursor: moment.Moment;
	private mode: ViewMode = "month";
	private isMobile = Platform.isMobile;
	private resizeObserver: ResizeObserver | null = null;
	private unsubscribe: (() => void) | null = null;
	private currentOccurrences: OccurrenceInstance[] = [];

	private callbacks: CalendarCallbacks = {
		onOpenEvent: (occ) => {
			const file = this.app.vault.getAbstractFileByPath(occ.event.filePath);
			if (file instanceof TFile) void openEventNote(this.app, file);
		},
		onToggleComplete: (occ) => {
			if (occ.isRecurring || occ.event.kind !== "task") return;
			const file = this.app.vault.getAbstractFileByPath(occ.event.filePath);
			if (file instanceof TFile) void toggleEventCompletion(this.app, file);
		},
		onCreateAt: (date, time) => {
			new QuickAddModal(this.app, this.plugin, { date, time }).open();
		},
		onMoveEvent: async (occ, newDate, newStartTime) => {
			const file = this.app.vault.getAbstractFileByPath(occ.event.filePath);
			if (!(file instanceof TFile)) return;
			const { event } = occ;
			const patch: Partial<Pick<NoteEvent, "date" | "endDate" | "startTime" | "endTime">> = {};

			if (newStartTime === null) {
				patch.date = newDate;
				if (event.endDate && event.date) {
					const spanDays = moment(event.endDate, "YYYY-MM-DD").diff(moment(event.date, "YYYY-MM-DD"), "days");
					patch.endDate = moment(newDate, "YYYY-MM-DD").add(spanDays, "days").format("YYYY-MM-DD");
				}
			} else {
				patch.date = newDate;
				patch.startTime = newStartTime;
				if (event.startTime && event.endTime) {
					const duration = toMinutes(event.endTime) - toMinutes(event.startTime);
					patch.endTime = fromMinutes(toMinutes(newStartTime) + duration);
				}
			}

			await updateEventFields(this.app, file, patch);
		},
		onResizeEvent: async (occ, newEndTime) => {
			const file = this.app.vault.getAbstractFileByPath(occ.event.filePath);
			if (!(file instanceof TFile)) return;
			await updateEventFields(this.app, file, { endTime: newEndTime });
		},
		onSelectDay: (date) => {
			const dayOccs = this.currentOccurrences.filter((o) => o.occurrenceDate === date);
			openDaySheet(this.app, this.plugin.settings, date, dayOccs, this.callbacks);
		},
	};

	constructor(leaf: WorkspaceLeaf, plugin: CalendarNotesPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.cursor = moment();
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return "Calendar";
	}

	getIcon(): string {
		return "calendar-days";
	}

	async onOpen(): Promise<void> {
		this.contentEl.toggleClass("calendar-notes-mobile", this.isMobile);
		this.resizeObserver = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;
			this.contentEl.toggleClass("calendar-notes-narrow", width < MOBILE_NARROW_BREAKPOINT_PX);
		});
		this.resizeObserver.observe(this.contentEl);

		this.unsubscribe = this.plugin.eventStore.onChange(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	}

	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("calendar-notes-view");

		this.renderHeader(container);

		const { start, end } = computeVisibleRange(this.mode, this.cursor, this.plugin.settings.firstDayOfWeek);
		const allEvents = this.plugin.eventStore.getAllEvents();
		const occurrences = buildOccurrences(allEvents, start, end);
		this.currentOccurrences = occurrences;

		const ctx: RenderContext = {
			container: container.createDiv({ cls: "calendar-notes-body" }),
			rangeStart: start,
			rangeEnd: end,
			anchor: this.cursor,
			occurrences,
			allEvents,
			settings: this.plugin.settings,
			isMobile: this.isMobile,
			todayKey: moment().format("YYYY-MM-DD"),
			callbacks: this.callbacks,
		};

		switch (this.mode) {
			case "month":
				renderMonthView(ctx);
				break;
			case "week":
				renderWeekView(ctx);
				break;
			case "day":
				renderDayView(ctx);
				break;
			case "agenda":
				renderAgendaView(ctx);
				break;
		}
	}

	private renderHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: "calendar-notes-header" });

		const prevBtn = header.createEl("button", { text: "‹", cls: "calendar-notes-nav-btn" });
		prevBtn.addEventListener("click", () => {
			this.step(-1);
			this.render();
		});

		header.createEl("span", { text: this.formatTitle(), cls: "calendar-notes-month-label" });

		const nextBtn = header.createEl("button", { text: "›", cls: "calendar-notes-nav-btn" });
		nextBtn.addEventListener("click", () => {
			this.step(1);
			this.render();
		});

		const todayBtn = header.createEl("button", { text: "今日", cls: "calendar-notes-today-btn" });
		todayBtn.addEventListener("click", () => {
			this.cursor = moment();
			this.render();
		});

		const tabs = header.createDiv({ cls: "calendar-notes-mode-tabs" });
		for (const mode of ["month", "week", "day", "agenda"] as ViewMode[]) {
			const tab = tabs.createEl("button", { text: VIEW_MODE_LABELS[mode], cls: "calendar-notes-mode-tab" });
			if (mode === this.mode) tab.addClass("is-active");
			tab.addEventListener("click", () => {
				this.mode = mode;
				this.render();
			});
		}
	}

	private step(direction: 1 | -1): void {
		if (this.mode === "month") this.cursor = this.cursor.clone().add(direction, "month");
		else if (this.mode === "week") this.cursor = this.cursor.clone().add(direction * 7, "days");
		else if (this.mode === "day") this.cursor = this.cursor.clone().add(direction, "day");
		else this.cursor = this.cursor.clone().add(direction * 30, "days");
	}

	private formatTitle(): string {
		if (this.mode === "month") return this.cursor.format("YYYY年 M月");
		if (this.mode === "day") return this.cursor.format("YYYY年M月D日");
		if (this.mode === "week") {
			const { start, end } = computeVisibleRange("week", this.cursor, this.plugin.settings.firstDayOfWeek);
			return `${start.format("YYYY年M月D日")} - ${end.format("M月D日")}`;
		}
		return "アジェンダ";
	}
}
