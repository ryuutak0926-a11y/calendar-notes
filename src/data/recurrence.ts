import { moment } from "obsidian";
import { RECUR_DAY_CODES } from "../constants";
import type { NoteEvent, OccurrenceInstance } from "./types";

/**
 * Expands a recurring NoteEvent into virtual per-date occurrences within [rangeStart, rangeEnd].
 * Recurring is restricted to schedule-kind events (enforced upstream in eventParser/QuickAddModal
 * too, but re-checked here as a last line of defense): a single note's `completed` field can't
 * represent "done for this occurrence only", so task-kind recurrence is never expanded.
 */
export function expandRecurringEvent(
	event: NoteEvent,
	rangeStart: moment.Moment,
	rangeEnd: moment.Moment
): OccurrenceInstance[] {
	if (event.kind === "task") return [];
	if (!event.daysOfWeek || event.daysOfWeek.length === 0) return [];

	const recurStart = event.startRecur ? moment(event.startRecur, "YYYY-MM-DD") : null;
	const recurEnd = event.endRecur ? moment(event.endRecur, "YYYY-MM-DD") : null;

	const windowStart = recurStart && recurStart.isAfter(rangeStart) ? recurStart : rangeStart.clone();
	const windowEnd = recurEnd && recurEnd.isBefore(rangeEnd) ? recurEnd : rangeEnd.clone();
	if (windowStart.isAfter(windowEnd, "day")) return [];

	const dowSet = new Set(event.daysOfWeek.map((code) => RECUR_DAY_CODES.indexOf(code)));

	const out: OccurrenceInstance[] = [];
	const cursor = windowStart.clone();
	while (cursor.isSameOrBefore(windowEnd, "day")) {
		if (dowSet.has(cursor.day())) {
			out.push({ event, occurrenceDate: cursor.format("YYYY-MM-DD"), isRecurring: true });
		}
		cursor.add(1, "day");
	}
	return out;
}
