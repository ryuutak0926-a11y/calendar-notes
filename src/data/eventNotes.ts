import { App, TFile, TFolder, moment, normalizePath } from "obsidian";
import type { CalendarCategory } from "../settings";
import type { NoteEvent } from "./types";

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath);
	if (!normalized) return;
	const existing = app.vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFolder) return;
	if (existing instanceof TFile) {
		throw new Error(`Cannot create folder "${normalized}": a file already exists at that path.`);
	}
	await app.vault.createFolder(normalized);
}

function slugifyFilename(title: string): string {
	const cleaned = title.replace(/[\\/:*?"<>|]/g, "").trim();
	return cleaned || "Untitled";
}

async function uniqueFilePath(app: App, folder: string, baseName: string): Promise<string> {
	let candidate = normalizePath(`${folder}/${baseName}.md`);
	if (!app.vault.getAbstractFileByPath(candidate)) return candidate;

	let suffix = 2;
	while (true) {
		candidate = normalizePath(`${folder}/${baseName} ${suffix}.md`);
		if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
		suffix++;
	}
}

export interface CreateEventNoteInput {
	title: string;
	date: string | null;
	/** Already exclusive by the time it reaches here. */
	endDate: string | null;
	allDay: boolean;
	startTime: string | null;
	endTime: string | null;
	daysOfWeek?: string[] | null;
	startRecur?: string | null;
	endRecur?: string | null;
}

export async function createEventNote(app: App, category: CalendarCategory, input: CreateEventNoteInput): Promise<TFile> {
	await ensureFolder(app, category.folder);
	const path = await uniqueFilePath(app, category.folder, slugifyFilename(input.title));

	// Obsidian has no public API to serialize a frontmatter object into a brand-new file's
	// YAML block, so create a minimal empty-frontmatter shell first and let processFrontMatter
	// (Obsidian's own YAML stringifier) populate it — avoids hand-built YAML quoting bugs.
	const file = await app.vault.create(path, "---\n---\n\n");

	await app.fileManager.processFrontMatter(file, (fm) => {
		fm.title = input.title;
		fm.allDay = input.allDay;
		if (input.date) fm.date = input.date;
		if (input.endDate) fm.endDate = input.endDate;
		if (!input.allDay && input.startTime) fm.startTime = input.startTime;
		if (input.endTime) fm.endTime = input.endTime;
		fm.tags = [category.kind];

		if (category.kind === "task") {
			fm.completed = false;
		}

		if (category.kind === "schedule" && input.daysOfWeek && input.daysOfWeek.length > 0) {
			fm.daysOfWeek = input.daysOfWeek;
			if (input.startRecur) fm.startRecur = input.startRecur;
			if (input.endRecur) fm.endRecur = input.endRecur;
			delete fm.date;
			delete fm.endDate;
		}
	});

	return file;
}

export async function toggleEventCompletion(app: App, file: TFile): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		const wasComplete = typeof fm.completed === "string" && fm.completed.trim().length > 0;
		fm.completed = wasComplete ? false : moment().format("YYYY-MM-DDTHH:mm:ssZ");

		const tags: unknown[] = Array.isArray(fm.tags) ? fm.tags.filter((t: unknown) => t !== "complete") : [];
		if (!wasComplete) tags.push("complete");
		fm.tags = tags;
	});
}

export async function openEventNote(app: App, file: TFile): Promise<void> {
	await app.workspace.getLeaf(false).openFile(file);
}

/** Single write path for drag-move / resize — mirrors createEventNote/toggleEventCompletion's processFrontMatter pattern. */
export async function updateEventFields(
	app: App,
	file: TFile,
	patch: Partial<Pick<NoteEvent, "date" | "endDate" | "startTime" | "endTime">>
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
			const value = patch[key];
			if (value === null || value === undefined) delete fm[key];
			else fm[key] = value;
		}
	});
}
