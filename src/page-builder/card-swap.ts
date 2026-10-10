// Swapping a card's look in place (wayfinder components-and-builder ticket
// 09 §8 and §10): the card becomes another card component, or a variant of
// one, keeping its content by slot role (title, body, image, link, as a page
// fills it, card-fill.ts `cardRoles`; other slots by name). The content is
// read back from the card, so canvas edits carry over; a slot that shows its
// fallback holds nothing. What the new look has no place for is kept aside
// by the caller, never written to the HTML (spec decision 12), and comes
// back on a swap to a look with a place for it. Pure: src/page-builder/cards.ts
// writes the result as one undo step.

import { attributeEdit, descendants, parseSource, plainText, slotLabel, startTagAttributes, templateSlots, type SourceElement, type SourceNode, type TemplateSlot } from "./component-model";
import { cardRoles } from "./card-fill";
import { slotMarkup } from "../native-insert";
import type { CardLook } from "./card-looks";

/** What a card holds, by role; markup as the card wrote it. */
export interface CardContent {
  /** The title's and the body's inner HTML. */
  title?: string;
  body?: string;
  image?: { src: string; alt?: string };
  /** The link's address and its inner HTML (none when it was the title's own link, decision 3). */
  link?: { href: string; html?: string };
  /** Other slots' elements by slot name ("" the unnamed slot's content), one entry per element. */
  other: Record<string, string[]>;
}

export interface CardSwap {
  /** The card in the new look. */
  markup: string;
  /** Everything the card has held so far, what it holds now on top: what to keep aside for the next swap. */
  kept: CardContent;
  /** What the new look shows none of: "image (no image slot)". */
  notShown: string[];
}

interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const elementsOf = (nodes: SourceNode[]) => nodes.filter((node): node is SourceElement => node.type === "element");
const attribute = (html: string, element: SourceElement, name: string) => startTagAttributes(html, element.tag).find((entry) => entry.name === name)?.value;
const inner = (html: string, element: SourceElement) => (element.close ? html.slice(element.tag.end, element.close.start) : "");
const blank = (html: string, node: SourceNode) => node.type === "text" && !/[^\t\n\f\r ]/.test(html.slice(node.start, node.end));
const lower = (text: string) => `${text[0]?.toLowerCase() ?? ""}${text.slice(1)}`;

function applyEdits(html: string, edits: RangeEdit[]) {
  let text = html;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

/** The white space before `at` on its line, when nothing else is. */
function leadOf(html: string, at: number): string | undefined {
  const lead = html.slice(html.lastIndexOf("\n", at - 1) + 1, at);
  return /^[\t ]*$/.test(lead) ? lead : undefined;
}

/** What a piece of markup shows: its text and its images. Equal for a fallback and a copy of it. */
const shows = (html: string) => {
  const images = [...descendants(parseSource(html))].filter((element) => element.name === "img").map((img) => attribute(html, img, "src") ?? "");
  return `${squash(plainText(html))}\n${images.join("\n")}`;
};

/** The element that holds an element's text: its one child element, again and again, while nothing else is in it (not a link). */
function holder(html: string, element: SourceElement): SourceElement {
  let target = element;
  for (let only = elementsOf(target.children); only.length === 1 && only[0].close && only[0].name !== "a" && target.children.every((node) => node === only[0] || blank(html, node)); only = elementsOf(target.children)) target = only[0];
  return target;
}

const find = (element: SourceElement, name: string) => (element.name === name ? element : [...descendants(element.children)].find((child) => child.name === name));

/** What the card `card` (an instance's markup) holds in the slots of its `template`; a slot showing its fallback holds nothing. */
export function readCardContent(card: string, template: string): CardContent {
  const out: CardContent = { other: {} };
  const root = elementsOf(parseSource(card))[0];
  if (!root?.close) return out;
  const slots = templateSlots(template);
  const { roleOf, linkSlot } = cardRoles(slots);
  const fills = new Map<string, SourceNode[]>();
  for (const node of root.children) {
    if (blank(card, node)) continue;
    const name = node.type === "element" ? (attribute(card, node, "slot") ?? "").trim() : "";
    fills.set(name, [...(fills.get(name) ?? []), node]);
  }
  for (const [name, nodes] of fills) {
    const slot = slots.find((entry) => entry.name === name);
    const fallback = slot?.fallback ?? "";
    const role = slot ? roleOf(slot) : "other";
    const element = elementsOf(nodes)[0];
    if (role === "title" && element) {
      let html = inner(card, holder(card, element));
      // A look without a link slot links its title (decision 3): that link is the card's.
      const only = elementsOf(parseSource(html));
      if (!linkSlot && only.length === 1 && only[0].name === "a" && !squash(plainText(html.slice(0, only[0].start) + html.slice(only[0].end)))) {
        const href = attribute(html, only[0], "href");
        if (href) out.link = { href };
        html = inner(html, only[0]);
      }
      if (shows(html) !== shows(fallback)) out.title = html.trim();
    } else if (role === "body" && element) {
      const html = inner(card, holder(card, element));
      if (shows(html) !== shows(fallback)) out.body = html.trim();
    } else if (role === "image" && element) {
      const img = find(element, "img");
      const src = img && attribute(card, img, "src");
      const own = [...descendants(parseSource(fallback))].find((child) => child.name === "img");
      if (img && src && src !== (own && attribute(fallback, own, "src"))) {
        const alt = attribute(card, img, "alt");
        out.image = alt === undefined ? { src } : { src, alt };
      }
    } else if (role === "link" && element) {
      const a = find(element, "a");
      const href = a && attribute(card, a, "href");
      const html = a ? inner(card, a).trim() : "";
      const own = [...descendants(parseSource(fallback))].find((child) => child.name === "a");
      if (a && (href || html) && (href !== (own && attribute(fallback, own, "href")) || shows(html) !== shows(fallback))) out.link = { href: href ?? "", html };
    } else {
      const html = nodes.map((node) => card.slice(node.start, node.end));
      if (shows(html.join("\n")) !== shows(fallback)) out.other[name] = html;
    }
  }
  return out;
}

/** `kept` (content from earlier looks) with what the card holds `now` on top. */
export function mergeCardContent(kept: CardContent | undefined, now: CardContent): CardContent {
  const out: CardContent = { ...kept, ...now, other: { ...kept?.other, ...now.other } };
  // The title's own link keeps the text the card's link had for that address.
  if (now.link && now.link.html === undefined && kept?.link?.href === now.link.href && kept.link.html !== undefined) out.link = kept.link;
  return out;
}

/** A slot's element as a fresh card writes it (slotMarkup), else its fallback's one element with `slot` set; undefined when it has neither. */
function slotShape(template: string, slot: TemplateSlot): string | undefined {
  const line = slotMarkup(template).find((markup) => {
    const first = elementsOf(parseSource(markup))[0];
    return first && attribute(markup, first, "slot") === slot.name;
  });
  if (line !== undefined) return line;
  const nodes = parseSource(slot.fallback);
  const [only, ...more] = elementsOf(nodes);
  if (!only || more.length || !nodes.every((node) => node === only || blank(slot.fallback, node))) return undefined;
  const markup = slot.fallback.slice(only.start, only.end);
  const tag = elementsOf(parseSource(markup))[0];
  return applyEdits(markup, [attributeEdit(markup, tag.tag, "slot", slot.name)]);
}

/** `shape` (one element) with `html` in the element that holds its text. */
function withInner(shape: string, html: string): string {
  const element = elementsOf(parseSource(shape))[0];
  const target = element && holder(shape, element);
  return target?.close ? applyEdits(shape, [{ start: target.tag.end, end: target.close.start, text: html }]) : shape;
}

/** The look's attribute on the card's start tag, in the look's tag, the attributes the looks set (`variants`) dropped first. */
function startTag(card: string, root: SourceElement, look: CardLook, variants: readonly string[]): string {
  const at = root.tag.start;
  const edits = [{ start: at + 1, end: root.tag.nameEnd, text: look.tag }];
  for (const name of new Set([...variants, ...(look.attribute ? [look.attribute.name] : [])]))
    if (name !== look.attribute?.name) edits.push(attributeEdit(card, root.tag, name, undefined));
  if (look.attribute) edits.push(attributeEdit(card, root.tag, look.attribute.name, look.attribute.value));
  return applyEdits(card.slice(at, root.tag.end), edits.map((edit) => ({ ...edit, start: edit.start - at, end: edit.end - at })));
}

/**
 * The card `card` (an instance's markup, start tag to end tag, of the
 * component whose template is `template`) in `look` (whose template is
 * `lookTemplate`): its start tag keeps its other attributes (`slot`, `id`…),
 * minus the attributes the looks set (`variants`), plus the look's own; in
 * each of the look's slots, in template order, the content of that role (or
 * that name, first) from what the card holds now and what was `kept` from earlier
 * looks, written in the look's own element for the slot, else the slot's
 * fresh copy as Add card writes it. A look with no link slot links its title
 * to the card's link (decision 3).
 */
export function cardSwap(input: { card: string; template: string; look: CardLook; lookTemplate: string; kept?: CardContent; variants?: readonly string[] }): CardSwap {
  const { card, look, lookTemplate } = input;
  const kept = mergeCardContent(input.kept, readCardContent(card, input.template));
  const root = elementsOf(parseSource(card))[0];
  if (!root?.close) return { markup: card, kept, notShown: [] };
  const slots = templateSlots(lookTemplate);
  const { roleOf, titleSlot, linkSlot } = cardRoles(slots);
  const placed = new Set<string>();
  const fresh = slotMarkup(lookTemplate);
  const pieces: string[] = [];
  for (const slot of slots) {
    const role = roleOf(slot);
    const shape = () => slotShape(lookTemplate, slot);
    const element = (fallback: string) => shape() ?? fallback;
    let piece: string | undefined;
    // A slot of the same name holds the same thing, whatever role it has here.
    if (kept.other[slot.name]) {
      pieces.push(...kept.other[slot.name]);
      placed.add(`other:${slot.name}`);
      continue;
    }
    if (role === "title" && kept.title !== undefined) {
      const link = !linkSlot && kept.link?.href ? kept.link.href : undefined;
      piece = withInner(element(`<h3 slot="${escapeAttribute(slot.name)}"></h3>`), link === undefined ? kept.title : `<a href="${escapeAttribute(link)}">${kept.title}</a>`);
      placed.add("title");
      if (link !== undefined) placed.add("link");
    } else if (role === "body" && kept.body !== undefined) {
      piece = withInner(element(`<p slot="${escapeAttribute(slot.name)}"></p>`), kept.body);
      placed.add("body");
    } else if (role === "image" && kept.image) {
      const markup = element(`<img slot="${escapeAttribute(slot.name)}" src="" alt="">`);
      const img = elementsOf(parseSource(markup)).flatMap((first) => [first, ...descendants(first.children)]).find((child) => child.name === "img");
      // A picture's other sources would show instead of the image carried over.
      piece = img && !markup.includes("<source") ? applyEdits(markup, [
        attributeEdit(markup, img.tag, "src", kept.image.src),
        ...(kept.image.alt === undefined ? [] : [attributeEdit(markup, img.tag, "alt", kept.image.alt)]),
        attributeEdit(markup, img.tag, "srcset", undefined),
        attributeEdit(markup, img.tag, "sizes", undefined),
      ]) : `<img slot="${escapeAttribute(slot.name)}" src="${escapeAttribute(kept.image.src)}" alt="${escapeAttribute(kept.image.alt ?? "")}">`;
      placed.add("image");
    } else if (role === "link" && kept.link) {
      const markup = element(`<a slot="${escapeAttribute(slot.name)}"></a>`);
      const a = elementsOf(parseSource(markup)).flatMap((first) => [first, ...descendants(first.children)]).find((child) => child.name === "a");
      const html = kept.link.html ?? escapeText(kept.title !== undefined ? `Read about ${squash(plainText(kept.title))}` : "Read more");
      piece = a?.close
        ? applyEdits(markup, [attributeEdit(markup, a.tag, "href", kept.link.href), { start: a.tag.end, end: a.close.start, text: html }])
        : `<a slot="${escapeAttribute(slot.name)}" href="${escapeAttribute(kept.link.href)}">${html}</a>`;
      placed.add("link");
    }
    piece ??= fresh.find((line) => {
      const first = elementsOf(parseSource(line))[0];
      return first && attribute(line, first, "slot") === slot.name;
    });
    if (piece !== undefined) pieces.push(piece);
  }
  const notShown = [
    ...(kept.title !== undefined && !placed.has("title") ? ["title (no heading slot)"] : []),
    ...(kept.body !== undefined && !placed.has("body") ? ["body (no text slot)"] : []),
    ...(kept.image && !placed.has("image") ? ["image (no image slot)"] : []),
    ...(kept.link && !placed.has("link") ? [titleSlot ? "link (no link slot)" : "link (no link or heading slot)"] : []),
    ...Object.keys(kept.other).filter((name) => !placed.has(`other:${name}`)).map((name) => (name ? `${lower(slotLabel(name))} (no ${name} slot)` : "content (no slot for it)")),
  ];
  // One element a line, indented as the card's own, when it is written on several lines.
  const body = card.slice(root.tag.end, root.close.start);
  const newline = card.includes("\r\n") ? "\r\n" : "\n";
  const end = leadOf(card, root.close.start);
  const first = root.children.find((node) => node.type !== "text" || !blank(card, node));
  const lead = (first && leadOf(card, first.start)) ?? `${end ?? ""}  `;
  const lines = body.includes("\n") && end !== undefined;
  const children = lines ? `${pieces.map((piece) => `${newline}${lead}${piece}`).join("")}${newline}${end}` : pieces.join("");
  return { markup: `${startTag(card, root, look, input.variants ?? [])}${children}</${look.tag}>`, kept, notShown };
}
