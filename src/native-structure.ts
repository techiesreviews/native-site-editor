// Structural and attribute edits behind the edit bar's More menu, Replace
// and the accessibility fields: each is one range edit (or two that do not
// overlap) computed from the element's exact source range, never a re-serialisation.

import { startTagAttribute, startTags, type ElementRange, type StartTag } from "./native-source-location";
import { uniqueDataKey } from "./native-insert";

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
