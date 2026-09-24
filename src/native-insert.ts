// Inserting components between page sections.
//
// A component fits between sections when its template is a single <section>
// element: a feature or testimonial block fits, a button or card does not.
// There is no separate declaration; the template's own root says what the
// component is. Inserting writes a new instance tag into the page source on
// its own line, indented like its neighbour, as one range edit.

import { locateNativeElementRange, startTags } from "./native-source-location";

const COMMENTS = /<!--[\s\S]*?-->/g;
const blank = (text: string) => !text.replace(COMMENTS, "").trim();

/** Whether a component template is exactly one `<section>` element. */
export function isSectionTemplate(html: string) {
  const tags = startTags(html);
  const first = tags[0];
  if (first?.name !== "section" || !blank(html.slice(0, first.start))) return false;
  // Opening and closing section tags in source order; the first section
  // ends where the depth first returns to zero.
  const events = [
    ...tags.filter((tag) => tag.name === "section").map((tag) => ({ at: tag.start, depth: 1, end: -1 })),
    ...[...html.matchAll(/<\/section\s*>/gi)].map((match) => ({ at: match.index, depth: -1, end: match.index + match[0].length })),
  ].sort((a, b) => a.at - b.at);
  let depth = 0;
  for (const event of events) {
    depth += event.depth;
    if (depth === 0) return blank(html.slice(event.end));
  }
  return false;
}

/** "feature-block" → "Feature block". */
export function componentLabel(tag: string) {
  const words = tag.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `tag`, or `tag-2`, `tag-3`… when a `data-key` in `source` already uses it. */
export function uniqueDataKey(source: string, tag: string) {
  const taken = new Set([...source.matchAll(/\bdata-key\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3]));
  if (!taken.has(tag)) return tag;
  let n = 2;
  while (taken.has(`${tag}-${n}`)) n++;
  return `${tag}-${n}`;
}

/** Inserts `markup` on its own line before or after the element at `anchor`, matching its indentation. */
export function insertBesideEdit(source: string, anchor: { start: number; end: number }, where: "before" | "after", markup: string) {
  const lineStart = source.lastIndexOf("\n", anchor.start - 1) + 1;
  const lead = source.slice(lineStart, anchor.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  return where === "before"
    ? { start: anchor.start, end: anchor.start, text: `${markup}\n${indent}` }
    : { start: anchor.end, end: anchor.end, text: `\n${indent}${markup}` };
}

/**
 * The source edit that puts a new `<tag>` at element-child position `index`
 * under `parent` (element-child indexes from the page root). Undefined when
 * neither neighbour's exact source range can be told.
 */
export function nativeInsertEdit(source: string, parent: number[], index: number, tag: string) {
  const markup = `<${tag} data-key="${uniqueDataKey(source, tag)}"></${tag}>`;
  const next = locateNativeElementRange(source, [...parent, index]);
  if (next) return insertBesideEdit(source, next, "before", markup);
  // Past the last child, or the next element's range is ambiguous: right
  // after the previous one is the same position.
  const previous = index > 0 ? locateNativeElementRange(source, [...parent, index - 1]) : undefined;
  return previous ? insertBesideEdit(source, previous, "after", markup) : undefined;
}
