export const VIEW_TYPE_CALENDAR = "calendar-notes-view";

export const WEEKDAY_LABELS_JA = ["日", "月", "火", "水", "木", "金", "土"];

export const DEFAULT_COLOR_PALETTE = [
	"#4285F4", // blue
	"#EA4335", // red
	"#34A853", // green
	"#FBBC05", // yellow
	"#A142F4", // purple
	"#FF6D01", // orange
	"#00ACC1", // cyan
	"#D81B60", // pink
	"#7CB342", // light green
	"#5C6BC0", // indigo
	"#8D6E63", // brown
	"#546E7A", // blue grey
];

/** 1-letter weekday codes used by `daysOfWeek`, index = moment().day() (0=Sun..6=Sat). */
export const RECUR_DAY_CODES = "UMTWRFS";

export const DEFAULT_TIME_GRID_INTERVAL = 30;

/** Overlap-column cap before collapsing into a "+N more" chip. Renderers halve this on mobile. */
export const MAX_VISIBLE_OVERLAP_COLUMNS = 4;

/** ResizeObserver-driven pane-width threshold for the "narrow" responsive layout class. */
export const MOBILE_NARROW_BREAKPOINT_PX = 768;

/** Pointer-hold duration (ms) before a touch drag starts on mobile. */
export const LONG_PRESS_MS = 450;
