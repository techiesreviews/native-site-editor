// The site by URL, for the explorer's Pages tab.
//
// Pages are routed by where their files are (shared/native-routes.ts), and
// any page can have subpages: the page at `/about/` is `about.html`, or
// `about/index.html` once it has subpages, which are the pages in
// `about/`. This module turns the page files and the parsed manifest into
// that tree (a folder with pages and no `index.html` of its own is a row
// with no page), labels each row, and decides what a new page writes: a
// slug made from the title typed, and the file and URL it gives. It has no
// DOM and no I/O.
import { NATIVE_PAGES_DIR, nativePageRoute } from "../shared/native-routes";
import { routeHeading, type Checked } from "./native-create";
import { leafToFolder, parentRoute, type FileMove } from "./native-page-moves";

export interface NativePageNode {
  /** The page file; none for a folder of pages that has no page of its own. */
  file?: string;
  route: string;
  label: string;
  /** A new file drafted in this browser, not on GitHub yet (for a row with no page: everything under it is). */
  isNew: boolean;
  /** `/` and `/404/` are placed first and last at the top. */
  special?: "home" | "notFound";
  /** The file another file's route wins over (`work.html` beside `work/index.html`): it has no page. */
  unusedFor?: string;
  /** Its subpages, alphabetical by label. */
  children: NativePageNode[];
}

/** The site: its home page, and the pages at the top level (`/404/` last). */
export interface NativeSiteTree {
  home?: NativePageNode;
  children: NativePageNode[];
}

export interface NativePagesInput {
  /** Page files: every `.html` under `src/pages/` on the branch and drafted in the browser. */
  files: Iterable<string>;
  /** The parsed manifest's route → page file. */
  routes: Record<string, string>;
  /** Route → the manifest's title for it. */
  titles?: Record<string, string | undefined>;
  /** A page's first heading, when its source is at hand. */
  heading?: (file: string) => string | undefined;
  isNew?: (file: string) => boolean;
}

const compare = (a: NativePageNode, b: NativePageNode) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }) ||
  (a.route < b.route ? -1 : a.route > b.route ? 1 : 0);

/**
 * The site as a tree of pages by URL: each page's subpages are the pages
 * whose URL is one part longer. A URL between (a folder with pages and no
 * page of its own) is a row with no `file`. Labels are the manifest's title,
 * else the page's first heading, else its URL's last part humanised; the
 * home page is always "Home".
 */
export function buildNativePagesTree(input: NativePagesInput): NativeSiteTree {
  const byFile = new Map<string, string>();
  for (const [route, file] of Object.entries(input.routes)) if (!byFile.has(file)) byFile.set(file, route);
  const files = new Set<string>();
  for (const file of input.files) if (file.startsWith(NATIVE_PAGES_DIR) && (byFile.has(file) || nativePageRoute(file))) files.add(file);
  for (const file of byFile.keys()) if (file.startsWith(NATIVE_PAGES_DIR)) files.add(file);

  const nodes = new Map<string, NativePageNode>();
  const unused: NativePageNode[] = [];
  for (const file of [...files].sort()) {
    const mapped = byFile.get(file);
    const route = mapped ?? nativePageRoute(file)!;
    const node: NativePageNode = { file, route, label: "", isNew: Boolean(input.isNew?.(file)), children: [] };
    if (!mapped && input.routes[route]) {
      node.unusedFor = input.routes[route];
      node.label = pageLabel(file, route, undefined, input);
      unused.push(node);
      continue;
    }
    if (route === "/") node.special = "home";
    else if (route === "/404/") node.special = "notFound";
    node.label = pageLabel(file, route, node.special, input);
    nodes.set(route, node);
  }
  // Every URL between the top and a page is a row, with no page when none gives it.
  for (const route of [...nodes.keys()]) {
    for (let parent = parentRoute(route); parent !== "/" && !nodes.has(parent); parent = parentRoute(parent))
      nodes.set(parent, { route: parent, label: routeHeading(parent), isNew: true, children: [] });
  }
  const site: NativeSiteTree = { home: nodes.get("/"), children: [] };
  const place = (node: NativePageNode) => {
    const parent = parentRoute(node.route);
    (parent === "/" ? site.children : nodes.get(parent)!.children).push(node);
  };
  for (const node of nodes.values()) if (node.route !== "/") place(node);
  for (const node of unused) {
    if (node.route === "/") site.children.push(node);
    else place(node);
  }
  // A row with no page is new when everything under it is; children in label order.
  const settle = (node: NativePageNode): boolean => {
    let isNew = node.file ? node.isNew : true;
    for (const child of node.children) isNew = settle(child) && isNew;
    if (!node.file) node.isNew = isNew;
    node.children.sort(compare);
    return node.file ? node.isNew : isNew;
  };
  for (const node of site.children) settle(node);
  const top = site.children.filter((node) => node.special !== "notFound").sort(compare);
  site.children = [...top, ...site.children.filter((node) => node.special === "notFound")];
  return site;
}

/** Every page in the tree, depth first (the home page first). */
export function nativeTreePages(site: NativeSiteTree): NativePageNode[] {
  const out: NativePageNode[] = [];
  const walk = (node: NativePageNode) => {
    out.push(node);
    node.children.forEach(walk);
  };
  if (site.home) out.push(site.home);
  site.children.forEach(walk);
  return out;
}

/** How many pages are under `node` (its subpages, theirs, …). */
export function nativeSubpageCount(node: NativePageNode): number {
  return node.children.reduce((sum, child) => sum + (child.file && !child.unusedFor ? 1 : 0) + nativeSubpageCount(child), 0);
}

type LabelInput = Pick<NativePagesInput, "titles" | "heading">;

function pageLabel(file: string, route: string, special: NativePageNode["special"], input: LabelInput): string {
  if (special === "home") return "Home";
  return input.titles?.[route]?.trim() || input.heading?.(file)?.trim() ||
    (special === "notFound" ? "Page not found" : routeHeading(route));
}

/**
 * The label the Pages tab gives the page file `file` (see
 * buildNativePagesTree), or undefined when it is not one of the site's pages
 * (not under `src/pages/`, or no route in `routes` is its).
 */
export function nativePageLabel(file: string, input: Pick<NativePagesInput, "routes" | "titles" | "heading">): string | undefined {
  if (!file.startsWith(NATIVE_PAGES_DIR)) return undefined;
  const route = Object.entries(input.routes).find(([, page]) => page === file)?.[0];
  if (!route) return undefined;
  return pageLabel(file, route, route === "/" ? "home" : route === "/404/" ? "notFound" : undefined, input);
}

/** The text of the first `<h1>` in `html`, tags dropped and whitespace collapsed. */
export function firstHeadingText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const match = /<h1(?=[\s>/])[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
  if (!match) return undefined;
  const text = match[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

/**
 * A URL part from a title: lowercase, diacritics stripped, every run of
 * anything but letters and digits one `-`. "My first vídeo!" is
 * "my-first-video".
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export interface NativeNewTarget {
  /** The URL the new page has. */
  route: string;
  /** The file written: `<parent folder>/<slug>.html`. */
  file: string;
  /** The parent, a page with no subpages until now, made a folder (`about.html` → `about/index.html`). */
  convert?: FileMove;
}

/** What is already there, as far as the caller knows. */
export interface NativeTaken {
  /** The page file giving `route`, if any. */
  route(route: string): string | undefined;
  /** Whether the repository path (a file or folder) exists, on GitHub or as a draft. */
  exists(path: string): boolean;
}

const SLUG = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

/**
 * Where a new page named `slug` under the page at `parent` ("/" is the top
 * of the site) goes: `src/pages/<parent>/<slug>.html` at
 * `/<parent>/<slug>/`. A parent that is a page without subpages
 * (`about.html`) becomes a folder first (`convert`: `about/index.html`, the
 * same URL), given `files` (every file under `src/` now).
 */
export function nativeNewTarget(parent: string, slug: string, taken?: NativeTaken, files: Iterable<string> = []): Checked<NativeNewTarget> {
  const name = slug.trim();
  if (!name) return { ok: false, error: "Enter the page's title." };
  if (name.length > 80) return { ok: false, error: "That URL is too long; keep it under 80 characters." };
  if (!SLUG.test(name)) return { ok: false, error: "Use letters, digits and - in the URL, starting and ending with a letter or digit." };
  if (name.toLowerCase() === "index") return { ok: false, error: "index is the page's own file; choose another URL." };
  const folder = parent === "/" ? "" : parent.slice(1, -1);
  const base = `${NATIVE_PAGES_DIR}${folder ? `${folder}/` : ""}${name}`;
  const route = `${parent}${name}/`;
  const file = `${base}.html`;
  if (nativePageRoute(file) !== route) return { ok: false, error: `No page file can give the URL ${route}.` };
  if (taken) {
    const existing = taken.route(route);
    if (existing) return { ok: false, error: `The URL ${route} is taken by ${existing}.` };
    if (taken.exists(base)) return { ok: false, error: `The URL ${route} is taken: ${base} is already there.` };
    if (taken.exists(file)) return { ok: false, error: `${file} is already there.` };
  }
  const convert = parent === "/" ? undefined : leafToFolder(parent, taken?.route(parent), files);
  return { ok: true, value: convert ? { route, file, convert } : { route, file } };
}
