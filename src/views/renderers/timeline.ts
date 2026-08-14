import { Menu, moment } from "obsidian";
import { MAX_VISIBLE_OVERLAP_COLUMNS } from "../../constants";
import { attachDragHandlers, attachResizeHandle } from "../dragController";
import type { DropTarget } from "../dragController";
import { computeOverlapLayout, type OverlapLayout } from "../overlapLayout";
import { renderChip, resolveEventColor, type OccurrenceInstance, type RenderContext } from "./shared";

export const PIXELS_PER_HOUR = 48;
const MINUTES_PER_DAY = 24 * 60;

export function minutesToTop(minutes: number): number {
	return (minutes / 60) * PIXELS_PER_HOUR;
}

function snapMinutes(minutes: number, interval: number): number {
	return Math.min(MINUTES_PER_DAY - interval, Math.max(0, Math.round(minutes / interval) * interval));
}

function minutesToHHmm(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Renders a shared time-axis + N day-column timeline (used by both Week [7 cols] and Day [1 col]
 * views) with overlap-column layout, drag-move, and bottom-edge resize wired in.
 */
export function renderTimelineGrid(container: HTMLElement, days: moment.Moment[], ctx: RenderContext): void {
	const { settings, callbacks } = ctx;

	const byDate = new Map<string, OccurrenceInstance[]>();
	for (const occ of ctx.occurrences) {
		const bucket = byDate.get(occ.occurrenceDate);
		if (bucket) bucket.push(occ);
		else byDate.set(occ.occurrenceDate, [occ]);
	}

	const wrap = container.createDiv({ cls: "calendar-notes-timeline-wrap" });
	const axis = wrap.createDiv({ cls: "calendar-notes-time-axis" });
	axis.style.height = `${minutesToTop(MINUTES_PER_DAY)}px`;
	for (let h = 0; h < 24; h++) {
		const tick = axis.createDiv({ cls: "calendar-notes-time-axis-tick" });
		tick.style.top = `${minutesToTop(h * 60)}px`;
		tick.setText(`${String(h).padStart(2, "0")}:00`);
	}

	const grid = wrap.createDiv({ cls: "calendar-notes-timeline-grid" });
	grid.style.height = `${minutesToTop(MINUTES_PER_DAY)}px`;

	const maxColumns = ctx.isMobile ? 2 : MAX_VISIBLE_OVERLAP_COLUMNS;

	const resolveDropTarget = (x: number, y: number): DropTarget | null => {
		const el = document.elementFromPoint(x, y);
		const col = el instanceof HTMLElement ? el.closest<HTMLElement>(".calendar-notes-timeline-day-col") : null;
		if (!col || !grid.contains(col)) return null;
		const rect = col.getBoundingClientRect();
		const minutes = snapMinutes(((y - rect.top) / PIXELS_PER_HOUR) * 60, settings.timeGridInterval);
		return col.dataset.date ? { date: col.dataset.date, time: minutesToHHmm(minutes) } : null;
	};

	for (const day of days) {
		const dateKey = day.format("YYYY-MM-DD");
		const col = grid.createDiv({ cls: "calendar-notes-timeline-day-col" });
		col.dataset.date = dateKey;
		if (dateKey === ctx.todayKey) col.addClass("calendar-notes-cell-today");
		col.style.width = `${100 / days.length}%`;

		for (let h = 0; h < 24; h++) {
			const line = col.createDiv({ cls: "calendar-notes-hour-line" });
			line.style.top = `${minutesToTop(h * 60)}px`;
		}

		col.addEventListener("click", (evt) => {
			if (evt.target !== col) return; // chips/handles stop propagation before reaching here
			const rect = col.getBoundingClientRect();
			const minutes = snapMinutes(((evt.clientY - rect.top) / PIXELS_PER_HOUR) * 60, settings.timeGridInterval);
			callbacks.onCreateAt(dateKey, minutesToHHmm(minutes));
		});

		const timedOccs = (byDate.get(dateKey) ?? []).filter((o) => !o.event.allDay && o.event.startTime);
		const layout = computeOverlapLayout(timedOccs);

		const clusters = new Map<number, OverlapLayout[]>();
		for (const item of layout) {
			const bucket = clusters.get(item.clusterId);
			if (bucket) bucket.push(item);
			else clusters.set(item.clusterId, [item]);
		}

		for (const clusterItems of clusters.values()) {
			const totalColumns = clusterItems[0].totalColumns;
			const overflows = totalColumns > maxColumns;
			const effectiveColumns = Math.min(totalColumns, maxColumns);
			const visible = overflows ? clusterItems.filter((it) => it.column < maxColumns - 1) : clusterItems;
			const overflow = overflows ? clusterItems.filter((it) => it.column >= maxColumns - 1) : [];

			for (const item of visible) {
				renderTimedChip(col, item, effectiveColumns, ctx, resolveDropTarget);
			}
			if (overflow.length > 0) {
				renderOverflowChip(col, overflow, effectiveColumns, callbacks);
			}
		}
	}
}

function renderTimedChip(
	col: HTMLElement,
	item: OverlapLayout,
	effectiveColumns: number,
	ctx: RenderContext,
	resolveDropTarget: (x: number, y: number) => DropTarget | null
): void {
	const { settings, callbacks } = ctx;
	const occ = item.occurrence;
	const color = resolveEventColor(occ.event, settings.categories, settings.colorPalette);
	const chip = renderChip(col, occ, { color, showTime: true }, callbacks);
	chip.addClass("calendar-notes-chip-timed");
	chip.style.top = `${minutesToTop(item.startMinutes)}px`;
	chip.style.height = `${Math.max(minutesToTop(item.endMinutes - item.startMinutes), 16)}px`;
	chip.style.left = `${(item.column / effectiveColumns) * 100}%`;
	chip.style.width = `${100 / effectiveColumns}%`;

	if (occ.isRecurring) return;

	attachDragHandlers(chip, occ, {
		isMobile: ctx.isMobile,
		resolveDropTarget,
		onDragMove: () => {
			/* real chip only moves once the write resolves and the view re-renders */
		},
		onDragEnd: (o, target) => {
			if (target) void callbacks.onMoveEvent(o, target.date, target.time);
		},
	});

	const handle = chip.createDiv({ cls: "calendar-notes-resize-handle" });
	attachResizeHandle(handle, occ, {
		resolveEndTime: (y) => {
			const rect = col.getBoundingClientRect();
			const minutes = snapMinutes(((y - rect.top) / PIXELS_PER_HOUR) * 60, settings.timeGridInterval);
			return minutesToHHmm(minutes);
		},
		onResizeEnd: (o, newEndTime) => {
			if (newEndTime) void callbacks.onResizeEvent(o, newEndTime);
		},
	});
}

function renderOverflowChip(col: HTMLElement, overflow: OverlapLayout[], effectiveColumns: number, callbacks: RenderContext["callbacks"]): void {
	const start = Math.min(...overflow.map((o) => o.startMinutes));
	const end = Math.max(...overflow.map((o) => o.endMinutes));

	const chip = col.createDiv({ cls: "calendar-notes-chip calendar-notes-chip-overflow calendar-notes-chip-timed" });
	chip.setText(`+${overflow.length}件`);
	chip.style.top = `${minutesToTop(start)}px`;
	chip.style.height = `${Math.max(minutesToTop(end - start), 16)}px`;
	chip.style.left = `${((effectiveColumns - 1) / effectiveColumns) * 100}%`;
	chip.style.width = `${100 / effectiveColumns}%`;

	chip.addEventListener("click", (evt) => {
		evt.stopPropagation();
		const menu = new Menu();
		for (const item of overflow) {
			const { event } = item.occurrence;
			const label = event.startTime ? `${event.startTime} ${event.title}` : event.title;
			menu.addItem((menuItem) => menuItem.setTitle(label).onClick(() => callbacks.onOpenEvent(item.occurrence)));
		}
		menu.showAtMouseEvent(evt);
	});
}
