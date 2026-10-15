// The editor toast's pure rules (components/toast.ts draws it): how long it
// stays and how far it rises above the buttons it would cover.

/** What an announcement shows: `undo` adds Undo for the step just recorded in that file's history; "quiet" is said only. */
export type AnnounceAs = "quiet" | { undo: string };

/** A toast stays this long; hovering or focusing it holds it. */
export const TOAST_MS = 6000;
/** Once the pointer or focus leaves it, a toast stays at least this long more. */
export const TOAST_AFTER_HOLD_MS = 2000;

export interface ToastBox { left: number; top: number; width: number; height: number }

/**
 * How many pixels the toast at `toast` rises so it covers none of `obstacles`
 * (a pinned action row, a primary button), `gap` above the highest it would
 * touch. It never rises above the middle of the window: past that it stays
 * as high as that allows.
 */
export function toastLift(toast: ToastBox, obstacles: readonly ToastBox[], viewportHeight: number, gap = 8) {
  const start = toast.top + toast.height;
  const highest = Math.max(toast.height, viewportHeight / 2);
  let bottom = start;
  for (let moved = true; moved && bottom > highest;) {
    moved = false;
    for (const box of obstacles) {
      if (box.width <= 0 || box.height <= 0) continue;
      const across = box.left < toast.left + toast.width && toast.left < box.left + box.width;
      const covers = box.top - gap < bottom && bottom - toast.height < box.top + box.height + gap;
      if (across && covers) { bottom = box.top - gap; moved = true; }
    }
  }
  return Math.max(0, start - Math.max(bottom, highest));
}

/** How long a toast stays after the pointer or focus leaves it, `left` ms having been left of its time. */
export const toastResume = (left: number) => Math.max(left, TOAST_AFTER_HOLD_MS);
