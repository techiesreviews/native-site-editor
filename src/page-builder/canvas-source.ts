// Code to canvas (page builder, canvas slice): the element a place in the
// code pane belongs to, as the element-child index path the preview runtime
// resolves (`resolveNodePath`). It is the reverse of the selection mapping
// in src/native-source-location.ts and uses its parse, so implied elements
// and auto-closed tags line up with what the preview renders.

import { MARK, elementEnd, parseMarked } from "../native-source-location";
import { innermostAt, type SourceExtent } from "./canvas-model";

// Hover and cursor moves ask again and again about the same source: one parse, and what every
// query needs from it, is kept for the last source only.
interface Derived {
  tags: ReturnType<typeof parseMarked>["tags"];
  end: number;
  /** Marked elements in document order, and each one's index there. */
  marked: Element[];
  index: Map<Element, number>;
  /** For each marked element, the next marked element in document order that is not inside it. */
  following: (Element | undefined)[];
  /** Marked elements with a start tag, ordered by start, then by document order. */
  byStart: { start: number; el: Element }[];
}
let cache: { html: string; derived: Derived } | undefined;
function derived(html: string): Derived {
  if (cache?.html === html) return cache.derived;
  const { tags, root, end } = parseMarked(html);
  const marked = [...root.querySelectorAll(`[${MARK}]`)];
  const index = new Map(marked.map((el, at) => [el, at]));
  // Document order lists an element's descendants right after it, so the first marked element
  // after them is the next one outside it. One pass with a stack of open elements finds them all.
  const following: (Element | undefined)[] = new Array(marked.length).fill(undefined);
  const open: number[] = [];
  marked.forEach((el, at) => {
    while (open.length && !marked[open[open.length - 1]].contains(el)) following[open.pop()!] = el;
    open.push(at);
  });
  const byStart = marked.flatMap((el, at) => {
    const tag = tags[Number(el.getAttribute(MARK))];
    return tag ? [{ start: tag.start, el, at }] : [];
  }).sort((a, b) => a.start - b.start || a.at - b.at).map(({ start, el }) => ({ start, el }));
  cache = { html, derived: { tags, end, marked, index, following, byStart } };
  return cache.derived;
}

/**
 * The index path, from the page part of `html` (a page's `<body>` content
 * or a whole component template), of the innermost element whose source
 * holds `offset`; undefined outside the page part or between elements at
 * its top level.
 */
export function elementPathAtOffset(html: string, offset: number): number[] | undefined {
  const { tags, end, index, following, byStart } = derived(html);
  if (offset < 0 || offset > end) return undefined;
  const tagOf = (el: Element) => tags[Number(el.getAttribute(MARK))];
  // The last element whose start tag begins at or before the offset (the first in document order
  // among equal starts), then out through its ancestors to the first that has not ended yet.
  let low = 0, high = byStart.length;
  while (low < high) { const mid = (low + high) >> 1; if (byStart[mid].start <= offset) low = mid + 1; else high = mid; }
  if (!low) return undefined;
  const lastStart = byStart[low - 1].start;
  let first = low - 1;
  while (first > 0 && byStart[first - 1].start === lastStart) first--;
  const last = byStart[first].el;
  const chain: Element[] = [];
  for (let el: Element | null = last; el; el = el.parentElement) if (el.hasAttribute(MARK)) chain.push(el);
  // Outermost first: an element whose end tag is implied (`<div><p>Hi</div>`)
  // ends no later than its parent's end tag begins.
  const extents: SourceExtent[] = [];
  let limit = end;
  for (let at = chain.length - 1; at >= 0; at--) {
    const el = chain[at];
    const tag = tagOf(el)!;
    // The element ends before the next start tag outside it; its end tag
    // tells exactly where, when it can be told apart.
    const next = following[index.get(el)!];
    const boundary = Math.min(next ? tagOf(next)!.start : end, limit);
    const range = elementEnd(html, tags, Number(el.getAttribute(MARK)), boundary);
    extents[at] = { start: tag.start, end: range ? range.end : boundary };
    limit = range?.close ? range.close.start : boundary;
  }
  const found = chain[innermostAt(extents, offset)];
  if (!found) return undefined;
  const path: number[] = [];
  for (let el: Element | null = found; el; el = el.parentElement)
    path.unshift([...(el.parentNode as ParentNode).children].indexOf(el));
  return path;
}
