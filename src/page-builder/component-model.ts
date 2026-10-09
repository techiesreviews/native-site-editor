// Components as the page builder sees them, read from source and edited as
// source (docs/page-builder/components.md). No DOM here, so it runs in the
// unit tests as it does in the editor.
//
// A component is a custom element with a template (components/<tag>/<tag>.html)
// whose `<slot>`s the page fills: `<h3 slot="title">…</h3>` fills the slot
// named "title", anything without a `slot` attribute the unnamed (default)
// slot. The template decides what shows when the page fills nothing: a
// slot's fallback content, or nothing at all for an optional part, by the
// rules the site's loader (`hideEmpty` in the starter's components.js) and
// the editor's preview runtime (`applyEmptyRules`) share:
//   - in a section component the page fills at all, every slot it does not
//     fill is hidden with its fallback;
//   - an element holding slots, with no text of its own, whose slots all show
//     nothing, is hidden too.
//
// Every edit here is a range edit of the file the instance is in: the
// page's own markup inside the instance tag, or the instance's attributes.

import { asciiLower, VOID_ELEMENTS, decodeEntity, isSectionTemplate, startTagAttribute, startTags, textRangeInSource, type StartTag } from "../../shared/html-source";
import { itemKind } from "./card-grid";
import { decodeHtmlEntities } from "./html-entities";
import type { NativeStructureItem } from "../components/native-preview";

export interface TemplateStructureItem extends NativeStructureItem {
  children: TemplateStructureItem[];
  /** Template paths accepted by slotChipState; a text-only slot uses its own path. */
  chips: number[][];
  /** Set by Edit component mode: the template file the row is in, when not the one edited. */
  path?: string;
  /** Set by Edit component mode: this nested instance is open; its rows are that level's. */
  opened?: { path: string; root?: number[]; current: boolean };
  /** Set by Edit component mode: a nested instance of the template edited, which opens. */
  opens?: boolean;
}

/** The rendered fallbacks, with source paths preserved through invisible slot wrappers. */
export function templateStructure(template: string, templateOf: TemplateOf = () => undefined): TemplateStructureItem[] {
  const roots = elements(parseSource(template));
  const paths = new Map<SourceElement, number[]>();
  const index = (list: SourceElement[], parent: number[]) => list.forEach((el, i) => {
    const path = [...parent, i]; paths.set(el, path); index(elements(el.children), path);
  });
  index(roots, []);
  const inline = /^(a|strong|em|b|i|u|s|span|small|code|mark|sub|sup|br|wbr|abbr|time|cite|q|kbd|slot)$/;
  const run = /^(h[1-6]|p|li|button|blockquote|figcaption|dt|dd|summary|legend|caption|label|td|th|a|strong|em|b|i|small|cite|q|mark|code)$/;
  const landmark = /^(section|article|main|header|footer|nav|aside)$/;
  const text = (nodes: SourceNode[]): string => nodes.map(n => n.type === "text"
    ? decodeHtmlEntities(template.slice(n.start, n.end)) : n.name === "br" ? " " : text(n.children)).join("");
  const snippet = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 80);
  const heading = (el: SourceElement): string => {
    if (/^h[1-6]$/.test(el.name)) return "";
    const find = (list: SourceElement[]): string => {
      for (const child of list) {
        if (/^h[1-6]$/.test(child.name)) return snippet(text(child.children));
        if (landmark.test(child.name) || child.name.includes("-")) continue;
        const found = find(elements(child.children)); if (found) return found;
      }
      return "";
    };
    if (el.name.includes("-")) {
      const source = templateOf(el.name);
      if (source !== undefined) {
        // Inspect this template once; nested instances remain leaves.
        const rows = templateStructure(source);
        const first = (list: TemplateStructureItem[]): string => {
          for (const row of list) { if (/^h[1-6]$/.test(row.tag)) return row.text; const found = first(row.children); if (found) return found; }
          return "";
        };
        return first(rows);
      }
    }
    return find(elements(el.children));
  };
  const seenSlots = new Set<string>();
  const badge = (at: number[]): number[][] => {
    const state = slotChipState(template, at, templateOf);
    if (!state) return [];
    if (state.state === "fixed") return [at];
    const key = state.slot.join(".");
    if (seenSlots.has(key)) return [];
    seenSlots.add(key); return [at];
  };
  const visit = (list: SourceElement[], holder?: TemplateStructureItem): TemplateStructureItem[] => list.flatMap(el => {
    const at = paths.get(el)!;
    if (el.name === "style" || el.name === "script") return [];
    if (el.name === "slot") {
      if (elements(el.children).length) return visit(elements(el.children), holder);
      if (holder) { holder.chips.push(...badge(at)); return []; }
      return [{ tag: "slot", className: "", node: at, text: "", heading: "", slot: "", children: [], chips: badge(at) }];
    }
    const row: TemplateStructureItem = { tag: el.name, className: attribute(template, el, "class") ?? "",
      node: at, text: snippet(text(el.children)), heading: heading(el), slot: "", children: [], chips: badge(at) };
    // A nested instance is one row: the slots its content holds (`<card-note><slot name="note" slot="text">`) badge it.
    if (el.name.includes("-")) {
      for (const child of walk(el.children)) if (child.name === "slot") row.chips.push(...badge(paths.get(child)!));
      return [row];
    }
    const descendants = [...walk(el.children)];
    const isRun = descendants.length > 0 && descendants.every(child => inline.test(child.name) && attribute(template, child, "slot") === undefined)
      && (run.test(el.name) || el.children.some(n => n.type === "text" && snippet(text([n]))));
    if (isRun) {
      for (const child of descendants) if (child.name === "slot") row.chips.push(...badge(paths.get(child)!));
    } else row.children = visit(elements(el.children), row);
    return [row];
  });
  function* walk(nodes: SourceNode[]): Generator<SourceElement> {
    for (const el of elements(nodes)) { yield el; yield* walk(el.children); }
  }
  return roots.length === 1 && roots[0].name !== "slot" ? visit(elements(roots[0].children)) : visit(roots);
}

export interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

// ---- A small source tree: elements and text with their offsets. ----

export interface SourceElement {
  type: "element";
  name: string;
  tag: StartTag;
  // Outer range, from `<` to past the end tag (to past the start tag for a
  // void element, to the end of what was parsed for an unclosed one).
  start: number;
  end: number;
  close?: { start: number; end: number };
  children: SourceNode[];
  parent?: SourceElement;
}
export interface SourceText {
  type: "text";
  start: number;
  end: number;
  parent?: SourceElement;
}
export type SourceNode = SourceElement | SourceText;

const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);

/**
 * The elements and text of `html` between `from` and `to`, as written: end
 * tags close the nearest open element of their name (those opened inside
 * it close with it), stray end tags are ignored, comments are skipped.
 * Implied end tags are not inferred: the editor writes and reads explicit
 * markup, and an edit that depends on a guess is not made.
 */
export function parseSource(html: string, from = 0, to = html.length): SourceNode[] {
  const root: SourceNode[] = [];
  const stack: SourceElement[] = [];
  const add = (node: SourceNode) => {
    const parent = stack.at(-1);
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else root.push(node);
  };
  let text = from;
  const flush = (at: number) => {
    if (at > text) add({ type: "text", start: text, end: at });
  };
  let i = from;
  while (i < to) {
    const lt = html.indexOf("<", i);
    if (lt < 0 || lt >= to) break;
    if (html.startsWith("<!--", lt)) {
      flush(lt);
      const close = html.indexOf("-->", lt + 4);
      i = text = close < 0 || close + 3 > to ? to : close + 3;
      continue;
    }
    const next = html[lt + 1] ?? "";
    if (next === "/") {
      const match = /^<\/([a-zA-Z][^\t\n\f\r />]*)[^>]*>/.exec(html.slice(lt, to));
      if (!match) { i = lt + 1; continue; }
      flush(lt);
      const name = asciiLower(match[1]);
      const at = stack.map((el) => el.name).lastIndexOf(name);
      if (at >= 0) {
        // The element closed here gets its end tag; those opened in it end with it.
        const [closed, ...inside] = stack.splice(at);
        for (const open of inside) open.end = lt;
        closed.close = { start: lt, end: lt + match[0].length };
        closed.end = lt + match[0].length;
      }
      i = text = lt + match[0].length;
      continue;
    }
    if (next === "!" || next === "?") {
      flush(lt);
      const close = html.indexOf(">", lt + 2);
      i = text = close < 0 || close + 1 > to ? to : close + 1;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) { i = lt + 1; continue; }
    flush(lt);
    let j = lt + 1;
    while (j < to && !/[\t\n\f\r />]/.test(html[j])) j++;
    const name = asciiLower(html.slice(lt + 1, j));
    const nameEnd = j;
    while (j < to && html[j] !== ">") {
      const char = html[j];
      if (char === "\"" || char === "'") {
        const close = html.indexOf(char, j + 1);
        j = close < 0 ? to : close + 1;
      } else j++;
    }
    const end = Math.min(j + 1, to);
    const el: SourceElement = { type: "element", name, tag: { name, start: lt, nameEnd, end }, start: lt, end, children: [] };
    add(el);
    i = text = end;
    if (VOID_ELEMENTS.has(name)) continue;
    if (RAW_TEXT.has(name)) {
      const lower = asciiLower(html);
      let close = lower.indexOf(`</${name}`, end);
      while (close >= 0 && !/[\t\n\f\r />]/.test(html[close + name.length + 2] ?? "")) close = lower.indexOf(`</${name}`, close + 2);
      const gt = close < 0 ? -1 : html.indexOf(">", close);
      if (close < 0 || gt < 0 || gt >= to) {
        el.end = to;
        i = text = to;
      } else {
        if (close > end) el.children.push({ type: "text", start: end, end: close, parent: el });
        el.close = { start: close, end: gt + 1 };
        el.end = gt + 1;
        i = text = gt + 1;
      }
      continue;
    }
    stack.push(el);
  }
  flush(to);
  for (const open of stack) open.end = to;
  return root;
}

const elements = (nodes: SourceNode[]) => nodes.filter((node): node is SourceElement => node.type === "element");

export function* descendants(nodes: SourceNode[]): Generator<SourceElement> {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    yield node;
    yield* descendants(node.children);
  }
}

/**
 * `inner`'s text content as the browser parses it: tags and comments out,
 * entities decoded, white space as written. Offsets into it are what
 * `textRangeInSource` maps back to the source.
 */
export function decodedText(inner: string) {
  let out = "";
  let i = 0;
  while (i < inner.length) {
    const char = inner[i];
    if (char === "<") {
      if (inner.startsWith("<!--", i)) {
        const close = inner.indexOf("-->", i + 4);
        i = close < 0 ? inner.length : close + 3;
        continue;
      }
      if (/[a-zA-Z/!?]/.test(inner[i + 1] ?? "")) {
        const tag = /[a-zA-Z]/.test(inner[i + 1]) ? startTags(inner.slice(i))[0] : undefined;
        if (tag && tag.start === 0) i += tag.end;
        else {
          const close = inner.indexOf(">", i + 1);
          i = close < 0 ? inner.length : close + 1;
        }
        continue;
      }
    }
    if (char === "&") {
      const entity = decodeEntity(inner, i);
      if (entity) {
        out += entity.text;
        i += entity.length;
        continue;
      }
    }
    if (char === "\r") {
      if (inner[i + 1] !== "\n") out += "\n";
      i++;
      continue;
    }
    out += char;
    i++;
  }
  return out;
}

/**
 * `raw` with its white space collapsed as it shows (runs to one space, the
 * ends trimmed), and for each character of the result where it starts in
 * `raw`, plus one more entry: where the last one ends.
 */
function collapsed(raw: string) {
  let text = "";
  const index: number[] = [];
  let i = 0;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  let end = i;
  while (i < raw.length) {
    if (/\s/.test(raw[i])) {
      let j = i;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      if (j >= raw.length) break;
      index.push(i);
      text += " ";
      i = j;
      continue;
    }
    index.push(i);
    text += raw[i];
    i++;
    end = i;
  }
  index.push(end);
  return { text, index };
}

/** The text `html` shows: tags and comments out, entities decoded, white space collapsed. */
export function plainText(html: string) {
  return collapsed(decodedText(html)).text;
}

// ---- Line breaks in a run of text. ----
// An element whose content is phrasing (text and inline markup) can hold a
// `<br>`: a field editing its text maps each typed line break to one, and each
// one back to a line break. Nothing else typed ever becomes markup.

/**
 * Whether an element takes `<br>` among its text: any whose content is flow
 * or phrasing (p, h1-h6, a, span, li, button, div, …), not one whose children
 * are options, rows or list items, nor raw text.
 */
export const takesBreaks = (name: string) => !/^(?:option|optgroup|select|datalist|textarea|title|script|style|template|t(?:able|head|body|foot|r)|colgroup|ul|ol|dl|menu)$/.test(name);

// Only the element's own (direct-child) <br>s are line boundaries: the lines
// between them hold whole elements, so a line's range never splits a tag.
const hasBreak = (el: SourceElement): boolean => el.children.some(child => child.type === "element" && (child.name === "br" || hasBreak(child)));
function breakNodes(inner: string) {
  const nodes = parseSource(inner);
  const breaks = nodes.filter((node): node is SourceElement => node.type === "element" && node.name === "br");
  return { nodes, breaks };
}

/** Whether `inner` can be edited as lines: no <br> sits inside an inline child (a link, strong, …). */
export function breaksAllowed(inner: string) {
  return !breakNodes(inner).nodes.some(node => node.type === "element" && node.name !== "br" && hasBreak(node));
}

/** The source ranges of `inner` between its own `<br>`s. */
function breakSegments(inner: string) {
  const segments: { start: number; end: number }[] = [];
  let start = 0;
  for (const br of breakNodes(inner).breaks) {
    segments.push({ start, end: br.start });
    start = br.end;
  }
  segments.push({ start, end: inner.length });
  return segments;
}

/** `inner`'s text as a field shows it: each of its own `<br>`s a line break, the text between collapsed as it shows. */
export function breakText(inner: string) {
  return breakSegments(inner).map(segment => plainText(inner.slice(segment.start, segment.end))).join("\n");
}

/** How `inner` writes a line break: as its first own `<br>` is spelled (`<br>`, `<br/>`, `<br />`), never with its attributes. */
export function breakSpelling(inner: string) {
  const first = breakNodes(inner).breaks[0];
  if (!first) return "<br>";
  const tag = inner.slice(first.tag.start, first.tag.end);
  return /\s\/\s*>$/.test(tag) ? "<br />" : /\/\s*>$/.test(tag) ? "<br/>" : "<br>";
}

/**
 * The edit that makes the text of `source[from, to]` read `after`, each "\n"
 * of it a `<br>` (spelled as the content spells one): a change within one line
 * is the smallest one (keeping formatting around it); a change of lines writes
 * the lines it touches again, as text, and is refused (undefined) when those
 * lines hold any element (a link, strong, …) that would be lost. Undefined too
 * when `after` is what is there, or the change could not be placed.
 */
export function breakTextEdit(source: string, from: number, to: number, after: string): RangeEdit | undefined {
  const inner = source.slice(from, to);
  const segments = breakSegments(inner);
  const before = segments.map(segment => plainText(inner.slice(segment.start, segment.end)));
  const next = after.split("\n");
  if (before.join("\n") === after) return undefined;
  const spelling = breakSpelling(inner);
  if (next.length === before.length) {
    const changed = before.flatMap((line, index) => line === next[index] ? [] : [index]);
    if (changed.length === 1) {
      const at = segments[changed[0]];
      const edit = textChangeEdit(source, from + at.start, from + at.end, next[changed[0]]);
      if (edit) return edit;
    }
  }
  // The lines that differ, first to last: written again as text joined by breaks,
  // unless they hold an element (a link, strong, …) that rewriting would drop.
  const { nodes } = breakNodes(inner);
  const holdsElement = (start: number, end: number) => nodes.some(node => node.type === "element" && node.name !== "br" && node.start < end && node.end > start);
  let head = 0;
  while (head < before.length && head < next.length && before[head] === next[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < next.length - head && before[before.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  const lines = next.slice(head, next.length - tail).map(escapeText);
  const last = before.length - 1 - tail;
  if (last < head) {
    // Only new lines, between line head - 1 and line head: each after a break of
    // its own, or before the first line each before one.
    if (head === 0) { const at = from + segments[0].start; return { start: at, end: at, text: lines.map(line => line + spelling).join("") }; }
    const at = from + segments[head - 1].end;
    return { start: at, end: at, text: lines.map(line => spelling + line).join("") };
  }
  if (!lines.length) {
    // Only lines taken out (head..last), with the breaks before them.
    const start = head > 0 ? segments[head - 1].end : segments[head].start;
    const end = head > 0 ? segments[last].end : segments[last + 1].start;
    if (holdsElement(start, end)) return undefined;
    return { start: from + start, end: from + end, text: "" };
  }
  if (holdsElement(segments[head].start, segments[last].end)) return undefined;
  return { start: from + segments[head].start, end: from + segments[last].end, text: lines.join(spelling) };
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const blank = (html: string, node: SourceNode) => node.type === "text" && !html.slice(node.start, node.end).trim();
/** Elements and text that is not just white space. */
const meaningful = (html: string, nodes: SourceNode[]) => nodes.filter((node) => !blank(html, node));

/** `text` with its character references decoded (an attribute value as the browser reads it). */
export function decodeEntities(text: string) {
  let out = "";
  for (let i = 0; i < text.length;) {
    const entity = text[i] === "&" ? decodeEntity(text, i) : undefined;
    if (entity) {
      out += entity.text;
      i += entity.length;
    } else out += text[i++];
  }
  return out;
}

/** Every attribute of a start tag, in order, with its value decoded and its range (leading white space included). */
export function startTagAttributes(html: string, tag: StartTag) {
  const out: { name: string; value: string; start: number; end: number }[] = [];
  const text = html.slice(tag.nameEnd, tag.end);
  const pattern = /[\t\n\f\r ]+([^\t\n\f\r "'>\/=]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r "'=<>`]+)))?/g;
  for (const match of text.matchAll(pattern)) {
    out.push({
      name: asciiLower(match[1]),
      value: decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""),
      start: tag.nameEnd + match.index,
      end: tag.nameEnd + match.index + match[0].length,
    });
  }
  return out;
}

const attribute = (html: string, el: SourceElement, name: string) => startTagAttribute(html, el.tag, name)?.value;

// Elements whose whole content is one line of text.
const TEXT_BLOCKS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption", "dt", "dd", "button", "label", "summary", "legend", "caption", "td", "th", "address"]);
const INLINE = new Set(["a", "strong", "em", "b", "i", "u", "s", "span", "small", "code", "mark", "sub", "sup", "br", "wbr", "abbr", "time", "cite", "q", "kbd"]);

/** Whether `nodes` hold text and inline formatting only (no images, blocks or components). */
function textOnly(nodes: SourceNode[]): boolean {
  return nodes.every((node) => node.type === "text" || (INLINE.has(node.name) && textOnly(node.children)));
}

// ---- Templates and their slots. ----

export type SlotKind = "text" | "image" | "link" | "content";

export interface TemplateSlot {
  /** "" for the unnamed (default) slot. */
  name: string;
  /** The `<slot>` element in the template. */
  element: SourceElement;
  /** Its fallback content, as written. */
  fallback: string;
  /** What fills it: read from its fallback, else guessed from its name. */
  kind: SlotKind;
  /** The slot's own `slot` attribute: a slot passed on into a component the template uses. */
  forward?: string;
  /**
   * An items slot, which takes cards and other blocks (Add card, drops): the
   * unnamed slot, or a slot whose fallback is a card component, whatever it
   * is named. A slot holding another instance (`card-project`'s `card-note`)
   * is an ordinary slot.
   */
  items: boolean;
}

/** A component's template by its tag; undefined when the site has no such component. */
export type TemplateOf = (tag: string) => string | undefined;

/** A card component: a `card-…` component whose template has a heading slot (ticket 09 rule 9). */
export function isCardComponent(tag: string, templateOf: TemplateOf) {
  const template = tag.startsWith("card-") ? templateOf(tag) : undefined;
  return template !== undefined && hasHeadingSlot(template);
}

/**
 * Whether `nodes` are card component instances only, at least one. Text in
 * between counts as the preview's drop report reads it (character references
 * decoded, only ASCII white space blank).
 */
function cardsOnly(html: string, nodes: SourceNode[], templateOf: TemplateOf) {
  const parts = nodes.filter((node) => node.type !== "text" || /[^\t\n\f\r ]/.test(decodeHtmlEntities(html.slice(node.start, node.end))));
  return parts.length > 0 && parts.every((node) => node.type === "element" && isCardComponent(node.name, templateOf));
}

/** What a run of content is: a text line, an image, a link, or anything else. */
function contentKind(html: string, nodes: SourceNode[]): SlotKind | undefined {
  const parts = meaningful(html, nodes);
  if (!parts.length) return undefined;
  if (parts.length === 1 && parts[0].type === "element") {
    const only = parts[0];
    if (only.name === "img" || only.name === "picture") return "image";
    if (only.name === "a" && textOnly(only.children)) return "link";
    if ((TEXT_BLOCKS.has(only.name) || INLINE.has(only.name)) && textOnly(only.children)) return "text";
    return "content";
  }
  return textOnly(parts) ? "text" : "content";
}

/** A slot's kind from its name alone (an empty slot): "image", "link" or text. */
export function slotKindFromName(name: string): SlotKind {
  if (/image|img|photo|picture|logo|media|avatar|icon/i.test(name)) return "image";
  if (/link|action|cta|button|primary|secondary|url|href/i.test(name)) return "link";
  return "text";
}

/** "item-1-title" → "Item 1 title"; the unnamed slot is "Content". */
export function slotLabel(name: string) {
  if (!name) return "Content";
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The template's slots in source order, each name once (the first `<slot>` of
 * a name is the one filled). Telling a named items slot needs the site's
 * other templates (`templateOf`); without them only the unnamed slot is one.
 */
export function templateSlots(template: string, templateOf: TemplateOf = () => undefined): TemplateSlot[] {
  const out: TemplateSlot[] = [];
  const seen = new Set<string>();
  for (const el of descendants(parseSource(template))) {
    if (el.name !== "slot") continue;
    const name = (attribute(template, el, "name") ?? "").trim();
    if (seen.has(name)) continue;
    seen.add(name);
    const fallback = el.close ? template.slice(el.tag.end, el.close.start) : "";
    const forward = attribute(template, el, "slot");
    out.push({
      name,
      element: el,
      fallback,
      kind: contentKind(template, el.children) ?? slotKindFromName(name),
      ...(forward ? { forward } : {}),
      items: !name || cardsOnly(template, el.children, templateOf),
    });
  }
  return out;
}

// ---- Instances: the page's own markup inside the tag. ----

export interface InstanceRange {
  tag: StartTag;
  start: number;
  end: number;
  close?: { start: number; end: number };
}

export interface Instance {
  tag: string;
  range: InstanceRange;
  /** The instance's elements and non-blank text, in order. */
  children: SourceNode[];
  /** What the page gives each slot, by slot name ("" for the unnamed one). */
  fills: Map<string, SourceNode[]>;
  attributes: { name: string; value: string; start: number; end: number }[];
}

/** The instance whose outer range is `range` in `source`. */
export function readInstance(source: string, range: InstanceRange): Instance {
  const children = range.close ? meaningful(source, parseSource(source, range.tag.end, range.close.start)) : [];
  const fills = new Map<string, SourceNode[]>();
  for (const child of children) {
    const name = child.type === "element" ? (attribute(source, child, "slot") ?? "").trim() : "";
    fills.set(name, [...(fills.get(name) ?? []), child]);
  }
  return { tag: range.tag.name, range, children, fills, attributes: startTagAttributes(source, range.tag) };
}

export interface SlotState {
  /** The page fills the slot. */
  filled: boolean;
  /** The slot shows something on this instance: what the page gave it, else its fallback. */
  shown: boolean;
  /** What the slot shows when the page gives it nothing: its fallback, or nothing (an optional part). */
  whenEmpty: "fallback" | "hidden";
}

/**
 * Which slots show on an instance that fills `filled`, by the shared rules
 * (see the top of this file); `hostHasContent` is whether the instance holds
 * anything at all, which decides a section component's rule.
 */
function shownSlots(template: string, filled: ReadonlySet<string>, hostHasContent: boolean) {
  const tree = parseSource(template);
  const section = isSectionTemplate(template);
  const slots = new Map<string, SourceElement>();
  for (const el of descendants(tree)) if (el.name === "slot") {
    const name = (attribute(template, el, "name") ?? "").trim();
    if (!slots.has(name)) slots.set(name, el);
  }
  const nameOf = (slot: SourceElement) => (attribute(template, slot, "name") ?? "").trim();
  const assigned = (name: string) => slots.has(name) && filled.has(name);
  const unmet = (slot: SourceElement) => section && hostHasContent && !assigned(nameOf(slot));
  const hasFallback = (slot: SourceElement) => meaningful(template, slot.children).length > 0;
  const showsSomething = (slot: SourceElement) => assigned(nameOf(slot)) || (!unmet(slot) && hasFallback(slot));
  const ownText = (el: SourceElement): boolean => el.children.some((node) =>
    node.type === "text" ? !blank(template, node) : node.name !== "slot" && ownText(node));
  const hidden = (el: SourceElement) => {
    if (el.name === "slot") return unmet(el);
    const inner = [...descendants(el.children)].filter((node) => node.name === "slot");
    return inner.length > 0 && !inner.some(showsSomething) && !ownText(el);
  };
  const shown = new Map<string, boolean>();
  const visit = (nodes: SourceNode[], hiddenAbove: boolean) => {
    for (const node of elements(nodes)) {
      const off = hiddenAbove || hidden(node);
      if (node.name === "slot") {
        const name = nameOf(node);
        if (!shown.has(name)) shown.set(name, !off && (assigned(name) || hasFallback(node)));
      }
      visit(node.children, off);
    }
  };
  visit(tree, false);
  return { shown, hidden };
}

/** Each slot's state on `instance`, by name. */
export function slotStates(template: string, instance: Instance): Map<string, SlotState> {
  const filled = new Set(instance.fills.keys());
  const { shown } = shownSlots(template, filled, instance.children.length > 0);
  const out = new Map<string, SlotState>();
  for (const slot of templateSlots(template)) {
    const others = instance.children.filter((child) => !(instance.fills.get(slot.name) ?? []).includes(child));
    const without = new Set(filled);
    without.delete(slot.name);
    const empty = shownSlots(template, without, others.length > 0).shown.get(slot.name) ?? false;
    out.set(slot.name, { filled: filled.has(slot.name), shown: shown.get(slot.name) ?? false, whenEmpty: empty ? "fallback" : "hidden" });
  }
  return out;
}

/** What a slot holds on an instance, as the properties list shows it. */
export interface SlotValue {
  kind: SlotKind;
  /** The text shown (what the page gave, else the fallback's). */
  text: string;
  /** An image's or a link's element in the page, when the page fills the slot with exactly one. */
  element?: SourceElement;
  /** The `src` and `alt` of an image, the `href` of a link (the page's, else the fallback's). */
  src?: string;
  alt?: string;
  href?: string;
  /** The page's content can be typed into as one line of text. */
  editable: boolean;
  /**
   * The text as a field shows it for editing: like `text`, with each `<br>`
   * of the page's element as a line break ("\n"). Set for an editable fill.
   */
  lines?: string;
  /** Whether a line break can be typed: the page's element takes `<br>` (phrasing content). */
  breaks?: boolean;
}

/** What `slot` holds on `instance`, with what kind of value it is. */
export function slotValue(source: string, template: string, instance: Instance, slot: TemplateSlot): SlotValue {
  const fill = instance.fills.get(slot.name);
  if (fill?.length) {
    const kind = contentKind(source, fill) ?? slot.kind;
    const only = fill.length === 1 && fill[0].type === "element" ? fill[0] : undefined;
    const text = plainText(fill.map((node) => source.slice(node.start, node.end)).join(" "));
    const value: SlotValue = { kind, text, editable: false, ...(only ? { element: only } : {}) };
    if (only?.name === "img") {
      value.src = attribute(source, only, "src") ?? "";
      value.alt = attribute(source, only, "alt");
    } else if (only?.name === "a") value.href = attribute(source, only, "href") ?? "";
    // One text element, or text with inline formatting for the unnamed slot when it is all the instance holds.
    value.editable = kind === "text" || kind === "link"
      ? Boolean(only ? only.close && textOnly(only.children) : slot.name === "" && instance.children.length === fill.length && textOnly(fill))
      : false;
    if (value.editable && only?.close) {
      const inner = source.slice(only.tag.end, only.close.start);
      value.breaks = takesBreaks(only.name) && breaksAllowed(inner);
      value.lines = value.breaks ? breakText(inner) : value.text;
    } else if (value.editable) value.lines = value.text;
    return value;
  }
  const nodes = slot.element.children;
  const only = meaningful(template, nodes);
  const el = only.length === 1 && only[0].type === "element" ? only[0] : undefined;
  const value: SlotValue = { kind: slot.kind, text: plainText(slot.fallback), editable: slot.kind === "text" || slot.kind === "link" };
  if (el?.name === "img") {
    value.src = attribute(template, el, "src") ?? "";
    value.alt = attribute(template, el, "alt");
  } else if (el?.name === "a") value.href = attribute(template, el, "href") ?? "";
  return value;
}

// ---- Edits on an instance. ----

/**
 * The edit that makes the text between `from` and `to` in `source` (an
 * element's content) read `after`, where its text as shown (white space
 * collapsed) reads otherwise: only the stretch that changed is replaced, so
 * the formatting around it stays. Undefined when nothing changes or the
 * change would cut through a tag.
 */
export function textChangeEdit(source: string, from: number, to: number, after: string): RangeEdit | undefined {
  const inner = source.slice(from, to);
  const raw = decodedText(inner);
  const { text: before, index } = collapsed(raw);
  if (before === after) return undefined;
  if (!before) return { start: from, end: to, text: escapeText(after) };
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
  // A pure insertion takes a neighbouring character along, so the source
  // range is never empty and lands beside that character.
  if (endBefore === start) {
    if (start > 0) start--;
    else { endBefore++; endAfter++; }
  }
  let rawStart = index[start];
  let rawEnd = index[endBefore];
  // A space typed at either end (not layout: no line break in it) is part of
  // the text, though the collapsed text leaves it out: an edit reaching that
  // end takes it along, so it never lingers after (or before) what follows.
  if (endBefore === before.length && /^[ \t]+$/.test(raw.slice(rawEnd))) rawEnd = raw.length;
  if (start === 0 && /^[ \t]+$/.test(raw.slice(0, rawStart))) rawStart = 0;
  const span = textRangeInSource(inner, rawStart, rawEnd, raw.slice(rawStart, rawEnd));
  if (!span) return undefined;
  return { start: from + span.start, end: from + span.end, text: escapeText(after.slice(start, endAfter)) };
}

/** `markup` with a `slot` attribute just after its first tag name (or `slot` removed when `name` is ""). */
function withSlot(markup: string, name: string | undefined) {
  const tags = parseSource(markup);
  const first = elements(tags)[0];
  if (!first) return markup;
  const existing = startTagAttribute(markup, first.tag, "slot");
  if (existing) {
    if (name) return markup.slice(0, existing.valueStart) + escapeAttribute(name) + markup.slice(existing.valueEnd);
    return markup.slice(0, existing.start) + markup.slice(existing.end);
  }
  if (!name) return markup;
  return `${markup.slice(0, first.tag.nameEnd)} slot="${escapeAttribute(name)}"${markup.slice(first.tag.nameEnd)}`;
}

/** `html` without the `data-key` attributes older templates carry. */
export function withoutDataKeys(html: string) {
  const ranges = startTags(html).flatMap(tag => startTagAttributes(html, tag).filter(attribute => attribute.name === "data-key"));
  for (const range of ranges.reverse()) html = html.slice(0, range.start) + html.slice(range.end);
  return html;
}

/**
 * The page markup that fills `slot`, copied from its fallback (so the page
 * starts from what the template shows), with `text` as its text when given.
 * A fallback element takes the `slot` attribute itself; text goes in a
 * `<span slot>` (bare, for the unnamed slot). An empty slot gets an element
 * of its kind: an image, a link, or a line of text.
 */
export function fillMarkup(template: string, slot: TemplateSlot, text?: string): string {
  const name = slot.name;
  const trimAscii = (value: string) => value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
  const parts = slot.element.children.filter(node => node.type === "element" || trimAscii(template.slice(node.start, node.end)).length > 0);
  const single = parts.length === 1 && parts[0].type === "element" ? parts[0] : undefined;
  const label = slotLabel(name);
  if (single) {
    let copy = withoutDataKeys(template.slice(single.start, single.end));
    const local = elements(parseSource(copy))[0];
    if (text !== undefined && local?.close && textOnly(local.children))
      copy = copy.slice(0, local.tag.end) + escapeText(text) + copy.slice(local.close.start);
    return withSlot(copy, name || undefined);
  }
  if (parts.length && textOnly(parts)) {
    const inner = text !== undefined ? escapeText(text) : withoutDataKeys(trimAscii(slot.fallback));
    return name ? `<span slot="${escapeAttribute(name)}">${inner}</span>` : inner;
  }
  if (parts.length) {
    // Several elements take the slot in order; preserve their internal bytes
    // and the source gaps between them.
    return parts.map((part, index) => {
      const copy = withoutDataKeys(template.slice(part.start, part.end));
      const gap = index ? template.slice(parts[index - 1].end, part.start) : "";
      const filled = part.type === "text" ? (name ? `<span slot="${escapeAttribute(name)}">${copy}</span>` : copy) : withSlot(copy, name || undefined);
      return gap + filled;
    }).join("");
  }
  const slotAttribute = name ? ` slot="${escapeAttribute(name)}"` : "";
  if (slot.kind === "image") return `<img${slotAttribute} src="" alt="">`;
  if (slot.kind === "link") return `<a${slotAttribute} href="">${escapeText(text ?? label)}</a>`;
  return name ? `<span${slotAttribute}>${escapeText(text ?? label)}</span>` : escapeText(text ?? label);
}

const lineEnding = (source: string) => (source.includes("\r\n") ? "\r\n" : "\n");

function indentOf(source: string, at: number) {
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  const lead = source.slice(lineStart, at);
  return /^[ \t]*$/.test(lead) ? lead : "";
}

/** One element's own lines: from its line's start (when only indentation precedes it) through its line's newline. */
function wholeLines(source: string, range: { start: number; end: number }) {
  const lineStart = source.lastIndexOf("\n", range.start - 1) + 1;
  const start = /^[ \t]*$/.test(source.slice(lineStart, range.start)) ? lineStart : range.start;
  const trailing = /^[ \t]*\r?\n/.exec(source.slice(range.end));
  const end = trailing && start === lineStart ? range.end + trailing[0].length : range.end;
  return { start, end };
}

/**
 * Puts `markup` (what fills `slotName`) into the instance, among its other
 * children in the order of the template's slots: before the first child
 * that fills a later slot, else after the last. In an instance with no
 * children it goes on its own line inside the tag; text for the unnamed
 * slot of an empty instance goes straight between the tags.
 */
export function fillInsertEdit(source: string, instance: Instance, slots: TemplateSlot[], slotName: string, markup: string): RangeEdit | undefined {
  const { range } = instance;
  if (!range.close) return undefined;
  const order = (name: string) => {
    const at = slots.findIndex((slot) => slot.name === name);
    return at < 0 ? slots.length : at;
  };
  const target = order(slotName);
  const newline = lineEnding(source);
  const placed = instance.children.filter((child): child is SourceElement => child.type === "element");
  const nameOf = (el: SourceElement) => (attribute(source, el, "slot") ?? "").trim();
  if (!instance.children.length) {
    if (!/</.test(markup)) return { start: range.tag.end, end: range.close.start, text: markup };
    const indent = indentOf(source, range.start);
    return { start: range.tag.end, end: range.close.start, text: `${newline}${indent}  ${markup}${newline}${indent}` };
  }
  const later = placed.find((el) => order(nameOf(el)) > target);
  if (later) {
    const indent = indentOf(source, later.start);
    return { start: later.start, end: later.start, text: `${markup}${newline}${indent}` };
  }
  const last = instance.children.at(-1)!;
  const indent = indentOf(source, instance.children[0].start) || `${indentOf(source, range.start)}  `;
  // On a line of its own after the last child; an instance written on one line stays on one.
  const oneLine = !source.slice(range.tag.end, range.close.start).includes("\n");
  return oneLine
    ? { start: last.end, end: last.end, text: markup }
    : { start: last.end, end: last.end, text: `${newline}${indent}${markup}` };
}

/** Takes what the page gives `slotName` out of the instance, each element with its own lines. */
export function fillRemoveEdits(source: string, instance: Instance, slotName: string): RangeEdit[] {
  return (instance.fills.get(slotName) ?? []).map((node) => {
    if (node.type === "element") return { ...wholeLines(source, node), text: "" };
    // Text: just its non-blank stretch.
    const raw = source.slice(node.start, node.end);
    const lead = raw.length - raw.trimStart().length;
    return { start: node.start + lead, end: node.start + raw.trimEnd().length, text: "" };
  }).sort((a, b) => a.start - b.start);
}

/**
 * The edit that makes `slot` read `text` on `instance`: the changed stretch
 * of the page's own text element, or, when the page does not fill the slot
 * yet, a copy of the fallback with the new text put in. An error says why
 * when the page's content is not one line of text.
 */
export function slotTextEdit(source: string, template: string, instance: Instance, slot: TemplateSlot, text: string): RangeEdit | { error: string } {
  const fill = instance.fills.get(slot.name);
  if (!fill?.length) {
    const slots = templateSlots(template);
    const edit = fillInsertEdit(source, instance, slots, slot.name, fillMarkup(template, slot, text));
    return edit ?? { error: "The instance's end tag could not be found in the source." };
  }
  const value = slotValue(source, template, instance, slot);
  if (!value.editable) return { error: "This slot holds more than a line of text. Select it in the preview to edit it." };
  const only = value.element;
  const from = only ? only.tag.end : fill[0].start;
  const to = only ? only.close!.start : fill.at(-1)!.end;
  if (value.breaks) {
    // Typed line breaks are the element's `<br>`s; everything else stays text.
    if (breakText(source.slice(from, to)) === text) return { start: from, end: from, text: "" };
    const edit = breakTextEdit(source, from, to, text);
    return edit ?? { error: "That change could not be placed in the source. Change text within one formatting at a time." };
  }
  text = text.replace(/\r\n|[\r\n]/g, " ");
  if (plainText(source.slice(from, to)) === text) return { start: from, end: from, text: "" };
  const edit = textChangeEdit(source, from, to, text);
  return edit ?? { error: "That change could not be placed in the source. Change text within one formatting at a time." };
}

/** Sets (or, with `undefined`, removes) an attribute on the start tag at `tag`; `true` writes it bare (`data-featured`). */
export function attributeEdit(source: string, tag: StartTag, name: string, value: string | true | undefined): RangeEdit {
  const current = startTagAttribute(source, tag, name);
  // The whole attribute is written again, double-quoted and escaped, so a
  // value with a quote or a space never spills into another attribute.
  const text = value === undefined ? "" : value === true ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`;
  if (current) return { start: current.start, end: current.end, text };
  if (value === undefined) return { start: tag.end, end: tag.end, text: "" };
  let at = source[tag.end - 2] === "/" ? tag.end - 2 : tag.end - 1;
  while (at > tag.nameEnd && /[\t\n\f\r ]/.test(source[at - 1])) at--;
  return { start: at, end: at, text };
}

/** Why `name` cannot be an attribute name, or nothing. */
export function attributeNameProblem(name: string) {
  if (!name) return "Type a name.";
  if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(name)) return "Names are letters, digits and - _ : . (starting with a letter).";
  if (/^on/i.test(name)) return "Event handlers do not run in the editor's preview.";
  return undefined;
}

// ---- Where a component is used. ----

export interface ComponentUsage {
  /** Instances shown across the site's pages, counting those inside other components. */
  instances: number;
  pages: { file: string; route: string; count: number }[];
  /** Components whose template uses this one. */
  components: { tag: string; count: number }[];
}

// Elements named `tag` as parsed: comments and raw text (a script's string,
// a textarea's content) are not elements.
function tagCount(html: string, tag: string) {
  if (!asciiLower(html).includes(`<${tag}`)) return 0;
  let count = 0;
  for (const el of descendants(parseSource(html))) if (el.name === tag) count++;
  return count;
}

/**
 * Where `tag` shows: per page, the instances in its markup plus those in the
 * components it uses (a note inside each of three cards counts three times),
 * and which components' templates use it. `body` gives the part of a page
 * file the browser shows.
 */
export function componentUsage(
  site: { routes: Record<string, string>; components: Record<string, string> },
  sources: Record<string, string>,
  tag: string,
  body: (html: string) => string = (html) => html,
): ComponentUsage {
  const memo = new Map<string, number>();
  // Instances of `tag` that one instance of `name` shows.
  const inside = (name: string, visiting: Set<string>): number => {
    if (memo.has(name)) return memo.get(name)!;
    if (visiting.has(name)) return 0;
    visiting.add(name);
    const total = shows(sources[site.components[name] ?? ""] ?? "", visiting);
    visiting.delete(name);
    memo.set(name, total);
    return total;
  };
  const shows = (html: string, visiting: Set<string>): number => {
    let total = tagCount(html, tag);
    for (const name of Object.keys(site.components)) {
      if (name === tag) continue;
      const count = tagCount(html, name);
      if (count) total += count * inside(name, visiting);
    }
    return total;
  };
  const pages = Object.entries(site.routes)
    .map(([route, file]) => ({ file, route, count: shows(body(sources[file] ?? ""), new Set([tag])) }))
    .filter((page) => page.count > 0)
    .sort((a, b) => a.route.localeCompare(b.route));
  const components = Object.entries(site.components)
    .filter(([name]) => name !== tag)
    .map(([name, file]) => ({ tag: name, count: tagCount(sources[file] ?? "", tag) }))
    .filter((entry) => entry.count > 0);
  return { instances: pages.reduce((sum, page) => sum + page.count, 0), pages, components };
}

/** "3 instances on 2 pages", "1 instance on 1 page", "not on any page". */
export function usageSummary(usage: ComponentUsage) {
  if (!usage.instances) return "not used on any page yet";
  const instances = `${usage.instances} instance${usage.instances === 1 ? "" : "s"}`;
  const pages = `${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"}`;
  return `${instances} on ${pages}`;
}

// ---- Detach: the instance replaced by what it shows. ----

export interface DetachResult {
  markup: string;
  /** Attributes of the instance tag that had nowhere to go (a template with several top-level elements). */
  dropped: string[];
}

/** `text`'s lines after the first, moved from their own indentation to `indent`. */
function reindent(text: string, indent: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return text;
  const rest = lines.slice(1).filter((line) => line.trim());
  const common = rest.reduce((min, line) => Math.min(min, /^[ \t]*/.exec(line)![0].length), Infinity);
  const cut = Number.isFinite(common) ? common : 0;
  return [lines[0], ...lines.slice(1).map((line) => (line.trim() ? indent + line.slice(cut) : ""))].join("\n");
}

const REMOVED = "\u0000";
// Elements that hold a line of text only, and blocks that cannot stand in one.
const PHRASING_PARENTS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "a", "button", "label", "em", "strong", "b", "i", "small", "summary", "legend", "caption", "dt"]);
const BLOCKS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "blockquote", "ul", "ol", "figure"]);

/**
 * What the instance shows, written out as plain markup for its place in the
 * page (Figma's detach): the template with each slot replaced by what the
 * page gives it (a bare `<span slot>` reduced to its text) or by its
 * fallback, parts the template hides on this instance left out.
 * The instance tag's attributes go onto the template's
 * one top-level element (its classes added to the element's). Components
 * the template uses stay components. Lines are indented for the place of
 * the instance.
 */
export function detachMarkup(source: string, template: string, instance: Instance): DetachResult {
  const tree = parseSource(template);
  const filled = new Set(instance.fills.keys());
  const { hidden } = shownSlots(template, filled, instance.children.length > 0);
  const roots = meaningful(template, tree);
  const root = roots.length === 1 && roots[0].type === "element" ? roots[0] : undefined;
  const hostAttributes = instance.attributes.filter((item) => item.name !== "data-key");
  const dropped = root ? [] : hostAttributes.map((item) => item.name);

  const lineIndent = (at: number) => indentOf(template, at);
  // A fill as written in the page: its slot attribute passed on (or taken
  // off), a bare `<span slot>` reduced to its content, its lines re-indented
  // for the template line it lands on.
  const fillText = (node: SourceNode, forward: string | undefined, slot: SourceElement) => {
    let text = source.slice(node.start, node.end);
    if (node.type === "text") return forward ? `<span slot="${escapeAttribute(forward)}">${text}</span>` : text;
    const attributes = startTagAttributes(source, node.tag).filter((item) => item.name !== "slot" && item.name !== "data-key");
    // A plain wrapper that only carried the slot goes: a `<span slot>`, or
    // a block (`<p slot>`) slotted into a line of text, where it could not stand.
    const phrasing = slot.parent && PHRASING_PARENTS.has(slot.parent.name);
    if (!attributes.length && node.close && !forward && (node.name === "span" || (phrasing && BLOCKS.has(node.name) && textOnly(node.children))))
      text = source.slice(node.tag.end, node.close.start);
    else text = withSlot(text, forward);
    const inPre = (element: SourceElement | undefined): boolean => Boolean(element && (element.name === "pre" || inPre(element.parent)));
    const holdsPre = [...descendants([node])].some((element) => element.name === "pre");
    return inPre(slot.parent) || holdsPre ? text : reindent(text, lineIndent(slot.start));
  };
  const emit = (nodes: SourceNode[], forward?: string): string => nodes.map((node) => {
    if (node.type === "text") return template.slice(node.start, node.end);
    if (hidden(node)) return REMOVED;
    if (node.name === "slot") {
      const name = (attribute(template, node, "name") ?? "").trim();
      const pass = attribute(template, node, "slot") ?? forward;
      const fill = instance.fills.get(name);
      if (fill?.length) {
        // The page's own spacing: text as written, the white space between
        // neighbouring fills and the slot boundary spaces kept, nothing added.
        let out = "";
        fill.forEach((part, index) => {
          const before = index ? source.slice(fill[index - 1].end, part.start) : "";
          if (index && !name) {
            // Other named fills are not in this slot, but the text and comments
            // around them are still assigned to the unnamed slot.
            let gap = before;
            for (const element of elements(parseSource(before)).reverse())
              gap = gap.slice(0, element.start) + gap.slice(element.end);
            out += gap;
          }
          out += fillText(part, pass, node);
        });
        return out;
      }
      if (!meaningful(template, node.children).length) return REMOVED;
      return pass ? emit(node.children, pass) : emit(node.children);
    }
    let open = template.slice(node.tag.start, node.tag.end);
    const local = () => elements(parseSource(open))[0].tag;
    if (forward) open = withSlot(open, forward);
    if (node === root) {
      for (const item of hostAttributes) {
        if (item.name === "class") {
          // Keep the source tokens, including all named and numeric references.
          // Decoding a small entity subset then escaping would corrupt the rest.
          const own = startTagAttribute(open, local(), "class")?.value.split(/\s+/).filter(Boolean) ?? [];
          const host = startTagAttribute(source, instance.range.tag, "class")?.value.split(/\s+/).filter(Boolean) ?? [];
          const value = [...own, ...host.filter((word) => !own.includes(word))].join(" ");
          const edit = attributeEdit(open, local(), "class", "");
          edit.text = ` class="${value.replace(/"/g, "&quot;")}"`;
          open = open.slice(0, edit.start) + edit.text + open.slice(edit.end);
          continue;
        }
        // Any other attribute moves as the page wrote it (its quotes and character references kept).
        const gone = attributeEdit(open, local(), item.name, undefined);
        open = open.slice(0, gone.start) + gone.text + open.slice(gone.end);
        const at = open.endsWith("/>") ? open.length - 2 : open.length - 1;
        const written = source.slice(item.start, item.end).replace(/^\s+/, " ");
        open = open.slice(0, at).replace(/\s+$/, "") + written + open.slice(at);
      }
    }
    const inner = node.close ? emit(node.children) : "";
    return open + inner + (node.close ? template.slice(node.close.start, node.close.end) : "");
  }).join("");

  let markup = emit(tree)
    // Lines that held only a part left out go with it.
    .split("\n").filter((line) => !(line.includes(REMOVED) && !line.replaceAll(REMOVED, "").trim())).join("\n")
    .replaceAll(REMOVED, "");
  markup = markup.replace(/^\s*\n/, "").trimEnd();
  // Template lines start at the margin; the page's start at the instance's indentation.
  const indent = indentOf(source, instance.range.start);
  const newline = lineEnding(source);
  const preContents = [...descendants(parseSource(markup))].filter((element) => element.name === "pre")
    .map((element) => ({ start: element.tag.end, end: element.close?.start ?? element.end }));
  let offset = 0;
  markup = markup.split(/\r?\n/).map((line, index) => {
    const inPre = preContents.some((range) => offset >= range.start && offset <= range.end);
    offset += line.length + (markup.slice(offset + line.length, offset + line.length + 2) === "\r\n" ? 2 : 1);
    return index && line.trim() && !inPre ? indent + line : line;
  }).join(newline).trim();
  return { markup, dropped };
}

// ---- Make component: an element of the page becomes a component. ----

const RESERVED = new Set(["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"]);

/** Why `name` cannot be a new component's tag, or nothing. */
export function tagNameProblem(name: string, taken: Iterable<string>) {
  if (!name) return "Type a name with a dash, such as section-intro.";
  if (!/^[a-z]/.test(name)) return "A component's name starts with a lowercase letter.";
  if (!name.includes("-")) return "A component's name has a dash in it, such as section-intro.";
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(name)) return "Use lowercase letters, digits and single dashes between words.";
  if (RESERVED.has(name)) return `${name} is reserved by HTML.`;
  if ([...taken].includes(name)) return `There is a component <${name}> already.`;
  return undefined;
}

/** The containers Make component accepts, also named in agent refusals. */
export const makeComponentContainers = "section, div, article, aside, figure, nav, or header/footer inside article, aside, main, nav or section";

/**
 * Whether Make component is offered for the page container at the end of
 * `chain` (lowercase tag names from the file's root element down): section,
 * div, article, aside, figure, nav, or a header/footer inside article, aside,
 * main, nav or section. Refuses document elements, head content, the page's
 * own header/footer, components and anything inside an instance.
 */
export function makeComponentOffered(chain: readonly string[]): boolean {
  const tag = chain.at(-1);
  if (!tag || chain.includes("head") || chain.some((name) => name.includes("-"))) return false;
  // The page's header and footer (HTML-AAM banner and contentinfo): not inside sectioning content or <main>.
  if (tag === "header" || tag === "footer") {
    return chain.slice(0, -1).some((name) => ["article", "aside", "main", "nav", "section"].includes(name));
  }
  return ["section", "div", "article", "aside", "figure", "nav"].includes(tag);
}

const slug = (text: string, words = 3) => text.toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, words).join("-");

/** A part of the element that the plan makes a slot, or would but is kept fixed. */
export interface PlannedSlot {
  /** The part's element-child index path inside the element (`[]`: the element itself). */
  path: number[];
  /** "" for the unnamed slot. */
  name: string;
  /** Read from the part itself, the slot's fallback. */
  kind: SlotKind;
  /** Its text, or an image's alt text (else its address). */
  text: string;
  /** Picked by the default editables rule; false for a part made a slot by hand. */
  byDefault: boolean;
  /** Kept fixed in the template: not a slot, though it keeps the name it would have. */
  fixed: boolean;
  /**
   * A repeated group, the items slot: each item's path, the first being
   * `path`. The items move to the page as they are; `text` is the first's.
   */
  items?: number[][];
}

export interface MakeComponentPlan {
  /** components/<tag>/<tag>.html */
  template: string;
  /** components/<tag>/<tag>.css: the host made a block (and positioned, for a card's stretched title link). */
  css: string;
  /** What replaces the element in the page. */
  instance: string;
  slots: PlannedSlot[];
  /** What the making mode tells about the plan (a link-wrapped card that stays clickable through its title). */
  notes: string[];
  /** The card components made from repeated plain items, one per items slot, in source order. */
  cards: PlannedCard[];
}

/**
 * A repeated item made a card component: its files, and the items that
 * became its instances on the page (those written alike; the others stay as
 * they are). The items slot's fallback in the new template is one empty
 * instance of it.
 */
export interface PlannedCard {
  tag: string;
  /** The items slot it was made from ("" for the unnamed slot). */
  slot: string;
  /** components/<tag>/<tag>.html, from the first of its items. */
  template: string;
  css: string;
  /** The card's own slots, as planned for the first of its items. */
  slots: PlannedSlot[];
  notes: string[];
  /** The paths (as in `PlannedSlot`) of the items that became instances. */
  instances: number[][];
}

/** Resolve the agent's fixed slot names against the unchanged default plan. */
export function fixedSlotPaths(slots: readonly PlannedSlot[], names: readonly string[]): { fixed: number[][] } | { error: string } {
  const unknown = names.filter((name) => !slots.some((slot) => slot.name === name));
  if (unknown.length) return { error: `Unknown fixed slot: ${unknown.map((name) => name || "(unnamed)").join(", ")}. Slots in this plan: ${slots.map((slot) => slot.name || "(unnamed)").join(", ") || "(none)"}.` };
  return { fixed: slots.filter((slot) => names.includes(slot.name)).map((slot) => slot.path) };
}

/** The making mode's choices, each part named by its path inside the element (as in `PlannedSlot`). */
export interface SlotChoices {
  /** Parts to keep fixed in the template. */
  fixed?: ReadonlyArray<readonly number[]>;
  /** Parts made slots by hand: the whole element, whatever it is. */
  slots?: ReadonlyArray<readonly number[]>;
  /** New names for planned slots. */
  names?: ReadonlyArray<{ path: readonly number[]; name: string }>;
}

// Parts that stay in the template unless made slots by hand: icons, scripts, media and form controls.
const FIXED_PARTS = new Set(["svg", "script", "style", "template", "noscript", "iframe", "video", "audio", "canvas", "input", "select", "textarea", "br", "hr"]);
// Parts that only work as their parent's own child (a table's cells, a details' summary), so never a whole slot.
const IN_PLACE = new Set(["td", "th", "tr", "thead", "tbody", "tfoot", "caption", "colgroup", "col", "summary", "legend", "option", "optgroup"]);

/**
 * The role a slot of `kind` is named after: a heading is the "title", a list the "list", any link
 * the "link", a nested instance its tag without the kind of component it is (`card-note` → "note").
 */
const LISTS = new Set(["ul", "ol"]);
const roleName = (el: SourceElement, kind: SlotKind) =>
  (el.name.includes("-") ? el.name.replace(/^(?:section|card|block|site)-(?=.)/, "")
    : el.name === "a" ? "link"
      : kind === "text" && /^h[1-6]$/.test(el.name) ? "title" : LISTS.has(el.name) ? "list" : kind);

/**
 * What the slot chip says of a part of a template (ticket 14 §4): the slot it
 * is or sits in, `items` with how many items its fallback holds for an items
 * slot; else `fixed` with the name the part would get as a slot.
 */
export type SlotChipState =
  | { state: "slot"; name: string; slot: number[] }
  | { state: "items"; name: string; slot: number[]; count: number }
  | { state: "fixed"; name: string; part: number[] };

export type SlotChangeInput = { node: readonly number[]; chip: SlotChipState } &
  ({ action: "toggle" } | { action: "rename"; name: string });
export type SlotChange =
  | { kind: "made-slot"; name: string; part: number[] }
  | { kind: "made-fixed"; name: string }
  | { kind: "renamed"; from: string; to: string };

/** One template change; page rewrites can join its operation's edits map. */
export function slotChange(template: string, input: SlotChangeInput, templateOf: TemplateOf = () => undefined):
  { source: string; change: SlotChange; select: number[] } | { error: string } {
  const current = slotChipState(template, input.node, templateOf);
  const path = (chip: SlotChipState) => chip.state === "fixed" ? chip.part : chip.slot;
  // Items can show the page's count; their identity is the slot, not that count. A fixed
  // part's name is the one it would get: the editor may offer the name it had.
  if (!current || current.state !== input.chip.state || (current.state !== "fixed" && current.name !== input.chip.name)
    || JSON.stringify(path(current)) !== JSON.stringify(path(input.chip)))
    return { error: "The part changed; select it again before changing its slot." };
  let nodes = parseSource(template);
  let element: SourceElement | undefined;
  const at = path(current);
  for (const index of at) { element = elements(nodes)[index]; nodes = element?.children ?? []; }
  if (!element) return { error: "The part is no longer there." };
  const apply = (edit: RangeEdit, change: SlotChange, select: number[]) => ({
    source: template.slice(0, edit.start) + edit.text + template.slice(edit.end), change, select,
  });
  if (input.action === "rename") {
    if (current.state === "fixed") return { error: "Make this part a slot before renaming it." };
    if (input.name === current.name) return { error: "The slot already has that name." };
    if (templateSlots(template).some(slot => slot.name === input.name)) return { error: `Slot “${input.name}” already exists in this component.` };
    return apply(attributeEdit(template, element.tag, "name", input.name),
      { kind: "renamed", from: current.name, to: input.name }, [...input.node]);
  }
  const indent = indentOf(template, element.start), eol = lineEnding(template);
  if (input.chip.state === "fixed") {
    const name = input.chip.name;
    if (!name || templateSlots(template).some(slot => slot.name === name)) return { error: `Slot “${name}” already exists in this component.` };
    const part = template.slice(element.start, element.end);
    const open = `<slot name="${escapeAttribute(name)}">`;
    // A part over several lines goes inside on its own lines, one step in (text that keeps its spaces stays as it is).
    const text = part.includes("\n") && !KEEPS_SPACES.test(part)
      ? `${open}${eol}${indent}  ${part.split(/\r?\n/).map((line, at) => (at && line.trim() ? `  ${line}` : line.trim() ? line : "")).join(eol)}${eol}${indent}</slot>`
      : `${open}${part}</slot>`;
    return apply({ start: element.start, end: element.end, text },
      { kind: "made-slot", name, part: [...at] }, [...at, 0]);
  }
  if (!element.close) return { error: "The slot has no closing tag; fix its source first." };
  const tail = input.node.slice(at.length);
  const select = tail.length ? [...at.slice(0, -1), at.at(-1)! + tail[0], ...tail.slice(1)]
    : elements(element.children).length ? [...at] : at.slice(0, -1);
  return apply({ start: element.start, end: element.end, text: unwrapped(template.slice(element.tag.end, element.close.start), indent, eol) },
    { kind: "made-fixed", name: current.name }, select);
}

const KEEPS_SPACES = /<(?:pre|textarea|listing|xmp|plaintext)[\s>]/i;

/** A slot's children where the slot was: on their own lines inside it, they move out to its indentation. */
function unwrapped(inner: string, indent: string, eol: string) {
  if (KEEPS_SPACES.test(inner)) return inner;
  const lines = /^[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*$/.exec(inner)?.[1].split(/\r?\n/);
  if (!lines) return inner;
  const cut = Math.min(...lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)![0].length));
  return lines.map((line, at) => (!line.trim() ? "" : at ? indent + line.slice(cut) : line.slice(cut))).join(eol);
}

/**
 * The slot chip of the template's part at `path` (element-child indexes, as
 * the preview selects them): its nearest `<slot>`, itself included; else, for
 * a part that could be a slot, fixed under its role name (`title`, `text`,
 * `image`, a nested instance's tag without its kind…), numbered past the
 * template's own slot names. None for the root, a part holding slots, a part
 * of a nested instance, or one that only works in place (a table cell, a
 * summary).
 */
export function slotChipState(template: string, path: readonly number[], templateOf: TemplateOf = () => undefined): SlotChipState | undefined {
  const chain: SourceElement[] = [];
  let nodes = parseSource(template);
  for (const index of path) {
    const next = elements(nodes)[index];
    if (!next) return undefined;
    chain.push(next);
    nodes = next.children;
  }
  const part = chain.at(-1);
  if (!part) return undefined;
  let at = chain.length - 1;
  while (at >= 0 && chain[at].name !== "slot") at--;
  if (at >= 0) {
    const slot = chain[at];
    const name = (attribute(template, slot, "name") ?? "").trim();
    const where = path.slice(0, at + 1);
    return !name || cardsOnly(template, slot.children, templateOf)
      ? { state: "items", name, slot: where, count: elements(slot.children).length }
      : { state: "slot", name, slot: where };
  }
  if (chain.length < 2 || IN_PLACE.has(part.name) || chain.slice(0, -1).some((el) => el.name.includes("-"))
    || [...descendants(part.children)].some((el) => el.name === "slot")) return undefined;
  const taken = new Set(templateSlots(template).map((slot) => slot.name));
  const role = roleName(part, contentKind(template, [part]) ?? "content");
  let name = role;
  for (let count = 2; taken.has(name); count++) name = `${role}-${count}`;
  return { state: "fixed", name, part: [...path] };
}

// The attributes that make an `<a>` a link: on a link-wrapped card they move to its title.
const LINK_ATTRIBUTES = new Set(["href", "target", "rel", "download", "hreflang", "type", "ping", "referrerpolicy"]);

/**
 * A link-wrapped card (`<a class="card" href>…</a>`) with its wrapping link
 * gone: the card is an `<article>` with the link's other attributes, and
 * `title`, a line of text inside it, holds the link around its text, so a
 * page's title slot carries the address.
 */
function withLinkInTitle(html: string, card: SourceElement, title: SourceElement) {
  const attributes = startTagAttributes(html, card.tag);
  const written = (link: boolean) => attributes.filter(({ name }) => LINK_ATTRIBUTES.has(name) === link).map(({ start, end }) => html.slice(start, end)).join("");
  const opened = title.tag.end, closed = title.close?.start ?? opened;
  return `<article${written(false)}${html.slice(attributes.at(-1)?.end ?? card.tag.nameEnd, card.tag.end)}${html.slice(card.tag.end, opened)}`
    + `<a${written(true)}>${html.slice(opened, closed)}</a>${html.slice(closed, card.close?.start)}</article>${card.close ? html.slice(card.close.end) : ""}`;
}

/** A part's own class as a slot name (`lead`, `card__title` → `title`), to tell parts of one role apart. */
function className(html: string, el: SourceElement) {
  const word = (attribute(html, el, "class") ?? "").split(/\s+/).find((token) => /^[a-z][\w-]*$/i.test(token));
  return word ? slug(word.split("__").pop()!, 3) || undefined : undefined;
}

/** The element at `start` in `source` and the elements it sits in, outermost first. */
function ancestry(source: string, start: number): SourceElement[] {
  const chain: SourceElement[] = [];
  let nodes = parseSource(source);
  for (;;) {
    const holder = elements(nodes).find((el) => el.start <= start && start < el.end);
    if (!holder) return chain;
    chain.push(holder);
    if (holder.start === start) return chain;
    nodes = holder.children;
  }
}

/**
 * The element at `range` in `source` as a new component `tag`, by the
 * default editables rule: each text element (rich inline content kept),
 * image, picture and standalone link becomes a slot wrapping the whole
 * element (`<slot name="title"><h2>…</h2></slot>`), filled on the page by its
 * copy (`<h2 slot="title">…</h2>`), so the page shows what it showed and its
 * addresses and alt texts stay the page's. Icons (`svg`), scripts and media
 * stay fixed. A single line of text fills the unnamed slot. A `<ul>`/`<ol>`
 * is one slot, `list`. Two or more consecutive siblings of one item kind (a
 * custom element's tag, else the same tag and first class: cards) are a
 * repeated group, the items slot: an empty slot where they were, the items
 * moved to the page as they are; the first group is the unnamed slot, later
 * ones `items-2`, `items-3`. Slots are named by role (`title`, `text`,
 * `image`, `link`, `list`), numbered on repeats; a part's class tells parts
 * of one role apart. `choices` keeps parts fixed, makes
 * other parts slots and renames slots. An `id` moves to the instance tag,
 * where links to it still find it.
 *
 * A group of plain items with a heading (`<article class="card">`) also
 * becomes a card component (`cardTagFor`, free of `taken`): the items written
 * alike become its instances, each keeping its own content in its slots,
 * and the items slot's fallback is one empty instance of it. A group of card
 * instances keeps its items as they are, with one empty instance of theirs
 * as the fallback.
 */
export function makeComponentPlan(source: string, range: InstanceRange, tag: string, choices: SlotChoices = {}, taken: Iterable<string> = []): MakeComponentPlan | { error: string } {
  return planComponent(source, range, tag, choices, new Set([...taken, tag]));
}

/** `makeComponentPlan`; with no `taken`, a card's own plan, which makes no cards of its own. */
function planComponent(source: string, range: InstanceRange, tag: string, choices: SlotChoices, taken?: Set<string>): MakeComponentPlan | { error: string } {
  if (!range.close) return { error: "The element's end tag could not be found in the source." };
  const written = source.slice(range.start, range.end);
  const element = elements(parseSource(written))[0];
  if (!element?.close) return { error: "The element's end tag could not be found in the source." };
  if (element.name.includes("-")) return { error: "This is a component already." };
  if (["main", "body", "html", "head"].includes(element.name)) return { error: `A <${element.name}> cannot be a component.` };
  const host = ancestry(source, range.start).slice(0, -1).find((el) => el.name.includes("-"));
  if (host) return { error: `This is inside the component instance <${host.name}>; edit the component instead.` };
  if ([...descendants([element])].some((el) => el.name === "slot")) return { error: "This element holds slots of a component; make the component from the page instead." };

  // The id goes to the instance, where links to it still find it; the template and any copy of the element keep the rest.
  const id = startTagAttribute(written, element.tag, "id");
  const unkeyed = id ? written.slice(0, id.start) + written.slice(id.end) : written;
  let html = unkeyed;
  let root = elements(parseSource(html))[0];
  if (!root?.close) return { error: "The element's end tag could not be found in the source." };

  const key = (path: readonly number[]) => path.join(".");
  // A link-wrapped card's title, once found, gains the link as its one child: the paths inside it gain a step
  // (`inPlan`) for the walk, and lose it again (`inElement`) in the plan's slots.
  let card: { title: number[] } | undefined;
  const under = (path: readonly number[], depth: number) => Boolean(card && path.length > depth && card.title.every((step, index) => path[index] === step));
  const inPlan = (path: readonly number[]) => (card && under(path, card.title.length) ? [...card.title, 0, ...path.slice(card.title.length)] : [...path]);
  const inElement = (path: number[]) => (card && under(path, card.title.length + 1) ? [...card.title, ...path.slice(card.title.length + 1)] : path);
  const fixed = new Set<string>();
  const forced = new Set<string>();
  const choose = () => {
    fixed.clear();
    forced.clear();
    for (const path of choices.fixed ?? []) fixed.add(key(inPlan(path)));
    for (const path of choices.slots ?? []) forced.add(key(inPlan(path)));
  };
  choose();
  const forcedInside = (path: number[]) => [...forced].some((other) => !path.length ? other !== "" : other.startsWith(`${key(path)}.`));
  // `whole`: the element itself made a named slot, whole (a link wrapper with no title).
  interface Part { el: SourceElement; path: number[]; kind: SlotKind; byDefault: boolean; whole?: boolean; items?: { el: SourceElement; path: number[] }[] }
  const parts: Part[] = [];
  const kindOf = (el: SourceElement) => contentKind(html, [el]) ?? "content";
  const isText = (el: SourceElement) => Boolean(TEXT_BLOCKS.has(el.name) && el.close && textOnly(el.children) && plainText(html.slice(el.tag.end, el.close.start)));
  const isLink = (el: SourceElement) => Boolean(el.name === "a" && el.close && textOnly(el.children));
  // What a would-be item is (`itemKind`: a custom element's tag, else its tag and first class); none for a
  // part that is a slot of its own (a line of text, a standalone link), except a list's items.
  const itemOf = (el: SourceElement) => (el.name === "li" || !(isText(el) || isLink(el)) ? itemKind(el.name, (attribute(html, el, "class") ?? "").trim().split(/\s+/)[0]) : undefined);
  /** Runs of two or more consecutive siblings of one item kind, nothing but white space and comments between them. */
  const runs = (children: SourceElement[]) => {
    const found: number[][] = [];
    let run: number[] = [];
    children.forEach((child, index) => {
      const kind = itemOf(child);
      const before = children[index - 1];
      if (kind && run.length && itemOf(children[run[0]]) === kind && !html.slice(before.end, child.start).replace(/<!--[\s\S]*?-->/g, "").trim()) run.push(index);
      else {
        if (run.length > 1) found.push(run);
        run = kind ? [index] : [];
      }
    });
    if (run.length > 1) found.push(run);
    return found;
  };
  // `onlyForced`: inside a part kept fixed, where only the parts made slots by hand count.
  const visit = (el: SourceElement, path: number[], inText: boolean, onlyForced = false) => {
    const children = elements(el.children);
    const groups = onlyForced ? [] : runs(children);
    const grouped = new Set(groups.flat());
    children.forEach((child, index) => {
      const at = [...path, index];
      const group = groups.find((run) => run[0] === index);
      if (group) {
        // A repeated group: the items slot, its items moved to the page as they are.
        const items = group.map((member) => ({ el: children[member], path: [...path, member] }));
        parts.push({ el: child, path: at, kind: "content", byDefault: true, items });
        // Kept fixed, the items stay in the template: the later ones can still be made slots by hand, whole or inside.
        if (fixed.has(key(at))) for (const item of items) {
          if (key(item.path) !== key(at) && forced.has(key(item.path))) parts.push({ el: item.el, path: item.path, kind: kindOf(item.el), byDefault: false });
          else if (forcedInside(item.path) && !item.el.name.includes("-")) visit(item.el, item.path, false, true);
        }
        return;
      }
      if (grouped.has(index)) return;
      // Whole slots: a nested instance, so each page owns it and its own slots; a link wrapping more than text
      // (an image, a card), so each page owns the address.
      const whole = child.name.includes("-") || (child.name === "a" && !textOnly(child.children));
      const byDefault = Boolean(!onlyForced && !FIXED_PARTS.has(child.name) && !IN_PLACE.has(child.name)
        && (whole || child.name === "img" || child.name === "picture" || LISTS.has(child.name) || (!inText && isLink(child)) || isText(child)));
      if (byDefault || (forced.has(key(at)) && !IN_PLACE.has(child.name))) {
        parts.push({ el: child, path: at, kind: kindOf(child), byDefault });
        // A part kept fixed is walked into only for a part made a slot inside it; an instance's content is its own.
        if (!fixed.has(key(at)) || !forcedInside(at) || child.name === "picture" || child.name.includes("-")) return;
        visit(child, at, inText || TEXT_BLOCKS.has(child.name), true);
        return;
      } else if (child.name.includes("-") || FIXED_PARTS.has(child.name)) return;
      visit(child, at, inText || TEXT_BLOCKS.has(child.name), onlyForced);
    });
  };
  // A link-wrapped card's title: the line of text that carries its link.
  if (root.name === "a" && !textOnly(root.children)) {
    // The title is the first heading the rule makes a slot, else the first line of text it does.
    visit(root, [], false);
    const lines = parts.filter((part) => part.byDefault && !part.items && part.kind === "text" && TEXT_BLOCKS.has(part.el.name));
    const title = lines.find(({ el }) => /^h[1-6]$/.test(el.name)) ?? lines[0];
    parts.length = 0;
    if (title) {
      html = withLinkInTitle(html, root, title.el);
      root = elements(parseSource(html))[0];
      card = { title: title.path };
      choose();
      visit(root, [], false);
    } else {
      // A link wrapper with no line of text to carry the link: one whole slot.
      parts.push({ el: root, path: [], kind: kindOf(root), byDefault: true, whole: true });
      if (fixed.has("") && forcedInside([])) visit(root, [], false, true);
    }
  } else if (isText(root) || (isLink(root) && plainText(html.slice(root.tag.end, root.close.start)))) {
    // A single line of text (or a link's): it fills the unnamed slot, inside the element.
    parts.push({ el: root, path: [], kind: "text", byDefault: true });
    if (fixed.has("") && forcedInside([])) visit(root, [], true, true);
  } else if (root.name !== "picture") visit(root, [], false);

  // Names: by role; a tie between parts of one role is broken by each part's own class, else numbered.
  const names = new Map<Part, string>();
  for (const part of parts) if (!part.path.length && !part.whole) names.set(part, "");
  // Repeated groups: the first is the unnamed slot, later ones `items-2`, `items-3`.
  parts.filter((part) => part.items).forEach((part, index) => names.set(part, index ? `items-${index + 1}` : ""));
  // A link-wrapped card's title is the "title", even a paragraph, whatever other headings there are: the card
  // link rule stretches that slot's link.
  const isTitle = (part: Part) => Boolean(card && key(part.path) === key(card.title));
  for (const part of parts) if (isTitle(part)) names.set(part, "title");
  const roleOf = (part: Part) => (isTitle(part) ? "title" : roleName(part.el, part.kind));
  const roles = new Map<string, Part[]>();
  for (const part of parts) {
    if (!part.byDefault || names.has(part)) continue;
    const role = roleOf(part);
    roles.set(role, [...(roles.get(role) ?? []), part]);
  }
  for (const [role, group] of roles) {
    const classes = group.map((part) => (group.length > 1 ? className(html, part.el) : undefined));
    let count = 0;
    group.forEach((part, index) => {
      const own = classes[index];
      if (own && classes.filter((other) => other === own).length === 1) names.set(part, own);
      else names.set(part, ++count === 1 ? role : `${role}-${count}`);
    });
  }
  for (const part of parts) if (!names.has(part)) names.set(part, roleOf(part));
  // Renames, for named slots only: the element's own unnamed slot stays unnamed.
  const renames = new Map((choices.names ?? []).map(({ path, name }) => [key(inPlan(path)), name.trim()]));
  const renamed = (part: Part) => Boolean((part.path.length || part.whole) && renames.get(key(part.path)));
  for (const part of parts) if (renamed(part)) names.set(part, renames.get(key(part.path))!);
  // Each name once, in source order: renamed slots first, then a card's title, the others step aside.
  const used = new Set<string>();
  const order = [...parts.filter(renamed), ...parts.filter((part) => !renamed(part) && isTitle(part)), ...parts.filter((part) => !renamed(part) && !isTitle(part))];
  for (const part of order) {
    const name = names.get(part)!;
    let free = name;
    for (let n = 2; free && used.has(free); n++) free = `${name}-${n}`;
    used.add(free);
    names.set(part, free);
  }

  const slots: PlannedSlot[] = parts.map((part) => {
    const el = part.el;
    const text = part.kind === "image"
      ? (() => { const img = el.name === "img" ? el : [...descendants([el])].find((inner) => inner.name === "img"); return img ? attribute(html, img, "alt") || attribute(html, img, "src") || "" : ""; })()
      : el.close ? plainText(html.slice(el.tag.end, el.close.start)) : "";
    return {
      path: inElement(part.path), name: names.get(part)!, kind: part.kind, text, byDefault: part.byDefault, fixed: fixed.has(key(part.path)),
      ...(part.items ? { items: part.items.map((item) => item.path) } : {}),
    };
  });
  const fills: string[] = [];
  const cards: PlannedCard[] = [];
  // Edits to the element's own markup that make the template, back to front.
  const edits: RangeEdit[] = [];
  const indent = indentOf(source, range.start);
  const newline = lineEnding(source);
  parts.forEach((part, index) => {
    const { name, fixed: kept } = slots[index];
    if (kept) return;
    const el = part.el;
    if (!part.path.length && !part.whole) {
      // The element itself: its text fills the unnamed slot.
      const inner = html.slice(el.tag.end, el.close!.start);
      edits.push({ start: el.tag.end, end: el.close!.start, text: `<slot>${inner}</slot>` });
      fills.push(inner);
      return;
    }
    // A repeated group: a slot where the items were, its fallback one empty card; the items, and what was between
    // them, go to the page as written, plain items made cards.
    const items = part.items?.map((item) => item.el) ?? [el];
    const made = part.items && taken ? cardFrom(html, part.items, name, tag, taken) : undefined;
    if (made) {
      cards.push(made.card);
      taken!.add(made.card.tag);
    }
    const end = items[items.length - 1].end;
    let copy = html.slice(el.start, end);
    for (const item of [...items].reverse()) {
      const at = item.start - el.start;
      copy = copy.slice(0, at) + withSlot(made?.markup.get(item) ?? html.slice(item.start, item.end), name) + copy.slice(item.end - el.start);
    }
    const fallback = made?.card.tag ?? (el.name.startsWith("card-") ? el.name : undefined);
    edits.push({
      start: el.start, end,
      text: part.items ? `<slot${name ? ` name="${escapeAttribute(name)}"` : ""}>${fallback ? `<${fallback}></${fallback}>` : ""}</slot>` : `<slot name="${escapeAttribute(name)}">${html.slice(el.start, el.end)}</slot>`,
    });
    // Lines after the first move to the instance's indentation, unless white space is the content's own.
    const verbatim = items.some((item) => [...descendants([item])].some((inner) => inner.name === "pre" || inner.name === "textarea"));
    fills.push(verbatim ? copy : reindent(copy, `${indent}  `).replace(/\n/g, newline));
  });

  let template = html;
  for (const edit of edits.sort((a, b) => b.start - a.start)) template = template.slice(0, edit.start) + edit.text + template.slice(edit.end);
  // The page's indentation off the template's lines.
  template = template.split(/\r?\n/).map((line, index) => (index && line.startsWith(indent) ? line.slice(indent.length) : line)).join("\n").trimEnd() + "\n";

  const open = `<${tag}${id ? ` id="${escapeAttribute(id.value)}"` : ""}>`;
  const instance = !fills.length
    ? `${open}</${tag}>`
    : !parts[0].path.length && !parts[0].whole && !slots[0].fixed
      ? `${open}${fills[0]}</${tag}>`
      : [open, ...fills.map((fill) => `${indent}  ${fill}`), `${indent}</${tag}>`].join(newline);
  // A card's title link stretches over the card by the site's card link rule (`[slot="title"] > a:only-child::after`),
  // bounded by the host: component CSS can't reach a link inside a slotted heading.
  const title = card && slots.find((slot) => key(slot.path) === key(card.title));
  const stretched = Boolean(title && !title.fixed && title.name === "title");
  return {
    template,
    css: `:host {\n  display: block;\n${stretched ? "  position: relative;\n" : ""}}\n`,
    instance,
    slots,
    notes: stretched ? ["The whole card stays clickable through its title link."] : [],
    cards,
  };
}

/** Whether a template has a heading slot (a slot holding a heading, or a heading's only content): a card component's mark. */
export function hasHeadingSlot(template: string) {
  const heading = (el: SourceElement) => /^h[1-6]$/.test(el.name);
  const visit = (nodes: SourceNode[], parent?: SourceElement): boolean => elements(nodes).some((el) => {
    if (el.name !== "slot") return visit(el.children, el);
    const inside = meaningful(template, el.children);
    return (inside.length === 1 && inside[0].type === "element" && heading(inside[0]))
      || Boolean(parent && heading(parent) && meaningful(template, parent.children).length === 1);
  });
  return visit(parseSource(template));
}

/** A word's singular, by the common English endings: `services` → `service`, `stories` → `story`. */
function singular(word: string) {
  if (/(?:ss|us|is|news)$/.test(word)) return word;
  if (/[^aeiou]ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(?:ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  return word.endsWith("s") && word.length > 1 ? word.slice(0, -1) : word;
}

/**
 * The tag of the card component made from an items slot's items: `card-`
 * and the slot's name, its last word singular (`services` → `card-service`);
 * for the unnamed slot (or an `items-2` not renamed), the new component's
 * name (`section-work` → `card-work`). Numbered when taken.
 */
export function cardTagFor(slot: string, tag: string, taken: Iterable<string>) {
  const named = slot && !/^items-\d+$/.test(slot) ? slot : tag.replace(/^(?:section|block|site|card)-(?=.)/, "");
  const words = named.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+|-+$/g, "").replace(/^cards?-(?=.)|-cards?$/g, "").split("-").filter(Boolean);
  if (words.length) words.push(singular(words.pop()!));
  const base = `card-${words.join("-") || "item"}`;
  const used = new Set(taken);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  return name;
}

// Plain elements that can be made cards: not list items, which only work in their list.
const CARD_ITEMS = new Set(["article", "div", "figure", "a", "blockquote"]);

/** A template with each slot's fallback gone: two items written alike have one. */
function skeleton(template: string) {
  const slots = [...descendants(parseSource(template))].filter((el) => el.name === "slot" && el.close);
  let out = template;
  let after = Infinity;
  for (const slot of slots.reverse()) {
    if (slot.end > after) continue;
    out = out.slice(0, slot.tag.end) + out.slice(slot.close!.start);
    after = slot.start;
  }
  return out.replace(/\r\n/g, "\n");
}

/**
 * The card component made from a group of plain items in `html` (the element
 * being made a component): planned from each item, the items with a heading
 * slot written alike (one template once their fallbacks are gone; the
 * largest such set, at least two) become instances, each its own plan's
 * instance. None when the items are instances already or cannot be cards.
 */
function cardFrom(html: string, items: { el: SourceElement; path: number[] }[], slot: string, tag: string, taken: Set<string>) {
  if (!items.every(({ el }) => CARD_ITEMS.has(el.name) && el.close)) return undefined;
  const cardTag = cardTagFor(slot, tag, taken);
  const planned = items.map((item) => ({ item, plan: planComponent(html, { tag: item.el.tag, start: item.el.start, end: item.el.end, close: item.el.close }, cardTag, {}) }));
  const alike = new Map<string, { item: (typeof items)[number]; plan: MakeComponentPlan }[]>();
  for (const { item, plan } of planned) {
    if ("error" in plan || !hasHeadingSlot(plan.template)) continue;
    const key = skeleton(plan.template);
    alike.set(key, [...(alike.get(key) ?? []), { item, plan }]);
  }
  const chosen = [...alike.values()].reduce<{ item: (typeof items)[number]; plan: MakeComponentPlan }[]>((best, set) => (set.length > best.length ? set : best), []);
  if (chosen.length < 2) return undefined;
  const { template, css, slots, notes } = chosen[0].plan;
  return {
    card: { tag: cardTag, slot, template, css, slots, notes, instances: chosen.map(({ item }) => item.path) },
    markup: new Map(chosen.map(({ item, plan }) => [item.el, plan.instance])),
  };
}
