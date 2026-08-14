export type CategoryKind = "schedule" | "task";

export type CompletedState =
	| { type: "not-task" }
	| { type: "incomplete" }
	| { type: "complete"; completedAt: string };

/**
 * One standalone event/task note, parsed from its frontmatter.
 * Identity is the file path itself (not a generated id) — multiple notes can share a date.
 */
export interface NoteEvent {
	filePath: string;
	categoryId: string;
	/** Denormalized copy of the owning category's kind, for cheap filtering. */
	kind: CategoryKind;
	title: string;
	/** "YYYY-MM-DD". Required for schedule notes; may be null for undated tasks. */
	date: string | null;
	/** "YYYY-MM-DD", EXCLUSIVE (day after the last covered day). Null = single-day. */
	endDate: string | null;
	allDay: boolean;
	/** "HH:mm". Required when allDay is false. */
	startTime: string | null;
	/** "HH:mm". */
	endTime: string | null;
	completed: CompletedState;
	tags: string[];
	/** 1-letter weekday codes from RECUR_DAY_CODES ("UMTWRFS"), e.g. ["M","W"]. Schedule-kind only. */
	daysOfWeek: string[] | null;
	/** "YYYY-MM-DD" recurrence window bounds. */
	startRecur: string | null;
	endRecur: string | null;
}

/**
 * A single date placement of a NoteEvent on the calendar. Non-recurring events produce exactly
 * one instance; recurring events (daysOfWeek set) are expanded into one instance per matching
 * date within the visible range by `src/data/recurrence.ts`. The underlying note is always the
 * same file — there is no per-occurrence file, so occurrences of a recurring event share identity
 * via `event.filePath` and only differ by `occurrenceDate`.
 */
export interface OccurrenceInstance {
	event: NoteEvent;
	/** "YYYY-MM-DD" — the date this instance is anchored to. */
	occurrenceDate: string;
	isRecurring: boolean;
}

/** Shape written to / read from a note's YAML frontmatter. */
export interface EventFrontmatter {
	title?: string;
	date?: string;
	endDate?: string;
	allDay: boolean;
	startTime?: string;
	endTime?: string;
	completed?: false | string;
	tags?: string[];
	daysOfWeek?: string[];
	startRecur?: string;
	endRecur?: string;
}
