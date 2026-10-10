// What the canvas draws for a drop target (ticket 12 §5, variant D): a thin
// line between the container's items, sideways in rows and grids; a tinted
// area naming an empty container; a red outline round a container that
// refuses. No border round a container that takes the drop. And the level a
// drag steps up: one while Alt is held, one per Tab, back one per Shift+Tab,
// from zero again when the innermost container under the pointer changes.
// And the target a probe gives a dragged block (new from the rail, or moved). Pure; frame-viewport
// coordinates.

import type { DropChild, DropRect, DropReport } from "./drop-report";
import { dropContainerName, dropTarget, isBand, type DraggedBlock, type DropTarget } from "./drop-target";
import { sectionSnap } from "./section-snap";

export type DropIndicator =
  | { kind: "line"; rect: DropRect; vertical: boolean }
  | { kind: "area"; rect: DropRect; text: string }
  | { kind: "refused"; rect: DropRect };

const LINE = 3;
const shown = (child: DropChild) => child.rect.width > 0 && child.rect.height > 0;
const right = (r: DropRect) => r.left + r.width;
const bottom = (r: DropRect) => r.top + r.height;

/** The line, area or outline for `target`; nothing when the block stays where it is. */
export function dropIndicator(target: DropTarget, stays = false): DropIndicator | undefined {
  const { container, index } = target;
  if (!target.ok) return { kind: "refused", rect: container.rect };
  if (stays) return undefined;
  const items = container.children.filter(shown);
  // An empty items slot among a card's other parts: a line where it sits, not an area over them.
  if (!items.length && container.around) return line(container.around.prev, container.around.next, container.axis);
  if (!items.length) {
    const r = container.rect, inset = Math.min(4, r.width / 4, r.height / 4);
    const name = container.kind === "main" ? "page" : dropContainerName(container);
    return { kind: "area", rect: { left: r.left + inset, top: r.top + inset, width: r.width - 2 * inset, height: r.height - 2 * inset },
      text: container.empty ? `Drop into the empty ${name}` : `Drop at the end of the ${name}` };
  }
  const next = items.find((child) => child.index >= index)?.rect;
  const prev = [...items].reverse().find((child) => child.index < index)?.rect;
  return line(prev, next, container.axis);
}

/** The line between two boxes (or before the next, after the previous), along the axis. */
function line(prev: DropRect | undefined, next: DropRect | undefined, axis: DropTarget["container"]["axis"]): DropIndicator {
  if (axis === "column") {
    const y = prev && next ? (bottom(prev) + next.top) / 2 : next ? next.top - 4 : bottom(prev!) + 4;
    const left = Math.min(prev?.left ?? Infinity, next?.left ?? Infinity);
    const end = Math.max(prev ? right(prev) : -Infinity, next ? right(next) : -Infinity);
    return { kind: "line", vertical: false, rect: { left, top: y - LINE / 2, width: end - left, height: LINE } };
  }
  // Sideways: between two items on one row, else before the next or after the last.
  const x = prev && next && Math.abs(prev.top - next.top) < 2 ? (right(prev) + next.left) / 2 : next ? next.left - 4 : right(prev!) + 4;
  const row = next ?? prev!;
  return { kind: "line", vertical: true, rect: { left: x - LINE / 2, top: row.top, width: LINE, height: row.height } };
}

export interface DragLevel { alt: boolean; tabs: number; inner?: string }

/** Tab steps up one level, Shift+Tab back one (never below where the pointer is). */
export const stepLevel = (state: DragLevel, by: 1 | -1): DragLevel => ({ ...state, tabs: Math.max(0, state.tabs + by) });

/**
 * The level for the containers under the pointer now (`inner`: the
 * innermost one's key, `levels`: how many there are above it); Tab presses
 * count from zero again over another innermost container, and stop at the
 * outermost.
 */
export function levelAt(state: DragLevel, inner: string, levels: number): { state: DragLevel; level: number } {
  const alt = state.alt ? 1 : 0;
  const tabs = Math.min(inner === state.inner ? state.tabs : 0, Math.max(0, levels - alt));
  return { state: { ...state, inner, tabs }, level: alt + tabs };
}

/** The target a probe gives `block` at `at` (a band snaps between page bands), with Alt and Tab's level. */
export function blockDropTarget(report: DropReport, at: { x: number; y: number }, block: DraggedBlock, level: DragLevel) {
  if (isBand(block)) {
    const main = report.containers.find((container) => container.kind === "main");
    return { target: main && sectionSnap(main, at.y), level };
  }
  const inner = report.containers[0];
  if (!inner) return { target: undefined, level };
  const next = levelAt(level, `${inner.kind}:${inner.path.join(".")}:${inner.slot ?? ""}`, report.containers.length - 1);
  return { target: dropTarget(report.containers, at, block, next.level), level: next.state };
}
