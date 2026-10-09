// Card grids in a page's source: where they are, what their items are, and
// whether they are a collection of subpages. The page is parsed by the
// browser's own HTML parser (src/native-source-location.ts `parseMarked`),
// as the preview renders it, so element-child index paths are the
// preview's; the rules are src/page-builder/card-grid.ts.

import { MARK, markedRange, parseMarked, type ElementRange } from "../native-source-location";
import { nativeLinkTarget, isFolderRoute } from "../../shared/native-routes";
import { normalizeRoute } from "../native-create";
import { componentLabel } from "../native-insert";
import { collectionParent, elementTree, itemKind, itemNoun, NOT_GRIDS, repeatedRun, type SourceElement } from "./card-grid";

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

type Parsed = ReturnType<typeof parseMarked>;

function childAt(root: ParentNode, path: number[]): Element | ParentNode | undefined {
  let at: ParentNode = root;
  for (const index of path) {
    const child = at.children[index];
    if (!child) return undefined;
    at = child;
  }
  return at;
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
function itemRoute(item: Element, context: GridContext): string | undefined {
  for (const link of item.matches("a[href]") ? [item, ...item.querySelectorAll("a[href]")] : [...item.querySelectorAll("a[href]")]) {
    const route = linkRoute(link.getAttribute("href") ?? "", context);
    if (route && route !== "/" && route.split("/").filter(Boolean).length >= 2) return route;
  }
  return undefined;
}

const HEADING = "h1,h2,h3,h4,h5,h6";

/** A grid's name: a heading just before it, else the first heading of the section around it, else its label or id. */
function gridLabel(container: Element, noun: string): string {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() || undefined;
  for (let sibling = container.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (sibling.matches(HEADING)) return text(sibling)!;
    const inner = sibling.querySelector(HEADING);
    if (inner) return text(inner)!;
  }
  for (let at = container.parentElement; at && !NOT_GRIDS.has(at.localName); at = at.parentElement) {
    const heading = [...at.querySelectorAll(HEADING)].find((el) => !container.contains(el));
    if (heading && text(heading)) return text(heading)!;
    const named = at.getAttribute("aria-label") ?? at.getAttribute("id");
    if (named?.trim()) return named.trim();
  }
  return `${noun[0].toUpperCase()}${noun.slice(1)}s`;
}

function gridIn(source: string, parsed: Parsed, container: Element | ParentNode, parent: number[], context: GridContext): SourceGrid | undefined {
  if (!(container instanceof Element) || NOT_GRIDS.has(container.localName) || !parent.length) return undefined;
  const children = [...container.children];
  const run = repeatedRun(children.map((child) => itemKind(child.localName, child.getAttribute("class") ?? undefined, context.isSection(child.localName))));
  if (!run) return undefined;
  const items: SourceGrid["items"] = [];
  for (const index of run.indexes) {
    const range = markedRange(source, parsed.tags, parsed.root, children[index], parsed.end);
    if (!range) return undefined;
    items.push({ index, range, route: itemRoute(children[index], context) });
  }
  const noun = itemNoun(run.kind);
  return { parent, kind: run.kind, noun, label: gridLabel(container, noun), items, collection: collectionParent(items.map((item) => item.route)) };
}

/** What an instance with a card slot (at `parent`) is called: its own first heading ("Recent work"), else its tag ("Section work"). */
export function instanceLabel(source: string, parent: number[]): string | undefined {
  const el = childAt(parseMarked(source).root, parent);
  if (!(el instanceof Element)) return undefined;
  return el.querySelector(HEADING)?.textContent?.replace(/\s+/g, " ").trim() || componentLabel(el.localName);
}

/** The grid whose container is at `parent`, if it is one. */
export function gridAt(source: string, parent: number[], context: GridContext): SourceGrid | undefined {
  const parsed = parseMarked(source);
  const container = childAt(parsed.root, parent);
  return container ? gridIn(source, parsed, container, parent, context) : undefined;
}

/** The grid the element at `node` is an item of, with its place among the items. */
export function gridOfItem(source: string, node: number[], context: GridContext): { grid: SourceGrid; position: number } | undefined {
  if (node.length < 2) return undefined;
  const grid = gridAt(source, node.slice(0, -1), context);
  const position = grid ? grid.items.findIndex((item) => item.index === node[node.length - 1]) : -1;
  return grid && position >= 0 ? { grid, position } : undefined;
}

/** The nearest item around the element at `node` (not the element itself): its path and grid. */
export function itemAround(source: string, node: number[], context: GridContext): { node: number[]; grid: SourceGrid } | undefined {
  const parsed = parseMarked(source);
  for (let length = node.length - 1; length >= 2; length--) {
    const item = node.slice(0, length);
    const parent = item.slice(0, -1);
    const container = childAt(parsed.root, parent);
    const grid = container ? gridIn(source, parsed, container, parent, context) : undefined;
    if (grid?.items.some((entry) => entry.index === item[item.length - 1])) return { node: item, grid };
  }
  return undefined;
}

/** Every grid of a page, outermost first. */
export function pageGrids(source: string, context: GridContext): SourceGrid[] {
  const parsed = parseMarked(source);
  const out: SourceGrid[] = [];
  const visit = (el: Element, path: number[]) => {
    const grid = gridIn(source, parsed, el, path, context);
    if (grid) out.push(grid);
    [...el.children].forEach((child, index) => visit(child, [...path, index]));
  };
  [...parsed.root.children].forEach((child, index) => visit(child, [index]));
  return out;
}

/** The element tree of an item's source (src/page-builder/card-grid.ts `elementTree`): the item itself. */
export function itemElement(source: string, range: ElementRange): SourceElement | undefined {
  const tree = elementTree(source, range.start, range.end);
  return tree?.length === 1 ? tree[0] : undefined;
}

/** The `<main>` of a page document (else its body content) as a source range. */
export function mainRange(source: string): { start: number; end: number } | undefined {
  const parsed = parseMarked(source);
  const main = parsed.root.querySelector("main");
  if (main?.hasAttribute(MARK)) {
    const range = markedRange(source, parsed.tags, parsed.root, main, parsed.end);
    if (range?.close) return { start: range.tag.end, end: range.close.start };
  }
  return undefined;
}
