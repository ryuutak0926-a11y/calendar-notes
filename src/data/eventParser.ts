import { moment } from "obsidian";
import type { CalendarCategory } from "../settings";
import { RECUR_DAY_CODES } from "../constants";
import type { CompletedState, NoteEvent } from "./types";

/** First category whose folder is a path-prefix of `path`, or null if none match. */
export function matchCategory(path: string, categories: CalendarCategory[]): CalendarCategory | null {
	for (const category of categories) {
		const folder = (category.folder || "").replace(/\/+$/, "");
		if (!folder) continue;
		if (path.startsWith(`${folder}/`)) return category;
	}
	return null;
}

function basename(path: string): string {
	const slash = path.lastIndexOf("/");
	const file = slash >= 0 ? path.slice(slash + 1) : path;
	return file.replace(/\.md$/i, "");
}

function parseDateField(raw: unknown, filePath: string, fieldName: string): string | null {
	if (typeof raw !== "string" || !raw.trim()) return null;
	if (!moment(raw, "YYYY-MM-DD", true).isValid()) {
		console.warn(`[calendar-notes] ${filePath}: invalid ${fieldName} "${raw}" ignored`);
		return null;
	}
	return raw;
}

function parseTimeField(raw: unknown): string | null {
	if (typeof raw !== "string" || !raw.trim()) return null;
	return /^\d{1,2}:\d{2}$/.test(raw.trim()) ? raw.trim() : null;
}

function parseCompleted(raw: unknown): CompletedState {
	if (raw === undefined || raw === null) return { type: "not-task" };
	if (raw === false) return { type: "incomplete" };
	if (typeof raw === "string" && raw.trim()) return { type: "complete", completedAt: raw };
	return { type: "incomplete" };
}

function parseTags(raw: unknown): string[] {
	if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
	if (typeof raw === "string") return raw.split(",").map((t) => t.trim()).filter(Boolean);
	return [];
}

function parseDaysOfWeek(raw: unknown, filePath: string): string[] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const valid: string[] = [];
	for (const entry of raw) {
		const code = typeof entry === "string" ? entry.trim().toUpperCase() : "";
		if (code.length === 1 && RECUR_DAY_CODES.includes(code)) {
			valid.push(code);
		} else {
			console.warn(`[calendar-notes] ${filePath}: invalid daysOfWeek entry ${JSON.stringify(entry)} dropped`);
		}
	}
	return valid.length > 0 ? Array.from(new Set(valid)) : null;
}

function parseRecurDate(raw: unknown, fieldName: string, filePath: string): string | null {
	if (typeof raw !== "string" || !raw.trim()) return null;
	if (!moment(raw, "YYYY-MM-DD", true).isValid()) {
		console.warn(`[calendar-notes] ${filePath}: invalid ${fieldName} "${raw}" ignored`);
		return null;
	}
	return raw;
}

/**
 * Parses a note's frontmatter into a NoteEvent. Defensive/lenient throughout — the only
 * hard gate (a non-object frontmatter) is applied by the caller before this is invoked.
 */
export function parseEventFrontmatter(
	filePath: string,
	category: CalendarCategory,
	frontmatter: Record<string, unknown>
): NoteEvent {
	const title = typeof frontmatter.title === "string" && frontmatter.title.trim() ? frontmatter.title.trim() : basename(filePath);
	const allDay = typeof frontmatter.allDay === "boolean" ? frontmatter.allDay : true;
	const startTime = parseTimeField(frontmatter.startTime);
	const endTime = parseTimeField(frontmatter.endTime);
	const completed = parseCompleted(frontmatter.completed);
	const tags = parseTags(frontmatter.tags);

	let date = parseDateField(frontmatter.date, filePath, "date");
	let endDate = parseDateField(frontmatter.endDate, filePath, "endDate");

	let daysOfWeek = parseDaysOfWeek(frontmatter.daysOfWeek, filePath);
	let startRecur = parseRecurDate(frontmatter.startRecur, "startRecur", filePath);
	let endRecur = parseRecurDate(frontmatter.endRecur, "endRecur", filePath);

	if (category.kind === "task" && daysOfWeek) {
		console.warn(
			`[calendar-notes] ${filePath}: recurring fields are not supported on task-kind notes; ignoring daysOfWeek/startRecur/endRecur`
		);
		daysOfWeek = null;
		startRecur = null;
		endRecur = null;
	}

	if (daysOfWeek) {
		if (date) {
			console.warn(`[calendar-notes] ${filePath}: both date and daysOfWeek are set; recurrence takes precedence, ignoring date/endDate`);
		}
		date = null;
		endDate = null;
	}

	return {
		filePath,
		categoryId: category.id,
		kind: category.kind,
		title,
		date,
		endDate,
		allDay,
		startTime,
		endTime,
		completed,
		tags,
		daysOfWeek,
		startRecur,
		endRecur,
	};
}
