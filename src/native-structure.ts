// Structural and attribute edits behind the edit bar: the section icons (move,
// duplicate, remove), the image Address and the accessibility fields. Each is one range edit (or two that do not
// overlap) computed from the element's exact source range, never a re-serialisation.

import { startTagAttribute, startTags, type ElementRange, type StartTag } from "./native-source-location";
import { componentLabel, uniqueDataKey } from "./native-insert";

// What the edit bar and the page structure call an element: a kind in the
// user's words, or the tag itself for anything else.
export function nativeKindLabel(tag: string) {
  if (/^h[1-6]$/.test(tag)) return "Heading";
  const labels: Record<string, string> = {
    p: "Paragraph", a: "Link", button: "Button", img: "Image", picture: "Image", video: "Video",
    ul: "List", ol: "List", li: "List item", section: "Section", article: "Article", header: "Header",
    footer: "Footer", nav: "Navigation", main: "Main", aside: "Aside", figure: "Figure", blockquote: "Quote",
    table: "Table", form: "Form", span: "Text", strong: "Text", em: "Text", slot: "Slot", div: "Block",
  };
  return labels[tag] ?? tag;
}

/** One rendered page element as the runtime reports it for the page structure. */
export interface StructureItemInfo {
  tag: string;
  text: string;
  heading: string;
  children: { length: number };
}

/**
 * The row for a page element in the page structure: its kind (a component's
 * name for an instance) and the text that tells it apart. A container (an
 * element with children, or a component instance) is named by the first
 * heading inside it, since its own text is everything it holds; an atom by
 * its own text.
 */
export function structureLabel(item: StructureItemInfo, component: boolean) {
  const kind = component ? componentLabel(item.tag) : nativeKindLabel(item.tag);
  const container = component || item.children.length > 0;
  const text = container ? item.heading : item.text;
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

/**
 * A copy of the element right after it, on its own lines with the same
 * indentation, whose root `data-key` (when it has one) is made unique.
 */
export function duplicateEdit(source: string, range: ElementRange): RangeEdit {
  const lines = wholeLines(source, range);
  const indent = source.slice(lines.start, range.start);
  let copy = source.slice(range.start, range.end);
  const key = startTagAttribute(copy, startTags(copy)[0], "data-key");
  if (key?.value) copy = copy.slice(0, key.valueStart) + uniqueDataKey(source, key.value) + copy.slice(key.valueEnd);
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

/**
 * Moves the element at `index` among its siblings to the gap `target`, where
 * the gaps are numbered as the insert points are: `target` = before the
 * sibling at that index, the sibling count = after the last one. `sibling`
 * gives the exact range of the sibling at an index (nothing when it cannot
 * be told, in which case nothing moves). The element travels with its own
 * lines, so its indentation is kept; the two edits do not overlap. The gap
 * the element already fills, before or after itself, moves nothing.
 */
export function moveEdit(
  source: string,
  range: ElementRange,
  index: number,
  target: number,
  sibling: (at: number) => ElementRange | undefined,
): RangeEdit[] {
  if (target === index || target === index + 1 || target < 0) return [];
  const lines = wholeLines(source, range);
  const block = source.slice(lines.start, lines.end);
  const neighbour = sibling(target < index ? target : target - 1);
  if (!neighbour || (neighbour.start < range.end && neighbour.end > range.start)) return [];
  const at = target < index ? wholeLines(source, neighbour).start : wholeLines(source, neighbour).end;
  if (at > lines.start && at < lines.end) return [];
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lineStart = at === 0 || source[at - 1] === "\n";
  let text = block;
  let removeStart = lines.start;
  if (block.endsWith("\n") && !lineStart) {
    // The block ends with its newline; after a neighbour that ends its line
    // without one (the last child before the parent's end tag) the newline
    // goes first instead.
    text = `${newline}${block.slice(0, -newline.length)}`;
  } else if (!block.endsWith("\n") && lineStart) {
    // The block ends its line without a newline (the last child before the
    // parent's end tag, or the end of the file): it takes one along to keep
    // its own line at the new place, and the newline that led to it goes
    // with it, so its old neighbour ends the line as the block did.
    text = `${block}${newline}`;
    if (source.slice(lines.start - newline.length, lines.start) === newline) removeStart = lines.start - newline.length;
  }
  const remove = { start: removeStart, end: lines.end, text: "" };
  const insert = { start: at, end: at, text };
  return at < lines.start ? [insert, remove] : [remove, insert];
}

/** Sets (or, with `value` undefined, removes) an attribute on a start tag. */
export function setAttributeEdit(source: string, tag: StartTag, name: string, value: string | undefined): RangeEdit {
  const current = startTagAttribute(source, tag, name);
  const escaped = value?.replace(/&/g, "&amp;").replace(/"/g, "&quot;") ?? "";
  if (current) {
    return value === undefined
      ? { start: current.start, end: current.end, text: "" }
      : current.value === "" && source[current.valueEnd] !== "\""
        // A bare attribute (`alt`) becomes a quoted one.
        ? { start: current.start, end: current.end, text: ` ${name}="${escaped}"` }
        : { start: current.valueStart, end: current.valueEnd, text: escaped };
  }
  if (value === undefined) return { start: tag.end, end: tag.end, text: "" };
  // A new attribute goes last in the start tag, before `>` or ` />`.
  let insertAt = source[tag.end - 2] === "/" ? tag.end - 2 : tag.end - 1;
  while (insertAt > tag.nameEnd && /\s/.test(source[insertAt - 1])) insertAt--;
  return { start: insertAt, end: insertAt, text: ` ${name}="${escaped}"` };
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
