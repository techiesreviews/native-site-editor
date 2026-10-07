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

/** The template's slots in source order, each name once (the first `<slot>` of a name is the one filled). */
export function templateSlots(template: string): TemplateSlot[] {
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

/** Sets (or, with `undefined`, removes) an attribute on the start tag at `tag`. */
export function attributeEdit(source: string, tag: StartTag, name: string, value: string | undefined): RangeEdit {
  const current = startTagAttribute(source, tag, name);
  const escaped = value === undefined ? "" : escapeAttribute(value);
  if (current) {
    // The whole attribute is written again, double-quoted and escaped, so a
    // value with a quote or a space never spills into another attribute.
    return { start: current.start, end: current.end, text: value === undefined ? "" : ` ${name}="${escaped}"` };
  }
  if (value === undefined) return { start: tag.end, end: tag.end, text: "" };
  let at = source[tag.end - 2] === "/" ? tag.end - 2 : tag.end - 1;
  while (at > tag.nameEnd && /[\t\n\f\r ]/.test(source[at - 1])) at--;
  return { start: at, end: at, text: ` ${name}="${escaped}"` };
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

const slug = (text: string, words = 3) => text.toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, words).join("-");

/** A free tag name for the element at `range`: its kind, then its class or heading ("section-hero"). */
export function suggestTagName(source: string, range: InstanceRange, taken: Iterable<string>) {
  const html = source.slice(range.start, range.end);
  const el = elements(parseSource(html))[0];
  const prefix = ({ section: "section", article: "card", header: "site-header", footer: "site-footer", nav: "site-nav", aside: "aside", figure: "figure", form: "form" } as Record<string, string>)[range.tag.name] ?? "block";
  const className = el ? (attribute(html, el, "class") ?? "").split(/\s+/).find((word) => /^[a-z]/i.test(word)) : undefined;
  const heading = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]/i.exec(html)?.[1];
  const words = [className && slug(className.split("__")[0], 2), heading && slug(plainText(heading), 2)].find((word) => word && word !== prefix);
  const base = prefix.includes("-") && !words ? prefix : `${prefix}-${words || "block"}`.replace(/^(site-[a-z]+)-.*$/, "$1");
  const used = new Set(taken);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  return name;
}

export interface MakeComponentPlan {
  /** components/<tag>/<tag>.html */
  template: string;
  /** components/<tag>/<tag>.css: the host made a block, nothing else. */
  css: string;
  /** What replaces the element in the page. */
  instance: string;
  slots: { name: string; kind: SlotKind; text: string }[];
}

/** A slot name for a part, from its class (`lead`, `card__title` → `title`) or its kind. */
function partName(html: string, el: SourceElement) {
  const className = (attribute(html, el, "class") ?? "").split(/\s+/).find((word) => /^[a-z][\w-]*$/i.test(word));
  if (className) {
    const part = className.includes("__") ? className.split("__").pop()! : className;
    const name = slug(part, 3);
    if (name) return name;
  }
  if (/^h[1-6]$/.test(el.name)) return "title";
  if (el.name === "img" || el.name === "picture") return "image";
  if (el.name === "a" || el.name === "button") return "link";
  if (el.name === "p") return "body";
  return "text";
}

/**
 * The element at `range` in `source` as a new component `tag`: its markup
 * becomes the template, where each line of text keeps its element and gets
 * a slot inside it (`<h2><slot name="title">…</slot></h2>`, so the site's
 * styles reach it as before) and each standalone link or image becomes a
 * slot of its own, filled by the page's copy (its address and alt text are
 * the page's to change). The page keeps every text, link and image as the
 * instance's content, so the page shows what it showed. An `id` moves to
 * the instance tag, where links to it still find it. Nothing else changes:
 * the site's stylesheets reach the component's shadow root as they reached
 * the page, so no CSS moves; the component's own stylesheet only makes the
 * new tag a block, as the element was.
 */
export function makeComponentPlan(source: string, range: InstanceRange, tag: string): MakeComponentPlan | { error: string } {
  if (!range.close) return { error: "The element's end tag could not be found in the source." };
  const html = source.slice(range.start, range.end);
  const tree = parseSource(html);
  const root = elements(tree)[0];
  if (!root?.close) return { error: "The element's end tag could not be found in the source." };
  if (root.name.includes("-")) return { error: "This is a component already." };
  if ([...descendants([root])].some((el) => el.name === "slot")) return { error: "This element holds slots of a component; make the component from the page instead." };
  if (["main", "body", "html", "head"].includes(root.name)) return { error: `A <${root.name}> cannot be a component.` };

  const used = new Set<string>();
  const unique = (name: string) => {
    let free = name;
    for (let n = 2; used.has(free); n++) free = `${name}-${n}`;
    used.add(free);
    return free;
  };
  const slots: MakeComponentPlan["slots"] = [];
  const fills: string[] = [];
  // Edits to the element's own markup that make the template, back to front.
  const edits: RangeEdit[] = [];
  const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

  if (TEXT_BLOCKS.has(root.name) && textOnly(root.children) && plainText(html.slice(root.tag.end, root.close.start))) {
    // A single line of text: it fills the unnamed slot.
    const inner = html.slice(root.tag.end, root.close.start);
    edits.push({ start: root.tag.end, end: root.close.start, text: `<slot>${inner}</slot>` });
    fills.push(oneLine(inner));
    slots.push({ name: "", kind: "text", text: plainText(inner) });
  } else {
    const visit = (el: SourceElement, inText: boolean) => {
      for (const child of elements(el.children)) {
        if (child.name.includes("-") || ["script", "style", "template", "svg"].includes(child.name)) continue;
        const text = child.close ? plainText(html.slice(child.tag.end, child.close.start)) : "";
        if (child.name === "img" || (child.name === "a" && !inText && child.close && textOnly(child.children))) {
          const name = unique(partName(html, child));
          const copy = html.slice(child.start, child.end);
          edits.push({ start: child.start, end: child.end, text: `<slot name="${name}">${copy}</slot>` });
          fills.push(withSlot(oneLine(copy), name));
          slots.push({ name, kind: child.name === "img" ? "image" : "link", text: child.name === "img" ? attribute(html, child, "alt") ?? attribute(html, child, "src") ?? "" : text });
          continue;
        }
        if (TEXT_BLOCKS.has(child.name) && child.close && textOnly(child.children) && text) {
          const name = unique(partName(html, child));
          const inner = html.slice(child.tag.end, child.close.start);
          edits.push({ start: child.tag.end, end: child.close.start, text: `<slot name="${name}">${inner}</slot>` });
          fills.push(`<span slot="${name}">${oneLine(inner)}</span>`);
          slots.push({ name, kind: "text", text });
          continue;
        }
        visit(child, inText || TEXT_BLOCKS.has(child.name));
      }
    };
    visit(root, false);
  }

  // The id goes to the instance; the template's root keeps the rest.
  const id = startTagAttribute(html, root.tag, "id");
  if (id) edits.push({ start: id.start, end: id.end, text: "" });
  let template = html;
  for (const edit of edits.sort((a, b) => b.start - a.start)) template = template.slice(0, edit.start) + edit.text + template.slice(edit.end);
  // The page's indentation off the template's lines.
  const indent = indentOf(source, range.start);
  template = template.split(/\r?\n/).map((line, index) => (index && line.startsWith(indent) ? line.slice(indent.length) : line)).join("\n").trimEnd() + "\n";

  const newline = lineEnding(source);
  const open = `<${tag}${id ? ` id="${escapeAttribute(id.value)}"` : ""}>`;
  const instance = !fills.length
    ? `${open}</${tag}>`
    : slots.length === 1 && slots[0].name === ""
      ? `${open}${fills[0]}</${tag}>`
      : [open, ...fills.map((fill) => `${indent}  ${fill}`), `${indent}</${tag}>`].join(newline);
  return { template, css: ":host {\n  display: block;\n}\n", instance, slots };
}
