/**
 * Turns a hand-written grid of native cards into a page collection without
 * losing what the cards say. Every card becomes the page it links to; text
 * that differs from the page's own title or description is kept as a custom
 * field of that page, scoped to this grid by its data-collection-id.
 * Anything that cannot be kept exactly is refused with a readable reason.
 */
import { startTagAttribute } from "../../shared/html-source";
import { attributeEdit, descendants, parseSource, type SourceElement } from "./component-model";
import { applyCollectionEdits, bindCollectionTemplate, planCollectionChange, type BakePlan } from "./collection-bake";
import { readPageFields, withCustomPageField, type CollectionIdentity, type PageFields } from "./collection-fields";
import { collectionRecords, makeGridCollection, validCollectionRoute } from "./collection-model";
import { decodeHtmlEntities } from "./html-entities";

interface CardSlot { slot: string; tag: string; open: string; text: string; href?: string }
interface Card { element: SourceElement; open: string; slots: CardSlot[]; gaps: string[] }
export interface ManualGrid { element: SourceElement; cards: Card[]; tag: string }
export type ManualGridResult = ManualGrid | { error: string };

const SPACE = /^[\t\n\f\r ]*$/;
const fail = (error: string): { error: string } => ({ error });

/** A grid of two or more cards that share one custom element tag. Detection only. */
export function isManualCardGrid(source: string, element: SourceElement): boolean {
  if (!element.close || startTagAttribute(source, element.tag, "data-each")) return false;
  const kids = element.children.filter((child): child is SourceElement => child.type === "element");
  return kids.length >= 2 && kids[0].name.includes("-") && kids.every((kid) => kid.name === kids[0].name);
}

function readCard(source: string, element: SourceElement, allowConditions: boolean): Card | { error: string } {
  if (!element.close) return fail("A card is not closed in the page source.");
  const slots: CardSlot[] = [], gaps: string[] = [];
  let cursor = element.tag.end;
  for (const child of element.children) {
    if (child.type === "text") continue;
    const gap = source.slice(cursor, child.start);
    if (!SPACE.test(gap)) return fail("A card has text or comments outside its parts, which a collection cannot keep.");
    gaps.push(gap); cursor = child.end;
    const slot = startTagAttribute(source, child.tag, "slot")?.value;
    if (!slot) return fail(`A card has a <${child.name}> that is not one of its named parts, which a collection cannot keep.`);
    if (!allowConditions && startTagAttribute(source, child.tag, "data-if")) return fail("A card part already has a condition, which a collection cannot keep.");
    if (!child.close || child.children.some((node) => node.type === "element")) return fail(`The ${slot} part has images, formatting or other markup inside it. Only plain text parts can be kept.`);
    const inner = source.slice(child.tag.end, child.close.start);
    if (/[<>{}]/.test(inner)) return fail(`The ${slot} part has markup or braces inside it. Only plain text parts can be kept.`);
    if (slots.some((item) => item.slot === slot)) return fail(`A card fills its ${slot} part twice.`);
    let open = source.slice(child.start, child.tag.end);
    let href: string | undefined;
    const link = startTagAttribute(source, child.tag, "href");
    if (link) {
      href = decodeHtmlEntities(link.value ?? "", true);
      open = rebuildOpen(source, child, "href", "{url}");
    }
    if (allowConditions) open = rebuildOpen(source, child, "data-if", undefined, open);
    slots.push({ slot, tag: child.name, open, text: decodeHtmlEntities(inner), href });
  }
  const tail = source.slice(cursor, element.close.start);
  if (!SPACE.test(tail)) return fail("A card has text or comments outside its parts, which a collection cannot keep.");
  gaps.push(tail);
  return { element, open: source.slice(element.start, element.tag.end), slots, gaps };
}

/** The start tag with one attribute set or removed; everything else byte for byte. */
function rebuildOpen(source: string, element: SourceElement, name: string, value: string | undefined, current?: string): string {
  const open = current ?? source.slice(element.start, element.tag.end);
  const local = parseSource(open)[0];
  if (local?.type !== "element") return open;
  return applyCollectionEdits(open, [attributeEdit(open, local.tag, name, value)]);
}

/** Reads every card, refusing shapes a plain-text collection cannot reproduce. */
export function readManualGrid(source: string, start: number): ManualGridResult {
  const element = [...descendants(parseSource(source))].find((item) => item.start === start);
  if (!element || !isManualCardGrid(source, element)) return fail("Select a grid of cards to choose its pages.");
  for (let parent = element.parent; parent; parent = parent.parent)
    if (startTagAttribute(source, parent.tag, "data-each")) return fail("This grid is inside another collection.");
  const cards: Card[] = [];
  let cursor = element.tag.end;
  for (const child of element.children) {
    if (child.type === "text") continue;
    if (!SPACE.test(source.slice(cursor, child.start))) return fail("The grid has text or comments between its cards, which a collection cannot keep.");
    cursor = child.end;
    const card = readCard(source, child, false);
    if ("error" in card) return card;
    cards.push(card);
  }
  if (!SPACE.test(source.slice(cursor, element.close!.start))) return fail("The grid has text or comments between its cards, which a collection cannot keep.");
  const first = cards[0];
  for (const card of cards) {
    if (card.open !== first.open) return fail("The cards have different settings on their outer tag, which one collection design cannot keep.");
    if (card.slots.length !== first.slots.length || card.slots.some((slot, index) => slot.slot !== first.slots[index].slot || slot.open !== first.slots[index].open))
      return fail("The cards fill different parts or style them differently, which one collection design cannot keep.");
    if (card.slots.some((slot) => !slot.text.trim())) return fail("A card has an empty part. Fill it or remove it before choosing pages.");
  }
  if (first.slots.filter((slot) => slot.href !== undefined).length !== 1) return fail("Each card needs exactly one link to its page.");
  return { element, cards, tag: first.element.name };
}

const builtinFor = (slot: CardSlot): "title" | "description" | undefined =>
  slot.href !== undefined ? undefined : slot.slot === "title" || /^h[1-6]$/.test(slot.tag) ? "title" : ["body", "description", "summary"].includes(slot.slot) ? "description" : undefined;
const linkFallback = "Read about {title}";

export interface ManualConversionInput {
  sources: Readonly<Record<string, string>>;
  routes: Readonly<Record<string, string>>;
  identity: CollectionIdentity;
  path: string;
  start: number;
  folders: string[];
  /** Grid namespace persisted as data-collection-id; letters and digits, starting with a letter. */
  token: string;
}
export interface ManualConversion { plan: BakePlan; template: string; kept: string[]; records: number; cards: number }

function folderOf(url: string): string { return url.replace(/[^/]+\/$/, ""); }
/** The folders the current cards live in; the default selection keeps them all. */
export function manualGridFolders(source: string, start: number, routes: Readonly<Record<string, string>>): string[] {
  const grid = readManualGrid(source, start);
  if ("error" in grid) return [];
  return [...new Set(grid.cards.flatMap((card) => card.slots.flatMap((slot) => slot.href && Object.hasOwn(routes, slot.href) ? [folderOf(slot.href)] : [])))];
}

/** A fresh token no page already uses. */
export function newCollectionToken(sources: Readonly<Record<string, string>>, random = Math.random): string {
  for (;;) {
    const token = "g" + Math.floor(random() * 36 ** 5).toString(36).padStart(5, "0");
    if (!Object.values(sources).some((source) => source.includes(token))) return token;
  }
}

/** Plans conversion, page fields and the baked grid as one change; no writes. */
export function planManualConversion(input: ManualConversionInput): ManualConversion | { error: string } {
  const { sources, routes, identity, path, start, folders, token } = input;
  if (!/^[a-z][a-z0-9]{2,15}$/.test(token)) return fail("The grid needs a valid collection id.");
  const source = sources[path];
  if (source === undefined) return fail("Load the page before choosing pages for this grid.");
  if (!folders.length) return fail("Select at least one folder.");
  if (Object.values(sources).some((text) => text.includes(`data-collection-id="${token}"`))) return fail("This collection id is already used.");
  const grid = readManualGrid(source, start);
  if ("error" in grid) return grid;
  const pages = grid.cards.map((card) => {
    const href = card.slots.find((slot) => slot.href !== undefined)!.href!;
    return { card, url: href, page: Object.hasOwn(routes, href) && validCollectionRoute(href, routes[href]) ? routes[href] : undefined };
  });
  for (const { url, page } of pages) {
    if (!page) return fail(`A card links to ${url}, which is not a page of this site. Only cards that link to their own page can be kept.`);
    if (page === path) return fail(`A card links to this page itself (${url}).`);
    if (sources[page] === undefined) return fail(`Load ${page} before choosing pages for this grid.`);
  }
  if (new Set(pages.map((item) => item.page)).size !== pages.length) return fail("Two cards link to the same page. Each card must link to a different page.");
  // Per slot: a bare built-in, or a per-grid override with the built-in as fallback.
  const first = grid.cards[0];
  const fieldsByPage = new Map(pages.map(({ url, page }) => [page!, readPageFields(sources[page!], url, identity)]));
  const writes = new Map<string, Record<string, string>>();
  const kept: string[] = [];
  const parts = first.slots.map((slot, index) => {
    const field = `${token}-${slot.slot.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
    const close = `</${slot.tag}>`;
    const builtin = builtinFor(slot);
    const fallback = slot.href !== undefined ? linkFallback : builtin ? `{${builtin}}` : undefined;
    const fallbackText = (fields: PageFields) => fallback?.replace(/\{(title|description)\}/g, (_, name: string) => fields[name] ?? "");
    const differs = pages.filter(({ card, page }) => card.slots[index].text !== fallbackText(fieldsByPage.get(page!)!));
    if (fallback && !differs.length) return slot.open + fallback + close;
    for (const { card, page } of fallback ? differs : pages) (writes.get(page!) ?? writes.set(page!, {}).get(page!)!)[field] = card.slots[index].text;
    kept.push(fallback ? `${slot.slot} text on ${differs.length} of ${pages.length} cards` : `${slot.slot} text`);
    const conditioned = (condition: string, text: string) => withCondition(slot.open, condition) + text + close;
    return conditioned(field, `{${field}}`) + (fallback ? first.gaps[index + 1] + conditioned(`!${field}`, fallback) : "");
  });
  const template = first.gaps[0] + parts.map((part, index) => part + (index < parts.length - 1 ? first.gaps[index + 1] : "")).join("") + first.gaps[first.gaps.length - 1];
  const markup = first.open + template + `</${grid.tag}>`;
  try {
    const matched = new Set(collectionRecords(sources as Record<string, string>, routes as Record<string, string>, identity, { folder: folders[0], folders, sort: "", filter: "", limit: Number.MAX_SAFE_INTEGER }, path).map((record) => record.path));
    const dropped = pages.find(({ page }) => !matched.has(page!));
    if (dropped) return fail(`The chosen folders leave out ${dropped.url}. Select its folder so no card is dropped.`);
    if (matched.size > 500) return fail("The chosen folders have more than 500 pages.");
    const after: Record<string, string> = { ...sources };
    for (const [page, fields] of writes) for (const [field, value] of Object.entries(fields)) after[page] = withCustomPageField(after[page], field, value, identity);
    const converted = makeGridCollection(source, start, { folders, sort: "", filter: "", limit: "", template: markup });
    const host = [...descendants(parseSource(converted))].find((item) => item.start === start)!;
    after[path] = applyCollectionEdits(converted, [attributeEdit(converted, host.tag, "data-collection-id", token)]);
    const plan = planCollectionChange(sources as Record<string, string>, after, routes as Record<string, string>, identity);
    if ("error" in plan) return plan;
    const collection = plan.collections.find((item) => item.path === path && item.start === start);
    if (!collection) return fail("The grid could not be read back after choosing pages.");
    // Prove every current card renders exactly as before; refuse rather than approximate.
    for (const { card, page } of pages) {
      const record = collection.records.find((item) => item.path === page);
      if (!record) return fail(`The chosen folders leave out ${card.slots.find((slot) => slot.href)!.href}. Select its folder so no card is dropped.`);
      const known = [...new Set(collection.records.flatMap((item) => Object.keys(item.fields)))];
      const rendered = bindCollectionTemplate(markup, record.fields, known);
      const back = readCard(rendered, parseSource(rendered).find((node): node is SourceElement => node.type === "element")!, true);
      if ("error" in back || back.open !== card.open || back.slots.length !== card.slots.length ||
        back.slots.some((slot, index) => slot.slot !== card.slots[index].slot || slot.text !== card.slots[index].text || slot.href !== card.slots[index].href || slot.open !== card.slots[index].open))
        return fail("A card would not look the same after choosing pages, so nothing was changed.");
    }
    return { plan, template: markup, kept, records: collection.records.length, cards: pages.length };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The pages could not be chosen for this grid.");
  }
}

function withCondition(open: string, condition: string): string {
  const local = parseSource(open)[0] as SourceElement;
  return applyCollectionEdits(open, [attributeEdit(open, local.tag, "data-if", condition)]);
}
