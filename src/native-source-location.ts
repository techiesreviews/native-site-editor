// Maps a native preview selection back to the start tag that produced it.
//
// The preview runtime reports the selected element as element-child indexes
// from its page or component root. A page is a full document whose page is
// the content of its `<body>` (shared/native-project.ts `nativePageBody`),
// which is all the preview renders, so indexes count from there; a component
// template is its whole text. Here every start tag in that part of the
// source is tagged with its offset and parsed by the same browser HTML
// parser the preview uses, so implied elements and auto-closed tags line up
// exactly; walking the indexes then yields the tag's position in the source.

import { MARK, VOID_ELEMENTS, elementEnd, startTags, type ElementRange, type StartTag } from "../shared/html-source";
import { nativePageBody } from "../shared/native-project";

export * from "../shared/html-source";

export function parseMarked(html: string) {
  const tags = startTags(html);
  // The page part: a document's <body> content, or the whole of a template.
  const { start, end } = nativePageBody(html);
  let marked = "";
  let from = start;
  tags.forEach((tag, index) => {
    if (tag.start < start || tag.start >= end) return;
    marked += `${html.slice(from, tag.nameEnd)} ${MARK}="${index}"`;
    from = tag.nameEnd;
  });
  marked += html.slice(from, end);
  const template = document.createElement("template");
  template.innerHTML = marked;
  // Mirror the preview runtime's sanitizer, which drops these before render.
  template.content.querySelectorAll("script").forEach((el) => el.remove());
  template.content.querySelectorAll("meta[http-equiv]").forEach((el) => {
    if ((el.getAttribute("http-equiv") ?? "").toLowerCase() === "refresh") el.remove();
  });
  return { tags, root: template.content, end };
}

// Selection lookups repeatedly read the same bytes. Keep DOM private and leave
// parseMarked fresh for callers that own and may mutate their parsed fragment.
type ParsedSource = ReturnType<typeof parseMarked> & { ranges: Map<Element, ElementRange | undefined> };
const parsedSources = new Map<string, ParsedSource>();
const MAX_CACHED_SOURCE_BYTES = 1024 * 1024;

function parsedSource(html: string) {
  const cached = parsedSources.get(html);
  if (cached) {
    parsedSources.delete(html);
    parsedSources.set(html, cached);
    return cached;
  }
  const parsed: ParsedSource = { ...parseMarked(html), ranges: new Map() };
  parsed.tags.forEach(Object.freeze);
  if (html.length <= MAX_CACHED_SOURCE_BYTES && new TextEncoder().encode(html).length <= MAX_CACHED_SOURCE_BYTES) {
    parsedSources.set(html, parsed);
    if (parsedSources.size > 2) parsedSources.delete(parsedSources.keys().next().value!);
  }
  return parsed;
}

function frozenRange(range: ElementRange | undefined): ElementRange | undefined {
  if (!range) return undefined;
  Object.freeze(range.tag);
  if (range.close) Object.freeze(range.close);
  return Object.freeze(range);
}

function sourceRange(html: string, parsed: ParsedSource, el: Element): ElementRange | undefined {
  if (parsed.ranges.has(el)) return parsed.ranges.get(el);
  const range = frozenRange(markedRange(html, parsed.tags, parsed.root, el, parsed.end));
  parsed.ranges.set(el, range);
  return range;
}

function tagOf(tags: StartTag[], el: Element | null | undefined) {
  if (!el?.hasAttribute(MARK)) return undefined;
  return tags[Number(el.getAttribute(MARK))];
}

// The start tag of the element at `path` (element-child indexes from the root
// of `html`), or of its deepest ancestor the parser kept a source tag for.
export function locateNativeElement(html: string, path: number[]): StartTag | undefined {
  if (!path.length) return undefined;
  const { tags, root } = parsedSource(html);
  let parent: ParentNode = root;
  let found: StartTag | undefined;
  for (const index of path) {
    const child = parent.children[index];
    if (!child) break;
    const tag = tagOf(tags, child);
    if (tag) found = tag;
    parent = child;
  }
  return found;
}

// The exact outer source range of the element at `path`, for edits that
// touch its tags or content. Undefined unless the element itself and its end
// tag map to the source unambiguously.
export function locateNativeElementRange(html: string, path: number[]): ElementRange | undefined {
  if (!path.length) return undefined;
  const parsed = parsedSource(html);
  const { root } = parsed;
  let parent: ParentNode = root;
  let el: Element | undefined;
  for (const index of path) {
    const child = parent.children[index];
    if (!child) return undefined;
    el = child;
    parent = child;
  }
  return el ? sourceRange(html, parsed, el) : undefined;
}

// The element-child index path, from the root of `html`, of the element
// whose start tag begins at `start` (the inverse of the lookups above).
export function elementPathAt(html: string, start: number): number[] | undefined {
  const { tags, root } = parsedSource(html);
  const index = tags.findIndex((tag) => tag.start === start);
  let el = index < 0 ? null : root.querySelector(`[${MARK}="${index}"]`);
  if (!el) return undefined;
  const path: number[] = [];
  while (el) {
    path.unshift([...(el.parentNode as ParentNode).children].indexOf(el));
    el = el.parentElement;
  }
  return path;
}

// The outer range of a marked element in a parsed source whose page part ends at `limit`.
export function markedRange(html: string, tags: StartTag[], root: ParentNode, el: Element, limit = html.length): ElementRange | undefined {
  const tag = tagOf(tags, el);
  if (!tag) return undefined;
  // The element's end tag precedes the next start tag outside its subtree.
  const marked = [...root.querySelectorAll(`[${MARK}]`)];
  const following = marked.slice(marked.indexOf(el) + 1).find((other) => !el.contains(other));
  const boundary = tagOf(tags, following)?.start ?? limit;
  return elementEnd(html, tags, tags.indexOf(tag), boundary);
}

// The innermost element named in `names` around the text offset `at` of the
// inner source `inner` (offsets as in the element's DOM text content).
export function wrapperAround(inner: string, at: number, names: string[]): ElementRange | undefined {
  const parsed = parsedSource(inner);
  const { root } = parsed;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node: Node | null = null;
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const length = text.textContent?.length ?? 0;
    node = text;
    if (at < seen + length) break;
    seen += length;
  }
  let el = node?.parentElement ?? null;
  while (el && !names.includes(el.localName)) el = el.parentElement;
  return el ? sourceRange(inner, parsed, el) : undefined;
}

