// Code to canvas (page builder, canvas slice): the element a place in the
// code pane belongs to, as the element-child index path the preview runtime
// resolves (`resolveNodePath`). It is the reverse of the selection mapping
// in src/native-source-location.ts and uses its parse, so implied elements
// and auto-closed tags line up with what the preview renders.

import { MARK, elementEnd, parseMarked } from "../native-source-location";
import { innermostAt, type SourceExtent } from "./canvas-model";

// Hover and cursor moves ask again and again about the same source.
let cache: { html: string; parsed: ReturnType<typeof parseMarked> } | undefined;
function parsed(html: string) {
  if (cache?.html !== html) cache = { html, parsed: parseMarked(html) };
  return cache.parsed;
}

/**
 * The index path, from the page part of `html` (a page's `<body>` content
 * or a whole component template), of the innermost element whose source
 * holds `offset`; undefined outside the page part or between elements at
 * its top level.
 */
export function elementPathAtOffset(html: string, offset: number): number[] | undefined {
  const { tags, root, end } = parsed(html);
  if (offset < 0 || offset > end) return undefined;
  const marked = [...root.querySelectorAll(`[${MARK}]`)];
  const tagOf = (el: Element) => tags[Number(el.getAttribute(MARK))];
  // The last element whose start tag begins at or before the offset, then
  // out through its ancestors to the first that has not ended yet.
  let last: Element | undefined;
  for (const el of marked) {
    const tag = tagOf(el);
    if (tag && tag.start <= offset && (!last || tag.start > tagOf(last)!.start)) last = el;
  }
  if (!last) return undefined;
  const chain: Element[] = [];
  for (let el: Element | null = last; el; el = el.parentElement) if (el.hasAttribute(MARK)) chain.push(el);
  const extents: SourceExtent[] = chain.map((el) => {
    const tag = tagOf(el)!;
    // The element ends before the next start tag outside it; its end tag
    // tells exactly where, when it can be told apart.
    const following = marked.slice(marked.indexOf(el) + 1).find((other) => !el.contains(other));
    const boundary = following ? tagOf(following)!.start : end;
    const range = elementEnd(html, tags, tags.indexOf(tag), boundary);
    return { start: tag.start, end: range ? range.end : boundary };
  });
  const found = chain[innermostAt(extents, offset)];
  if (!found) return undefined;
  const path: number[] = [];
  for (let el: Element | null = found; el; el = el.parentElement)
    path.unshift([...(el.parentNode as ParentNode).children].indexOf(el));
  return path;
}
