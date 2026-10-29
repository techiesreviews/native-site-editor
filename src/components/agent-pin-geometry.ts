import type { SelectionRect } from "./edit-bar";

/** Space between an element's top edge and the notes on it. */
export const NOTE_GAP = 4;
/** A pin's height, and Ask agent's note's on one line. */
export const PIN_HEIGHT = 22;
/**
 * Where the notes on an element start, in frame coordinates: its left edge
 * kept inside the frame, and its top edge (or the top of what stands just
 * above it, `clear`), which the notes stand above or, with no room at the
 * top of the frame, hang under (`below`).
 */
export function noteAnchor(rect: SelectionRect, frame: { width: number; height: number }) {
  const at = (top: number) => {
    const edge = Math.max(0, Math.min(top, frame.height));
    return { x: Math.max(4, Math.min(rect.left, frame.width - 4 - PIN_HEIGHT)), edge, below: edge - NOTE_GAP - PIN_HEIGHT < 4 };
  };
  // Clear of what stands just above it (ticket am-45), while there is room above that; else on its own edge.
  const lifted = rect.clear !== undefined && rect.clear < rect.top ? at(rect.clear) : undefined;
  return lifted && !lifted.below ? lifted : at(rect.top);
}
/** The top of a note `height` tall at `anchor`. */
export function noteTop(anchor: ReturnType<typeof noteAnchor>, height: number) {
  return anchor.below ? anchor.edge + NOTE_GAP : anchor.edge - NOTE_GAP - height;
}

/** The room a row of pins takes above its element: the gap, the pin and the gap again. */
export const PIN_ROOM = NOTE_GAP * 2 + PIN_HEIGHT;
type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number };
/**
 * The top of what stands just above an element at `rect` (ticket am-45: an eyebrow line over a heading), from its
 * earlier siblings' boxes, nearest first: those stacked over it closer than a row of pins. Siblings beside it, over
 * it (a layer behind it, a float) or hidden do not count. None when there are none, or when they reach higher than
 * two rows of pins (its pins stay near it).
 */
export function clearAbove(rect: Pick<Box, "top" | "left" | "right">, earlier: Iterable<Box>) {
  let top = rect.top;
  for (const box of earlier) {
    if (!box.width || !box.height || box.bottom > rect.top + 1 || box.right <= rect.left || box.left >= rect.right) continue;
    if (box.bottom <= top - PIN_ROOM) break;
    top = Math.min(top, box.top);
  }
  return top < rect.top && rect.top - top <= PIN_ROOM * 2 ? top : undefined;
}
