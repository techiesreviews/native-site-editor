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

import type { NativePreview, NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import type { GridDescription, ItemGridReport } from "../components/card-grid-controls";
import { nativePageBody, nativePageHead, nativePageMovedUrl, nativePageWithDetails, type NativeSite } from "../../shared/native-project";
import { nativeNewPageTitle, nativePageTemplate, normalizeRoute, withoutStructuredData, type Checked } from "../native-create";
import { firstHeadingText, nativeNewTarget, slugify } from "../native-pages";
import { duplicateEdit, removeEdit, swapEdits } from "../native-structure";
import { aOr, insertAfterEdit, itemCopy, itemTitle, leafSummary, pageBodyCopy, slotFallbacks } from "./card-grid";
import { gridAt, gridOfItem, itemAround, itemElement, linkRoute, mainRange, pageGrids, type GridContext, type SourceGrid } from "./card-source";

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
    replaceActiveRange(edit: RangeEdit & { path: string; expected: string }, group?: boolean, companion?: { undo(): void; redo(): void }): void;
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
  operation(op: { creates: { path: string; content: string }[]; edits: Map<string, string>; open?: string; done: string; undone: string; focus?: { file?: string } }): Promise<string | undefined>;
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

export function createCards(deps: CardsDeps) {
  const routeOf = (path: string) => {
    const site = deps.site();
    return site ? Object.entries(site.routes).find(([, file]) => file === path)?.[0] : undefined;
  };
  const context = (route: string): GridContext => ({ route, routes: deps.site()?.routes ?? {}, isSection: deps.isSection });
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

  /** Where a new page titled `title` goes under a collection's URL, or why it cannot. */
  function planPage(collection: string, title: string): Checked<{ route: string; file: string }> {
    const site = deps.site();
    if (!site) return { ok: false, error: "Open a native site first." };
    const slug = slugify(title);
    if (!title.trim()) return { ok: false, error: "Enter the page's title." };
    if (!slug) return { ok: false, error: "The title gives no URL: add letters or digits." };
    // Only a URL a page could have, never one that leaves the site's folders.
    const parent = normalizeRoute(collection);
    if (!parent.ok || parent.value !== collection) return { ok: false, error: `${collection} is not a URL a page can have.` };
    return nativeNewTarget(collection, slug, { route: (route) => site.routes[route], exists: deps.exists });
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
    const slots = component ? slotFallbacks(component) : { fallbacks: {}, optional: new Set<string>() };
    const copy = element && itemCopy(source, element, {
      noun: grid.noun,
      title: page?.title,
      href: item.route ? page?.route ?? "" : undefined,
      isLinked: (href) => linkRoute(href, context(route)) === item.route,
      fallbacks: slots.fallbacks,
      optional: slots.optional,
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

  /** The grid on the page shown that `report` names, as the source has it now. */
  function describe(report: ItemGridReport): GridDescription | undefined {
    const found = gridFor(report.path, report.parent);
    if (!found) return undefined;
    return { noun: found.grid.noun, label: found.grid.label, collection: found.grid.collection };
  }

  // Adds a card with placeholder text after the grid's last item and selects it.
  async function addCard(path: string, parent: number[]) {
    if (!(await deps.ensureOpen(path))) return;
    const found = gridFor(path, parent);
    const route = routeOf(path);
    if (!found || !route) { deps.announce("That grid is not on the page any more."); return; }
    const { source, grid } = found;
    const last = grid.items[grid.items.length - 1];
    const copy = cardMarkup(source, route, grid, last);
    const edit = insertAfterEdit(source, last.range, copy.text);
    const what = capital(grid.noun);
    deps.change(path, source, [edit], [...grid.parent, last.index + 1],
      copy.reset ? `${what} added to ${grid.label}` : `${what} added to ${grid.label}, a copy of the last one (its text could not be reset)`);
  }

  // Creates a page under the grid's URL and its card after the last one, as
  // one undo step of the page with the grid: the card is an edit in its
  // editor, and the new page's draft goes and comes back with it.
  async function addPage(path: string, parent: number[], title: string): Promise<string | undefined> {
    if (!(await deps.ensureOpen(path))) return "The page could not be opened.";
    const found = gridFor(path, parent);
    const route = routeOf(path);
    const editor = deps.editor();
    const preview = deps.preview();
    if (!found?.grid.collection || !route || !editor || !preview) return "That grid does not list pages any more.";
    const { source, grid } = found;
    const target = planPage(found.grid.collection, title);
    if (!target.ok) return target.error;
    const content = subpageDocument(source, grid, title, target.value.route);
    const last = grid.items[grid.items.length - 1];
    const copy = cardMarkup(source, route, grid, last, { title, route: target.value.route });
    const edit = insertAfterEdit(source, last.range, copy.text);
    const file = target.value.file;
    const failed = deps.saveNewDraft(file, content);
    if (failed) return failed;
    const companion = {
      undo: () => deps.dropNewDraft(file),
      redo: () => { deps.saveNewDraft(file, content); },
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
      const about = grid && describe(grid);
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
        onPress: () => {
          if (reported && reported.parent.join(".") === grid.parent.join(".")) preview.addToSelectedGrid();
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
    plan(report: ItemGridReport, title: string): Checked<{ route: string }> {
      const about = describe(report);
      if (!about?.collection) return { ok: false, error: "That grid does not list pages." };
      return planPage(about.collection, title);
    },
    addCard: (report: ItemGridReport) => addCard(report.path, report.parent),
    addPage: (report: ItemGridReport, title: string) => addPage(report.path, report.parent, title),
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
      const target = nativeNewTarget(request.parent, request.slug, { route: (route) => site.routes[route], exists: deps.exists });
      if (!target.ok) return target.error;
      const { source, grid, file, route } = found;
      const title = request.title.trim();
      const content = subpageDocument(source, grid, title, target.value.route);
      const last = grid.items[grid.items.length - 1];
      const copy = cardMarkup(source, route, grid, last, { title, route: target.value.route });
      const next = applyEdits(source, [insertAfterEdit(source, last.range, copy.text)]);
      const where = `“${grid.label}” on ${deps.pageLabel(file)}`;
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
