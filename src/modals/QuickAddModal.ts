import { App, Modal, Notice, Setting, moment } from "obsidian";
import type CalendarNotesPlugin from "../main";
import type { CalendarCategory } from "../settings";
import { createEventNote } from "../data/eventNotes";
import { RECUR_DAY_CODES, WEEKDAY_LABELS_JA } from "../constants";

export interface QuickAddModalOptions {
	date?: string;
	time?: string | null;
	categoryId?: string;
}

export class QuickAddModal extends Modal {
	private plugin: CalendarNotesPlugin;

	private categoryId: string;
	private title = "";
	private allDay: boolean;
	private startTime: string;
	private endTime = "";
	private startDate: string;
	private endDate: string;
	private isRecurring = false;
	private daysOfWeek: Set<string> = new Set();
	private startRecur: string;
	private endRecur = "";
	private notes = "";

	private conditionalEl: HTMLElement | null = null;

	constructor(app: App, plugin: CalendarNotesPlugin, opts: QuickAddModalOptions = {}) {
		super(app);
		this.plugin = plugin;

		const today = moment().format("YYYY-MM-DD");
		this.startDate = opts.date ?? today;
		this.endDate = this.startDate;
		this.startRecur = this.startDate;
		this.allDay = !opts.time;
		this.startTime = opts.time ?? "";
		this.categoryId = opts.categoryId ?? plugin.settings.categories[0]?.id ?? "";
	}

	private get selectedCategory(): CalendarCategory | null {
		return this.plugin.settings.categories.find((c) => c.id === this.categoryId) ?? null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "予定・タスクを追加" });

		if (this.plugin.settings.categories.length === 0) {
			contentEl.createEl("p", {
				text: "カテゴリが未設定です。設定タブでカテゴリ(フォルダ・種別・色)を追加してください。",
				cls: "setting-item-description",
			});
			return;
		}

		let titleInputEl: HTMLInputElement | undefined;

		new Setting(contentEl)
			.setName("カテゴリ")
			.addDropdown((dropdown) => {
				for (const category of this.plugin.settings.categories) {
					dropdown.addOption(category.id, `${category.name} (${category.kind === "task" ? "タスク" : "予定"})`);
				}
				dropdown.setValue(this.categoryId).onChange((value) => {
					this.categoryId = value;
					this.renderConditionalFields();
				});
			});

		new Setting(contentEl).setName("タイトル").addText((text) => {
			titleInputEl = text.inputEl;
			text.setPlaceholder("会議").onChange((value) => (this.title = value));
			text.inputEl.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") {
					evt.preventDefault();
					void this.submit();
				}
			});
		});

		this.conditionalEl = contentEl.createDiv();
		this.renderConditionalFields();

		new Setting(contentEl).setName("メモ").addTextArea((text) => text.onChange((value) => (this.notes = value)));

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText("追加")
				.setCta()
				.onClick(() => void this.submit())
		);

		titleInputEl?.focus();
	}

	private renderConditionalFields(): void {
		const container = this.conditionalEl;
		if (!container) return;
		container.empty();

		const category = this.selectedCategory;
		if (!category) return;

		if (category.kind === "schedule") {
			new Setting(container)
				.setName("繰り返し")
				.setDesc("曜日を指定して繰り返す予定にします(完了状態は1ノート単位のため、タスクカテゴリでは使用できません)")
				.addToggle((toggle) =>
					toggle.setValue(this.isRecurring).onChange((value) => {
						this.isRecurring = value;
						this.renderConditionalFields();
					})
				);
		} else {
			container.createEl("p", {
				text: "タスクカテゴリでは繰り返し設定は使用できません — 完了状態はノート単位のため、繰り返しタスクは1回分の完了しか表現できません。",
				cls: "setting-item-description",
			});
		}

		new Setting(container)
			.setName("終日")
			.addToggle((toggle) =>
				toggle.setValue(this.allDay).onChange((value) => {
					this.allDay = value;
					timeSetting.settingEl.toggleClass("is-disabled", value);
					timeSetting.components.forEach((c) => {
						const el = (c as { inputEl?: HTMLInputElement }).inputEl;
						if (el) el.disabled = value;
					});
				})
			);

		const timeSetting = new Setting(container).setName("時刻").addText((text) => {
			text.inputEl.type = "time";
			text.setValue(this.startTime);
			text.inputEl.disabled = this.allDay;
			text.onChange((value) => (this.startTime = value));
		});
		timeSetting.addText((text) => {
			text.inputEl.type = "time";
			text.setPlaceholder("終了(任意)");
			text.setValue(this.endTime);
			text.inputEl.disabled = this.allDay;
			text.onChange((value) => (this.endTime = value));
		});
		timeSetting.settingEl.toggleClass("is-disabled", this.allDay);

		if (category.kind === "schedule" && this.isRecurring) {
			const dowSetting = new Setting(container).setName("曜日");
			for (let i = 0; i < 7; i++) {
				const code = RECUR_DAY_CODES[i];
				const btn = dowSetting.controlEl.createEl("button", { text: WEEKDAY_LABELS_JA[i], cls: "calendar-notes-dow-btn" });
				if (this.daysOfWeek.has(code)) btn.addClass("is-active");
				btn.addEventListener("click", (evt) => {
					evt.preventDefault();
					if (this.daysOfWeek.has(code)) this.daysOfWeek.delete(code);
					else this.daysOfWeek.add(code);
					btn.toggleClass("is-active", this.daysOfWeek.has(code));
				});
			}

			new Setting(container).setName("開始日").addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.startRecur).onChange((value) => (this.startRecur = value || this.startRecur));
			});
			new Setting(container).setName("終了日(任意)").addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.endRecur).onChange((value) => (this.endRecur = value));
			});
		} else {
			new Setting(container).setName("開始日").addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.startDate).onChange((value) => {
					this.startDate = value;
					if (this.endDate < this.startDate) this.endDate = this.startDate;
				});
			});
			new Setting(container).setName("終了日").addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.endDate).onChange((value) => {
					this.endDate = value || this.startDate;
				});
			});
		}
	}

	private async submit(): Promise<void> {
		const category = this.selectedCategory;
		if (!category) {
			new Notice("カテゴリを選択してください");
			return;
		}
		if (!this.title.trim()) {
			new Notice("タイトルを入力してください");
			return;
		}
		if (!this.allDay && !this.startTime) {
			new Notice("時刻を入力してください");
			return;
		}

		const recurring = category.kind === "schedule" && this.isRecurring;

		if (recurring) {
			if (this.daysOfWeek.size === 0) {
				new Notice("繰り返す曜日を選択してください");
				return;
			}
			if (!this.startRecur) {
				new Notice("開始日を入力してください");
				return;
			}
		} else if (category.kind === "schedule" && !this.startDate) {
			new Notice("開始日を入力してください");
			return;
		}

		// endDate is stored EXCLUSIVE (day after the last covered day); the picker shows an
		// inclusive last day, so convert here — getting this backwards makes every multi-day
		// event off by one.
		const exclusiveEndDate =
			!recurring && this.endDate && this.endDate !== this.startDate
				? moment(this.endDate, "YYYY-MM-DD").add(1, "day").format("YYYY-MM-DD")
				: null;

		const file = await createEventNote(this.app, category, {
			title: this.title.trim(),
			date: recurring ? null : this.startDate || null,
			endDate: exclusiveEndDate,
			allDay: this.allDay,
			startTime: this.allDay ? null : this.startTime || null,
			endTime: this.allDay ? null : this.endTime || null,
			daysOfWeek: recurring ? Array.from(this.daysOfWeek) : null,
			startRecur: recurring ? this.startRecur : null,
			endRecur: recurring && this.endRecur ? this.endRecur : null,
		});

		if (this.notes.trim()) {
			await this.app.vault.append(file, `\n${this.notes.trim()}\n`);
		}

		new Notice("追加しました");
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
