// The site by URL, for the explorer's Pages tab.
//
// Pages are routed by where their files are (shared/native-routes.ts), so the
// site's shape is its folders under `src/pages/`: a folder is a collection
// (a nested folder a sub-collection), its `index.html`, when it has one, is
// the collection's overview page, and every other page file in it is one of
// its pages. This module turns the page files and the parsed manifest into
// that tree, labels each row, and decides what a new page or collection
// writes: a slug made from the title typed, and the file and URL it gives.
// It has no DOM and no I/O.
import { NATIVE_PAGES_DIR, nativePageRoute } from "../shared/native-routes";
import { routeHeading, type Checked } from "./native-create";

export interface NativePageNode {
  kind: "page";
  /** Repository path of the page file. */
  file: string;
  route: string;
  label: string;
  /** A new file drafted in this browser, not on GitHub yet. */
  isNew: boolean;
  /** `/` and `/404/` are placed first and last at the top. */
  special?: "home" | "notFound";
  /** The file another file's route wins over (`work.html` beside `work/index.html`): it has no page. */
  unusedFor?: string;
}

export interface NativeCollectionNode {
  kind: "collection";
  /** The folder under `src/pages/` ("" for the site itself), e.g. "videos/tutorials". */
  folder: string;
  /** The URL its overview page has, or would have. */
  route: string;
  label: string;
  /** Its `index.html`, when it has one. */
  overview?: NativePageNode;
  /** Pages first, then sub-collections, each alphabetical by label; at the top, `/404/` last. */
  children: NativeTreeNode[];
  /** Pages directly in it, beside its overview. */
  pageCount: number;
  /** Every page in it is new, so the folder is not on GitHub yet. */
  isNew: boolean;
}

export type NativeTreeNode = NativePageNode | NativeCollectionNode;

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

const compare = (a: NativeTreeNode, b: NativeTreeNode) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }) ||
  (a.route < b.route ? -1 : a.route > b.route ? 1 : 0);

/**
 * The site as a tree of collections and pages; the root is the site itself,
 * whose overview is the home page. Labels are the manifest's title, else the
 * page's first heading, else its URL's last part humanised; the home page is
 * always "Home".
 */
export function buildNativePagesTree(input: NativePagesInput): NativeCollectionNode {
  const byFile = new Map<string, string>();
  for (const [route, file] of Object.entries(input.routes)) if (!byFile.has(file)) byFile.set(file, route);
  const files = new Set<string>();
  for (const file of input.files) if (file.startsWith(NATIVE_PAGES_DIR) && (byFile.has(file) || nativePageRoute(file))) files.add(file);
  for (const file of byFile.keys()) if (file.startsWith(NATIVE_PAGES_DIR)) files.add(file);

  const title = (route: string) => input.titles?.[route]?.trim() || undefined;
  const heading = (file: string) => input.heading?.(file)?.trim() || undefined;
  const page = (file: string): NativePageNode => {
    const mapped = byFile.get(file);
    const route = mapped ?? nativePageRoute(file)!;
    const node: NativePageNode = { kind: "page", file, route, label: "", isNew: Boolean(input.isNew?.(file)) };
    if (!mapped && input.routes[route]) node.unusedFor = input.routes[route];
    if (route === "/" && !node.unusedFor) {
      node.special = "home";
      node.label = "Home";
    } else {
      if (route === "/404/" && !node.unusedFor) node.special = "notFound";
      node.label = title(route) ?? heading(file) ?? (node.special === "notFound" ? "Page not found" : routeHeading(route));
    }
    return node;
  };

  const root: NativeCollectionNode = { kind: "collection", folder: "", route: "/", label: "Home", children: [], pageCount: 0, isNew: false };
  const collections = new Map<string, NativeCollectionNode>([["", root]]);
  const collection = (folder: string): NativeCollectionNode => {
    let found = collections.get(folder);
    if (found) return found;
    const parent = collection(folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "");
    found = { kind: "collection", folder, route: `/${folder}/`, label: "", children: [], pageCount: 0, isNew: true };
    collections.set(folder, found);
    parent.children.push(found);
    return found;
  };
  for (const file of [...files].sort()) {
    const relative = file.slice(NATIVE_PAGES_DIR.length, -".html".length);
    const slash = relative.lastIndexOf("/");
    const folder = slash < 0 ? "" : relative.slice(0, slash);
    const name = relative.slice(slash + 1);
    const node = page(file);
    const owner = collection(folder);
    if (name === "index" && !owner.overview) owner.overview = node;
    else {
      owner.children.push(node);
      owner.pageCount++;
    }
  }
  // A collection is new when nothing in it is on GitHub; its label is its overview's.
  const settle = (node: NativeCollectionNode): boolean => {
    let isNew = node.overview ? node.overview.isNew : true;
    for (const child of node.children) isNew = (child.kind === "page" ? child.isNew : settle(child)) && isNew;
    node.isNew = node !== root && isNew;
    if (node !== root)
      node.label = (node.overview && (title(node.overview.route) ?? heading(node.overview.file))) || routeHeading(node.route);
    const pages = node.children.filter((child) => child.kind === "page" && child.special !== "notFound").sort(compare);
    const folders = node.children.filter((child) => child.kind === "collection").sort(compare);
    const last = node.children.filter((child) => child.kind === "page" && child.special === "notFound");
    node.children = [...pages, ...folders, ...last];
    return isNew;
  };
  settle(root);
  return root;
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

export type NativeNewKind = "page" | "collection";

export interface NativeNewTarget {
  /** The URL the new page (or the collection's overview) has. */
  route: string;
  /** The file written: `<collection>/<slug>.html`, or `<collection>/<slug>/index.html` for a collection. */
  file: string;
  /** A new collection's folder, under `src/pages/`. */
  folder?: string;
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
 * Where a new page or collection named `slug` in the collection `folder` ("" is
 * the top of the site) goes: a page is `src/pages/<folder>/<slug>.html` at
 * `/<folder>/<slug>/`; a collection is the folder `src/pages/<folder>/<slug>`
 * with its overview page `index.html`, at the same URL.
 */
export function nativeNewTarget(kind: NativeNewKind, folder: string, slug: string, taken?: NativeTaken): Checked<NativeNewTarget> {
  const name = slug.trim();
  if (!name) return { ok: false, error: kind === "page" ? "Enter the page's title." : "Enter the collection's name." };
  if (name.length > 80) return { ok: false, error: "That URL is too long; keep it under 80 characters." };
  if (!SLUG.test(name)) return { ok: false, error: "Use letters, digits and - in the URL, starting and ending with a letter or digit." };
  if (name.toLowerCase() === "index") return { ok: false, error: "index is the collection's own page; choose another URL." };
  const base = `${NATIVE_PAGES_DIR}${folder ? `${folder}/` : ""}${name}`;
  const route = `/${folder ? `${folder}/` : ""}${name}/`;
  const file = kind === "page" ? `${base}.html` : `${base}/index.html`;
  if (nativePageRoute(file) !== route) return { ok: false, error: `No page file can give the URL ${route}.` };
  if (taken) {
    const existing = taken.route(route);
    if (existing) return { ok: false, error: `The URL ${route} is taken by ${existing}.` };
    if (taken.exists(base)) return { ok: false, error: `The URL ${route} is taken: ${base} is already there.` };
    if (kind === "page" && taken.exists(file)) return { ok: false, error: `${file} is already there.` };
    if (kind === "collection" && taken.exists(`${base}.html`)) return { ok: false, error: `The URL ${route} is taken by ${base}.html.` };
  }
  return { ok: true, value: kind === "page" ? { route, file } : { route, file, folder: base } };
}
