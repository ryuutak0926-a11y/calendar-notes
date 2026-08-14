import type { OccurrenceInstance } from "../data/types";

export interface OverlapLayout {
	occurrence: OccurrenceInstance;
	column: number;
	totalColumns: number;
	startMinutes: number;
	endMinutes: number;
	/** Monotonic id grouping items in the same overlap cluster — use to build one "+N more" per cluster. */
	clusterId: number;
}

function parseMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

/**
 * Greedy interval-partitioning layout for same-day timed events: splits into overlap clusters,
 * then within each cluster assigns the first free column (first column whose previous event has
 * already ended). `totalColumns` is scoped to each event's own cluster, not the whole day, so an
 * unrelated later cluster with many overlaps doesn't squeeze an earlier lone event.
 * Caller is expected to have already filtered to one day's timed (non-allDay) occurrences.
 */
export function computeOverlapLayout(
	dayOccurrences: OccurrenceInstance[],
	opts?: { defaultDurationMinutes?: number }
): OverlapLayout[] {
	const defaultDuration = opts?.defaultDurationMinutes ?? 30;

	const items = dayOccurrences
		.filter((occ) => !occ.event.allDay && occ.event.startTime)
		.map((occ) => {
			const startMinutes = parseMinutes(occ.event.startTime as string);
			const endMinutes = occ.event.endTime ? Math.max(parseMinutes(occ.event.endTime), startMinutes + 1) : startMinutes + defaultDuration;
			return { occ, startMinutes, endMinutes };
		})
		.sort((a, b) => a.startMinutes - b.startMinutes);

	const result: OverlapLayout[] = [];
	let clusterItems: typeof items = [];
	let clusterMaxEnd = -Infinity;
	let nextClusterId = 0;

	const flushCluster = () => {
		if (clusterItems.length === 0) return;
		const columnEnds: number[] = [];
		const assigned: Array<{ item: (typeof clusterItems)[number]; column: number }> = [];

		for (const item of clusterItems) {
			let column = columnEnds.findIndex((end) => end <= item.startMinutes);
			if (column === -1) {
				column = columnEnds.length;
				columnEnds.push(item.endMinutes);
			} else {
				columnEnds[column] = item.endMinutes;
			}
			assigned.push({ item, column });
		}

		const totalColumns = columnEnds.length;
		const clusterId = nextClusterId++;
		for (const { item, column } of assigned) {
			result.push({
				occurrence: item.occ,
				column,
				totalColumns,
				startMinutes: item.startMinutes,
				endMinutes: item.endMinutes,
				clusterId,
			});
		}
		clusterItems = [];
		clusterMaxEnd = -Infinity;
	};

	for (const item of items) {
		if (item.startMinutes >= clusterMaxEnd) {
			flushCluster();
		}
		clusterItems.push(item);
		clusterMaxEnd = Math.max(clusterMaxEnd, item.endMinutes);
	}
	flushCluster();

	return result;
}
