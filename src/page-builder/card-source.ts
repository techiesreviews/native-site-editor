// Card grids in a page's source: where they are, what their items are, and
// whether they are a collection of subpages. Every read goes through a
// `SourceTree` (source-tree.ts): in the editor the page adapter (`readPage`,
// the browser's parser, so element-child index paths are the preview's), in
// Node tests the source adapter. The rules are rules/items.ts and card-grid.ts.

import { readPage, type ElementRange } from "../native-source-location";
import { nativeLinkTarget, isFolderRoute } from "../../shared/native-routes";
import { normalizeRoute } from "../native-create";
import { componentLabel } from "../native-insert";
import { collectionParent, elementTree, itemNoun, type SourceElement } from "./card-grid";
import { plain, type SourceTree } from "./source-tree";
import { itemKind, NOT_GRIDS, repeatedRun } from "./rules/items";

/** A grid (or list) of repeated items in a page's source. */
export interface SourceGrid {
  /** Element-child indexes of the container from the page root. */
  parent: number[];
  kind: string;
  /** "card", "item", "link". */
  noun: string;
  /** Its name for people: the heading above it ("Recent work"), else what it holds ("Cards"). */
  label: string;
  /** Its items in order: their element-child index in the container, source range and the route each links to. */
  items: { index: number; range: ElementRange; route?: string }[];
  /** The parent URL its items' pages are under, when it is a collection of subpages. */
  collection?: string;
}

export interface GridContext {
  /** The page's route, against which relative links resolve. */
  route: string;
  /** The site's routes to page files. */
  routes: Record<string, string>;
  /** Whether a tag is a section (a `<section>` or a section component): never an item. */
  isSection: (tag: string) => boolean;
}

/** Where a link goes as a route: a page of the site, else a root folder path (`/work/new/`), else none. */
export function linkRoute(href: string, context: GridContext): string | undefined {
  const known = nativeLinkTarget(href, context.route, context.routes);
  if (known) return known;
  // A page that is not there (yet): the URL resolved as the browser would (`..` and all), and only a
  // folder URL a page could have (`normalizeRoute`), so a link never names a path outside the site.
  const value = href.trim();
  if (!value || value.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return undefined;
  let path: string;
  try {
    const url = new URL(value, `https://site.invalid${context.route.startsWith("/") ? context.route : `/${context.route}`}`);
    if (url.origin !== "https://site.invalid") return undefined;
    path = decodeURI(url.pathname);
  } catch {
    return undefined;
  }
  const route = normalizeRoute(path);
  return route.ok && route.value === path && isFolderRoute(path) && path !== "/" ? path : undefined;
}

/** The route an item links to: its first link to a page below the top level. */
function itemRoute<N>(tree: SourceTree<N>, item: N, context: GridContext): string | undefined {
  for (const link of [item, ...tree.elements(item)]) {
    if (tree.view.name(link) !== "a") continue;
    const route = linkRoute(tree.attribute(link, "href")?.value ?? "", context);
    if (route && route !== "/" && route.split("/").filter(Boolean).length >= 2) return route;
  }
  return undefined;
}

const heading = <N>(tree: SourceTree<N>, node: N) => /^h[1-6]$/.test(tree.view.name(node));

/** A grid's name: a heading just before it, else the first heading of the section around it, else its label or id. */
function gridLabel<N>(tree: SourceTree<N>, container: N, noun: string): string {
  const text = (node: N) => plain(tree.text(node)) || undefined;
  const siblings = tree.children(tree.view.parent(container));
  for (let index = siblings.indexOf(container) - 1; index >= 0; index--) {
    const sibling = siblings[index];
    const found = heading(tree, sibling) ? sibling : tree.elements(sibling).find(node => heading(tree, node));
    if (found !== undefined) return text(found)!;
  }
  const contains = (node: N) => {
    for (let at: N | undefined = node; at !== undefined; at = tree.view.parent(at)) {
      if (at === container) return true;
    }
    return false;
  };
  for (let at = tree.view.parent(container); at !== undefined && !NOT_GRIDS.has(tree.view.name(at)); at = tree.view.parent(at)) {
    const found = tree.elements(at).find(node => heading(tree, node) && !contains(node));
    if (found !== undefined && text(found)) return text(found)!;
    const named = tree.attribute(at, "aria-label")?.value ?? tree.attribute(at, "id")?.value;
    if (named?.trim()) return named.trim();
  }
  return `${noun[0].toUpperCase()}${noun.slice(1)}s`;
}

function gridIn<N>(tree: SourceTree<N>, container: N, parent: number[], context: GridContext): SourceGrid | undefined {
  if (NOT_GRIDS.has(tree.view.name(container)) || !parent.length) return undefined;
  const children = tree.children(container);
  const run = repeatedRun(children.map(child => itemKind(tree.view.name(child), tree.attribute(child, "class")?.value, context.isSection(tree.view.name(child)))));
  if (!run) return undefined;
  const items: SourceGrid["items"] = [];
  for (const index of run.indexes) {
    const range = tree.range(children[index]);
    if (!range) return undefined;
    items.push({ index, range, route: itemRoute(tree, children[index], context) });
  }
  const noun = itemNoun(run.kind);
  return { parent, kind: run.kind, noun, label: gridLabel(tree, container, noun), items, collection: collectionParent(items.map(item => item.route)) };
}

/** What an instance with a card slot is called: its own first heading, else its tag. */
export function instanceLabel<N>(tree: SourceTree<N>, parent: number[]): string | undefined {
  const el = tree.at(parent);
  if (el === undefined) return undefined;
  const found = tree.elements(el).find(node => heading(tree, node));
  return (found !== undefined && plain(tree.text(found))) || componentLabel(tree.view.name(el));
}

/** The grid whose container is at `parent`, if it is one. */
export function gridAt<N>(tree: SourceTree<N>, parent: number[], context: GridContext): SourceGrid | undefined {
  const container = tree.at(parent);
  return container === undefined ? undefined : gridIn(tree, container, parent, context);
}

/** The grid the element at `node` is an item of, with its place among the items. */
export function gridOfItem(source: string, node: number[], context: GridContext): { grid: SourceGrid; position: number } | undefined;
export function gridOfItem<N>(tree: SourceTree<N>, node: number[], context: GridContext): { grid: SourceGrid; position: number } | undefined;
export function gridOfItem<N>(source: string | SourceTree<N>, node: number[], context: GridContext): { grid: SourceGrid; position: number } | undefined {
  if (typeof source === "string") return gridOfItem(readPage(source), node, context);
  if (node.length < 2) return undefined;
  const grid = gridAt(source, node.slice(0, -1), context);
  const position = grid ? grid.items.findIndex(item => item.index === node[node.length - 1]) : -1;
  return grid && position >= 0 ? { grid, position } : undefined;
}

/** The nearest item around the element at `node` (not the element itself): its path and grid. */
export function itemAround<N>(tree: SourceTree<N>, node: number[], context: GridContext): { node: number[]; grid: SourceGrid } | undefined {
  for (let length = node.length - 1; length >= 2; length--) {
    const item = node.slice(0, length);
    const grid = gridAt(tree, item.slice(0, -1), context);
    if (grid?.items.some(entry => entry.index === item[item.length - 1])) return { node: item, grid };
  }
  return undefined;
}

/** Every grid of a page, outermost first. */
export function pageGrids<N>(tree: SourceTree<N>, context: GridContext): SourceGrid[] {
  const out: SourceGrid[] = [];
  const visit = (el: N, path: number[]) => {
    const grid = gridIn(tree, el, path, context);
    if (grid) out.push(grid);
    tree.children(el).forEach((child, index) => visit(child, [...path, index]));
  };
  tree.children().forEach((child, index) => visit(child, [index]));
  return out;
}

/** The element tree of an item's source (src/page-builder/card-grid.ts `elementTree`): the item itself. */
export function itemElement(source: string, range: ElementRange): SourceElement | undefined {
  const tree = elementTree(source, range.start, range.end);
  return tree?.length === 1 ? tree[0] : undefined;
}

/** The content of an explicitly closed `<main>` in the page. */
export function mainRange<N>(tree: SourceTree<N>): { start: number; end: number } | undefined {
  const main = tree.elements().find(node => tree.view.name(node) === "main");
  const range = main === undefined ? undefined : tree.range(main);
  return range?.close ? { start: range.tag.end, end: range.close.start } : undefined;
}
