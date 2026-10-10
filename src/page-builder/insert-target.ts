// Where the Add panel puts a section: after the selected section (or the
// section around the selected element), else at the end of <main>; and,
// while one is dragged over the canvas, the gap nearest the pointer. Both
// pick among the insert points the preview runtime reports, so a drop or a
// click is the same source edit as a plus between sections. Pure.

import type { InsertPoint } from "../components/insert-controls";

/** The key a plus between sections has for its point (insert-controls.ts). */
export const insertPointKey = (point: InsertPoint) => `${point.path}|${point.parent.join(".")}|${point.index}`;

const samePath = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((step, at) => step === b[at]);

/**
 * The point a click in the Add panel inserts at: right after the selected
 * element's nearest ancestor-or-self that sits in a gap list, when the
 * selection is on the page the points belong to; otherwise the end of
 * <main>, or the last point.
 */
export function defaultInsertPoint(points: readonly InsertPoint[], selection?: { path: string; node?: readonly number[] }): InsertPoint | undefined {
  if (!points.length) return undefined;
  const node = selection?.node;
  if (node?.length && selection?.path === points[0].path) {
    for (let depth = node.length; depth >= 1; depth--) {
      const parent = node.slice(0, depth - 1);
      const index = node[depth - 1] + 1;
      const found = points.find((point) => point.index === index && samePath(point.parent, parent));
      if (found) return found;
    }
  }
  const inMain = points.filter((point) => point.tag === "main");
  const pool = inMain.length ? inMain : points.filter((point) => samePath(point.parent, points[points.length - 1].parent));
  return pool.reduce((last, point) => (point.index > last.index ? point : last));
}

/**
 * The gap a section dragged to (`x`, `y`) in the frame's viewport would go
 * into: the nearest by height, with distance across counted double so a
 * gap inside a narrow column wins only when the pointer is over it.
 */
export function pointAt(points: readonly InsertPoint[], x: number, y: number): InsertPoint | undefined {
  let best: InsertPoint | undefined;
  let bestScore = Infinity;
  for (const point of points) {
    const across = x < point.left ? point.left - x : x > point.left + point.width ? x - point.left - point.width : 0;
    // An empty <main> is a whole area to drop into, not a line.
    const bottom = point.empty ? point.top + (point.height ?? 0) : point.top;
    const down = y < point.top ? point.top - y : y > bottom ? y - bottom : 0;
    const score = down + across * 2;
    if (score < bestScore) {
      best = point;
      bestScore = score;
    }
  }
  return best;
}

/** "Goes before “Work”", or "Goes at the end". */
export function positionText(point: InsertPoint | undefined) {
  if (!point) return "This page has no place for a section.";
  if (point.empty) return "Goes into the empty page";
  return point.before ? `Goes before “${point.before}”` : "Goes at the end";
}
