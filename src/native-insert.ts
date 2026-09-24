// Inserting components between page sections, and atoms (a heading, text,
// a button, an image) or non-section components inside a section.
//
// A component fits between sections when its template is a single <section>
// element: a feature or testimonial block fits, a button or card does not.
// There is no separate declaration; the template's own root says what the
// component is; the others fit inside a section instead. Inserting writes
// the new markup into the page source on its own line, indented like its
// neighbour, as one range edit. A new instance carries its own copy of each
// text slot, so typing in the preview changes this page alone and the shared
// template stays as it is.

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

const INLINE = new Set(["a", "strong", "em", "b", "i", "u", "s", "span", "small", "code", "mark", "sub", "sup", "br", "wbr", "abbr", "time", "cite", "q", "kbd"]);

/**
 * Per-instance content for a template's slots: a `<span slot="…">` for each
 * named slot, holding the template's own fallback, so the text lives in the
 * page. A slot whose fallback is not plain text and inline markup (a list of
 * items, another component) is left to the template.
 */
export function slotMarkup(template: string) {
  const out: string[] = [];
  for (const match of template.matchAll(/<slot\b([^>]*)>([\s\S]*?)<\/slot\s*>/gi)) {
    const name = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(match[1]);
    const slot = (name?.[1] ?? name?.[2] ?? name?.[3] ?? "").trim();
    const content = match[2].replace(COMMENTS, "").trim();
    if (!content || !slot || !textOnly(content)) continue;
    out.push(`<span slot="${slot}">${content.replace(/\s+/g, " ")}</span>`);
  }
  return out;
}

function textOnly(html: string) {
  const plain = html.replace(COMMENTS, "");
  return startTags(plain).every((tag) => INLINE.has(tag.name)) &&
    [...plain.matchAll(/<\/([a-zA-Z][^\s>]*)/g)].every((match) => INLINE.has(match[1].toLowerCase()));
}

/** Inserts `markup` (one or more lines) on its own line before or after the element at `anchor`, matching its indentation. */
export function insertBesideEdit(source: string, anchor: { start: number; end: number }, where: "before" | "after", markup: string) {
  const lineStart = source.lastIndexOf("\n", anchor.start - 1) + 1;
  const lead = source.slice(lineStart, anchor.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  const text = markup.split("\n").join(`\n${indent}`);
  return where === "before"
    ? { start: anchor.start, end: anchor.start, text: `${text}\n${indent}` }
    : { start: anchor.end, end: anchor.end, text: `\n${indent}${text}` };
}

/** The markup for a new `<tag>` in `source`, with its own copy of the template's text slots. */
export function instanceMarkup(source: string, tag: string, template: string) {
  const open = `<${tag} data-key="${uniqueDataKey(source, tag)}">`;
  const slots = slotMarkup(template);
  return slots.length ? [open, ...slots.map((line) => `  ${line}`), `</${tag}>`].join("\n") : `${open}</${tag}>`;
}

/** The atoms a section accepts, with the picker's name and description for each. */
export type AtomKind = "heading" | "text" | "button" | "image";
export const ATOMS: { kind: AtomKind; label: string; description: string }[] = [
  { kind: "heading", label: "Heading", description: "A new thought" },
  { kind: "text", label: "Text", description: "Start writing here." },
  { kind: "button", label: "Button", description: "Learn more" },
  { kind: "image", label: "Image", description: "Image" },
];

/** The placeholder text a new heading, text or button starts with (selected for replacement). */
export const atomText: Record<Exclude<AtomKind, "image">, string> = {
  heading: "A new thought",
  text: "Start writing here.",
  button: "Learn more",
};

/**
 * The level for a new heading inside the section at `range`: one below the
 * section's first heading, or H2 when it has none.
 */
export function newHeadingLevel(source: string, range: { start: number; end: number } | undefined) {
  if (!range) return 2;
  for (const tag of startTags(source.slice(range.start, range.end))) {
    const match = /^h([1-6])$/.exec(tag.name);
    if (match) return Math.min(Number(match[1]) + 1, 6);
  }
  return 2;
}

/**
 * The markup for a new atom in `source`: `level` for a heading, `image` the
 * repository path for an image (empty when the repository has none).
 */
export function atomMarkup(source: string, kind: AtomKind, options: { level?: number; image?: string } = {}) {
  const key = uniqueDataKey(source, kind);
  switch (kind) {
    case "heading": return `<h${options.level ?? 2} data-key="${key}">${atomText.heading}</h${options.level ?? 2}>`;
    case "text": return `<p data-key="${key}">${atomText.text}</p>`;
    case "button": return `<a class="button" href="#/" data-key="${key}">${atomText.button}</a>`;
    case "image": return `<img src="${options.image ?? ""}" alt="" data-key="${key}">`;
  }
}

/**
 * The source edit that puts a new `<tag>` at element-child position `index`
 * under `parent` (element-child indexes from the page root). Undefined when
 * neither neighbour's exact source range can be told.
 */
export function nativeInsertEdit(source: string, parent: number[], index: number, tag: string, template = "") {
  return insertMarkupEdit(source, parent, index, instanceMarkup(source, tag, template));
}

/** The source edit that puts `markup` at element-child position `index` under `parent`; undefined when the spot cannot be told. */
export function insertMarkupEdit(source: string, parent: number[], index: number, markup: string) {
  const next = locateNativeElementRange(source, [...parent, index]);
  if (next) return insertBesideEdit(source, next, "before", markup);
  // Past the last child, or the next element's range is ambiguous: right
  // after the previous one is the same position.
  const previous = index > 0 ? locateNativeElementRange(source, [...parent, index - 1]) : undefined;
  return previous ? insertBesideEdit(source, previous, "after", markup) : undefined;
}
