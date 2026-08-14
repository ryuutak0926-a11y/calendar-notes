/**
 * Japanese public holidays, computed from the rules in the Public Holidays Act
 * (as amended, "Happy Monday" system since 2000/2003) rather than a static
 * dataset, so future/past years stay correct without yearly upkeep.
 *
 * Known limitation: one-off ad-hoc holiday moves that don't follow the general
 * rule (e.g. the 2019 imperial enthronement holiday, the 2020/2021
 * Olympics-related holiday shifts) are not represented.
 */

interface YMD {
	year: number;
	month: number; // 1-12
	day: number;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function toDateKey({ year, month, day }: YMD): string {
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 0 = Sunday .. 6 = Saturday, computed independent of the host system's timezone. */
function dayOfWeek(year: number, month: number, day: number): number {
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays({ year, month, day }: YMD, delta: number): YMD {
	const d = new Date(Date.UTC(year, month - 1, day + delta));
	return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** nth (1-indexed) occurrence of `weekday` (0=Sun..6=Sat) in the given month. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
	const firstDow = dayOfWeek(year, month, 1);
	const offset = (weekday - firstDow + 7) % 7;
	return 1 + offset + (n - 1) * 7;
}

function vernalEquinoxDay(year: number): number {
	return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year: number): number {
	return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

const MONDAY = 1;

function baseHolidays(year: number): Map<string, string> {
	const holidays = new Map<string, string>();
	const set = (month: number, day: number, name: string) => holidays.set(toDateKey({ year, month, day }), name);

	set(1, 1, "元日");
	if (year >= 2000) {
		set(1, nthWeekdayOfMonth(year, 1, MONDAY, 2), "成人の日");
	}
	set(2, 11, "建国記念の日");
	if (year >= 2020) {
		set(2, 23, "天皇誕生日");
	}
	set(3, vernalEquinoxDay(year), "春分の日");
	set(4, 29, "昭和の日");
	set(5, 3, "憲法記念日");
	set(5, 4, "みどりの日");
	set(5, 5, "こどもの日");
	if (year >= 2003) {
		set(7, nthWeekdayOfMonth(year, 7, MONDAY, 3), "海の日");
	}
	if (year >= 2016) {
		set(8, 11, "山の日");
	}
	if (year >= 2003) {
		set(9, nthWeekdayOfMonth(year, 9, MONDAY, 3), "敬老の日");
	}
	set(9, autumnalEquinoxDay(year), "秋分の日");
	if (year >= 2000) {
		set(10, nthWeekdayOfMonth(year, 10, MONDAY, 2), "スポーツの日");
	}
	set(11, 3, "文化の日");
	set(11, 23, "勤労感謝の日");

	return holidays;
}

function applySubstituteHolidays(holidays: Map<string, string>, year: number): void {
	const originalKeys = Array.from(holidays.keys());
	for (const key of originalKeys) {
		const [y, m, d] = key.split("-").map(Number);
		if (dayOfWeek(y, m, d) !== 0) continue; // only Sunday-landing holidays substitute

		let candidate = addDays({ year: y, month: m, day: d }, 1);
		while (holidays.has(toDateKey(candidate))) {
			candidate = addDays(candidate, 1);
		}
		holidays.set(toDateKey(candidate), "振替休日");
	}
}

function applyCitizensHoliday(holidays: Map<string, string>, year: number): void {
	// Scan a generous window; citizens' holidays only ever fall between two
	// already-known holidays within the same year in practice.
	for (let month = 1; month <= 12; month++) {
		const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
		for (let day = 1; day <= daysInMonth; day++) {
			const key = toDateKey({ year, month, day });
			if (holidays.has(key)) continue;
			if (dayOfWeek(year, month, day) === 0) continue;

			const prev = addDays({ year, month, day }, -1);
			const next = addDays({ year, month, day }, 1);
			if (holidays.has(toDateKey(prev)) && holidays.has(toDateKey(next))) {
				holidays.set(key, "国民の休日");
			}
		}
	}
}

const yearCache = new Map<number, Map<string, string>>();

export function getJapaneseHolidays(year: number): Map<string, string> {
	const cached = yearCache.get(year);
	if (cached) return cached;

	const holidays = baseHolidays(year);
	applySubstituteHolidays(holidays, year);
	applyCitizensHoliday(holidays, year);

	yearCache.set(year, holidays);
	return holidays;
}

export function getJapaneseHolidayName(dateKey: string): string | null {
	const year = Number(dateKey.slice(0, 4));
	if (!Number.isFinite(year)) return null;
	return getJapaneseHolidays(year).get(dateKey) ?? null;
}
