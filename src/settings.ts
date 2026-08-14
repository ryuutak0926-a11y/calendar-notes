import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type CalendarNotesPlugin from "./main";
import { DEFAULT_COLOR_PALETTE, DEFAULT_TIME_GRID_INTERVAL } from "./constants";
import type { CategoryKind } from "./data/types";
import { colorForKey } from "./utils/colorHash";

export interface CalendarCategory {
	id: string;
	name: string;
	/** vault-relative, normalizePath()'d */
	folder: string;
	kind: CategoryKind;
	/** null = auto-color via colorForKey(id, colorPalette) */
	color: string | null;
}

export interface CalendarPluginSettings {
	categories: CalendarCategory[];
	/** 0 = Sunday, 1 = Monday */
	firstDayOfWeek: 0 | 1;
	showHolidays: boolean;
	colorPalette: string[];
	/** Minute granularity for the Week/Day timeline grid and slot-click snapping. */
	timeGridInterval: 15 | 30;
}

export const DEFAULT_SETTINGS: CalendarPluginSettings = {
	categories: [],
	firstDayOfWeek: 0,
	showHolidays: true,
	colorPalette: [...DEFAULT_COLOR_PALETTE],
	timeGridInterval: DEFAULT_TIME_GRID_INTERVAL,
};

function generateCategoryId(): string {
	return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class CalendarSettingTab extends PluginSettingTab {
	plugin: CalendarNotesPlugin;

	constructor(app: App, plugin: CalendarNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("First day of week")
			.setDesc("Which day starts each week in the calendar grid.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("0", "Sunday")
					.addOption("1", "Monday")
					.setValue(String(this.plugin.settings.firstDayOfWeek))
					.onChange(async (value) => {
						this.plugin.settings.firstDayOfWeek = (value === "1" ? 1 : 0) as 0 | 1;
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarViews();
					})
			);

		new Setting(containerEl)
			.setName("Show Japanese holidays")
			.setDesc("Overlay national holidays computed for the displayed year.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showHolidays).onChange(async (value) => {
					this.plugin.settings.showHolidays = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				})
			);

		new Setting(containerEl)
			.setName("Time grid interval")
			.setDesc("Minute granularity for the Week/Day timeline and slot-click snapping.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("15", "15 minutes")
					.addOption("30", "30 minutes")
					.setValue(String(this.plugin.settings.timeGridInterval))
					.onChange(async (value) => {
						this.plugin.settings.timeGridInterval = (value === "15" ? 15 : 30) as 15 | 30;
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarViews();
					})
			);

		containerEl.createEl("h3", { text: "Categories" });
		containerEl.createEl("p", {
			text: "Each category maps one vault folder to a calendar source: schedule notes are date-fixed and passive, task notes need active work and may have an unset date. Notes in a folder with no matching category are ignored.",
			cls: "setting-item-description",
		});

		const categoriesEl = containerEl.createDiv();
		this.renderCategories(categoriesEl);

		new Setting(containerEl).addButton((button) =>
			button.setButtonText("Add category").onClick(async () => {
				this.plugin.settings.categories.push({
					id: generateCategoryId(),
					name: "New category",
					folder: "",
					kind: "schedule",
					color: null,
				});
				await this.plugin.saveSettings();
				this.renderCategories(categoriesEl);
				await this.plugin.rebuildEventIndex();
				this.plugin.refreshCalendarViews();
			})
		);
	}

	private renderCategories(container: HTMLElement): void {
		container.empty();
		const { categories } = this.plugin.settings;

		const folderCounts = new Map<string, number>();
		for (const category of categories) {
			const normalized = normalizePath(category.folder || "");
			folderCounts.set(normalized, (folderCounts.get(normalized) ?? 0) + 1);
		}

		for (const category of categories) {
			const setting = new Setting(container);
			setting.settingEl.addClass("calendar-notes-category-row");

			const commit = async (): Promise<void> => {
				await this.plugin.saveSettings();
				await this.plugin.rebuildEventIndex();
				this.plugin.refreshCalendarViews();
			};

			setting.addText((text) =>
				text
					.setPlaceholder("Name")
					.setValue(category.name)
					.onChange(async (value) => {
						category.name = value;
						await commit();
					})
			);

			setting.addText((text) =>
				text
					.setPlaceholder("Folder path")
					.setValue(category.folder)
					.onChange(async (value) => {
						category.folder = normalizePath(value.trim());
						const normalized = category.folder;
						const count = categories.filter((c) => normalizePath(c.folder || "") === normalized).length;
						if (normalized && count > 1) {
							new Notice(`複数のカテゴリが同じフォルダ "${normalized}" を指しています`);
						}
						await commit();
					})
			);

			setting.addDropdown((dropdown) =>
				dropdown
					.addOption("schedule", "Schedule")
					.addOption("task", "Task")
					.setValue(category.kind)
					.onChange(async (value) => {
						category.kind = value === "task" ? "task" : "schedule";
						await commit();
					})
			);

			setting.addColorPicker((picker) =>
				picker
					.setValue(category.color ?? colorForKey(category.id, this.plugin.settings.colorPalette))
					.onChange(async (value) => {
						category.color = value;
						await commit();
					})
			);

			setting.addExtraButton((button) =>
				button
					.setIcon("rotate-ccw")
					.setTooltip("自動色にリセット")
					.onClick(async () => {
						category.color = null;
						await commit();
						this.renderCategories(container);
					})
			);

			setting.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("カテゴリを削除")
					.onClick(async () => {
						const index = categories.indexOf(category);
						if (index >= 0) categories.splice(index, 1);
						await commit();
						this.renderCategories(container);
					})
			);
		}

		if (categories.length === 0) {
			container.createEl("p", {
				text: "カテゴリが未設定です。追加するまで予定・タスクの作成/表示はできません。",
				cls: "setting-item-description",
			});
		}
	}
}
