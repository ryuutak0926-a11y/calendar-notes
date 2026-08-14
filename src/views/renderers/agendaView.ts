import { moment } from "obsidian";
import { WEEKDAY_LABELS_JA } from "../../constants";
import { renderChip, resolveEventColor, type OccurrenceInstance, type RenderContext } from "./shared";

export function renderAgendaView(ctx: RenderContext): void {
	const { container, settings, callbacks } = ctx;

	const byDate = new Map<string, OccurrenceInstance[]>();
	for (const occ of ctx.occurrences) {
		const bucket = byDate.get(occ.occurrenceDate);
		if (bucket) bucket.push(occ);
		else byDate.set(occ.occurrenceDate, [occ]);
	}

	const dateKeys = Array.from(byDate.keys()).sort();
	const list = container.createDiv({ cls: "calendar-notes-agenda-list" });

	if (dateKeys.length === 0) {
		list.createDiv({ cls: "calendar-notes-agenda-empty", text: "この期間に予定・タスクはありません" });
	}

	for (const dateKey of dateKeys) {
		const date = moment(dateKey, "YYYY-MM-DD");
		const section = list.createDiv({ cls: "calendar-notes-agenda-day" });
		if (dateKey === ctx.todayKey) section.addClass("calendar-notes-cell-today");

		const header = section.createDiv({ cls: "calendar-notes-agenda-day-header" });
		header.createSpan({ text: date.format("M月D日") });
		header.createSpan({ cls: "calendar-notes-agenda-day-weekday", text: `(${WEEKDAY_LABELS_JA[date.day()]})` });
		const addBtn = header.createSpan({ cls: "calendar-notes-add-btn", text: "+" });
		addBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			callbacks.onCreateAt(dateKey, null);
		});

		const rowList = section.createDiv({ cls: "calendar-notes-agenda-row-list" });
		const occs = (byDate.get(dateKey) ?? []).sort((a, b) => {
			if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
			return (a.event.startTime ?? "").localeCompare(b.event.startTime ?? "");
		});
		for (const occ of occs) {
			const color = resolveEventColor(occ.event, settings.categories, settings.colorPalette);
			renderChip(rowList, occ, { color, showTime: true }, callbacks);
		}
	}

	const undated = ctx.allEvents.filter((e) => e.kind === "task" && !e.date && (!e.daysOfWeek || e.daysOfWeek.length === 0));
	if (undated.length > 0) {
		const section = list.createDiv({ cls: "calendar-notes-agenda-day calendar-notes-agenda-undated" });
		section.createDiv({ cls: "calendar-notes-agenda-day-header", text: "期限なし" });
		const rowList = section.createDiv({ cls: "calendar-notes-agenda-row-list" });
		for (const event of undated) {
			const occ: OccurrenceInstance = { event, occurrenceDate: "", isRecurring: false };
			const color = resolveEventColor(event, settings.categories, settings.colorPalette);
			renderChip(rowList, occ, { color }, callbacks);
		}
	}
}
