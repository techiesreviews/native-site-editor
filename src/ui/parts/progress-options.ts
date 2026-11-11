// The Progress bar part's options and how they become markup (atomic catalogue ticket 14). Plain data in, plain data
// out, so a unit test can pin it without a browser; src/ui/parts/progress.ts draws it.

// Known: a `value` out of `max` fills the bar that far. Unknown: no `value`, a short bar slides along the track.

/** Places along the bar the board shows (out of 100): not started, partway, done. */
export const PROGRESS_STEPS = [0, 30, 60, 100] as const;

export const DEFAULT_PROGRESS_LABEL = "Progress";

export interface ProgressOptions {
  /** How far along, from 0 to `max`. Missing, blank or not a number: unknown. Out of range: kept inside it. */
  value?: number | string | null;
  /** The value at the far end of the bar; default 100. A `max` that is not above 0 is 100. */
  max?: number | string;
  /** What assistive technology says for it. Blank or missing: "Progress". */
  label?: string;
}

export function progressMax(max: ProgressOptions["max"]): number {
  const wanted = typeof max === "string" && !max.trim() ? NaN : Number(max);
  return Number.isFinite(wanted) && wanted > 0 ? wanted : 100;
}

/** The value kept between 0 and `max`, or null when the progress is not known. */
export function progressValue(value: ProgressOptions["value"], max: ProgressOptions["max"] = 100): number | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  const wanted = Number(value);
  if (!Number.isFinite(wanted)) return null;
  return Math.min(Math.max(wanted, 0), progressMax(max));
}

/** The attributes of the one element: one class, the mode as a data attribute, the fill as a percentage the style reads. */
export function progressAttributes(options: ProgressOptions = {}): Record<string, string> {
  const max = progressMax(options.max);
  const value = progressValue(options.value, max);
  const label = options.label?.trim() || DEFAULT_PROGRESS_LABEL;
  if (value === null) return { class: "progress", "data-mode": "unknown", role: "progressbar", "aria-label": label };
  const percent = Math.round((value / max) * 1000) / 10;
  return {
    class: "progress", "data-mode": "known", role: "progressbar", "aria-label": label,
    "aria-valuemin": "0", "aria-valuemax": String(max), "aria-valuenow": String(value), "data-percent": String(percent),
  };
}
