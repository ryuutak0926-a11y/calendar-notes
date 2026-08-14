import type { OccurrenceInstance } from "../data/types";
import { LONG_PRESS_MS } from "../constants";

export interface DropTarget {
	date: string;
	time: string | null;
}

export interface DragConfig {
	isMobile: boolean;
	longPressMs?: number;
	/** Maps viewport coordinates to a candidate drop target; renderer owns the grid geometry. */
	resolveDropTarget(x: number, y: number): DropTarget | null;
	onDragStart?(occ: OccurrenceInstance): void;
	onDragMove(occ: OccurrenceInstance, target: DropTarget | null): void;
	onDragEnd(occ: OccurrenceInstance, target: DropTarget | null): void;
}

export interface ResizeConfig {
	resolveEndTime(y: number): string | null;
	onResizeMove?(occ: OccurrenceInstance, newEndTime: string | null): void;
	onResizeEnd(occ: OccurrenceInstance, newEndTime: string | null): void;
}

const MOVE_CANCEL_THRESHOLD_PX = 10;

/**
 * Wires pointer-based drag on a chip element. Desktop: pointerdown starts the drag immediately.
 * Mobile: pointerdown starts a long-press timer; movement beyond the threshold before it fires
 * cancels the timer (treated as a scroll, not a drag) so normal scrolling isn't broken.
 * Callers must not call this for recurring occurrences (occ.isRecurring) — there is no
 * per-occurrence field a drag on a recurring instance could write to.
 */
export function attachDragHandlers(chipEl: HTMLElement, occ: OccurrenceInstance, config: DragConfig): void {
	let dragging = false;
	let longPressTimer: number | null = null;
	let startX = 0;
	let startY = 0;
	let activePointerId: number | null = null;

	const clearLongPressTimer = () => {
		if (longPressTimer !== null) {
			window.clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	};

	const cleanup = () => {
		dragging = false;
		clearLongPressTimer();
		chipEl.removeClass("calendar-notes-chip-dragging");
		if (activePointerId !== null) {
			try {
				chipEl.releasePointerCapture(activePointerId);
			} catch {
				// already released
			}
		}
		activePointerId = null;
		chipEl.removeEventListener("pointermove", onPointerMove);
		chipEl.removeEventListener("pointerup", onPointerUp);
		chipEl.removeEventListener("pointercancel", onPointerCancel);
	};

	const beginDrag = (evt: PointerEvent) => {
		dragging = true;
		chipEl.setPointerCapture(evt.pointerId);
		chipEl.addClass("calendar-notes-chip-dragging");
		config.onDragStart?.(occ);
	};

	function onPointerMove(evt: PointerEvent): void {
		if (activePointerId === null || evt.pointerId !== activePointerId) return;

		if (!dragging) {
			if (config.isMobile) {
				const dx = Math.abs(evt.clientX - startX);
				const dy = Math.abs(evt.clientY - startY);
				if (dx > MOVE_CANCEL_THRESHOLD_PX || dy > MOVE_CANCEL_THRESHOLD_PX) cleanup();
			}
			return;
		}

		evt.preventDefault();
		config.onDragMove(occ, config.resolveDropTarget(evt.clientX, evt.clientY));
	}

	function onPointerUp(evt: PointerEvent): void {
		if (activePointerId === null || evt.pointerId !== activePointerId) return;
		const wasDragging = dragging;
		const target = config.resolveDropTarget(evt.clientX, evt.clientY);
		cleanup();
		if (wasDragging) config.onDragEnd(occ, target);
	}

	function onPointerCancel(evt: PointerEvent): void {
		if (activePointerId === null || evt.pointerId !== activePointerId) return;
		const wasDragging = dragging;
		cleanup();
		if (wasDragging) config.onDragEnd(occ, null);
	}

	chipEl.addEventListener("pointerdown", (evt: PointerEvent) => {
		if (evt.button !== 0) return;
		startX = evt.clientX;
		startY = evt.clientY;
		activePointerId = evt.pointerId;

		chipEl.addEventListener("pointermove", onPointerMove);
		chipEl.addEventListener("pointerup", onPointerUp);
		chipEl.addEventListener("pointercancel", onPointerCancel);

		if (config.isMobile) {
			longPressTimer = window.setTimeout(() => {
				longPressTimer = null;
				beginDrag(evt);
			}, config.longPressMs ?? LONG_PRESS_MS);
		} else {
			beginDrag(evt);
		}
	});
}

/** Wires pointer-based resize on a chip's bottom-edge handle. Week/Day timed blocks only. */
export function attachResizeHandle(handleEl: HTMLElement, occ: OccurrenceInstance, config: ResizeConfig): void {
	let resizing = false;
	let activePointerId: number | null = null;

	function onPointerMove(evt: PointerEvent): void {
		if (!resizing || evt.pointerId !== activePointerId) return;
		evt.preventDefault();
		evt.stopPropagation();
		config.onResizeMove?.(occ, config.resolveEndTime(evt.clientY));
	}

	function finish(evt: PointerEvent, commit: boolean): void {
		if (evt.pointerId !== activePointerId) return;
		if (commit) config.onResizeEnd(occ, config.resolveEndTime(evt.clientY));
		resizing = false;
		if (activePointerId !== null) {
			try {
				handleEl.releasePointerCapture(activePointerId);
			} catch {
				// already released
			}
		}
		activePointerId = null;
		handleEl.removeEventListener("pointermove", onPointerMove);
		handleEl.removeEventListener("pointerup", onPointerUp);
		handleEl.removeEventListener("pointercancel", onPointerCancel);
	}

	function onPointerUp(evt: PointerEvent): void {
		finish(evt, true);
	}
	function onPointerCancel(evt: PointerEvent): void {
		finish(evt, false);
	}

	handleEl.addEventListener("pointerdown", (evt: PointerEvent) => {
		if (evt.button !== 0) return;
		evt.stopPropagation();
		resizing = true;
		activePointerId = evt.pointerId;
		handleEl.setPointerCapture(evt.pointerId);
		handleEl.addEventListener("pointermove", onPointerMove);
		handleEl.addEventListener("pointerup", onPointerUp);
		handleEl.addEventListener("pointercancel", onPointerCancel);
	});
}
