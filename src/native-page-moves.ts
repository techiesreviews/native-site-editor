// Changing a page's URL, moving it under another page, and the shape rules
// that go with it, as plain data: which files move, which links change and
// what `_redirects` says afterwards. No DOM, no I/O.
//
// A page's URL is where its file is (shared/native-routes.ts), and the Pages
// tab keeps one rule for the file's shape: a page with subpages (or anything
// else in its folder) is `x/index.html`, a page without is `x.html`. So:
// - a page that gets its first subpage becomes a folder (`about.html` →
//   `about/index.html`: the URL stays `/about/`);
// - a page that loses its last subpage becomes a file again
//   (`about/index.html` → `about.html`), but only when an operation touches
//   that folder: a site's own childless `x/index.html` is left alone;
// - a page whose URL changes takes its whole subtree along
//   (`/about/` → `/company/` moves `/about/us/` to `/company/us/`).
import { NATIVE_PAGES_DIR, nativePageRoute } from "../shared/native-routes";
import type { Checked } from "./native-create";

export interface FileMove {
  from: string;
  to: string;
}

/** `/a/b/` is `/a/`; the top level's parent is `/`. */
export function parentRoute(route: string): string {
  if (route === "/") return "/";
  const trimmed = route.slice(0, -1);
  return trimmed.slice(0, trimmed.lastIndexOf("/") + 1);
}

/** The last part of a route: `/a/b/` is `b`. */
export function routeSlug(route: string): string {
  return route.split("/").filter(Boolean).at(-1) ?? "";
}

/** Whether `route` is `base` or under it (`/about/us/` is under `/about/`; `/about-us/` is not). */
export function isRouteWithin(route: string, base: string): boolean {
  return base !== "/" && (route === base || route.startsWith(base));
}

/** The folder under `src/pages/` a route's subpages are in: `/a/b/` is `src/pages/a/b/`. */
export const routeFolder = (route: string) => `${NATIVE_PAGES_DIR}${route.slice(1)}`;
/** The file a page without subpages has: `/a/b/` is `src/pages/a/b.html`. */
export const leafFile = (route: string) => `${NATIVE_PAGES_DIR}${route.slice(1, -1)}.html`;
/** The file a page with subpages has: `/a/b/` is `src/pages/a/b/index.html`. */
export const folderFile = (route: string) => `${routeFolder(route)}index.html`;

/**
 * A page given its first subpage: `about.html` becomes `about/index.html`
 * (same URL). Undefined when the page at `route` is already a folder's index
 * (or there is no such leaf file, or the index is taken).
 */
export function leafToFolder(route: string, pageFile: string | undefined, files: Iterable<string>): FileMove | undefined {
  if (route === "/" || !pageFile || pageFile !== leafFile(route)) return undefined;
  const index = folderFile(route);
  return new Set(files).has(index) ? undefined : { from: pageFile, to: index };
}

/**
 * A page that lost its last subpage: when everything in the folder of
 * `route` (in `files`, as they are after the operation) is its
 * `index.html`, that file becomes `x.html` (same URL). Undefined otherwise,
 * or when `x.html` is taken.
 */
export function folderToLeaf(route: string, files: Iterable<string>): FileMove | undefined {
  if (route === "/") return undefined;
  const list = [...files];
  const folder = routeFolder(route);
  const inside = list.filter((file) => file.startsWith(folder));
  const index = folderFile(route);
  if (inside.length !== 1 || inside[0] !== index) return undefined;
  const leaf = leafFile(route);
  return list.includes(leaf) ? undefined : { from: index, to: leaf };
}

export interface PageMoveInput {
  /** Every file under `src/` now: the branch's not deleted, and new ones drafted. */
  files: Iterable<string>;
  /** Route → page file, as the site is now. */
  routes: Record<string, string>;
  from: string;
  to: string;
}

export interface PageMovePlan {
  from: string;
  to: string;
  /** The page's file now, and where it goes. */
  file: string;
  target: string;
  /** Every file that moves: the page, what is in its folder, and a parent made a folder or a file again. */
  moves: FileMove[];
  /** Every route in the moved subtree, old → new, the page's first. */
  routes: [string, string][];
  /** The new parent, a page without subpages until now, made a folder. */
  converted?: { route: string } & FileMove;
  /** The old parent, left with no subpages, made a file again. */
  collapsed?: { route: string } & FileMove;
  /** Said beside the plan, not in its way. */
  warnings: string[];
}

const NOT_FOUND = "/404/";

/**
 * What changing the URL of the page at `from` to `to` (a normalized route)
 * does to the files, or why it cannot be done. The page moves to where its
 * new URL is, as `x.html`, or `x/index.html` when it has subpages (or
 * anything else in its folder, there or at the new place); everything in its
 * folder moves with it; the new parent, when it is a page without subpages,
 * becomes a folder; the old parent, when this was its last subpage, becomes
 * a file again.
 */
export function planPageMove(input: PageMoveInput): Checked<PageMovePlan> {
  const { from, to, routes } = input;
  const files = [...new Set(input.files)];
  const file = routes[from];
  if (!file) return { ok: false, error: `No page has the URL ${from}.` };
  if (from === "/") return { ok: false, error: "The home page's URL is always /." };
  if (to === from) return { ok: false, error: "That is the page's URL now." };
  if (to === "/") return { ok: false, error: "/ is the home page's URL." };
  if (to.startsWith(from)) return { ok: false, error: "A page cannot go under itself or its own subpages." };
  if (nativePageRoute(leafFile(to)) !== to) return { ok: false, error: `No page file can give the URL ${to}.` };

  // Every route in the subtree, and where it goes.
  const pairs: [string, string][] = Object.keys(routes)
    .filter((route) => isRouteWithin(route, from))
    .sort((a, b) => (a === from ? -1 : b === from ? 1 : a < b ? -1 : 1))
    .map((route) => [route, `${to}${route.slice(from.length)}`]);
  const leaving = new Set(pairs.map(([route]) => route));
  for (const [, route] of pairs) {
    const taken = routes[route];
    if (taken && !leaving.has(route)) return { ok: false, error: `The URL ${route} is taken by ${taken}.` };
  }

  const moves = new Map<string, string>();
  const fromFolder = routeFolder(from);
  const toFolder = routeFolder(to);
  for (const path of files)
    if (path.startsWith(fromFolder) && path !== file) moves.set(path, `${toFolder}${path.slice(fromFolder.length)}`);
  // A page with anything in its folder, there or where it goes, is that folder's index.
  const staying = files.some((path) => path.startsWith(toFolder) && !moves.has(path) && path !== file);
  const target = moves.size || staying ? folderFile(to) : leafFile(to);
  if (target !== file) moves.set(file, target);

  const warnings: string[] = [];
  if (to === NOT_FOUND) warnings.push("/404/ is the page shown for addresses the site does not have.");
  if (from === NOT_FOUND) warnings.push("The site will have no page for addresses it does not have.");

  // The new parent: a page without subpages becomes a folder.
  const newParent = parentRoute(to);
  let converted: PageMovePlan["converted"];
  if (newParent !== "/" && !moves.has(routes[newParent] ?? "")) {
    const move = leafToFolder(newParent, routes[newParent], files);
    if (move) {
      converted = { route: newParent, ...move };
      moves.set(move.from, move.to);
    }
  }

  // The old parent: left with nothing in its folder but its index, it becomes a file again.
  const oldParent = parentRoute(from);
  let collapsed: PageMovePlan["collapsed"];
  if (oldParent !== "/" && oldParent !== newParent && routes[oldParent] === folderFile(oldParent)) {
    const after = files.map((path) => moves.get(path) ?? path);
    const move = folderToLeaf(oldParent, after);
    if (move) {
      collapsed = { route: oldParent, ...move };
      moves.set(move.from, move.to);
    }
  }

  // Nothing lands on a file that stays.
  const present = new Set(files);
  for (const [source, destination] of moves)
    if (present.has(destination) && !moves.has(destination)) return { ok: false, error: `${destination} is already there (moving ${source}).` };
  const destinations = new Set<string>();
  for (const destination of moves.values()) {
    if (destinations.has(destination)) return { ok: false, error: `Two files would both be ${destination}.` };
    destinations.add(destination);
  }
  // A file where a folder must go (`x.html` is fine; a file named `x` is not).
  const blocked = [...destinations].map((path) => path.split("/")).flatMap((parts) => parts.slice(1, -1).map((_, index) => parts.slice(0, index + 2).join("/")))
    .find((folder) => present.has(folder) && !moves.has(folder));
  if (blocked) return { ok: false, error: `${blocked} is a file, so nothing can go in it.` };

  return {
    ok: true,
    value: {
      from, to, file, target,
      moves: [...moves].map(([source, destination]) => ({ from: source, to: destination })),
      routes: pairs,
      ...(converted ? { converted } : {}),
      ...(collapsed ? { collapsed } : {}),
      warnings,
    },
  };
}

const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

export interface LinkRewrite {
  text: string;
  /** How many links changed. */
  count: number;
  /** The edits made, as ranges of the text before, last first not assumed. */
  edits: { start: number; end: number; text: string }[];
}

/**
 * `source` with every link to the page at `from` and its subpages pointing
 * at `to` instead: `#/about/` → `#/company/`, `#/about/us/` →
 * `#/company/us/`, `#/about/#team` → `#/company/#team`, `#/about` →
 * `#/company`, and root-relative `href="/about/"` alike. Only whole route
 * parts match (`/about-us/` is not under `/about/`); only the path in each
 * `href` changes, so the rest of the markup stays as written.
 */
export function rewriteRouteLinks(source: string, from: string, to: string, subtree = true): LinkRewrite {
  const edits: LinkRewrite["edits"] = [];
  if (from === "/" || from === to) return { text: source, count: 0, edits };
  const bare = from.slice(0, -1);
  for (const match of source.matchAll(HREF)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    const quoted = match[3] === undefined ? 1 : 0;
    const valueStart = match.index! + match[0].length - value.length - quoted;
    // Leading spaces in a quoted value are kept.
    const lead = value.length - value.trimStart().length;
    const trimmed = value.slice(lead);
    let offset: number;
    if (trimmed.startsWith("#/")) offset = 1;
    else if (trimmed.startsWith("/") && !trimmed.startsWith("//")) offset = 0;
    else continue;
    const path = trimmed.slice(offset).split(/[?#\s]/)[0];
    let next: string | undefined;
    if (path === bare) next = to.slice(0, -1);
    else if (path === from || (subtree && path.startsWith(from))) next = `${to}${path.slice(from.length)}`;
    if (next === undefined) continue;
    const start = valueStart + lead + offset;
    edits.push({ start, end: start + path.length, text: next });
  }
  let text = source;
  for (const edit of [...edits].reverse()) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return { text, count: edits.length, edits };
}

export const NATIVE_REDIRECTS_PATH = "src/public/_redirects";

/**
 * Cloudflare's `_redirects` (copied to the site root by the export) after
 * the page at `from` moved to `to`: one `old new 301` line for each route in
 * `redirect` (the moved page and subpages that are on the live site), and
 * no chains or loops: a line whose destination was under `from` now points
 * under `to` (dropped when it would point at itself), and a line whose
 * source is one of the new URLs, or one of the old URLs about to be
 * written again, goes. Comments and other lines stay as written. With
 * `subtree` false only the page at `from` moved, not the pages under it.
 */
export function editNativeRedirects(text: string | undefined, from: string, to: string, redirect: string[], subtree = true): string {
  const newline = text?.includes("\r\n") ? "\r\n" : "\n";
  const lines = text ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const move = (path: string) => {
    const bare = from.slice(0, -1);
    const [route, rest] = splitPath(path);
    if (route === bare) return `${to.slice(0, -1)}${rest}`;
    if (route === from || (subtree && route.startsWith(from))) return `${to}${route.slice(from.length)}${rest}`;
    return undefined;
  };
  const writing = new Set(redirect);
  const out: string[] = [];
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    if (!line.trim() || tokens[0].startsWith("#") || tokens.length < 2) { out.push(line); continue; }
    const [source, destination] = tokens;
    const sourceRoute = splitPath(source)[0];
    // The new URLs are pages now: a redirect away from one would hide it.
    if ((subtree ? isRouteWithin(sourceRoute, to) : sourceRoute === to) || sourceRoute === to.slice(0, -1)) continue;
    if (writing.has(source) || writing.has(sourceRoute)) continue;
    const moved = move(destination);
    if (moved === undefined) { out.push(line); continue; }
    if (splitPath(moved)[0] === sourceRoute) continue;
    const at = line.indexOf(destination, line.indexOf(source) + source.length);
    out.push(line.slice(0, at) + moved + line.slice(at + destination.length));
  }
  for (const route of redirect) {
    const target = move(route);
    if (target !== undefined) out.push(`${route} ${target} 301`);
  }
  return out.length ? `${out.join(newline)}${newline}` : "";
}

function splitPath(value: string): [string, string] {
  const at = value.search(/[?#]/);
  return at < 0 ? [value, ""] : [value.slice(0, at), value.slice(at)];
}

/** A page URL that changes: with `subtree`, every page under it moves along to the same place under `to`. */
export interface RouteChange {
  from: string;
  to: string;
  subtree: boolean;
}

/**
 * The URL changes of pages moved as files (the Files tab), grouped: a page
 * whose every subpage (every route under it in `before`) moved to the same
 * place under its new URL is one change of the whole subtree, as Change URL
 * makes; any other page changes only its own URL, so links to pages that
 * stayed are left alone.
 */
export function groupRouteChanges(before: Iterable<string>, changes: [string, string][]): RouteChange[] {
  const routes = [...before];
  const moved = new Map(changes);
  const covered = new Set<string>();
  const out: RouteChange[] = [];
  for (const [from, to] of [...changes].sort(([a], [b]) => a.length - b.length || a.localeCompare(b))) {
    if (covered.has(from)) continue;
    const under = routes.filter((route) => route !== from && isRouteWithin(route, from));
    const subtree = under.every((route) => moved.get(route) === `${to}${route.slice(from.length)}`);
    if (subtree) for (const route of under) covered.add(route);
    out.push({ from, to, subtree });
  }
  return out;
}
