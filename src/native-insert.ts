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

import { VOID_ELEMENTS, isSectionTemplate, locateNativeElementRange, startTags, type ElementRange, type StartTag } from "./native-source-location";
import { templateSlots } from "./page-builder/component-model";

export { isSectionTemplate };

const COMMENTS = /<!--[\s\S]*?-->/g;

/** "feature-block" → "Feature block". */
export function componentLabel(tag: string) {
  const words = tag.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Elements that hold a line of text, which a slot fallback can be.
const TEXT_BLOCKS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "figcaption", "dt", "dd", "address"]);

const INLINE = new Set(["a", "strong", "em", "b", "i", "u", "s", "span", "small", "code", "mark", "sub", "sup", "br", "wbr", "abbr", "time", "cite", "q", "kbd"]);

/**
 * Per-instance content for a template's slots: a `<span slot="…">` for each
 * named slot, holding the template's own fallback, so the text lives in the
 * page. A fallback that is one element (a heading, a paragraph, a button
 * link, an image) takes the `slot` attribute itself, so the page source
 * shows that element and the template's `h1` rules (through the
 * `::slotted()` twins of shared/slotted-css.ts) still reach it. A slot whose
 * fallback is not plain text and inline markup (a list of items, another
 * component) is left to the template. Copies leave out `data-key`.
 */
export function slotMarkup(template: string) {
  const out: string[] = [];
  for (const match of template.matchAll(/<slot\b([^>]*)>([\s\S]*?)<\/slot\s*>/gi)) {
    const name = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(match[1]);
    const slot = name?.[1] ?? name?.[2] ?? name?.[3] ?? "";
    const text = withoutDataKeys(match[2].replace(COMMENTS, "").trim().replace(/\s+/g, " "));
    if (!text || !slot) continue;
    const first = startTags(text)[0];
    const inner = first && oneElement(text, first) && !/\sslot\s*=/i.test(text.slice(0, first.end))
      ? text.slice(first.end, text.lastIndexOf("<"))
      : undefined;
    // An image alone is copied too, so each page can have its own.
    const image = first?.name === "img" && first.start === 0 && first.end === text.length && !/\sslot\s*=/i.test(text);
    if (image || (inner !== undefined && (INLINE.has(first.name) || TEXT_BLOCKS.has(first.name)) && textOnly(inner)))
      out.push(`${text.slice(0, first.nameEnd)} slot="${slot}"${text.slice(first.nameEnd)}`);
    else if (textOnly(text)) out.push(`<span slot="${slot}">${text}</span>`);
  }
  return out;
}

/**
 * A new instance's starting items: the template's unnamed slot's
 * placeholder when it is elements only (blocks and cards built into it in
 * Edit component mode), as written, one line per source line, its
 * indentation relative to the first. A section component hides a slot the
 * page leaves unfilled, so they are the page's own from the start. A text
 * placeholder (a button's label) stays the template's.
 */
export function itemsMarkup(template: string): string[] {
  const slot = templateSlots(template).find((entry) => entry.name === "");
  const kids = slot?.element.children ?? [];
  const elements = kids.filter((kid) => kid.type === "element");
  const text = (kid: (typeof kids)[number]) => template.slice(kid.start, kid.end).replace(COMMENTS, "");
  if (!elements.length || kids.some((kid) => kid.type === "text" && /\S/.test(text(kid)))) return [];
  const start = elements[0].start, end = elements[elements.length - 1].end;
  const lead = template.slice(template.lastIndexOf("\n", start - 1) + 1, start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  return withoutDataKeys(template.slice(start, end)).split(/\r?\n/).map((line, at) => (at && line.startsWith(indent) ? line.slice(indent.length) : line));
}

/** `html` without the `data-key` attributes an older template may still carry. */
function withoutDataKeys(html: string) {
  return html.replace(/<[a-zA-Z][^>]*>/g, (tag) => tag.replace(/\sdata-key(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?(?=[\s/>])/gi, ""));
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

/** The markup for a new `<tag>` in `source`, with its own copy of the template's text slots and starting items. */
export function instanceMarkup(source: string, tag: string, template: string) {
  const open = `<${tag}>`;
  const slots = [...slotMarkup(template), ...itemsMarkup(template)];
  return slots.length ? [open, ...slots.map((line) => (line ? `  ${line}` : line)), `</${tag}>`].join(lineEnding(source)) : `${open}</${tag}>`;
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

// Native HTML has a separate API; component tag/template insertion above is unchanged.
export { nativeMarkupInsertEdit, nativeMoveEdit, nativeMoveToEdit, nativeDestinations, applyGuardedSourceEdit } from "./page-builder/native-operations";
export type { GuardedSourceEdit, NativeDestination, NativePlacement } from "./page-builder/native-operations";
