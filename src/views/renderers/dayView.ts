import { WEEKDAY_LABELS_JA } from "../../constants";
import { renderTimelineGrid } from "./timeline";
import { renderChip, resolveEventColor, type OccurrenceInstance, type RenderContext } from "./shared";

export function renderDayView(ctx: RenderContext): void {
	const { container, settings, callbacks, rangeStart } = ctx;
	const dateKey = rangeStart.format("YYYY-MM-DD");

	const header = container.createDiv({ cls: "calendar-notes-day-header" });
	if (dateKey === ctx.todayKey) header.addClass("calendar-notes-cell-today");
	header.createSpan({ cls: "calendar-notes-day-header-weekday", text: WEEKDAY_LABELS_JA[rangeStart.day()] });
	header.createSpan({ cls: "calendar-notes-day-header-date", text: rangeStart.format("YYYY年M月D日") });

	const allDayOccs = ctx.occurrences.filter((o) => o.occurrenceDate === dateKey && o.event.allDay);
	const allDayRow = container.createDiv({ cls: "calendar-notes-day-allday-row" });
	allDayRow.addEventListener("click", (evt) => {
		if (evt.target === allDayRow) callbacks.onCreateAt(dateKey, null);
	});
	for (const occ of allDayOccs as OccurrenceInstance[]) {
		const color = resolveEventColor(occ.event, settings.categories, settings.colorPalette);
		renderChip(allDayRow, occ, { color, dense: true }, callbacks);
	}

	renderTimelineGrid(container, [rangeStart], ctx);
}
