import { selectionAfterRemove } from "./remove";
// Cards: grids of repeated items in the editor (docs/page-builder/cards.md).
// Add card places a blank card first. Component cards and collection items
// open Link to a page; choosing a page fills the card, and Create page copies
// a sibling's structure with the page and fill in one undo step. The Pages
// tab can still create or delete a page with its collection card.
//
// The grid markup and the page files are the collection: nothing else is
// written. Every change is one guarded edit, with all its reads tracked and
// its page and file changes in one undo step.

import { refuse as showRefusal } from "../components/refusal-note";
import type { NativePreview, NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import type { CardFilled, CardLinkPages, CardPageRequest, CardSwapped, GridDescription, ItemGridReport, NewCard } from "../components/card-grid-controls";
import { NATIVE_CONFIG_PATH, nativeSiteSettings, nativePageBody, nativePageHead, nativePageMovedUrl, nativePageWithDetails } from "../../shared/native-project";
import { nativeNewPageTitle, nativePageTemplate, normalizeRoute, withoutStructuredData, type Checked } from "../native-create";
import { firstHeadingText, nativeNewTarget, slugify } from "../native-pages";
import { duplicateEdit, removeEdit, swapEdits } from "../native-structure";
import { allElements, elementTree, aOr, insertAfterEdit, itemCopy, itemNoun, itemTitle, titleLeaf, leafSummary, pageBodyCopy, slotFallbacks } from "./card-grid";
import { gridAt, gridOfItem, instanceLabel, itemAround, itemElement, linkRoute, mainRange, pageGrids, type GridContext, type SourceGrid } from "./card-source";
import { cardSlotAddEdit, slotCardLinks } from "./card-slot";
import { cardFill, cardFillMarkup, itemPageFill, pageTitle } from "./card-fill";
import { cardFolder } from "./page-choices";
import { locateNativeElementRange } from "../native-source-location";
import type { CardLook } from "./card-looks";
import type { CardContent } from "./card-swap";
import type { VariantFiles } from "../../shared/variant-lookup";
import { decodeHtmlEntities } from "./html-entities";
import type { GuardedEdits, Outcome, Planned, Reads } from "../guarded-edit";
import { isSectionTemplate, startTagAttribute } from "../../shared/html-source";
import { nativeLinkTarget } from "../../shared/native-routes";

interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

/** What the editor offers this module (src/main.ts). */
export interface CardsDeps {
  edits: GuardedEdits;
  /** Reads the site's page creation inputs; resolves to a problem, if any. */
  siteRead(): Promise<string | undefined>;
  /** Whether the page is open, mounted and writable for a synchronous edit. */
  editable(path: string): boolean;
  preview(): NativePreview | undefined;
  /** Opens a page in the editor and the preview. */
  openPage(file: string): void;
  /** What the Pages tab calls a page file ("Home"). */
  pageLabel(file: string): string;
  /** The site's files for its Variant lookup (shared/variant-lookup.ts), drafts applied, read lazily. */
  variantFiles: VariantFiles;
  announce(text: string): void;
}

const capital = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

function applyEdits(source: string, edits: RangeEdit[]) {
  let text = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

/**
 * The folder URLs a page could be made in: every folder a page of the site
 * is in, each folder above it, and the site's top.
 */
export function cardPageFolders(routes: Record<string, string>): string[] {
  const out = new Set<string>(["/"]);
  for (const route of Object.keys(routes)) {
    const parts = route.split("/").filter(Boolean);
    const depth = route.endsWith("/") ? parts.length : parts.length - 1;
    for (let at = 1; at <= depth; at++) out.add(`/${parts.slice(0, at).join("/")}/`);
  }
  return [...out].sort();
}

/**
 * A grid's default folder when its cards' pages are not all in one (a page
 * from another folder joined it): the folder most of its cards' pages are
 * in, else the folder of its last card's page; only when two cards at least
 * link to pages of the site in folders below its top. None for a list of
 * the site's top-level pages (a menu).
 */
export function mixedParent(routes: Record<string, string>, itemRoutes: (string | undefined)[]): string | undefined {
  const parents = [...new Set(itemRoutes.filter((route): route is string => Boolean(route && routes[route] && route.endsWith("/"))))]
    .map((route) => route.replace(/[^/]+\/$/, ""))
    .filter((parent) => parent !== "/");
  if (parents.length < 2) return undefined;
  const count = (parent: string) => parents.filter((other) => other === parent).length;
  return [...parents].reverse().reduce((best, parent) => (count(parent) > count(best) ? parent : best));
}

/** Translate a typed URL prefix into the existing page creation request. */
export function cardPrefixRequest(title: string, prefix: string, folders: string[], newFolders: boolean): Checked<CardPageRequest> {
  if (!prefix) return { ok: false, error: "Enter the URL prefix." };
  const normal = normalizeRoute(prefix);
  if (!normal.ok || normal.value !== prefix || !prefix.endsWith("/"))
    return { ok: false, error: `${prefix} is not a folder a page can be in.` };
  if (folders.includes(prefix)) return { ok: true, value: { title, parent: prefix } };
  const parent = folders.filter((folder) => prefix.startsWith(folder)).sort((a, b) => b.length - a.length)[0];
  const name = parent ? prefix.slice(parent.length, -1) : "";
  if (!newFolders || !parent || !name || name.includes("/"))
    return { ok: false, error: "Choose an existing folder or add one folder inside it." };
  return { ok: true, value: { title, parent, newFolder: name } };
}

/** Where a new page titled `request.title` goes in `request.parent` (in a new folder there, with `newFolder`), or why it cannot. */
export function planCardPage(input: { routes: Record<string, string>; exists(path: string): boolean; folders: string[] }, request: CardPageRequest): Checked<{ route: string; file: string }> {
  const title = request.title.trim();
  const slug = request.slug ?? slugify(title);
  if (!title) return { ok: false, error: "Enter the page's title." };
  if (!slug) return { ok: false, error: "The title gives no URL: add letters or digits." };
  // Only a URL a page could have, never one that leaves the site's folders.
  const normal = normalizeRoute(request.parent);
  if (!normal.ok || normal.value !== request.parent || !request.parent.endsWith("/")) return { ok: false, error: `${request.parent} is not a folder a page can be in.` };
  if (!input.folders.includes(request.parent)) return { ok: false, error: `There is no folder ${request.parent} in the site.` };
  const taken = { route: (route: string) => input.routes[route], exists: (path: string) => input.exists(path) };
  let parent = request.parent;
  if (request.newFolder !== undefined) {
    const name = request.newFolder.trim();
    if (!name) return { ok: false, error: "Enter the new folder's name." };
    const folder = nativeNewTarget(parent, name, taken);
    if (!folder.ok) return { ok: false, error: folder.error.replace(/ in the URL,/, " in the folder's name,") };
    parent = folder.value.route;
  }
  return nativeNewTarget(parent, slug, taken);
}

export function createCards(deps: CardsDeps) {
  const refuse = (reason: string) => { deps.announce(reason); showRefusal(reason); };
  function accepted(outcome: Outcome, stale: string): boolean {
    if (!outcome.ok) { refuse(outcome.reason === "stale" ? stale : outcome.message); return false; }
    if (outcome.message) refuse(outcome.message);
    return true;
  }
  const routeOf = (reads: Reads, path: string) => {
    const site = reads.site();
    return site ? Object.entries(site.routes).find(([, file]) => file === path)?.[0] : undefined;
  };
  const context = (reads: Reads, route: string): GridContext => ({ route, routes: reads.site()?.routes ?? {}, isSection: (tag) => tag === "section" || (tag.includes("-") && isSectionTemplate(reads.template(tag)?.source ?? "")) });
  const template = (reads: Reads, tag: string) => reads.template(tag)?.source;

  // Painting keeps the last grid read for each reported container while its page's text is the
  // same; a plan reads afresh, so the templates behind section-ness are read through its `r`.
  const cache = new Map<string, { source: string; grid: SourceGrid | undefined }>();
  function gridFor(reads: Reads, path: string, parent: number[]): { source: string; grid: SourceGrid } | undefined {
    const source = reads.source(path), route = routeOf(reads, path);
    if (source === undefined || !route) return undefined;
    if (reads !== deps.edits.peek) {
      const grid = gridAt(source, parent, context(reads, route));
      return grid ? { source, grid } : undefined;
    }
    const key = `${path}|${parent.join(".")}`;
    let entry = cache.get(key);
    if (!entry || entry.source !== source) {
      entry = { source, grid: gridAt(source, parent, context(reads, route)) };
      cache.set(key, entry);
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
    }
    return entry.grid ? { source, grid: entry.grid } : undefined;
  }

  const siteFolders = (reads: Reads) => cardPageFolders(reads.site()?.routes ?? {});
  const pageParent = (reads: Reads, grid: SourceGrid) => grid.collection ?? mixedParent(reads.site()?.routes ?? {}, grid.items.map((item) => item.route));

  /** Where a new page goes for `request`, or why it cannot. */
  function planPage(reads: Reads, request: CardPageRequest): Checked<{ route: string; file: string }> {
    const site = reads.site();
    if (!site) return { ok: false, error: "Open a native site first." };
    return planCardPage({ routes: site.routes, exists: (path) => reads.exists(path), folders: siteFolders(reads) }, request);
  }

  /**
   * The markup of a new item after `item` of `grid` (src/page-builder/card-grid.ts
   * `itemCopy`): with `page`, titled and linked to it; else with placeholder
   * text and its page link emptied. A verbatim copy when its text cannot be
   * reset (`reset` false).
   */
  function cardMarkup(reads: Reads, source: string, route: string, grid: SourceGrid, item: SourceGrid["items"][number], page?: { title: string; route: string }) {
    const element = itemElement(source, item.range);
    const tag = grid.kind.split(".")[0];
    const component = tag.includes("-") ? template(reads, tag) : undefined;
    const slots = component ? slotFallbacks(component) : { fallbacks: {} };
    const copy = element && itemCopy(source, element, {
      noun: grid.noun,
      title: page?.title,
      href: item.route ? page?.route ?? "" : undefined,
      isLinked: (href) => linkRoute(href, context(reads, route)) === item.route,
      fallbacks: slots.fallbacks,
    });
    return copy === undefined ? { text: source.slice(item.range.start, item.range.end), reset: false } : { text: copy, reset: true };
  }

  /**
   * A new subpage's document from sibling cards: a copy of the page
   * the last linked item goes to (its chrome, its sections), its text reset
   * by src/page-builder/card-grid.ts `pageBodyCopy` against a second sibling,
   * with the new title in its `<title>` (in the sibling's form, "Oak · Larkspur
   * Studio"), no description, and its own address. With no sibling page to
   * copy, the home page's document with an empty `<main>`, as the Pages tab makes.
   */
  function subpageDocument(reads: Reads, siblings: { route?: string; title?: string }[], title: string, route: string): string {
    const site = reads.site()!;
    const linked = siblings.filter((item) => item.route && site.routes[item.route] && reads.source(site.routes[item.route]) !== undefined);
    const from = linked.at(-1);
    const siteUrl = nativeSiteSettings(reads.source(NATIVE_CONFIG_PATH)).url;
    const blank = () => nativePageTemplate(reads.source(site.routes["/"] ?? ""), title, siteUrl ? `${siteUrl.replace(/\/$/, "")}${route}` : undefined);
    if (!from?.route) return blank();
    const sibling = reads.source(site.routes[from.route])!;
    const other = linked.slice(0, -1).at(-1);
    const otherSource = other?.route ? reads.source(site.routes[other.route]) : undefined;
    const range = (text: string) => mainRange(text) ?? nativePageBody(text);
    const otherLeaves = otherSource ? leafSummary(otherSource, range(otherSource)) : undefined;
    const oldTitle = from.title || firstHeadingText(sibling);
    const body = pageBodyCopy(sibling, range(sibling), otherLeaves, {
      title,
      from: from.route,
      to: route,
      oldTitle,
      fallback: (tag, slot) => {
        const text = template(reads, tag);
        return text ? slotFallbacks(text).fallbacks[slot] : undefined;
      },
    });
    if (body === undefined) return blank();
    const full = nativeNewPageTitle(nativePageHead(sibling).title, title);
    const detailed = nativePageWithDetails(withoutStructuredData(body), { title: full, description: "" });
    return nativePageMovedUrl(detailed, from.route, route, siteUrl);
  }

  /** Add card on an instance's card slot (card-slot.ts): the fresh card's edit, and what the slot is called, while its page's text and the templates read are the same. */
  let slotCache: { key: string; source: string; templates: Map<string, string | undefined>; add: ReturnType<typeof slotAdd> } | undefined;
  function slotAdd(source: string, parent: number[], slot: string, templateOf: (tag: string) => string | undefined, look?: CardLook) {
    const add = cardSlotAddEdit(source, parent, templateOf, slot, look);
    return add && { ...add, noun: itemNoun(add.card), label: instanceLabel(source, parent) ?? "" };
  }
  function slotAddFor(path: string, parent: number[], slot: string) {
    const reads = deps.edits.peek;
    const source = reads.source(path);
    if (source === undefined) return undefined;
    const key = `${path}|${parent.join(".")}|${slot}`;
    const fresh = slotCache?.key === key && slotCache.source === source && [...slotCache.templates].every(([tag, text]) => template(reads, tag) === text);
    if (!fresh) {
      const templates = new Map<string, string | undefined>();
      const add = slotAdd(source, parent, slot, (tag) => {
        if (!templates.has(tag)) templates.set(tag, template(reads, tag));
        return templates.get(tag);
      });
      slotCache = { key, source, templates, add };
    }
    return slotCache!.add;
  }

  /** The grid on the page shown that `report` names, as the source has it now. */
  function describe(report: ItemGridReport): GridDescription | undefined {
    const reads = deps.edits.peek;
    // A card slot's Add card places its card at once; linking it to a page comes after (ticket 09 §1).
    if (report.slot !== undefined) {
      const add = slotAddFor(report.path, report.parent, report.slot);
      return add && { noun: add.noun, label: add.label, card: add.card };
    }
    const found = gridFor(reads, report.path, report.parent);
    if (!found) return undefined;
    const tag = found.grid.kind.split(".")[0];
    return { noun: found.grid.noun, label: found.grid.label, collection: pageParent(reads, found.grid), card: template(reads, tag) !== undefined ? tag : undefined };
  }

  // Adds a card after the grid's last item and selects it: in an instance's
  // card slot (`slot`, else the slot its last item fills) a fresh card of the
  // slot's card component, else a copy of the last item with placeholder text.
  // Add card ▾ places a card slot's card in the chosen `look` (ticket 09 §7).
  // Resolves to the fresh card, which a page can be linked to next (ticket 09 §1).
  async function addCard(path: string, parent: number[], slot?: string, look?: CardLook): Promise<NewCard | undefined> {
    let result: NewCard | undefined;
    const outcome = await deps.edits.run(async reads => {
      // The page and the site as the press found them: proved unchanged across the site read.
      const before = reads.source(path);
      reads.site();
      const problem = await deps.siteRead();
      if (problem) return { refuse: problem };
      const found = gridFor(reads, path, parent);
      const route = routeOf(reads, path);
      const last = found?.grid.items.at(-1);
      const lastSlot = last && startTagAttribute(found!.source, last.range.tag, "slot")?.value;
      const slotName = slot ?? decodeHtmlEntities(lastSlot ?? "", true);
      const fresh = route && before !== undefined && slotAdd(before, parent, slotName, tag => template(reads, tag), look);
      if (fresh) {
        result = { path, node: [...parent, fresh.index] };
        return { edits: new Map([[path, [fresh.edit]]]), select: { after: result },
          done: `${capital(fresh.noun)} added to ${fresh.label}${look ? ` as ${look.label}` : ""}`,
          undone: `Undid adding the ${fresh.noun}.` };
      }
      if (look) return { refuse: "That card can't be added there any more." };
      if (!found || !route || !last) return { refuse: "That grid is not on the page any more." };
      const { source, grid } = found;
      const copy = cardMarkup(reads, source, route, grid, last);
      const node = [...grid.parent, last.index + 1];
      if (canFill(reads, grid.kind.split(".")[0], grid, copy.text)) result = { path, node };
      return { edits: new Map([[path, [insertAfterEdit(source, last.range, copy.text)]]]), select: { after: { path, node } },
        done: copy.reset ? `${capital(grid.noun)} added to ${grid.label}` : `${capital(grid.noun)} added to ${grid.label}, a copy of the last one (its text could not be reset)`,
        undone: `Undid adding the ${grid.noun}.` };
    }, { anchor: path });
    return accepted(outcome, "The page changed meanwhile; try adding the card again.") ? result : undefined;
  }

  /** Components, collections and plain cards with a heading can link to a page. */
  function canFill(reads: Reads, tag: string, grid?: SourceGrid, markup?: string): boolean {
    const root = markup && elementTree(markup)?.[0];
    const title = root && titleLeaf(markup!, root);
    return template(reads, tag) !== undefined || Boolean(grid && pageParent(reads, grid)) || Boolean(title && /^h[1-6]$/.test(title.name));
  }

  /** The pages the new card can link to (page-choices.ts): the site's, its page file, and those the grid's other cards link to. */
  function linkPages(card: NewCard): CardLinkPages | undefined {
    const reads = deps.edits.peek;
    const site = reads.site();
    if (!site) return undefined;
    const source = reads.source(card.path);
    const route = routeOf(reads, card.path);
    if (source === undefined || !route) return undefined;
    const grid = gridFor(reads, card.path, card.node.slice(0, -1))?.grid;
    return {
      routes: site.routes,
      folders: siteFolders(reads),
      folder: grid && pageParent(reads, grid),
      exists: path => reads.exists(path),
      own: card.path,
      inGrid: slotCardLinks(source, card.node, (href) => nativeLinkTarget(href, route, site.routes)),
      pages: Object.entries(site.routes).map(([route, file]) => ({ route, file, title: pageTitle(reads.source(file) ?? "", route).title })),
    };
  }

  /** The card's markup now; undefined once it is gone (undone, removed). */
  function cardText(card: NewCard): string | undefined {
    const reads = deps.edits.peek;
    const source = reads.source(card.path);
    const range = source === undefined ? undefined : locateNativeElementRange(source, card.node);
    return range && source!.slice(range.start, range.end);
  }

  const tagOf = (markup: string) => markup.slice(1).match(/^[^\s/>]+/)?.[0].toLowerCase();

  // Swaps the card's look in place (card-swap.ts, loaded with the looks),
  // one undo step, keeping it selected: its content carried by role, `kept`
  // what earlier looks held while the combobox is open (ticket 09 §8, §10).
  async function swapCard(card: NewCard, look: CardLook, from: { kept?: CardContent; variants: string[] }): Promise<CardSwapped | undefined> {
    let result: CardSwapped | undefined;
    const outcome = await deps.edits.run(async reads => {
      const source = reads.source(card.path);
      const range = source === undefined ? undefined : locateNativeElementRange(source, card.node);
      const before = range && source!.slice(range.start, range.end);
      const tag = before && tagOf(before);
      const own = tag ? template(reads, tag) : undefined;
      const lookTemplate = reads.template(look.tag);
      if (!range || own === undefined || !lookTemplate) return { refuse: "That card or its look is not there any more." };
      const { cardSwap } = await import("./card-swap");
      const swapped = cardSwap({ card: before!, template: own, look, lookTemplate: lookTemplate.source, kept: from.kept, variants: from.variants });
      const css = await hostCss(reads, lookTemplate.path, swapped.titleLinked);
      const noun = itemNoun(look.tag);
      result = { kept: swapped.kept, notShown: swapped.notShown, text: swapped.markup };
      return cardPlan(card, { start: range.start, end: range.end, text: swapped.markup }, css,
        `${capital(noun)} is now ${look.label}`, `Undid changing the ${noun}'s look.`);
    }, { anchor: card.path });
    return accepted(outcome, "The page changed meanwhile; choose the look again.") ? result : undefined;
  }

  /** Build both existing-page and new-page fills directly from the page's text. */
  function fillFrom(reads: Reads, card: NewCard, route: string, page: string) {
    const source = reads.source(card.path);
    const range = source === undefined ? undefined : locateNativeElementRange(source, card.node);
    const element = range && itemElement(source!, range);
    if (!element || !range || source === undefined) return undefined;
    const tag = element.name;
    const text = template(reads, tag);
    const grid = gridFor(reads, card.path, card.node.slice(0, -1))?.grid;
    if (!canFill(reads, tag, grid, source.slice(range.start, range.end))) return undefined;
    const from = source.slice(range.start, range.end);
    const title = pageTitle(page, route).title;
    // Plain cards map the same facts onto their first body paragraph and image.
    let rows = cardFill({ template: text ?? '<slot name="title"><h3>Title</h3></slot><slot name="body"><p></p></slot><slot name="image"><img src="" alt=""></slot><slot name="link"></slot>', page: { route, source: page }, siteUrl: nativeSiteSettings(reads.source(NATIVE_CONFIG_PATH)).url }).rows.map(row => text === undefined ? { ...row, slot: undefined } : row);
    const plain = text === undefined ? itemPageFill(from, grid!.noun, title, route, rows) : undefined;
    if (plain) rows = plain.rows;
    const filled = text !== undefined ? cardFillMarkup(from, text, rows) : plain?.markup;
    if (filled === undefined) return undefined;
    return { source, templatePath: reads.template(tag)?.path, titleLinked: rows.some(row => row.status === "added"),
      edit: { start: range.start, end: range.end, text: filled }, noun: grid?.noun ?? itemNoun(tag), result: { title, route } };
  }

  /** Fill from an existing page as one guarded edit. */
  async function fillCard(card: NewCard, route: string): Promise<CardFilled | undefined> {
    let result: CardFilled | undefined;
    const outcome = await deps.edits.run(async reads => {
      const file = reads.site()?.routes[route];
      const page = file === undefined ? undefined : reads.source(file);
      const fill = page === undefined ? undefined : fillFrom(reads, card, route, page);
      if (!fill) return { refuse: "That card or page is not there any more." };
      const css = await hostCss(reads, fill.templatePath, fill.titleLinked);
      result = fill.result;
      return cardPlan(card, fill.edit, css, `${capital(fill.noun)} filled from ${fill.result.title}`, `Undid filling the ${fill.noun}.`);
    }, { anchor: card.path });
    return accepted(outcome, "The page changed meanwhile; choose the page again.") ? result : undefined;
  }

  /** Read the host before loading the CSS helper, including its absence. */
  async function hostCss(reads: Reads, templatePath: string | undefined, titleLinked: boolean) {
    if (!templatePath || !titleLinked) return undefined;
    const path = templatePath.replace(/\.html$/, ".css");
    const before = reads.source(path);
    if (before === undefined && reads.exists(path)) return undefined;
    const { cardLinkCss } = await import("./card-link-css");
    const after = cardLinkCss(before);
    return before === after ? undefined : { path, before, after };
  }

  /** The card range and optional host CSS share one step. */
  function cardPlan(card: NewCard, edit: RangeEdit, css: Awaited<ReturnType<typeof hostCss>>, done: string, undone: string): Planned {
    const edits: Planned["edits"] = new Map([[card.path, [edit]]]);
    const creates: NonNullable<Planned["creates"]> = [];
    if (css) {
      if (css.before === undefined) creates.push({ path: css.path, content: css.after });
      else edits.set(css.path, css.after);
    }
    return { edits, creates, select: { before: card, after: card }, done, undone };
  }

  /**
   * The pages a new page for `card` copies its structure from, last one
   * first in line: a grid's items' own pages (each item's title too), else,
   * in an instance's card slot, the other cards' links under the folder most
   * of them go to (a card's second link, to About, is not a sibling).
   */
  function siblingPages(reads: Reads, source: string, card: NewCard, route: string, routes: Record<string, string>): { route?: string; title?: string }[] {
    const titled = (range: SourceGrid["items"][number]["range"]) => {
      const element = itemElement(source, range);
      return element && itemTitle(source, element);
    };
    const parentRange = locateNativeElementRange(source, card.node.slice(0, -1));
    const children = (parentRange && itemElement(source, parentRange))?.children ?? [];
    const own = card.node.at(-1)!;
    // Only the card's own slot counts: an instance's two card slots are two lists.
    const slotOf = (element: (typeof children)[number] | undefined) => element && decodeHtmlEntities(startTagAttribute(source, element.tag, "slot")?.value ?? "", true);
    const sameSlot = (at: number) => at !== own && slotOf(children[at]) === slotOf(children[own]);
    const grid = gridFor(reads, card.path, card.node.slice(0, -1))?.grid;
    const items = grid?.items.filter((item) => sameSlot(item.index));
    if (items?.some((item) => item.route)) return items.map((item) => ({ route: item.route, title: titled(item.range) }));
    const links = slotCardLinks(source, card.node, (href) => nativeLinkTarget(href, route, routes));
    const folder = cardFolder(links);
    const peers = children.filter((_, at) => sameSlot(at));
    return links.filter((link) => !folder || (link !== folder && link.startsWith(folder))).map((link) => {
      const item = [...peers].reverse().find((child) => allElements([child]).some((element) => {
        const href = element.name === "a" && startTagAttribute(source, element.tag, "href")?.value;
        return href && nativeLinkTarget(decodeHtmlEntities(href, true), route, routes) === link;
      }));
      return { route: link, title: item && itemTitle(source, item) };
    });
  }

  /** Create a page and fill the placed card in one guarded edit. */
  async function createPage(card: NewCard, request: CardPageRequest): Promise<CardFilled | undefined> {
    let result: CardFilled | undefined;
    const outcome = await deps.edits.run(async reads => {
      const source = reads.source(card.path), route = routeOf(reads, card.path), site = reads.site();
      if (source === undefined || !route || !site) return { refuse: "That card is not there any more." };
      const target = planPage(reads, request);
      if (!target.ok) return { refuse: target.error };
      const siblings = siblingPages(reads, source, card, route, site.routes);
      // The home page is a creation input even when siblings supply the structure.
      if (site.routes["/"]) reads.source(site.routes["/"]);
      const content = subpageDocument(reads, siblings, request.title.trim(), target.value.route);
      const fill = fillFrom(reads, card, target.value.route, content);
      if (!fill) return { refuse: "That card is not there any more." };
      if (fill.edit.text === source.slice(fill.edit.start, fill.edit.end)) return { refuse: `Nothing on this ${fill.noun} takes a page's title or address.` };
      const css = await hostCss(reads, fill.templatePath, fill.titleLinked);
      result = fill.result;
      const plan = cardPlan(card, fill.edit, css,
        `Created the page ${fill.result.title} at ${fill.result.route} and filled the ${fill.noun} from it`, `Undid creating the page ${fill.result.title} and filling the ${fill.noun}.`);
      plan.creates!.push({ path: target.value.file, content });
      return plan;
    }, { anchor: card.path });
    return accepted(outcome, "The page changed meanwhile; try again.") ? result : undefined;
  }

  /** Moves the item at `node` one place among its grid's items, keeping it selected. */
  function move(selection: { path: string; node?: number[] }, direction: "up" | "down", painted = deps.edits.peek.source(selection.path), since = deps.edits.stamp()): boolean {
    const { path, node } = selection;
    if (!node || painted === undefined || !deps.editable(path)) return false;
    let found = false;
    const outcome = deps.edits.now(reads => {
      if (reads.source(path) !== painted) return { refuse: "The source changed. Select the element again and try again." };
      const route = routeOf(reads, path);
      const own = route && gridOfItem(painted, node, context(reads, route));
      if (!own) return { edits: new Map(), done: "", undone: "" };
      found = true;
      const { grid, position } = own;
      const other = grid.items[position + (direction === "up" ? -1 : 1)];
      if (!other) return { edits: new Map([[path, []]]), done: "", undone: "" };
      const row = deps.preview()?.selectedItemGrid()?.row;
      const words = direction === "up" ? (row ? "left" : "up") : (row ? "right" : "down");
      return { edits: new Map([[path, swapEdits(painted, grid.items[position].range, other.range)]]),
        select: { before: { path, node }, after: { path, node: [...grid.parent, other.index] } },
        done: `${capital(grid.noun)} moved ${words}`, undone: `Undid moving the ${grid.noun}.` };
    }, { anchor: path, since });
    return accepted(outcome, "The source changed. Select the element again and try again.") && found;
  }

  /**
   * The edit bar's controls for a selection in or around an item: the
   * item's own (Move, Duplicate, Remove, Add card, Open page) when it is
   * one, else Select card when it is inside one (in the page, or in a
   * component's template on the page).
   */
  function controls(selection: NativePreviewSelection, source: string): EditBarControl[] {
    const reads = deps.edits.peek;
    const site = reads.site();
    const preview = deps.preview();
    const node = selection.node;
    if (!site || !preview) return [];
    const route = routeOf(reads, selection.path);
    if (!route) {
      // In a component's template: the runtime knows the page's item around it.
      const grid = preview.selectedItemGrid();
      const about = grid && grid.index >= 0 && describe(grid);
      if (!grid || !about) return [];
      return [selectItem(about.noun, grid.path, [...grid.parent, grid.index])];
    }
    if (!node) return [];
    const own = gridOfItem(source, node, context(reads, route));
    if (!own) {
      const around = itemAround(source, node, context(reads, route));
      return around ? [selectItem(around.grid.noun, selection.path, around.node)] : [];
    }
    const { grid, position } = own;
    const item = grid.items[position];
    const previous = grid.items[position - 1];
    const next = grid.items[position + 1];
    const noun = capital(grid.noun);
    const reported = preview.selectedItemGrid();
    const row = reported && reported.parent.join(".") === grid.parent.join(".") ? reported.row : false;
    const path = selection.path;
    const since = deps.edits.stamp();
    const change = (edits: RangeEdit[], next: number[] | undefined, done: string, undone: string) => {
      if (!deps.editable(path)) return false;
      const outcome = deps.edits.now(reads => {
        // The item is still one of this grid's (section-ness comes from templates, read through `r`).
        if (reads.source(path) !== source || gridOfItem(source, node, context(reads, route))?.grid.parent.join(".") !== grid.parent.join("."))
          return { refuse: "The source changed. Select the element again and try again." };
        return { edits: new Map([[path, edits]]), select: { before: { path, node }, after: next ? { path, node: next } : undefined }, done, undone };
      }, { anchor: path, since });
      return accepted(outcome, "The source changed. Select the element again and try again.");
    };
    const out: EditBarControl[] = [
      { kind: "button", icon: row ? "left" : "up", label: row ? "Move left" : "Move up", disabled: !previous, onPress: () => move(selection, "up", source, since) },
      { kind: "button", icon: row ? "right" : "down", label: row ? "Move right" : "Move down", disabled: !next, onPress: () => move(selection, "down", source, since) },
      { kind: "button", icon: "duplicate", label: "Duplicate", onPress: () => change([duplicateEdit(source, item.range)], [...grid.parent, item.index + 1], `${noun} duplicated`, `Undid duplicating the ${grid.noun}.`) },
      {
        kind: "button",
        icon: "remove",
        label: "Remove",
        // Every Remove uses the same sibling/parent selection rule.
        onPress: () => change([removeEdit(source, item.range)],
          selectionAfterRemove(node, Boolean(locateNativeElementRange(source, [...node.slice(0, -1), node.at(-1)! + 1]))), `${noun} removed`, `Undid removing the ${grid.noun}.`),
      },
      {
        kind: "button",
        icon: "add",
        label: `Add ${grid.noun}`,
        title: `Add ${aOr(grid.noun)} to ${grid.label}`,
        // The grid report can arrive after the bar is built: read it at the press.
        onPress: () => {
          const now = deps.preview()?.selectedItemGrid();
          if (now && now.parent.join(".") === grid.parent.join(".")) deps.preview()?.addToSelectedGrid();
          else void addCard(path, grid.parent);
        },
      },
    ];
    const page = item.route ? site.routes[item.route] : undefined;
    if (page) out.push({ kind: "button", label: "Open page", title: `Open ${item.route}`, className: "edit-bar__open-page", onPress: () => deps.openPage(page) });
    return out;
  }

  function selectItem(noun: string, path: string, node: number[]): EditBarControl {
    return {
      kind: "button",
      label: `Select ${noun}`,
      title: `Select the whole ${noun} this is in`,
      className: "edit-bar__select-item",
      onPress: () => deps.preview()?.selectNode({ path, node }),
    };
  }

  /** The grid on any page that lists the pages under `parent`, with the page it is on. */
  function collectionFor(reads: Reads, parent: string): { file: string; route: string; source: string; grid: SourceGrid } | undefined {
    const site = reads.site();
    if (!site || parent === "/") return undefined;
    for (const [route, file] of Object.entries(site.routes)) {
      const source = reads.source(file);
      if (source === undefined) continue;
      const grid = pageGrids(source, context(reads, route)).find((item) => item.collection === parent);
      if (grid) return { file, route, source, grid };
    }
    return undefined;
  }

  return {
    describe,
    addCard: (report: ItemGridReport, look?: CardLook) => addCard(report.path, report.parent, report.slot, look),
    createPage,
    linkPages,
    fillCard,
    swapCard,
    cardText,
    variantFiles: deps.variantFiles,
    move,
    controls,

    /** The Pages tab's offer for a new subpage of `parent`: the label of its checkbox, when a grid lists those pages. */
    cardOffer(parent: string): string | undefined {
      const reads = deps.edits.peek;
      const found = collectionFor(reads, parent);
      return found ? `Add ${aOr(found.grid.noun)} to “${found.grid.label}” on ${deps.pageLabel(found.file)}` : undefined;
    },

    /**
     * A new subpage made in the Pages tab with its card: the page from a
     * sibling's structure and a card after the grid's last one, as one
     * operation (one undo). Resolves to an error.
     */
    async createWithCard(request: { parent: string; title: string; slug: string }): Promise<string | undefined> {
      const outcome = await deps.edits.run(async reads => {
        const site = reads.site();
        const found = collectionFor(reads, request.parent);
        if (!site || !found) return { refuse: `No grid lists the pages under ${request.parent} any more.` };
        const target = nativeNewTarget(request.parent, request.slug, { route: (route) => site.routes[route], exists: (path) => reads.exists(path) });
        if (!target.ok) return { refuse: target.error };
        const { source, grid, file, route } = found;
        const title = request.title.trim();
        if (site.routes["/"]) reads.source(site.routes["/"]);
        const content = subpageDocument(reads, grid.items.map(item => { const element = itemElement(source, item.range); return { route: item.route, title: element && itemTitle(source, element) }; }), title, target.value.route);
        const where = `“${grid.label}” on ${deps.pageLabel(file)}`;
        const last = grid.items[grid.items.length - 1];
        const copy = cardMarkup(reads, source, route, grid, last, { title, route: target.value.route });

        return {
          creates: [{ path: target.value.file, content }],
          edits: new Map([[file, [insertAfterEdit(source, last.range, copy.text)]]]),
          open: target.value.file,
          done: `Created the page ${title} at ${target.value.route}, with its ${grid.noun} in ${where}.`,
          undone: `Undid creating the page ${title} and its ${grid.noun}.`,
          focus: { file: target.value.file },
        };
      });
      // Written, but opening the new page failed: the Pages tab shows that message, as before.
      return outcome.message;
    },

    /**
     * The items that link to the page at `route` in grids listing pages, on
     * pages other than `except`: the checkbox's label for deleting them with
     * the page, and each page's text without them.
     */
    cardsLinkingTo(route: string, except: Set<string>): { label: string; edits: Map<string, string> } | undefined {
      const reads = deps.edits.peek;
      const site = reads.site();
      if (!site) return undefined;
      const edits = new Map<string, string>();
      let first: { grid: SourceGrid; file: string } | undefined;
      let count = 0;
      for (const [pageRoute, file] of Object.entries(site.routes)) {
        if (except.has(file)) continue;
        const source = reads.source(file);
        if (source === undefined) continue;
        const removals: RangeEdit[] = [];
        for (const grid of pageGrids(source, context(reads, pageRoute))) {
          if (!grid.collection) continue;
          for (const item of grid.items) {
            if (item.route !== route) continue;
            removals.push(removeEdit(source, item.range));
            first ??= { grid, file };
            count++;
          }
        }
        // Nested grids could overlap; only the outermost removal of a range is kept.
        const kept = removals.filter((edit, index) => !removals.some((other, at) => at !== index && other.start <= edit.start && other.end >= edit.end && (other.start < edit.start || other.end > edit.end)));
        if (kept.length) edits.set(file, applyEdits(source, kept));
      }
      if (!first) return undefined;
      const where = `“${first.grid.label}” on ${deps.pageLabel(first.file)}`;
      return {
        label: count === 1 ? `Also remove its ${first.grid.noun} from ${where}` : `Also remove its ${count} ${first.grid.noun}s (one in ${where})`,
        edits,
      };
    },
  };
}

export type Cards = ReturnType<typeof createCards>;
