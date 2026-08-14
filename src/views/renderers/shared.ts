import { moment } from "obsidian";
import type { CalendarCategory, CalendarPluginSettings } from "../../settings";
import type { NoteEvent, OccurrenceInstance } from "../../data/types";
import { expandRecurringEvent } from "../../data/recurrence";
import { colorForKey } from "../../utils/colorHash";

export type { OccurrenceInstance } from "../../data/types";

export type ViewMode = "month" | "week" | "day" | "agenda";

export const GRID_CELL_COUNT = 42;
export const AGENDA_RANGE_DAYS = 60;

export interface CalendarCallbacks {
	onOpenEvent(occ: OccurrenceInstance): void;
	/** No-op expected for recurring occurrences (isTaskCompletable already excludes them). */
	onToggleComplete(occ: OccurrenceInstance): void;
	onCreateAt(date: string, time: string | null): void;
	onMoveEvent(occ: OccurrenceInstance, newDate: string, newStartTime: string | null): Promise<void>;
	onResizeEvent(occ: OccurrenceInstance, newEndTime: string): Promise<void>;
	/** Mobile month-view day tap -> bottom sheet. */
	onSelectDay(date: string): void;
}

export interface RenderContext {
	container: HTMLElement;
	rangeStart: moment.Moment;
	rangeEnd: moment.Moment;
	anchor: moment.Moment;
	occurrences: OccurrenceInstance[];
	/** All raw events regardless of date placement — Agenda view uses this for its undated-task bucket. */
	allEvents: NoteEvent[];
	settings: CalendarPluginSettings;
	isMobile: boolean;
	todayKey: string;
	callbacks: CalendarCallbacks;
}

export function computeVisibleRange(
	mode: ViewMode,
	cursor: moment.Moment,
	firstDayOfWeek: 0 | 1
): { start: moment.Moment; end: moment.Moment } {
	if (mode === "day") {
		return { start: cursor.clone().startOf("day"), end: cursor.clone().startOf("day") };
	}

	if (mode === "week") {
		const diff = (cursor.day() - firstDayOfWeek + 7) % 7;
		const start = cursor.clone().startOf("day").subtract(diff, "days");
		return { start, end: start.clone().add(6, "days") };
	}

	if (mode === "agenda") {
		const start = cursor.clone().startOf("day");
		return { start, end: start.clone().add(AGENDA_RANGE_DAYS - 1, "days") };
	}

	// month
	const firstOfMonth = cursor.clone().startOf("month");
	const diff = (firstOfMonth.day() - firstDayOfWeek + 7) % 7;
	const start = firstOfMonth.clone().subtract(diff, "days");
	return { start, end: start.clone().add(GRID_CELL_COUNT - 1, "days") };
}

/**
 * Expands every event (recurring + single-occurrence) into date-anchored instances clipped to
 * [rangeStart, rangeEnd]. `endDate` is EXCLUSIVE — the effective last inclusive day is
 * `endDate - 1 day`, never `endDate` itself. Undated tasks (date === null, non-recurring) are
 * never emitted here; Agenda view queries them separately as a "no due date" bucket.
 */
export function buildOccurrences(events: NoteEvent[], rangeStart: moment.Moment, rangeEnd: moment.Moment): OccurrenceInstance[] {
	const out: OccurrenceInstance[] = [];

	for (const event of events) {
		if (event.daysOfWeek && event.daysOfWeek.length > 0) {
			out.push(...expandRecurringEvent(event, rangeStart, rangeEnd));
			continue;
		}

		if (!event.date) continue;

		const firstDay = moment(event.date, "YYYY-MM-DD");
		const lastInclusiveRaw = event.endDate ? moment(event.endDate, "YYYY-MM-DD").subtract(1, "day") : firstDay.clone();
		const lastInclusive = lastInclusiveRaw.isBefore(firstDay, "day") ? firstDay : lastInclusiveRaw;

		const spanStart = firstDay.isBefore(rangeStart, "day") ? rangeStart.clone() : firstDay;
		const spanEnd = lastInclusive.isAfter(rangeEnd, "day") ? rangeEnd.clone() : lastInclusive;
		if (spanStart.isAfter(spanEnd, "day")) continue;

		const cursor = spanStart.clone();
		while (cursor.isSameOrBefore(spanEnd, "day")) {
			out.push({ event, occurrenceDate: cursor.format("YYYY-MM-DD"), isRecurring: false });
			cursor.add(1, "day");
		}
	}

	return out;
}

export function resolveEventColor(event: NoteEvent, categories: CalendarCategory[], palette: string[]): string {
	const category = categories.find((c) => c.id === event.categoryId);
	return category?.color ?? colorForKey(event.categoryId, palette);
}

/** Recurring instances have no per-occurrence completion field to write to — never completable. */
export function isTaskCompletable(occ: OccurrenceInstance): boolean {
	return !occ.isRecurring && occ.event.kind === "task";
}

export interface ChipRenderOptions {
	color: string;
	dense?: boolean;
	showTime?: boolean;
}

/** Renders one event chip. Handles checkbox-toggle vs open-note click routing internally. */
export function renderChip(
	parent: HTMLElement,
	occ: OccurrenceInstance,
	opts: ChipRenderOptions,
	callbacks: CalendarCallbacks
): HTMLElement {
	const { event } = occ;
	const isSpan = !!(event.endDate && event.date && event.date !== event.endDate);

	const chip = parent.createDiv({
		cls: `calendar-notes-chip${opts.dense ? " calendar-notes-chip-dense" : ""}${isSpan ? " calendar-notes-chip-span" : ""}${
			occ.isRecurring ? " calendar-notes-chip-recurring" : ""
		}`,
	});
	chip.style.backgroundColor = opts.color;
	chip.setAttribute("title", event.title);

	if (isTaskCompletable(occ)) {
		const checkbox = chip.createEl("input", { type: "checkbox", cls: "calendar-notes-chip-checkbox" });
		checkbox.checked = event.completed.type === "complete";
		checkbox.addEventListener("click", (evt) => {
			evt.stopPropagation();
			callbacks.onToggleComplete(occ);
		});
		if (event.completed.type === "complete") chip.addClass("calendar-notes-chip-complete");
	}

	const label = opts.showTime && !event.allDay && event.startTime ? `${event.startTime} ${event.title}` : event.title;
	chip.createSpan({ cls: "calendar-notes-chip-label", text: label });

	chip.addEventListener("click", (evt) => {
		evt.stopPropagation();
		callbacks.onOpenEvent(occ);
	});

	return chip;
}
