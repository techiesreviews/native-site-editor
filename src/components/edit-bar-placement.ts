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

/** The docked bar's box and the visual viewport (`window.visualViewport`'s offsetTop and height), in host viewport px. */
export interface DockLiftOptions {
  barTop: number;
  barBottom: number;
  viewportTop: number;
  viewportHeight: number;
}

/**
 * How far to raise the bar docked at the canvas foot (phones) so it sits right
 * on top of the on-screen keyboard, or at the foot of a zoomed-in visual
 * viewport: 0 when that foot is at or under the bar, never past its top.
 */
export function dockLift({ barTop, barBottom, viewportTop, viewportHeight }: DockLiftOptions): number {
  return Math.max(0, Math.min(barBottom - (viewportTop + viewportHeight), barTop - viewportTop));
}

/** The selection (with its note row) in frame px, and where the page shows down to: the docked bar's top, or the keyboard's. */
export interface DockScrollOptions {
  selectionTop: number;
  selectionBottom: number;
  visibleBottom: number;
  inset?: number;
}

/**
 * How far to scroll the page (px; positive scrolls down) so a selection hidden
 * behind the docked bar or the keyboard comes into view 8 px above it, its top
 * kept 8 px under the sticky header; 0 when it is already in view. A selection
 * taller than the room shows its top.
 */
export function dockScroll({ selectionTop, selectionBottom, visibleBottom, inset = 0 }: DockScrollOptions): number {
  const ceiling = Math.min(inset, Math.max(0, visibleBottom - 16)) + 8;
  const hidden = selectionBottom - (visibleBottom - 8);
  return hidden > 0 ? Math.max(0, Math.min(hidden, selectionTop - ceiling)) : 0;
}
