// The phone sheet's rules (phone-sheet.ts), pure: how tall the sheet that holds
// Page structure and the code may be, where a drag or a key leaves it, and
// what a release settles on. Sizes are the sheet's content below its handle
// (px); 0 is folded. Tested in tests/phone-sheet-rules.test.ts.

/** The smallest open sheet. */
export const SHEET_MIN = 160;
/** The page keeps at least this much above an open sheet. */
export const CANVAS_MIN = 160;
/** A release below this folds the sheet. */
export const FOLD_BELOW = 96;
/** A release faster than this (px per ms) is a flick. */
export const FLICK = 0.5;
/** Past its tallest the sheet follows the finger at this rate (rubber band). */
const STRETCH = 0.2;
/** One arrow key press. */
const STEP = 40;

export interface SheetBounds { min: number; max: number }
export interface SheetState { open: boolean; size: number }

/** Bounds in `space`, the room the page and the open sheet share. */
export function sheetBounds(space: number): SheetBounds {
  const max = Math.max(0, Math.round(space - CANVAS_MIN));
  return { min: Math.min(SHEET_MIN, max), max };
}

/** The first open size: half the room. */
export const firstSize = (space: number) => Math.round(Math.max(0, space) / 2);

const clamp = (size: number, { min, max }: SheetBounds) => Math.round(Math.max(min, Math.min(max, size)));

/** The size shown while dragging to `raw`: 1:1 within the bounds, resisting past the tallest, never below 0. */
export function dragSize(raw: number, { max }: SheetBounds): number {
  return raw > max ? max + (raw - max) * STRETCH : Math.max(0, raw);
}

/**
 * Where a released drag settles. `velocity` is px per ms, positive upward
 * (opening); `last` is the size the sheet last stayed open at. A flick down
 * or a release under FOLD_BELOW folds (keeping `last`); a flick up opens to
 * at least `last`; otherwise it stays where it was let go, within the bounds.
 */
export function settleSheet(size: number, velocity: number, last: number, bounds: SheetBounds): SheetState {
  if (velocity <= -FLICK || (velocity < FLICK && size < FOLD_BELOW)) return { open: false, size: last };
  return { open: true, size: clamp(velocity >= FLICK ? Math.max(size, last) : size, bounds) };
}

/** A key on the handle: ArrowUp and ArrowDown grow and shrink it (shrinking past the smallest folds), Home folds, End is the tallest. */
export function keySheet(key: string, state: SheetState, bounds: SheetBounds): SheetState | undefined {
  const size = state.open ? state.size : 0;
  if (key === "Home") return { open: false, size: state.size };
  if (key === "End") return { open: true, size: bounds.max };
  if (key === "ArrowUp") return { open: true, size: clamp(state.open ? size + STEP : state.size, bounds) };
  if (key === "ArrowDown") return size - STEP < bounds.min ? { open: false, size: state.size } : { open: true, size: clamp(size - STEP, bounds) };
  return undefined;
}

/** A remembered state read back (sessionStorage text), or undefined when it is not one. */
export function readSheet(text: string | null): SheetState | undefined {
  try {
    const value = JSON.parse(text ?? "") as Partial<SheetState>;
    return typeof value.open === "boolean" && typeof value.size === "number" && value.size > 0 ? { open: value.open, size: value.size } : undefined;
  } catch {
    return undefined;
  }
}
