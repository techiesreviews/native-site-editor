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
