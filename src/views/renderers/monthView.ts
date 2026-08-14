import { WEEKDAY_LABELS_JA } from "../../constants";
import { getJapaneseHolidayName } from "../../holidays/jpHolidays";
import { attachDragHandlers } from "../dragController";
import type { DropTarget } from "../dragController";
import { GRID_CELL_COUNT, renderChip, resolveEventColor, type OccurrenceInstance, type RenderContext } from "./shared";

function cellDropTargetResolver(grid: HTMLElement): (x: number, y: number) => DropTarget | null {
	return (x, y) => {
		const el = document.elementFromPoint(x, y);
		const cell = el instanceof HTMLElement ? el.closest<HTMLElement>(".calendar-notes-cell") : null;
		if (!cell || !grid.contains(cell)) return null;
		const date = cell.dataset.date;
		return date ? { date, time: null } : null;
	};
}

export function renderMonthView(ctx: RenderContext): void {
	const { container, settings, callbacks } = ctx;

	// weekday row
	const row = container.createDiv({ cls: "calendar-notes-weekday-row" });
	for (let i = 0; i < 7; i++) {
		const dow = (settings.firstDayOfWeek + i) % 7;
		row.createDiv({ cls: "calendar-notes-weekday", text: WEEKDAY_LABELS_JA[dow] });
	}

	const grid = container.createDiv({ cls: "calendar-notes-grid" });

	const byDate = new Map<string, OccurrenceInstance[]>();
	for (const occ of ctx.occurrences) {
		const bucket = byDate.get(occ.occurrenceDate);
		if (bucket) bucket.push(occ);
		else byDate.set(occ.occurrenceDate, [occ]);
	}

	const currentMonth = ctx.anchor.month();
	const resolveDropTarget = cellDropTargetResolver(grid);
	let highlightedCell: HTMLElement | null = null;

	for (let i = 0; i < GRID_CELL_COUNT; i++) {
		const date = ctx.rangeStart.clone().add(i, "days");
		const dateKey = date.format("YYYY-MM-DD");
		const occs = byDate.get(dateKey) ?? [];

		const cell = grid.createDiv({ cls: "calendar-notes-cell" });
		cell.dataset.date = dateKey;
		if (date.month() !== currentMonth) cell.addClass("calendar-notes-cell-outside");
		if (dateKey === ctx.todayKey) cell.addClass("calendar-notes-cell-today");

		const dow = date.day();
		if (dow === 0) cell.addClass("calendar-notes-cell-sunday");
		if (dow === 6) cell.addClass("calendar-notes-cell-saturday");

		const holidayName = settings.showHolidays ? getJapaneseHolidayName(dateKey) : null;
		if (holidayName) cell.addClass("calendar-notes-cell-holiday");

		const dateRow = cell.createDiv({ cls: "calendar-notes-date-row" });
		dateRow.createSpan({ cls: "calendar-notes-date", text: String(date.date()) });

		const addBtn = dateRow.createSpan({ cls: "calendar-notes-add-btn", text: "+" });
		addBtn.setAttribute("aria-label", "予定を追加");
		addBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			callbacks.onCreateAt(dateKey, null);
		});

		if (holidayName) {
			cell.createDiv({ cls: "calendar-notes-holiday-label", text: holidayName });
		}

		if (ctx.isMobile) {
			const dotsEl = cell.createDiv({ cls: "calendar-notes-dot-list" });
			for (const occ of occs) {
				const dot = dotsEl.createSpan({ cls: "calendar-notes-dot" });
				dot.style.backgroundColor = resolveEventColor(occ.event, settings.categories, settings.colorPalette);
			}
			cell.addEventListener("click", () => callbacks.onSelectDay(dateKey));
		} else {
			const chipList = cell.createDiv({ cls: "calendar-notes-chip-list" });
			for (const occ of occs) {
				const color = resolveEventColor(occ.event, settings.categories, settings.colorPalette);
				const chip = renderChip(chipList, occ, { color, dense: true, showTime: true }, callbacks);
				if (!occ.isRecurring) {
					attachDragHandlers(chip, occ, {
						isMobile: false,
						resolveDropTarget,
						onDragMove: (_o, target) => {
							if (highlightedCell) highlightedCell.removeClass("calendar-notes-cell-drop-target");
							highlightedCell = target ? grid.querySelector<HTMLElement>(`[data-date="${target.date}"]`) : null;
							highlightedCell?.addClass("calendar-notes-cell-drop-target");
						},
						onDragEnd: (o, target) => {
							highlightedCell?.removeClass("calendar-notes-cell-drop-target");
							highlightedCell = null;
							if (target && target.date !== o.occurrenceDate) void callbacks.onMoveEvent(o, target.date, null);
						},
					});
				}
			}
		}
	}
}
