// Cards: grids of repeated items in the editor (docs/page-builder/cards.md).
// Add card places a blank card first. Component cards and collection items
// open Link to a page; choosing a page fills the card, and Create page copies
// a sibling's structure with the page and fill in one undo step. The Pages
// tab can still create or delete a page with its collection card.
//
// The grid markup and the page files are the collection: nothing else is
// written. Every change is one range edit to the page in its editor, or
// one operation over drafts (src/main.ts `applyNativeOperation`).

import { refuse as showRefusal } from "../components/refusal-note";
import type { NativePreview, NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import type { CardFilled, CardLinkPages, CardPageRequest, CardSwapped, GridDescription, ItemGridReport, NewCard } from "../components/card-grid-controls";
import { nativePageBody, nativePageHead, nativePageMovedUrl, nativePageWithDetails, type NativeSite } from "../../shared/native-project";
import { nativeNewPageTitle, nativePageTemplate, normalizeRoute, withoutStructuredData, type Checked } from "../native-create";
import { firstHeadingText, nativeNewTarget, slugify } from "../native-pages";
import { duplicateEdit, removeEdit, swapEdits } from "../native-structure";
import { allElements, elementTree, aOr, insertAfterEdit, itemCopy, itemNoun, itemTitle, titleLeaf, itemFill, leafSummary, pageBodyCopy, slotFallbacks } from "./card-grid";
import { gridAt, gridOfItem, instanceLabel, itemAround, itemElement, linkRoute, mainRange, pageGrids, type GridContext, type SourceGrid } from "./card-source";
import { cardSlotAddEdit, slotCardLinks } from "./card-slot";
import { cardFill, cardFillContent, cardFillMarkup, pageTitle } from "./card-fill";
import { cardFolder } from "./page-choices";
import { locateNativeElementRange } from "../native-source-location";
import type { CardLook } from "./card-looks";
import type { CardContent } from "./card-swap";
import { decodeHtmlEntities } from "./html-entities";
import { startTagAttribute } from "../../shared/html-source";
import { nativeLinkTarget } from "../../shared/native-routes";

interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

/** What the editor offers this module (src/main.ts). */
export interface CardsDeps {
  site(): NativeSite | undefined;
  /** A file's text as edited (the mounted editor's, a draft's, else the branch's). */
  source(path: string): string | undefined;
  /** Whether a tag is a section (a `<section>` or a section component). */
  isSection(tag: string): boolean;
  editor(): {
    isMounted(path: string): boolean;
    replaceActiveRange(edit: RangeEdit & { path: string; expected: string }, group?: boolean, companion?: { undo(): void; redo(): void | string }): void;
  } | undefined;
  preview(): NativePreview | undefined;
  /** Opens a page file in the editor unless it is open; resolves to whether it is mounted then. */
  ensureOpen(path: string): Promise<boolean>;
  /** Opens a page in the editor and the preview. */
  openPage(file: string): void;
  /** One verified edit to the mounted page as one undo step, selecting `next` after (src/main.ts `applyNativeChange`). */
  change(path: string, source: string, edits: RangeEdit[], next: number[] | undefined, message: string): boolean;
  /** Whether a repository path (a file, or a folder something is in) is there, on the branch or drafted. */
  exists(path: string): boolean;
  /** The site's address, from `.editor/config.json`. */
  siteUrl(): string | undefined;
  /** Writes a new file as a draft and finds the site's pages again; resolves to an error. */
  saveNewDraft(path: string, content: string): string | undefined;
  /** Takes a draft made by `saveNewDraft` back. */
  dropNewDraft(path: string): void;
  /** Creates and edits files as one operation (src/main.ts `applyNativeOperation`); resolves to an error. */
  operation(op: { expectedSources?: Map<string, string | undefined>; creates: { path: string; content: string }[]; edits: Map<string, string>; open?: string; done: string; undone: string; focus?: { file?: string }; current?: () => boolean; selection?: { before?: { path: string; node: number[] }; after?: { path: string; node: number[] } } }): Promise<string | undefined>;
  /** What the Pages tab calls a page file ("Home"). */
  pageLabel(file: string): string;
  /** The site's scripts, drafts applied (read lazily), for the attributes they set: those are no card looks. */
  scripts(): { path: string; source: string }[];
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
  const routeOf = (path: string) => {
    const site = deps.site();
    return site ? Object.entries(site.routes).find(([, file]) => file === path)?.[0] : undefined;
  };
  const context = (route: string): GridContext => ({ route, routes: deps.site()?.routes ?? {}, isSection: (tag) => deps.isSection(tag) });
  const template = (tag: string) => {
    const file = deps.site()?.components[tag];
    return file ? deps.source(file) : undefined;
  };

  // The last grid read for each reported container, while its page's text is the same.
  const cache = new Map<string, { source: string; grid: SourceGrid | undefined }>();
  function gridFor(path: string, parent: number[]): { source: string; grid: SourceGrid } | undefined {
    const source = deps.source(path);
    const route = routeOf(path);
    if (source === undefined || !route) return undefined;
    const key = `${path}|${parent.join(".")}`;
    let entry = cache.get(key);
    if (!entry || entry.source !== source) {
      entry = { source, grid: gridAt(source, parent, context(route)) };
      cache.set(key, entry);
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
    }
    return entry.grid ? { source, grid: entry.grid } : undefined;
  }

  const siteFolders = () => cardPageFolders(deps.site()?.routes ?? {});
  const pageParent = (grid: SourceGrid) => grid.collection ?? mixedParent(deps.site()?.routes ?? {}, grid.items.map((item) => item.route));

  /** Where a new page goes for `request`, or why it cannot. */
  function planPage(request: CardPageRequest): Checked<{ route: string; file: string }> {
    const site = deps.site();
    if (!site) return { ok: false, error: "Open a native site first." };
    return planCardPage({ routes: site.routes, exists: (path) => deps.exists(path), folders: siteFolders() }, request);
  }

  /**
   * The markup of a new item after `item` of `grid` (src/page-builder/card-grid.ts
   * `itemCopy`): with `page`, titled and linked to it; else with placeholder
   * text and its page link emptied. A verbatim copy when its text cannot be
   * reset (`reset` false).
   */
  function cardMarkup(source: string, route: string, grid: SourceGrid, item: SourceGrid["items"][number], page?: { title: string; route: string }) {
    const element = itemElement(source, item.range);
    const tag = grid.kind.split(".")[0];
    const component = tag.includes("-") ? template(tag) : undefined;
    const slots = component ? slotFallbacks(component) : { fallbacks: {} };
    const copy = element && itemCopy(source, element, {
      noun: grid.noun,
      title: page?.title,
      href: item.route ? page?.route ?? "" : undefined,
      isLinked: (href) => linkRoute(href, context(route)) === item.route,
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
  function subpageDocument(siblings: { route?: string; title?: string }[], title: string, route: string): string {
    const site = deps.site()!;
    const linked = siblings.filter((item) => item.route && site.routes[item.route] && deps.source(site.routes[item.route]) !== undefined);
    const from = linked.at(-1);
    const siteUrl = deps.siteUrl();
    const blank = () => nativePageTemplate(deps.source(site.routes["/"] ?? ""), title, siteUrl ? `${siteUrl.replace(/\/$/, "")}${route}` : undefined);
    if (!from?.route) return blank();
    const sibling = deps.source(site.routes[from.route])!;
    const other = linked.slice(0, -1).at(-1);
    const otherSource = other?.route ? deps.source(site.routes[other.route]) : undefined;
    const range = (text: string) => mainRange(text) ?? nativePageBody(text);
    const otherLeaves = otherSource ? leafSummary(otherSource, range(otherSource)) : undefined;
    const oldTitle = from.title || firstHeadingText(sibling);
    const body = pageBodyCopy(sibling, range(sibling), otherLeaves, {
      title,
      from: from.route,
      to: route,
      oldTitle,
      fallback: (tag, slot) => {
        const text = template(tag);
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
    const source = deps.source(path);
    if (source === undefined) return undefined;
    const key = `${path}|${parent.join(".")}|${slot}`;
    const fresh = slotCache?.key === key && slotCache.source === source && [...slotCache.templates].every(([tag, text]) => template(tag) === text);
    if (!fresh) {
      const templates = new Map<string, string | undefined>();
      const add = slotAdd(source, parent, slot, (tag) => {
        if (!templates.has(tag)) templates.set(tag, template(tag));
        return templates.get(tag);
      });
      slotCache = { key, source, templates, add };
    }
    return slotCache!.add;
  }

  /** The grid on the page shown that `report` names, as the source has it now. */
  function describe(report: ItemGridReport): GridDescription | undefined {
    // A card slot's Add card places its card at once; linking it to a page comes after (ticket 09 §1).
    if (report.slot !== undefined) {
      const add = slotAddFor(report.path, report.parent, report.slot);
      return add && { noun: add.noun, label: add.label, card: add.card };
    }
    const found = gridFor(report.path, report.parent);
    if (!found) return undefined;
    const tag = found.grid.kind.split(".")[0];
    return { noun: found.grid.noun, label: found.grid.label, collection: pageParent(found.grid), card: template(tag) !== undefined ? tag : undefined };
  }

  // Adds a card after the grid's last item and selects it: in an instance's
  // card slot (`slot`, else the slot its last item fills) a fresh card of the
  // slot's card component, else a copy of the last item with placeholder text.
  // Add card ▾ places a card slot's card in the chosen `look` (ticket 09 §7).
  // Resolves to the fresh card, which a page can be linked to next (ticket 09 §1).
  async function addCard(path: string, parent: number[], slot?: string, look?: CardLook): Promise<NewCard | undefined> {
    const before = deps.source(path);
    const site = deps.site();
    if (!(await deps.ensureOpen(path))) return;
    if (deps.source(path) !== before || deps.site() !== site) { refuse("The page changed meanwhile; try adding the card again."); return; }
    const found = gridFor(path, parent);
    const route = routeOf(path);
    const last = found?.grid.items[found.grid.items.length - 1];
    const lastSlot = last && startTagAttribute(found.source, last.range.tag, "slot")?.value;
    const slotName = slot ?? decodeHtmlEntities(lastSlot ?? "", true);
    const text = look && deps.source(path);
    const fresh = route && (!look ? slotAddFor(path, parent, slotName) : text === undefined ? undefined : slotAdd(text, parent, slotName, template, look));
    if (fresh) {
      const node = [...parent, fresh.index];
      return deps.change(path, fresh.edit.source, [fresh.edit], node, `${capital(fresh.noun)} added to ${fresh.label}${look ? ` as ${look.label}` : ""}`) ? { path, node } : undefined;
    }
    if (look) { refuse("That card can't be added there any more."); return; }
    if (!found || !route || !last) { refuse("That grid is not on the page any more."); return; }
    const { source, grid } = found;
    const copy = cardMarkup(source, route, grid, last);
    const edit = insertAfterEdit(source, last.range, copy.text);
    const what = capital(grid.noun);
    const node = [...grid.parent, last.index + 1];
    const changed = deps.change(path, source, [edit], node,
      copy.reset ? `${what} added to ${grid.label}` : `${what} added to ${grid.label}, a copy of the last one (its text could not be reset)`);
    return changed && canFill(grid.kind.split(".")[0], grid, copy.text) ? { path, node } : undefined;
  }

  /** Components, collections and plain cards with a heading can link to a page. */
  function canFill(tag: string, grid?: SourceGrid, markup?: string): boolean {
    const root = markup && elementTree(markup)?.[0];
    const title = root && titleLeaf(markup!, root);
    return template(tag) !== undefined || Boolean(grid && pageParent(grid)) || Boolean(title && /^h[1-6]$/.test(title.name));
  }

  /** The pages the new card can link to (page-choices.ts): the site's, its page file, and those the grid's other cards link to. */
  function linkPages(card: NewCard): CardLinkPages | undefined {
    const site = deps.site();
    if (!site) return undefined;
    const source = deps.source(card.path);
    const route = routeOf(card.path);
    if (source === undefined || !route) return undefined;
    const grid = gridFor(card.path, card.node.slice(0, -1))?.grid;
    return {
      routes: site.routes,
      folders: siteFolders(),
      folder: grid && pageParent(grid),
      exists: path => deps.exists(path),
      own: card.path,
      inGrid: slotCardLinks(source, card.node, (href) => nativeLinkTarget(href, route, site.routes)),
      pages: Object.entries(site.routes).map(([route, file]) => ({ route, file, title: pageTitle(deps.source(file) ?? "", route).title })),
    };
  }

  /** The card's markup now; undefined once it is gone (undone, removed). */
  function cardText(card: NewCard): string | undefined {
    const source = deps.source(card.path);
    const range = source === undefined ? undefined : locateNativeElementRange(source, card.node);
    return range && source!.slice(range.start, range.end);
  }

  const tagOf = (markup: string) => markup.slice(1).match(/^[^\s/>]+/)?.[0].toLowerCase();

  // Swaps the card's look in place (card-swap.ts, loaded with the looks),
  // one undo step, keeping it selected: its content carried by role, `kept`
  // what earlier looks held. A filled card's strip rows, and the card Change
  // page fills from, follow the new look (ticket 09 §8, §10).
  async function swapCard(card: NewCard, look: CardLook, from: { kept?: CardContent; variants: string[]; filled?: CardFilled }): Promise<CardSwapped | undefined> {
    // The site and page as the swap was asked for: another site, or a change meanwhile, is not swapped over.
    const site = deps.site();
    const source = deps.source(card.path);
    const { cardSwap } = await import("./card-swap");
    if (deps.site() !== site || deps.source(card.path) !== source) { refuse("The page changed meanwhile; choose the look again."); return undefined; }
    const range = source === undefined ? undefined : locateNativeElementRange(source, card.node);
    const before = range && source!.slice(range.start, range.end);
    const tag = before && tagOf(before);
    const own = tag ? template(tag) : undefined;
    const next = template(look.tag);
    if (!range || own === undefined || next === undefined) { refuse("That card or its look is not there any more."); return undefined; }
    const swapped = cardSwap({ card: before!, template: own, look, lookTemplate: next, kept: from.kept, variants: from.variants });
    const edit = { start: range.start, end: range.end, text: swapped.markup };
    if (swapped.markup !== before && !deps.change(card.path, source!, [edit], card.node, `${capital(itemNoun(look.tag))} is now ${look.label}`)) return undefined;
    let filled = from.filled && { ...from.filled, filled: swapped.markup };
    const file = filled && deps.site()?.routes[filled.route];
    const page = file === undefined ? undefined : deps.source(file);
    if (filled && page !== undefined) {
      const baseTag = tagOf(filled.base);
      const baseTemplate = baseTag ? template(baseTag) : undefined;
      filled = {
        ...filled,
        rows: cardFill({ template: next, page: { route: filled.route, source: page }, siteUrl: deps.siteUrl() }).rows,
        base: baseTemplate === undefined ? filled.base : cardSwap({ card: filled.base, template: baseTemplate, look, lookTemplate: next, variants: from.variants }).markup,
      };
    }
    return { kept: swapped.kept, notShown: swapped.notShown, text: swapped.markup, filled };
  }

  /** Build both existing-page and new-page fills directly from the page's text. */
  function fillFrom(card: NewCard, route: string, page: string, base?: string) {
    const source = deps.source(card.path);
    const range = source === undefined ? undefined : locateNativeElementRange(source, card.node);
    const element = range && itemElement(source!, range);
    if (!element || !range || source === undefined) return undefined;
    const tag = element.name;
    const text = template(tag);
    const grid = gridFor(card.path, card.node.slice(0, -1))?.grid;
    if (!canFill(tag, grid, source.slice(range.start, range.end))) return undefined;
    const before = source.slice(range.start, range.end);
    const from = base ?? before;
    const title = pageTitle(page, route).title;
    // Plain collection items use the same facts, with Title and Link as their two roles.
    let rows = cardFill({ template: text ?? '<slot name="title"><h3>Title</h3></slot><slot name="link"></slot>', page: { route, source: page }, siteUrl: deps.siteUrl() }).rows.map(row => text === undefined ? { ...row, slot: undefined } : row);
    const plain = text === undefined ? itemFill(from, grid!.noun, title, route) : undefined;
    if (plain?.added) rows = rows.map(row => row.role === "link" ? { ...row, status: "added", text: title } : row);
    const filled = text !== undefined ? cardFillMarkup(from, text, rows) : plain?.markup;
    const expectedSources = new Map<string, string | undefined>([[card.path, source]]);
    const pagePath = deps.site()?.routes[route];
    if (pagePath) expectedSources.set(pagePath, page);
    const templatePath = deps.site()?.components[tag];
    if (templatePath) expectedSources.set(templatePath, text);
    // A component's title link (decision 3) needs its host positioned to bound the site's stretch rule.
    const cssPath = text !== undefined && rows.some(row => row.status === "added") ? templatePath?.replace(/\.html$/, ".css") : undefined;
    const cssBefore = cssPath && deps.source(cssPath);
    // A CSS file there whose text is not read is left alone: the title link works without it.
    const host = cssPath && (cssBefore !== undefined || !deps.exists(cssPath)) ? { path: cssPath, before: cssBefore } : undefined;
    if (filled === undefined) return undefined;
    return { source, host, expectedSources, edit: { start: range.start, end: range.end, text: filled }, noun: grid?.noun ?? itemNoun(tag), result: { rows, title, route, base: from, filled, content: cardFillContent(rows) } };
  }

  /** Fill an existing page as one edit, preserving the original card for Change page. */
  function fillCard(card: NewCard, route: string, base?: string): CardFilled | undefined | Promise<CardFilled | undefined> {
    const file = deps.site()?.routes[route];
    const page = file === undefined ? undefined : deps.source(file);
    const fill = page === undefined ? undefined : fillFrom(card, route, page, base);
    if (!fill) { refuse("That card or page is not there any more."); return undefined; }
    const message = `${capital(fill.noun)} filled from ${fill.result.title}`;
    const plainFill = () => (fill.edit.text === fill.source.slice(fill.edit.start, fill.edit.end) ||
      deps.change(card.path, fill.source, [fill.edit], card.node, message) ? fill.result : undefined);
    if (!fill.host) return plainFill();
    return hostCss(card, fill).then(css => css === null ? undefined : css === undefined ? plainFill() : fillOperation(card, fill, css, [], message).then(ok => ok ? fill.result : undefined));
  }

  type Fill = NonNullable<ReturnType<typeof fillFrom>>;

  /**
   * The component's CSS with `:host { position: relative; }` (card-link-css.ts,
   * loaded only here) when it lacks it; null, refused, when the site, the
   * editor or any file the fill read changed while it loaded.
   */
  async function hostCss(card: NewCard, fill: Fill): Promise<{ path: string; before?: string; after: string } | undefined | null> {
    const site = deps.site();
    const editor = deps.editor();
    const { cardLinkCss } = await import("./card-link-css");
    const read = new Map([...fill.expectedSources, ...(fill.host ? [[fill.host.path, fill.host.before] as const] : [])]);
    if (deps.site() !== site || deps.editor() !== editor || !editor?.isMounted(card.path) || [...read].some(([path, text]) => deps.source(path) !== text)) {
      refuse("The page changed meanwhile; choose the page again.");
      return null;
    }
    if (!fill.host) return undefined;
    const after = cardLinkCss(fill.host.before);
    return after === fill.host.before ? undefined : { ...fill.host, after };
  }

  /** The fill and the component's CSS change as one undo step (with a new page's file in `creates`). */
  async function fillOperation(card: NewCard, fill: Fill, css: { path: string; before?: string; after: string }, creates: { path: string; content: string }[], done: string): Promise<boolean> {
    const edits = new Map([[card.path, applyEdits(fill.source, [fill.edit])]]);
    const expectedSources = new Map(fill.expectedSources);
    expectedSources.set(css.path, css.before);
    if (css.before === undefined) creates.push({ path: css.path, content: css.after });
    else edits.set(css.path, css.after);
    // The page stays the open one throughout: its history takes the step.
    const site = deps.site();
    const editor = deps.editor();
    const current = () => deps.site() === site && deps.editor() === editor && Boolean(editor?.isMounted(card.path));
    const problem = await deps.operation({ creates, edits, expectedSources, done, undone: `Undid filling the ${fill.noun}.`, current, selection: { before: card, after: card } });
    if (problem) refuse(problem);
    return !problem;
  }

  /**
   * The pages a new page for `card` copies its structure from, last one
   * first in line: a grid's items' own pages (each item's title too), else,
   * in an instance's card slot, the other cards' links under the folder most
   * of them go to (a card's second link, to About, is not a sibling).
   */
  function siblingPages(source: string, card: NewCard, route: string, routes: Record<string, string>): { route?: string; title?: string }[] {
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
    const grid = gridFor(card.path, card.node.slice(0, -1))?.grid;
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

  /** Create a page and fill the placed card together, with the draft as its history companion. */
  function createPage(card: NewCard, request: CardPageRequest, base?: string): CardFilled | undefined | Promise<CardFilled | undefined> {
    const source = deps.source(card.path);
    const route = routeOf(card.path);
    const site = deps.site();
    const editor = deps.editor();
    const preview = deps.preview();
    if (source === undefined || !route || !site || !editor?.isMounted(card.path) || !preview) return undefined;
    const target = planPage(request);
    if (!target.ok) { refuse(target.error); return undefined; }
    const siblings = siblingPages(source, card, route, site.routes);
    const inputs = new Map([site.routes["/"], ...siblings.map(sibling => sibling.route && site.routes[sibling.route])]
      .filter((path): path is string => Boolean(path)).map(path => [path, deps.source(path)]));
    const content = subpageDocument(siblings, request.title.trim(), target.value.route);
    const fill = fillFrom(card, target.value.route, content, base);
    if (!fill) { refuse("That card is not there any more."); return undefined; }
    // A fill that changes nothing has no edit to carry the page with it: one undo could not take the page back.
    if (fill.edit.text === source.slice(fill.edit.start, fill.edit.end)) { refuse(`Nothing on this ${fill.noun} takes a page's title or address.`); return undefined; }
    const file = target.value.file;
    if (!fill.host) return createWithCompanion(card, fill, file, content);
    // The new page is made from these: they are proved unchanged across the wait too.
    for (const [path, source] of inputs) fill.expectedSources.set(path, source);
    return hostCss(card, fill).then(css => {
      if (css === null) return undefined;
      if (!css) return createWithCompanion(card, fill, file, content);
      const done = `Created the page ${fill.result.title} at ${fill.result.route} and filled the ${fill.noun} from it`;
      return fillOperation(card, fill, css, [{ path: file, content }], done).then(ok => ok ? fill.result : undefined);
    });
  }

  /** The new page's draft as the fill's history companion: one undo takes both back. */
  function createWithCompanion(card: NewCard, fill: Fill, file: string, content: string): CardFilled | undefined {
    const source = fill.source;
    const editor = deps.editor();
    const preview = deps.preview();
    if (deps.source(card.path) !== source || !editor?.isMounted(card.path) || !preview) { refuse("The page changed meanwhile; try again."); return undefined; }
    const failed = deps.saveNewDraft(file, content);
    if (failed) { refuse(failed); return undefined; }
    const companion = {
      undo: () => deps.dropNewDraft(file),
      redo: () => {
        const problem = deps.exists(file) ? `${file} already exists.` : deps.saveNewDraft(file, content);
        if (problem) refuse(problem);
        return problem;
      },
    };
    preview.selectAfterUpdate({ path: card.path, node: card.node });
    try {
      editor.replaceActiveRange({ path: card.path, ...fill.edit, expected: source.slice(fill.edit.start, fill.edit.end) }, false, companion);
    } catch (error) {
      preview.selectAfterUpdate(undefined);
      deps.dropNewDraft(file);
      refuse(error instanceof Error ? error.message : "The card could not be filled.");
      return undefined;
    }
    deps.announce(`Created the page ${fill.result.title} at ${fill.result.route} and filled the ${fill.noun} from it`);
    return fill.result;
  }

  /** Moves the item at `node` one place among its grid's items, keeping it selected. */
  function move(selection: { path: string; node?: number[] }, direction: "up" | "down"): boolean {
    const { path, node } = selection;
    const route = routeOf(path);
    const source = deps.source(path);
    if (!node || !route || source === undefined || !deps.editor()?.isMounted(path)) return false;
    const own = gridOfItem(source, node, context(route));
    if (!own) return false;
    const { grid, position } = own;
    const other = grid.items[position + (direction === "up" ? -1 : 1)];
    if (!other) return true;
    const edits = swapEdits(source, grid.items[position].range, other.range);
    const row = deps.preview()?.selectedItemGrid()?.row;
    const words = direction === "up" ? (row ? "left" : "up") : (row ? "right" : "down");
    return deps.change(path, source, edits, [...grid.parent, other.index], `${capital(grid.noun)} moved ${words}`);
  }

  /**
   * The edit bar's controls for a selection in or around an item: the
   * item's own (Move, Duplicate, Remove, Add card, Open page) when it is
   * one, else Select card when it is inside one (in the page, or in a
   * component's template on the page).
   */
  function controls(selection: NativePreviewSelection, source: string): EditBarControl[] {
    const site = deps.site();
    const preview = deps.preview();
    const node = selection.node;
    if (!site || !preview) return [];
    const route = routeOf(selection.path);
    if (!route) {
      // In a component's template: the runtime knows the page's item around it.
      const grid = preview.selectedItemGrid();
      const about = grid && grid.index >= 0 && describe(grid);
      if (!grid || !about) return [];
      return [selectItem(about.noun, grid.path, [...grid.parent, grid.index])];
    }
    if (!node) return [];
    const own = gridOfItem(source, node, context(route));
    if (!own) {
      const around = itemAround(source, node, context(route));
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
    const out: EditBarControl[] = [
      { kind: "button", icon: row ? "left" : "up", label: row ? "Move left" : "Move up", disabled: !previous, onPress: () => move(selection, "up") },
      { kind: "button", icon: row ? "right" : "down", label: row ? "Move right" : "Move down", disabled: !next, onPress: () => move(selection, "down") },
      { kind: "button", icon: "duplicate", label: "Duplicate", onPress: () => deps.change(path, source, [duplicateEdit(source, item.range)], [...grid.parent, item.index + 1], `${noun} duplicated`) },
      {
        kind: "button",
        icon: "remove",
        label: "Remove",
        // The previous item is selected next, else the next one.
        onPress: () => deps.change(path, source, [removeEdit(source, item.range)],
          previous ? [...grid.parent, previous.index] : next ? [...grid.parent, next.index - 1] : undefined, `${noun} removed`),
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
  function collectionFor(parent: string): { file: string; route: string; source: string; grid: SourceGrid } | undefined {
    const site = deps.site();
    if (!site || parent === "/") return undefined;
    for (const [route, file] of Object.entries(site.routes)) {
      const source = deps.source(file);
      if (source === undefined) continue;
      const grid = pageGrids(source, context(route)).find((item) => item.collection === parent);
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
    scripts: () => deps.scripts(),
    move,
    controls,

    /** The Pages tab's offer for a new subpage of `parent`: the label of its checkbox, when a grid lists those pages. */
    cardOffer(parent: string): string | undefined {
      const found = collectionFor(parent);
      return found ? `Add ${aOr(found.grid.noun)} to “${found.grid.label}” on ${deps.pageLabel(found.file)}` : undefined;
    },

    /**
     * A new subpage made in the Pages tab with its card: the page from a
     * sibling's structure and a card after the grid's last one, as one
     * operation (one undo). Resolves to an error.
     */
    async createWithCard(request: { parent: string; title: string; slug: string }): Promise<string | undefined> {
      const site = deps.site();
      const found = collectionFor(request.parent);
      if (!site || !found) return `No grid lists the pages under ${request.parent} any more.`;
      const target = nativeNewTarget(request.parent, request.slug, { route: (route) => site.routes[route], exists: (path) => deps.exists(path) });
      if (!target.ok) return target.error;
      const { source, grid, file, route } = found;
      const title = request.title.trim();
      const content = subpageDocument(grid.items.map(item => { const element = itemElement(source, item.range); return { route: item.route, title: element && itemTitle(source, element) }; }), title, target.value.route);
      const where = `“${grid.label}” on ${deps.pageLabel(file)}`;
      const last = grid.items[grid.items.length - 1];
      const copy = cardMarkup(source, route, grid, last, { title, route: target.value.route });
      const next = applyEdits(source, [insertAfterEdit(source, last.range, copy.text)]);
      return deps.operation({
        creates: [{ path: target.value.file, content }],
        edits: new Map([[file, next]]),
        open: target.value.file,
        done: `Created the page ${title} at ${target.value.route}, with its ${grid.noun} in ${where}.`,
        undone: `Undid creating the page ${title} and its ${grid.noun}.`,
        focus: { file: target.value.file },
      });
    },

    /**
     * The items that link to the page at `route` in grids listing pages, on
     * pages other than `except`: the checkbox's label for deleting them with
     * the page, and each page's text without them.
     */
    cardsLinkingTo(route: string, except: Set<string>): { label: string; edits: Map<string, string> } | undefined {
      const site = deps.site();
      if (!site) return undefined;
      const edits = new Map<string, string>();
      let first: { grid: SourceGrid; file: string } | undefined;
      let count = 0;
      for (const [pageRoute, file] of Object.entries(site.routes)) {
        if (except.has(file)) continue;
        const source = deps.source(file);
        if (source === undefined) continue;
        const removals: RangeEdit[] = [];
        for (const grid of pageGrids(source, context(pageRoute))) {
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
