/** Vertical geometry in frame coordinates, including the selection's note row. */
export interface EditBarPlacementOptions {
  selectionTop: number;
  selectionBottom: number;
  frameHeight: number;
  barHeight: number;
  inset?: number;
  visible: boolean;
}

/**
 * Prefer clear space above, then below (also under a sticky header);
 * otherwise the canvas edge that covers the least of the visible selection.
 * The sticky header is never covered (unless it leaves no room at all).
 */
export function editBarPlacement({ selectionTop, selectionBottom, frameHeight, barHeight, inset = 0, visible }: EditBarPlacementOptions): { top: number; side: "above" | "below" | "pinned" } {
  const covered = Math.min(inset, Math.max(0, frameHeight - barHeight - 8));
  const ceiling = covered + 4;
  const floor = frameHeight - barHeight - 4;
  const above = selectionTop - barHeight - 8;
  const below = Math.max(ceiling, selectionBottom + 8);
  let top = above;
  let side: "above" | "below" | "pinned" = "above";
  if (above < ceiling) {
    if (below <= floor) {
      top = below;
      side = "below";
    } else {
      const visibleTop = Math.max(0, selectionTop);
      const visibleBottom = Math.min(frameHeight, selectionBottom);
      const overlap = (at: number) => Math.max(0, Math.min(at + barHeight, visibleBottom) - Math.max(at, visibleTop));
      top = overlap(floor) < overlap(ceiling) ? floor : ceiling;
      side = "pinned";
    }
  }
  if (!visible) {
    // Retain active controls, clamped into the frame, until focus leaves them.
    top = Math.max(ceiling, Math.min(top, floor));
    side = "pinned";
  }
  return { top, side };
}

/**
 * How far to scroll the page (px; positive scrolls down) so a selection the
 * bar would cover gets clear room above or below it, the shorter way, with the
 * selection still in view; 0 when it already has room or no scroll can give it.
 */
export function roomScroll({ selectionTop, selectionBottom, frameHeight, barHeight, inset = 0 }: Omit<EditBarPlacementOptions, "visible">): number {
  const ceiling = Math.min(inset, Math.max(0, frameHeight - barHeight - 8)) + 4;
  const above = selectionTop - barHeight - 8 - ceiling;
  const below = selectionBottom + 8 - (frameHeight - barHeight - 4);
  if (above >= 0 || below <= 0) return 0;
  const up = selectionBottom - above <= frameHeight;
  const down = selectionTop - below >= ceiling;
  return up && (!down || -above <= below) ? above : down ? below : 0;
}
