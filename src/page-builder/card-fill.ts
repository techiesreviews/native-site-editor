// A card's fill plan, read from source without a DOM. Writing it is a
// separate operation: these rows describe each slot's source and mapping.
// An empty unnamed fallback has no row; text or image fallbacks still do.
import { attributeEdit, descendants, parseSource, plainText, slotLabel, startTagAttributes, templateSlots, type SourceElement, type TemplateSlot } from "./component-model";
import { slotMarkup } from "../native-insert";
import { allElements, elementTree, itemFill, plainText as itemPlainText, textLeaves, titleLeaf } from "./card-grid";

export type CardFillRole = "title" | "body" | "image" | "link" | "other";
export type CardFillFrom = "h1" | "<title>" | "address" | "meta description" | "og:image" | "matched" | "kept" | "not used";

export interface CardFillRow {
  /** Absent for facts without a slot; "" for the unnamed slot. */
  slot?: string;
  label: string;
  role: CardFillRole;
  from: CardFillFrom;
  status: "filled" | "kept" | "not-used" | "added";
  text?: string;
  href?: string;
  src?: string;
  matched?: string;
}

export interface CardFill {
  /** Template order, then the added title link and unused page facts. */
  rows: CardFillRow[];
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const attribute = (source: string, element: SourceElement, name: string) =>
  startTagAttributes(source, element.tag).find(attr => attr.name === name)?.value;
const firstElement = (slot: TemplateSlot) => slot.element.children.find(node => node.type === "element");
const heading = (slot: TemplateSlot) => /^h[1-6]$/.test(firstElement(slot)?.name ?? "");
const elementText = (source: string, element: SourceElement) => plainText(source.slice(element.tag.end, element.close?.start ?? element.end));

function siteImage(image: string, siteUrl?: string): string {
  if (!siteUrl) return image;
  try {
    const url = new URL(image);
    return url.origin === new URL(siteUrl).origin ? `${url.pathname}${url.search}${url.hash}` : image;
  } catch {
    return image;
  }
}

/** Other slots match their component first, then their fallback's classes; an empty match keeps the fallback. */
function matchSlot(slot: TemplateSlot, template: string, source: string, page: SourceElement[]) {
  const fallback = firstElement(slot);
  const parent = slot.element.parent;
  const component = fallback?.name.includes("-") ? fallback : parent?.name.includes("-") ? parent : undefined;
  if (component) {
    const found = page.find(element => element.name === component.name);
    if (found) {
      // A slot directly in a component can forward to just one of its slots.
      const forward = component === parent ? slot.forward : undefined;
      const fills = forward ? found.children.filter(node => node.type === "element" && attribute(source, node, "slot") === forward) : undefined;
      const text = squash(fills ? fills.map(node => plainText(source.slice(node.start, node.end))).join(" ") : elementText(source, found));
      if (text) return { text, matched: `<${component.name}>` };
    }
  }
  // Each of the fallback's classes in turn, its first class first.
  for (const className of (fallback && attribute(template, fallback, "class")?.split(/\s+/).filter(Boolean)) ?? []) {
    const found = page.find(element => attribute(source, element, "class")?.split(/\s+/).includes(className));
    const text = found && elementText(source, found);
    if (text) return { text, matched: `.${className}` };
  }
  return undefined;
}

/** A page's title as a card takes it: its h1 (main's first), else its `<title>` without the site's name, else its address's last part. */
export function pageTitle(source: string, route: string, document = [...descendants(parseSource(source))]): { title: string; from: "h1" | "<title>" | "address" } {
  const main = document.find(element => element.name === "main");
  const h1 = (main && [...descendants(main.children)].find(element => element.name === "h1")) || document.find(element => element.name === "h1");
  const h1Text = h1 ? elementText(source, h1) : "";
  const titleTag = document.find(element => element.name === "title");
  const titleText = titleTag ? elementText(source, titleTag).split(/ [·|–—-] /)[0].trim() : "";
  const title = h1Text || titleText || plainText(route.split("/").filter(Boolean).at(-1) || route);
  return { title, from: h1Text ? "h1" : titleText ? "<title>" : "address" };
}

/**
 * Which of a card template's slots (templateSlots) take its title (the first
 * heading slot, else one named "title"), body (the first text slot after the
 * title, else the last before it), image and link; any other is "other". The
 * unnamed slot is content, never one of these. A page fills a card by these
 * roles, and a look swap carries content by them (card-swap.ts).
 */
export function cardRoles(slots: TemplateSlot[]) {
  const named = slots.filter(slot => slot.name);
  const titleSlot = named.find(heading) ?? named.find(slot => slot.name === "title");
  const titleAt = titleSlot ? slots.indexOf(titleSlot) : -1;
  const textSlots = named.filter(slot => slot !== titleSlot && slot.kind === "text" && !heading(slot));
  const bodySlot = textSlots.find(slot => slots.indexOf(slot) > titleAt) ?? textSlots.at(-1);
  const imageSlot = named.find(slot => slot !== titleSlot && slot.kind === "image");
  const linkSlot = named.find(slot => slot !== titleSlot && slot.kind === "link");
  const roleOf = (slot: TemplateSlot): CardFillRole =>
    slot === titleSlot ? "title" : slot === bodySlot ? "body" : slot === imageSlot ? "image" : slot === linkSlot ? "link" : "other";
  return { titleSlot, bodySlot, imageSlot, linkSlot, roleOf };
}

/** Map a chosen page's facts to a card's slots; missing facts keep fallbacks. */
export function cardFill(input: { template: string; page: { route: string; source: string }; siteUrl?: string }): CardFill {
  const { template, page: { source, route }, siteUrl } = input;
  const document = [...descendants(parseSource(source))];
  const main = document.find(element => element.name === "main");
  const body = document.find(element => element.name === "body");
  const scope = main ?? body;
  const content = scope ? [...descendants(scope.children)] : document;
  const { title, from: titleFrom } = pageTitle(source, route, document);
  const meta = (name: string, value: string) => {
    const found = document.find(element => element.name === "meta" && attribute(source, element, name)?.toLowerCase() === value);
    return found ? squash(attribute(source, found, "content") ?? "") : "";
  };
  const description = meta("name", "description");
  const image = siteImage(meta("property", "og:image"), siteUrl);
  const slots = templateSlots(template);
  const { roleOf, titleSlot, bodySlot, imageSlot, linkSlot } = cardRoles(slots);
  const rows = slots.map((slot): CardFillRow => {
    const role = roleOf(slot);
    const row: CardFillRow = { slot: slot.name, label: slotLabel(slot.name), role, from: "kept", status: "kept" };
    const fill = (from: CardFillFrom, value: Pick<CardFillRow, "text" | "href" | "src" | "matched">): CardFillRow =>
      ({ ...row, from, status: "filled", ...value });
    if (role === "title") return fill(titleFrom, { text: title });
    if (role === "body" && description) return fill("meta description", { text: description });
    if (role === "image" && image) return fill("og:image", { src: image });
    if (role === "link") return fill("address", { href: route, text: `Read about ${title}` });
    if (role === "other" && slot.name) {
      const match = matchSlot(slot, template, source, content);
      if (match) return fill("matched", match);
    }
    const fallback = [...descendants(slot.element.children)];
    if (slot.kind === "image") {
      const img = fallback.find(element => element.name === "img");
      if (img) row.src = attribute(template, img, "src");
    } else {
      row.text = plainText(slot.fallback);
      if (slot.kind === "link") {
        const link = fallback.find(element => element.name === "a");
        if (link) row.href = attribute(template, link, "href");
      }
    }
    return row;
  }).filter(row => row.slot !== "" || row.text?.trim() || row.src);
  if (!linkSlot) rows.push({
    label: "Link", role: "link", from: titleSlot ? "address" : "not used",
    status: titleSlot ? "added" : "not-used", href: route, text: title,
  });
  if (description && !bodySlot) rows.push({ label: "Body", role: "body", from: "not used", status: "not-used", text: description });
  if (image && !imageSlot) rows.push({ label: "Image", role: "image", from: "not used", status: "not-used", src: image });
  return { rows };
}

interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const elementsOf = (element: SourceElement) => element.children.filter((node): node is SourceElement => node.type === "element");
const blankText = (source: string, element: SourceElement) =>
  element.children.every((node) => node.type === "element" || !/[^\t\n\f\r ]/.test(source.slice(node.start, node.end)));

/** Non-overlapping edits; insertions at one place land in the order given. */
function applyEdits(source: string, edits: RangeEdit[]) {
  let text = source;
  const order = edits.map((edit, at) => ({ edit, at })).sort((a, b) => b.edit.start - a.edit.start || b.at - a.at);
  for (const { edit } of order) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

/** The white space before `at` on its line, when nothing else is. */
function leadOf(source: string, at: number): string | undefined {
  const lead = source.slice(source.lastIndexOf("\n", at - 1) + 1, at);
  return /^[\t ]*$/.test(lead) ? lead : undefined;
}

/**
 * The edits that fill `element` (a slot's element in a card) from `row`:
 * an image's address (its `srcset`, `sizes` and a picture's other sources
 * dropped, so the new one shows), a link's address and text, else the text
 * of its innermost element, as a link to `link` when the title takes the
 * card's link (decision 3).
 */
function fillElementEdits(source: string, element: SourceElement, row: CardFillRow, link?: string): RangeEdit[] {
  const inside = (name: string) => (element.name === name ? element : [...descendants(element.children)].find((child) => child.name === name));
  const text = escapeText(row.text ?? "");
  // All of `holder` becomes one link to `href` with the row's text, keeping the attributes of the link it held.
  const linkIn = (holder: SourceElement, href: string): RangeEdit[] => {
    const anchor = inside("a");
    if (anchor === holder) return [attributeEdit(source, anchor.tag, "href", href), ...(anchor.close ? [{ start: anchor.tag.end, end: anchor.close.start, text }] : [])];
    if (!holder.close) return [];
    const at = anchor?.tag.start ?? 0;
    const open = anchor ? applyEdits(source.slice(at, anchor.tag.end), [attributeEdit(source, anchor.tag, "href", href)].map((edit) => ({ ...edit, start: edit.start - at, end: edit.end - at })))
      : `<a href="${escapeAttribute(href)}">`;
    return [{ start: holder.tag.end, end: holder.close.start, text: `${open}${text}</a>` }];
  };
  if (row.role === "image") {
    const img = inside("img");
    if (!img || row.src === undefined) return [];
    return cardImageEdits(source, img, row.src);
  }
  if (row.role === "link") return linkIn(element, row.href ?? "");
  // The text goes in the innermost element that holds the rest (`<div slot><p>…</p></div>`), not into an image or a line break.
  let target = element;
  for (let only = elementsOf(target); only.length === 1 && only[0].close && only[0].name !== "a" && blankText(source, target); only = elementsOf(target)) target = only[0];
  if (link !== undefined) return linkIn(target, link);
  return target.close ? [{ start: target.tag.end, end: target.close.start, text }] : [];
}

/** Replace an image's source, keeping alt and removing competing responsive sources. */
export function cardImageEdits(source: string, img: SourceElement, src: string): RangeEdit[] {
  // Only the image's own picture: a video's sources beside it stay.
  const picture = img.parent?.name === "picture" ? img.parent.children : [];
  const sources = picture.filter((child): child is SourceElement => child.type === "element" && child.name === "source").map((child) => {
    const lead = leadOf(source, child.start);
    const start = lead === undefined ? child.start : Math.max(0, child.start - lead.length - (source[child.start - lead.length - 2] === "\r" ? 2 : 1));
    return { start, end: child.end, text: "" };
  });
  return [attributeEdit(source, img.tag, "src", src), attributeEdit(source, img.tag, "srcset", undefined), attributeEdit(source, img.tag, "sizes", undefined), ...sources];
}

/** A new element for a slot the card has none for: its fallback's shape (as Add card copies it, else its one element), else a plain one. */
function newSlotElement(template: string, row: CardFillRow, link?: string): string {
  const name = row.slot ?? "";
  const filled = (markup: string) => {
    const [first] = parseSource(markup) as SourceElement[];
    return applyEdits(markup, fillElementEdits(markup, first, row, link));
  };
  const copy = slotMarkup(template).find((line) => {
    const [first] = parseSource(line);
    return first?.type === "element" && attribute(line, first, "slot") === name;
  });
  if (copy) return filled(copy);
  const fallback = templateSlots(template).find((entry) => entry.name === name)?.fallback ?? "";
  const nodes = parseSource(fallback);
  const [only, ...more] = nodes.filter((node): node is SourceElement => node.type === "element");
  if (only && !more.length && nodes.every((node) => node === only || !/[^\t\n\f\r ]/.test(fallback.slice(node.start, node.end))))
    return filled(applyEdits(fallback.slice(only.start, only.end), [attributeEdit(fallback, only.tag, "slot", name)].map((edit) => ({ ...edit, start: edit.start - only.start, end: edit.end - only.start }))));
  const slot = `slot="${escapeAttribute(name)}"`;
  if (row.role === "image") return `<img ${slot} src="${escapeAttribute(row.src ?? "")}" alt="">`;
  if (row.role === "link") return `<a ${slot} href="${escapeAttribute(row.href ?? "")}">${escapeText(row.text ?? "")}</a>`;
  return filled(`<span ${slot}></span>`);
}

/**
 * The card `card` (an instance's markup, start tag to end tag) filled by
 * `rows` (cardFill's, for the card's `template`): each filled slot's element
 * takes the page's text, address or image; a filled slot the card has no
 * element for gets one, in template order, indented as its neighbours. With
 * an "added" link the title's text becomes a link to the page (spec decision
 * 3: no class; the card's CSS stretches it). Kept slots, the unnamed slot's
 * content and anything else stay as they are.
 */
export function cardFillMarkup(card: string, template: string, rows: CardFillRow[]): string {
  const root = parseSource(card).find((node): node is SourceElement => node.type === "element");
  if (!root?.close) return card;
  const kids = elementsOf(root);
  const slotted = (name: string) => kids.find((kid) => (attribute(card, kid, "slot") ?? "") === name);
  const added = rows.find((row) => row.status === "added")?.href;
  const order = templateSlots(template).map((slot) => slot.name);
  const newline = card.includes("\r\n") ? "\r\n" : "\n";
  const edits: RangeEdit[] = [];
  for (const row of rows) {
    if (row.status !== "filled" || !row.slot) continue;
    const link = row.role === "title" ? added : undefined;
    const own = slotted(row.slot);
    if (own) { edits.push(...fillElementEdits(card, own, row, link)); continue; }
    const markup = newSlotElement(template, row, link);
    // Before the next slot's element in template order, else after the one before, else at the end.
    const at = order.indexOf(row.slot);
    const next = order.slice(at + 1).map((name) => name && slotted(name)).find(Boolean);
    const before = order.slice(0, Math.max(at, 0)).reverse().map((name) => name && slotted(name)).find(Boolean);
    if (next) {
      const lead = leadOf(card, next.start);
      edits.push({ start: next.start, end: next.start, text: lead === undefined ? markup : `${markup}${newline}${lead}` });
    } else if (before) {
      const lead = leadOf(card, before.start);
      edits.push({ start: before.end, end: before.end, text: lead === undefined ? markup : `${newline}${lead}${markup}` });
    } else {
      const lead = leadOf(card, root.close.start);
      const kid = kids[0] && leadOf(card, kids[0].start);
      edits.push(lead === undefined
        ? { start: root.close.start, end: root.close.start, text: markup }
        : { start: root.close.start - lead.length, end: root.close.start - lead.length, text: `${kid ?? `${lead}  `}${markup}${newline}` });
    }
  }
  return applyEdits(card, edits);
}

/**
 * A placed plain card filled from a page: `facts` (cardFill's rows) put the
 * meta description in its first paragraph after the title that holds no
 * link, and the og:image in its first image (cardImageEdits); a fact the
 * page lacks keeps what the card says, a fact the card has no place for is
 * "not used". Then the title and link as `itemFill`. The rows describe the mapping.
 */
export function itemPageFill(card: string, noun: string, title: string, href: string, facts: CardFillRow[]): { markup: string; rows: CardFillRow[] } | undefined {
  const root = elementTree(card)?.[0];
  if (!root) return undefined;
  const source = card;
  const leaves = textLeaves(source, [root]);
  const heading = titleLeaf(source, root, leaves);
  // The first paragraph after the title, text or empty; one holding a link is the card's link ("Read about …"), not its text.
  const blank = (element: (typeof leaves)[number]) => !element.children.length && !itemPlainText(source.slice(element.innerStart, element.innerEnd));
  const body = heading && allElements([root]).find(element => element.name === "p" && element.start >= heading.end
    && (leaves.includes(element) || blank(element)) && !allElements(element.children).some(child => child.name === "a"));
  const img = [...descendants(parseSource(source))].find(element => element.name === "img");
  const edits: RangeEdit[] = [];
  const rows = facts.map((fact): CardFillRow => {
    const row = { ...fact, slot: undefined };
    if (row.role !== "body" && row.role !== "image") return row;
    const target = row.role === "body" ? body : img;
    if (!target) return { ...row, from: "not used", status: "not-used" };
    if (row.status === "filled") {
      if (row.role === "body" && body && row.text !== undefined) edits.push({ start: body.innerStart, end: body.innerEnd, text: escapeText(row.text) });
      if (row.role === "image" && img && row.src !== undefined) edits.push(...cardImageEdits(source, img, row.src));
      return row;
    }
    return row.role === "body" && body
      ? { ...row, from: "kept", status: "kept", text: itemPlainText(source.slice(body.innerStart, body.innerEnd)) }
      : { ...row, from: "kept", status: "kept", src: img && startTagAttributes(source, img.tag).find(attribute => attribute.name === "src")?.value };
  }).filter(row => row.status !== "not-used" || Boolean(row.text || row.src));
  // The title and the card's link are filled over the facts (itemFill keeps the rest of the text).
  const filled = itemFill(applyEdits(source, edits), noun, title, href);
  return filled && { markup: filled.markup, rows: rows.map(row => row.role === "link" && filled.added ? { ...row, status: "added", text: title } : row) };
}
