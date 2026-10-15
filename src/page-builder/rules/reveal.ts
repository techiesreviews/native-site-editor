// Where the canvas scrolls an element it brings into view (one chosen in Page
// structure or in the code, or just added): below the site's sticky header,
// with room above it for the edit bar, which stands 8 px above the selection
// and at least 4 px below the header (components/edit-bar-placement.ts).
// Used by the preview runtime; tested in tests/rules-reveal.test.ts.

/** The one-row edit bar with its name tab (about 60 px), its 8 px gap above the selection and its 4 px margin under the header. */
export const EDIT_BAR_ROOM = 76;
// Below this much of the element showing under the bar (or all of a shorter
// one), the element comes first and the bar is pinned over it instead.
const LEAST_SHOWN = 120;

export interface RevealInput {
  /** The element's top and bottom in the view (px). */
  top: number;
  bottom: number;
  /** The view's height and the part of its top the site's sticky header covers. */
  height: number;
  inset: number;
  room?: number;
}

/**
 * How far to scroll (px; positive scrolls down) to show the element centred in
 * the space under the header and the bar's room; one taller than that space
 * shows from its top, just under the bar. Without room for the bar and a fair
 * part of the element, the element goes just under the header.
 */
export function revealOffset({ top, bottom, height, inset, room = EDIT_BAR_ROOM }: RevealInput): number {
  const size = Math.max(0, bottom - top);
  const under = Math.max(0, height - inset);
  const gap = under - room >= Math.min(size, LEAST_SHOWN) ? room : 0;
  const free = under - gap;
  return top - (inset + gap + Math.max(0, (free - size) / 2));
}
