/** Vertical geometry in frame coordinates, including the selection's note row. */
export interface EditBarPlacementOptions {
  selectionTop: number;
  selectionBottom: number;
  frameHeight: number;
  barHeight: number;
  inset?: number;
  visible: boolean;
}

/** Prefer clear space above, then below; otherwise cover the least visible selection. */
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
