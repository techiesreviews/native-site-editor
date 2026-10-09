// A card's fill plan, read from source without a DOM. Writing it is a
// separate operation: these rows also supply the fill strip's provenance.
import { descendants, parseSource, plainText, slotLabel, startTagAttributes, templateSlots, type SourceElement, type TemplateSlot } from "./component-model";

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

/** Map a chosen page's facts to a card's slots; missing facts keep fallbacks. */
export function cardFill(input: { template: string; page: { route: string; source: string }; siteUrl?: string }): CardFill {
  const { template, page: { source, route }, siteUrl } = input;
  const document = [...descendants(parseSource(source))];
  const main = document.find(element => element.name === "main");
  const body = document.find(element => element.name === "body");
  const scope = main ?? body;
  const content = scope ? [...descendants(scope.children)] : document;
  const h1 = (main && content.find(element => element.name === "h1")) || document.find(element => element.name === "h1");
  const h1Text = h1 ? elementText(source, h1) : "";
  const titleTag = document.find(element => element.name === "title");
  const titleText = titleTag ? elementText(source, titleTag).split(/ [·|–—-] /)[0].trim() : "";
  const title = h1Text || titleText || plainText(route.split("/").filter(Boolean).at(-1) || route);
  const titleFrom = h1Text ? "h1" : titleText ? "<title>" : "address";
  const meta = (name: string, value: string) => {
    const found = document.find(element => element.name === "meta" && attribute(source, element, name)?.toLowerCase() === value);
    return found ? squash(attribute(source, found, "content") ?? "") : "";
  };
  const description = meta("name", "description");
  const image = siteImage(meta("property", "og:image"), siteUrl);
  const slots = templateSlots(template);
  // The default slot is content, never a page-fact destination.
  const named = slots.filter(slot => slot.name);
  const titleSlot = named.find(heading) ?? named.find(slot => slot.name === "title");
  const titleAt = titleSlot ? slots.indexOf(titleSlot) : -1;
  const textSlots = named.filter(slot => slot !== titleSlot && slot.kind === "text" && !heading(slot));
  const bodySlot = textSlots.find(slot => slots.indexOf(slot) > titleAt) ?? textSlots.at(-1);
  const imageSlot = named.find(slot => slot !== titleSlot && slot.kind === "image");
  const linkSlot = named.find(slot => slot !== titleSlot && slot.kind === "link");
  const rows = slots.map((slot): CardFillRow => {
    const role: CardFillRole = slot === titleSlot ? "title" : slot === bodySlot ? "body" : slot === imageSlot ? "image" : slot === linkSlot ? "link" : "other";
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
  });
  if (!linkSlot) rows.push({
    label: "Link", role: "link", from: titleSlot ? "address" : "not used",
    status: titleSlot ? "added" : "not-used", href: route, text: title,
  });
  if (description && !bodySlot) rows.push({ label: "Body", role: "body", from: "not used", status: "not-used", text: description });
  if (image && !imageSlot) rows.push({ label: "Image", role: "image", from: "not used", status: "not-used", src: image });
  return { rows };
}
