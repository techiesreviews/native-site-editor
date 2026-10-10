// Structural and attribute edits behind the edit bar: the section icons (move,
// duplicate, remove), links on a text range and their new-tab and title
// options, the image Address and the accessibility fields. Each is one range edit (or two that do not
// overlap) computed from the element's exact source range, never a re-serialisation.

import { startTagAttribute, startTags, textRangeInSource, type ElementRange, type StartTag } from "./native-source-location";
import { componentLabel } from "./native-insert";
import { isButtonBlock } from "./page-builder/block-fields";

// What the edit bar and the page structure call an element: a kind in the
// user's words, or the tag itself for anything else.
export function nativeKindLabel(tag: string, className = "") {
  if (isButtonBlock(tag, [{ name: "class", value: className }])) return "Button";
  if (/^h[1-6]$/.test(tag)) return "Heading";
  const labels: Record<string, string> = {
    p: "Paragraph", a: "Link", button: "Button", img: "Image", picture: "Image", video: "Video",
    ul: "List", ol: "List", li: "List item", section: "Section", article: "Article", header: "Header",
    footer: "Footer", nav: "Navigation", main: "Main", aside: "Aside", figure: "Figure", blockquote: "Quote",
    table: "Table", form: "Form", span: "Text", strong: "Bold", b: "Bold", em: "Italic", i: "Italic", slot: "Slot", div: "Block",
  };
  return labels[tag] ?? tag;
}

/** What the edit bar and the page structure call an element: a component's name ("Section split") for an instance, else its kind. */
export function nativeElementLabel(tag: string, component: boolean, className = "") {
  return component ? componentLabel(tag) : nativeKindLabel(tag, className);
}

/** One rendered page element as the runtime reports it for the page structure. */
export interface StructureItemInfo {
  tag: string;
  className?: string;
  text: string;
  heading: string;
  children: { length: number };
}

/**
 * The row for a page element in the page structure: its kind (a component's
 * name for an instance) and the text that tells it apart. A container (an
 * element with children, or a component instance) is named by the first
 * heading inside it, since its own text is everything it holds; an atom by
 * its own text, and so is a component instance holding only text.
 */
export function structureLabel(item: StructureItemInfo, component: boolean) {
  const kind = nativeElementLabel(item.tag, component, item.className);
  const container = component || item.children.length > 0;
  // An instance holding only text (<card-note>Cafe · 2025</card-note>) with no heading is named by that text.
  const text = container ? item.heading || (component && !item.children.length ? item.text : "") : item.text;
  return { kind, text: text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text };
}

export interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

// The element's lines: from the start of its first line when only
// indentation precedes it, through the newline that ends its last line.
function wholeLines(source: string, range: { start: number; end: number }) {
  const lineStart = source.lastIndexOf("\n", range.start - 1) + 1;
  const start = /^[ \t]*$/.test(source.slice(lineStart, range.start)) ? lineStart : range.start;
  const rest = source.slice(range.end);
  const trailing = /^[ \t]*\r?\n/.exec(rest);
  const end = trailing && start === lineStart ? range.end + trailing[0].length : range.end;
  return { start, end };
}

/** Deletes the element with its own lines. */
export function removeEdit(source: string, range: ElementRange): RangeEdit {
  return { ...wholeLines(source, range), text: "" };
}

/** A copy of the element right after it, on its own lines with the same indentation. */
export function duplicateEdit(source: string, range: ElementRange): RangeEdit {
  const lines = wholeLines(source, range);
  const indent = source.slice(lines.start, range.start);
  const copy = source.slice(range.start, range.end);
  const ownLines = lines.end > range.end || lines.start < range.start;
  const text = ownLines ? `${indent}${copy}\n` : `\n${indent}${copy}`;
  return { start: lines.end, end: lines.end, text };
}

/** Exchanges two non-overlapping elements' source, keeping the whitespace between them. */
export function swapEdits(source: string, a: ElementRange, b: ElementRange): RangeEdit[] {
  const [first, second] = a.start < b.start ? [a, b] : [b, a];
  if (first.end > second.start) return [];
  return [
    { start: first.start, end: first.end, text: source.slice(second.start, second.end) },
    { start: second.start, end: second.end, text: source.slice(first.start, first.end) },
  ];
}

/** Sets (or, with `value` undefined, removes) an attribute on a start tag. */
export function setAttributeEdit(source: string, tag: StartTag, name: string, value: string | undefined): RangeEdit {
  const current = startTagAttribute(source, tag, name);
  const escaped = value?.replace(/&/g, "&amp;").replace(/"/g, "&quot;") ?? "";
  if (current) {
    return value === undefined
      ? { start: current.start, end: current.end, text: "" }
      // Rewrite with a known delimiter: single quotes and unquoted values
      // cannot safely receive a value escaped for double quotes.
      : { start: current.start, end: current.end, text: ` ${name}="${escaped}"` };
  }
  if (value === undefined) return { start: tag.end, end: tag.end, text: "" };
  // A new attribute goes last in the start tag, before `>` or ` />`.
  let insertAt = source[tag.end - 2] === "/" ? tag.end - 2 : tag.end - 1;
  while (insertAt > tag.nameEnd && /\s/.test(source[insertAt - 1])) insertAt--;
  return { start: insertAt, end: insertAt, text: ` ${name}="${escaped}"` };
}

/**
 * Several attribute changes on one start tag as one edit of that tag (so two
 * new attributes never meet at one insertion point); each change is what
 * `setAttributeEdit` does, `undefined` removing the attribute.
 */
export function setAttributesEdit(source: string, tag: StartTag, changes: [name: string, value: string | undefined][]): RangeEdit {
  let text = source.slice(tag.start, tag.end);
  for (const [name, value] of changes) {
    const local = startTags(text)[0];
    if (!local) break;
    const edit = setAttributeEdit(text, local, name, value);
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return { start: tag.start, end: tag.end, text };
}

/** Whether a link's start tag opens it in a new tab (`target="_blank"`). */
export function opensInNewTab(source: string, tag: StartTag) {
  return startTagAttribute(source, tag, "target")?.value.trim().toLowerCase() === "_blank";
}

/**
 * "Open in new tab" on a link: on, `target="_blank"` and `noopener` in `rel`
 * (other rel words kept); off, `target` goes and so do `noopener` and
 * `noreferrer`, the whole `rel` when nothing else is left in it.
 */
export function newTabEdit(source: string, tag: StartTag, on: boolean): RangeEdit {
  const rel = startTagAttribute(source, tag, "rel")?.value.split(/\s+/).filter(Boolean) ?? [];
  const words = on
    ? rel.some((word) => word.toLowerCase() === "noopener") ? rel : [...rel, "noopener"]
    : rel.filter((word) => !["noopener", "noreferrer"].includes(word.toLowerCase()));
  return setAttributesEdit(source, tag, [["target", on ? "_blank" : undefined], ["rel", words.length ? words.join(" ") : undefined]]);
}

/**
 * Links a text range of an element: `start`/`end` are offsets into the
 * element's text content (as the preview reports a text selection) and
 * `inner` is the element's inner source. The mapped source span is replaced
 * by itself wrapped in `<a href="">`, one edit; `link` is where the new start
 * tag begins. Refused when the span cuts through a tag (`split`) or already
 * holds a link (`nested`).
 */
export function linkWrapEdit(inner: string, start: number, end: number, text: string):
  { edit: RangeEdit; link: number } | { refused: "split" | "nested" } {
  const span = textRangeInSource(inner, start, end, text);
  if (!span) return { refused: "split" };
  const slice = inner.slice(span.start, span.end);
  if (startTags(slice).some((tag) => tag.name === "a")) return { refused: "nested" };
  return { edit: { start: span.start, end: span.end, text: `<a href="">${slice}</a>` }, link: span.start };
}

/** Removes an element's own tags and keeps its content (a link's text and formatting). */
export function unwrapEdits(range: ElementRange): RangeEdit[] | undefined {
  if (!range.close) return undefined;
  return [
    { start: range.tag.start, end: range.tag.end, text: "" },
    { start: range.close.start, end: range.close.end, text: "" },
  ];
}

/** "src/images/studio-desk@2x.jpg" → "Studio desk". */
export function altFromPath(path: string) {
  const name = path.split(/[?#]/)[0].split("/").pop() ?? "";
  const words = name.replace(/\.[a-z0-9]+$/i, "").replace(/@\d+x$/i, "").replace(/[-_.+]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/** The level of the last heading that starts before `at` in `source`, or 0. */
export function previousHeadingLevel(source: string, at: number) {
  let level = 0;
  for (const tag of startTags(source)) {
    if (tag.start >= at) break;
    const match = /^h([1-6])$/.exec(tag.name);
    if (match) level = Number(match[1]);
  }
  return level;
}

const IMAGE_EXTENSIONS = /\.(svg|png|jpe?g|gif|webp|avif|ico|bmp)$/i;
/** Whether a repository path names an image the preview can show. */
export const isImagePath = (path: string) => IMAGE_EXTENSIONS.test(path);
