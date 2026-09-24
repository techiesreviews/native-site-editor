// Maps a native preview selection back to the start tag that produced it.
//
// The preview runtime reports the selected element as element-child indexes
// from its page or component root. Here every start tag in the source is
// tagged with its offset and parsed by the same browser HTML parser the
// preview uses, so implied elements and auto-closed tags line up exactly;
// walking the indexes then yields the tag's position in the source.

import { MARK, VOID_ELEMENTS, elementEnd, markStartTags, startTags, type ElementRange, type StartTag } from "../shared/html-source";

export * from "../shared/html-source";

function parseMarked(html: string) {
  const tags = startTags(html);
  const template = document.createElement("template");
  template.innerHTML = markStartTags(html, tags);
  // Mirror the preview runtime's sanitizer, which drops these before render.
  template.content.querySelectorAll("script").forEach((el) => el.remove());
  template.content.querySelectorAll("meta[http-equiv]").forEach((el) => {
    if ((el.getAttribute("http-equiv") ?? "").toLowerCase() === "refresh") el.remove();
  });
  return { tags, root: template.content };
}

function tagOf(tags: StartTag[], el: Element | null | undefined) {
  if (!el?.hasAttribute(MARK)) return undefined;
  return tags[Number(el.getAttribute(MARK))];
}

// The start tag of the element at `path` (element-child indexes from the root
// of `html`), or of its deepest ancestor the parser kept a source tag for.
export function locateNativeElement(html: string, path: number[]): StartTag | undefined {
  if (!path.length) return undefined;
  const { tags, root } = parseMarked(html);
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
  const { tags, root } = parseMarked(html);
  let parent: ParentNode = root;
  let el: Element | undefined;
  for (const index of path) {
    const child = parent.children[index];
    if (!child) return undefined;
    el = child;
    parent = child;
  }
  return el ? markedRange(html, tags, root, el) : undefined;
}

// The outer range of a marked element in a parsed source.
function markedRange(html: string, tags: StartTag[], root: ParentNode, el: Element): ElementRange | undefined {
  const tag = tagOf(tags, el);
  if (!tag) return undefined;
  // The element's end tag precedes the next start tag outside its subtree.
  const marked = [...root.querySelectorAll(`[${MARK}]`)];
  const following = marked.slice(marked.indexOf(el) + 1).find((other) => !el.contains(other));
  const boundary = tagOf(tags, following)?.start ?? html.length;
  return elementEnd(html, tags, tags.indexOf(tag), boundary);
}

// The innermost element named in `names` around the text offset `at` of the
// inner source `inner` (offsets as in the element's DOM text content).
export function wrapperAround(inner: string, at: number, names: string[]): ElementRange | undefined {
  const { tags, root } = parseMarked(inner);
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
  return el ? markedRange(inner, tags, root, el) : undefined;
}

