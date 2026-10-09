// Cards: grids of repeated items in the editor (docs/page-builder/cards.md).
// On the canvas, "Add card" after a grid's last item adds a copy of it with
// placeholder text; for a grid whose items link to pages under one URL
// (`/work/…/`), "New page and card" also makes the page, from a sibling
// page's structure, as one undo step. A selected item gets Move, Duplicate,
// Remove, Add card and Open page in the edit bar; anything inside an item
// gets Select card. In the Pages tab a new subpage under such a URL can get
// its card, and deleting a page can take its card along.
//
// The grid markup and the page files are the collection: nothing else is
// written. Every change is one range edit to the page in its editor, or
// one operation over drafts (src/main.ts `applyNativeOperation`).

import { refuse as showRefusal } from "../components/refusal-note";
import type { NativePreview, NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import type { CardPageRequest, GridDescription, ItemGridReport } from "../components/card-grid-controls";
import { nativePageBody, nativePageHead, nativePageMovedUrl, nativePageWithDetails, type NativeSite } from "../../shared/native-project";
import { nativeNewPageTitle, nativePageTemplate, normalizeRoute, withoutStructuredData, type Checked } from "../native-create";
import { firstHeadingText, nativeNewTarget, slugify } from "../native-pages";
import { duplicateEdit, removeEdit, swapEdits } from "../native-structure";
import { aOr, insertAfterEdit, itemCopy, itemNoun, itemTitle, leafSummary, pageBodyCopy, slotFallbacks } from "./card-grid";
import { gridAt, gridOfItem, instanceLabel, itemAround, itemElement, linkRoute, mainRange, pageGrids, type GridContext, type SourceGrid } from "./card-source";
import { cardSlotAddEdit } from "./card-slot";
import { decodeHtmlEntities } from "./html-entities";
import { startTagAttribute } from "../../shared/html-source";

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
  operation(op: { expectedSources?: Map<string, string | undefined>; creates: { path: string; content: string }[]; edits: Map<string, string>; open?: string; done: string; undone: string; focus?: { file?: string } }): Promise<string | undefined>;
  /** What the Pages tab calls a page file ("Home"). */
  pageLabel(file: string): string;
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

/** The folders to offer, with the grid's default first. */
export function cardFolderChoices(folders: string[], parent: string | undefined): string[] {
  return parent ? [parent, ...folders.filter((folder) => folder !== parent)] : [...folders];
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
  const slug = slugify(title);
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

  /** What a page grid offers its new page: its default folder, the folders to choose from, and why none, when it cannot. */
  function pageOptions(grid: SourceGrid) {
    const parent = pageParent(grid);
    return { parent, folders: cardFolderChoices(siteFolders(), parent) };
  }

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
   * A new subpage's document for `grid`'s collection: a copy of the page
   * the last linked item goes to (its chrome, its sections), its text reset
   * by src/page-builder/card-grid.ts `pageBodyCopy` against a second sibling,
   * with the new title in its `<title>` (in the sibling's form, "Oak · Larkspur
   * Studio"), no description, and its own address. With no sibling page to
   * copy, the home page's document with an empty `<main>`, as the Pages tab makes.
   */
  function subpageDocument(source: string, grid: SourceGrid, title: string, route: string): string {
    const site = deps.site()!;
    const linked = grid.items.filter((item) => item.route && site.routes[item.route] && deps.source(site.routes[item.route]) !== undefined);
    const from = linked.at(-1);
    const siteUrl = deps.siteUrl();
    const blank = () => nativePageTemplate(deps.source(site.routes["/"] ?? ""), title, siteUrl ? `${siteUrl.replace(/\/$/, "")}${route}` : undefined);
    if (!from?.route) return blank();
    const sibling = deps.source(site.routes[from.route])!;
    const other = linked.slice(0, -1).at(-1);
    const otherSource = other?.route ? deps.source(site.routes[other.route]) : undefined;
    const range = (text: string) => mainRange(text) ?? nativePageBody(text);
    const otherLeaves = otherSource ? leafSummary(otherSource, range(otherSource)) : undefined;
    const element = itemElement(source, from.range);
    const oldTitle = (element && itemTitle(source, element)) || firstHeadingText(sibling);
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
  function slotAdd(source: string, parent: number[], slot: string, templateOf: (tag: string) => string | undefined) {
    const add = cardSlotAddEdit(source, parent, templateOf, slot);
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
      return add && { noun: add.noun, label: add.label };
    }
    const found = gridFor(report.path, report.parent);
    if (!found) return undefined;
    const options = pageOptions(found.grid);
    const collection = options.parent;
    if (!collection) return { noun: found.grid.noun, label: found.grid.label };
    return { noun: found.grid.noun, label: found.grid.label, collection, folders: options.folders, newFolders: true };
  }

  // Adds a card after the grid's last item and selects it: in an instance's
  // card slot (`slot`, else the slot its last item fills) a fresh card of the
  // slot's card component, else a copy of the last item with placeholder text.
  async function addCard(path: string, parent: number[], slot?: string) {
    if (!(await deps.ensureOpen(path))) return;
    const found = gridFor(path, parent);
    const route = routeOf(path);
    const last = found?.grid.items[found.grid.items.length - 1];
    const lastSlot = last && startTagAttribute(found.source, last.range.tag, "slot")?.value;
    const fresh = route && slotAddFor(path, parent, slot ?? decodeHtmlEntities(lastSlot ?? "", true));
    if (fresh) {
      deps.change(path, fresh.edit.source, [fresh.edit], [...parent, fresh.index], `${capital(fresh.noun)} added to ${fresh.label}`);
      return;
    }
    if (!found || !route || !last) { refuse("That grid is not on the page any more."); return; }
    const { source, grid } = found;
    const copy = cardMarkup(source, route, grid, last);
    const edit = insertAfterEdit(source, last.range, copy.text);
    const what = capital(grid.noun);
    deps.change(path, source, [edit], [...grid.parent, last.index + 1],
      copy.reset ? `${what} added to ${grid.label}` : `${what} added to ${grid.label}, a copy of the last one (its text could not be reset)`);
  }

  // Creates a page under the grid's URL and its card after the last one, as
  // one undo step of the page with the grid: the card is an edit in its
  // editor, and the new page's draft goes and comes back with it.
  async function addPage(path: string, parent: number[], request: CardPageRequest): Promise<string | undefined> {
    // What the request was made against, kept before anything waits.
    const before = deps.source(path);
    if (!(await deps.ensureOpen(path))) return "The page could not be opened.";
    if (deps.source(path) !== before)
      return "The page changed meanwhile; check the URL and try again.";
    const found = gridFor(path, parent);
    const route = routeOf(path);
    const editor = deps.editor();
    const preview = deps.preview();
    if (!found || !route || !editor || !preview || !pageOptions(found.grid).parent) return "That grid does not list pages any more.";
    const { source, grid } = found;
    const title = request.title.trim();
    const target = planPage(request);
    if (!target.ok) return target.error;
    const content = subpageDocument(source, grid, title, target.value.route);
    const last = grid.items[grid.items.length - 1];
    const copy = cardMarkup(source, route, grid, last, { title, route: target.value.route });
    const edit = insertAfterEdit(source, last.range, copy.text);
    const file = target.value.file;
    const failed = deps.saveNewDraft(file, content);
    if (failed) return failed;
    // Redo writes the page again only where nothing is now: else it refuses, with the card.
    const companion = {
      undo: () => deps.dropNewDraft(file),
      redo: () => {
        const problem = deps.exists(file) ? `${file} already exists.` : deps.saveNewDraft(file, content);
        if (problem) refuse(problem);
        return problem;
      },
    };
    preview.selectAfterUpdate({ path, node: [...grid.parent, last.index + 1] });
    try {
      editor.replaceActiveRange({ path, ...edit, expected: source.slice(edit.start, edit.end) }, false, companion);
    } catch (error) {
      preview.selectAfterUpdate(undefined);
      deps.dropNewDraft(file);
      return error instanceof Error ? error.message : "The card could not be added.";
    }
    deps.announce(`Created the page ${title} at ${target.value.route} and its ${grid.noun} in ${grid.label}`);
    return undefined;
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
        title: grid.collection ? `New page and ${grid.noun} in ${grid.label}` : `Add ${aOr(grid.noun)} to ${grid.label}`,
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
    plan(report: ItemGridReport, request: CardPageRequest): Checked<{ route: string }> {
      const found = gridFor(report.path, report.parent);
      if (!found || !pageOptions(found.grid).parent) return { ok: false, error: "That grid does not list pages." };
      return planPage(request);
    },
    addCard: (report: ItemGridReport) => addCard(report.path, report.parent, report.slot),
    addPage: (report: ItemGridReport, request: CardPageRequest) => addPage(report.path, report.parent, request),
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
      const content = subpageDocument(source, grid, title, target.value.route);
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
