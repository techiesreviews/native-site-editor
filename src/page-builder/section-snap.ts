// A dragged Section always snaps between <main>'s page bands, by their
// vertical midpoints. Above the bands (the header) picks the first gap;
// below them (the footer) picks the last. A nested element resolves through
// its band's span. Canvas spans come from child rects; Structure spans cover
// each band's row and its open subtree (slice 37). Pure.

import type { DropContainer } from "./drop-report";
import type { DropTarget } from "./drop-target";

/** A page band's vertical span and source index among <main>'s children. */
export interface BandSpan { index: number; top: number; height: number }

/** After the last shown band whose midpoint is above y, or before the first. */
export function snapIndex(bands: readonly BandSpan[], y: number): number {
  let index: number | undefined;
  for (const band of bands) {
    if (band.height === 0) continue;
    if (index === undefined) index = band.index;
    if (band.top + band.height / 2 < y) index = band.index + 1;
  }
  return index ?? 0;
}

/** A canvas Section target from all of <main>'s child rects, including a moved band. */
export function sectionSnap(main: DropContainer, y: number): DropTarget {
  const bands = main.children.map(child => ({ index: child.index, top: child.rect.top, height: child.rect.height }));
  return { container: main, index: snapIndex(bands, y), level: 0, ok: true };
}
