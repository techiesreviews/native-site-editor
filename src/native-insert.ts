// Inserting components between page sections.
//
// A component fits between sections when its template is a single <section>
// element: a feature or testimonial block fits, a button or card does not.
// There is no separate declaration; the template's own root says what the
// component is. Inserting writes a new instance tag into the page source on
// its own line, indented like its neighbour, as one range edit. A page whose
// <main> holds no section yet gets one place at the end of <main>, so a
// heading-only page can get sections too. The new
// instance carries its own copy of each text slot, so typing in the preview
// changes this page alone and the shared template stays as it is.

import { VOID_ELEMENTS, locateNativeElementRange, startTags, type ElementRange, type StartTag } from "./native-source-location";

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

/** `tag`, or `tag-2`, `tag-3`… when a `data-key` in `source` (or in `also`) already uses it. */
export function uniqueDataKey(source: string, tag: string, also: Iterable<string> = []) {
  const taken = new Set([...source.matchAll(/\bdata-key\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3]));
  for (const key of also) taken.add(key);
  if (!taken.has(tag)) return tag;
  let n = 2;
  while (taken.has(`${tag}-${n}`)) n++;
  return `${tag}-${n}`;
}

// Elements that hold a line of text, which a slot fallback can be.
const TEXT_BLOCKS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "figcaption", "dt", "dd", "address"]);

const INLINE = new Set(["a", "strong", "em", "b", "i", "u", "s", "span", "small", "code", "mark", "sub", "sup", "br", "wbr", "abbr", "time", "cite", "q", "kbd"]);

/**
 * Per-instance content for a template's slots: a `<span slot="…">` for each
 * named slot, holding the template's own fallback, so the text lives in the
 * page. A fallback that is one element (a heading, a paragraph, a button
 * link) takes the `slot` attribute itself, so the page source shows that
 * element and the template's `::slotted(h1)` rules still reach it. A slot
 * whose fallback is not plain text and inline markup (a list of items,
 * another component) is left to the template.
 */
export function slotMarkup(template: string) {
  const out: string[] = [];
  for (const match of template.matchAll(/<slot\b([^>]*)>([\s\S]*?)<\/slot\s*>/gi)) {
    const name = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(match[1]);
    const slot = (name?.[1] ?? name?.[2] ?? name?.[3] ?? "").trim();
    const text = match[2].replace(COMMENTS, "").trim().replace(/\s+/g, " ");
    if (!text || !slot) continue;
    const first = startTags(text)[0];
    const inner = first && oneElement(text, first) && !/\sslot\s*=/i.test(text.slice(0, first.end))
      ? text.slice(first.end, text.lastIndexOf("<"))
      : undefined;
    if (inner !== undefined && (INLINE.has(first.name) || TEXT_BLOCKS.has(first.name)) && textOnly(inner))
      out.push(`${text.slice(0, first.nameEnd)} slot="${slot}"${text.slice(first.nameEnd)}`);
    else if (textOnly(text)) out.push(`<span slot="${slot}">${text}</span>`);
  }
  return out;
}

/** Whether `html` is exactly the element `first` opens: its end tag is the last thing. */
function oneElement(html: string, first: StartTag) {
  if (first.start !== 0 || VOID_ELEMENTS.has(first.name)) return false;
  let depth = 0;
  for (const match of html.matchAll(new RegExp(`<(/?)${first.name}(?=[\\s/>])[^>]*>`, "gi"))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length === html.length;
  }
  return false;
}

function textOnly(html: string) {
  const plain = html.replace(COMMENTS, "");
  return startTags(plain).every((tag) => INLINE.has(tag.name)) &&
    [...plain.matchAll(/<\/([a-zA-Z][^\s>]*)/g)].every((match) => INLINE.has(match[1].toLowerCase()));
}

/** The line ending `source` is written with: CRLF when it has any, else LF. */
function lineEnding(source: string) {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

/** Inserts `markup` (one or more lines) on its own line before or after the element at `anchor`, matching its indentation and line endings. */
export function insertBesideEdit(source: string, anchor: { start: number; end: number }, where: "before" | "after", markup: string) {
  const lineStart = source.lastIndexOf("\n", anchor.start - 1) + 1;
  const lead = source.slice(lineStart, anchor.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  const newline = lineEnding(source);
  const text = markup.split(/\r?\n/).join(`${newline}${indent}`);
  return where === "before"
    ? { start: anchor.start, end: anchor.start, text: `${text}${newline}${indent}` }
    : { start: anchor.end, end: anchor.end, text: `${newline}${indent}${text}` };
}

/** The markup for a new `<tag>` in `source`, with its own copy of the template's text slots. */
export function instanceMarkup(source: string, tag: string, template: string) {
  const key = uniqueDataKey(source, tag);
  const open = `<${tag} data-key="${key}">`;
  // Keys copied from the template's fallbacks stay unique in the page.
  const taken = [key];
  const slots = slotMarkup(template).map((line) =>
    line.replace(/\bdata-key="([^"]*)"/g, (_, name: string) => {
      const unique = uniqueDataKey(source, name, taken);
      taken.push(unique);
      return `data-key="${unique}"`;
    }));
  return slots.length ? [open, ...slots.map((line) => `  ${line}`), `</${tag}>`].join(lineEnding(source)) : `${open}</${tag}>`;
}

/**
 * The source edit that puts a new `<tag>` at element-child position `index`
 * under `parent` (element-child indexes from the page root). Undefined when
 * neither neighbour's exact source range can be told.
 */
export function nativeInsertEdit(source: string, parent: number[], index: number, tag: string, template = "") {
  const markup = instanceMarkup(source, tag, template);
  const next = locateNativeElementRange(source, [...parent, index]);
  if (next) return insertBesideEdit(source, next, "before", markup);
  // Past the last child, or the next element's range is ambiguous: right
  // after the previous one is the same position.
  const previous = index > 0 ? locateNativeElementRange(source, [...parent, index - 1]) : undefined;
  if (previous) return insertBesideEdit(source, previous, "after", markup);
  if (index !== 0) return undefined;
  const container = locateNativeElementRange(source, parent);
  return container ? insertIntoEmptyEdit(source, container, markup) : undefined;
}

/**
 * Inserts `markup` as the only element of the element at `range` (an empty
 * `<main>`, say), on its own line one level deeper than the element's start
 * tag, before its end tag. Undefined when it has no end tag or has element
 * children already.
 */
export function insertIntoEmptyEdit(source: string, range: ElementRange, markup: string) {
  if (!range.close) return undefined;
  const inner = source.slice(range.tag.end, range.close.start);
  if (startTags(inner).length) return undefined;
  const lineStart = source.lastIndexOf("\n", range.start - 1) + 1;
  const lead = source.slice(lineStart, range.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  const newline = lineEnding(source);
  const text = markup.split(/\r?\n/).join(`${newline}${indent}  `);
  // Trailing blank space before the end tag gives way to the new line.
  const start = range.tag.end + inner.trimEnd().length;
  return { start, end: range.close.start, text: `${newline}${indent}  ${text}${newline}${indent}` };
}
