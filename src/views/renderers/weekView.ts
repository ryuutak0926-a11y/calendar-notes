import { WEEKDAY_LABELS_JA } from "../../constants";
import { attachDragHandlers } from "../dragController";
import type { DropTarget } from "../dragController";
import { renderTimelineGrid } from "./timeline";
import { renderChip, resolveEventColor, type OccurrenceInstance, type RenderContext } from "./shared";

export function renderWeekView(ctx: RenderContext): void {
	const { container, settings, callbacks } = ctx;
	const days = Array.from({ length: 7 }, (_, i) => ctx.rangeStart.clone().add(i, "days"));

	const byDate = new Map<string, OccurrenceInstance[]>();
	for (const occ of ctx.occurrences) {
		const bucket = byDate.get(occ.occurrenceDate);
		if (bucket) bucket.push(occ);
		else byDate.set(occ.occurrenceDate, [occ]);
	}

	const scroller = container.createDiv({ cls: "calendar-notes-week-scroller" });

	const headerRow = scroller.createDiv({ cls: "calendar-notes-week-header" });
	headerRow.createDiv({ cls: "calendar-notes-week-axis-spacer" });
	for (const day of days) {
		const dateKey = day.format("YYYY-MM-DD");
		const cell = headerRow.createDiv({ cls: "calendar-notes-week-day-label" });
		if (dateKey === ctx.todayKey) cell.addClass("calendar-notes-cell-today");
		cell.createSpan({ text: WEEKDAY_LABELS_JA[day.day()] });
		cell.createSpan({ cls: "calendar-notes-week-day-number", text: String(day.date()) });
	}

	const allDayRow = scroller.createDiv({ cls: "calendar-notes-week-allday-row" });
	allDayRow.createDiv({ cls: "calendar-notes-week-axis-spacer" });

	const resolveAllDayTarget = (x: number, y: number): DropTarget | null => {
		const el = document.elementFromPoint(x, y);
		const col = el instanceof HTMLElement ? el.closest<HTMLElement>(".calendar-notes-week-allday-cell") : null;
		if (!col || !allDayRow.contains(col)) return null;
		return col.dataset.date ? { date: col.dataset.date, time: null } : null;
	};

	let highlighted: HTMLElement | null = null;

	for (const day of days) {
		const dateKey = day.format("YYYY-MM-DD");
		const occs = (byDate.get(dateKey) ?? []).filter((o) => o.event.allDay);
		const cell = allDayRow.createDiv({ cls: "calendar-notes-week-allday-cell" });
		cell.dataset.date = dateKey;
		cell.addEventListener("click", () => callbacks.onCreateAt(dateKey, null));

		for (const occ of occs) {
			const color = resolveEventColor(occ.event, settings.categories, settings.colorPalette);
			const chip = renderChip(cell, occ, { color, dense: true }, callbacks);
			if (occ.isRecurring) continue;
			attachDragHandlers(chip, occ, {
				isMobile: ctx.isMobile,
				resolveDropTarget: resolveAllDayTarget,
				onDragMove: (_o, target) => {
					highlighted?.removeClass("calendar-notes-cell-drop-target");
					highlighted = target ? allDayRow.querySelector<HTMLElement>(`[data-date="${target.date}"]`) : null;
					highlighted?.addClass("calendar-notes-cell-drop-target");
				},
				onDragEnd: (o, target) => {
					highlighted?.removeClass("calendar-notes-cell-drop-target");
					highlighted = null;
					if (target && target.date !== o.occurrenceDate) void callbacks.onMoveEvent(o, target.date, null);
				},
			});
		}
	}

	renderTimelineGrid(scroller, days, ctx);
}
