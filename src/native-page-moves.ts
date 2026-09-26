// Changing a page's URL, moving it under another page, and deleting it, as
// plain data: which files move, which links change and what `_redirects`
// says afterwards. No DOM, no I/O.
//
// A page's URL is where its file is (shared/native-routes.ts): the page at
// `/about/` is `about/index.html` and everything else in `about/` (its
// subpages, their images) is under it; a page at `/notes.html` is that file
// alone. So a folder page whose URL changes takes its whole folder along
// (`/about/` → `/company/` moves `about/team/index.html` to
// `company/team/index.html`), and a single-file page moves alone.
import { NATIVE_NOT_FOUND_ROUTE, isFolderRoute, nativePageRoute, nativeRouteFile } from "../shared/native-routes";
import type { Checked } from "./native-create";

export interface FileMove {
  from: string;
  to: string;
}

/** `/a/b/` and `/a/b.html` are under `/a/`; the top level's parent is `/`. */
export function parentRoute(route: string): string {
  if (route === "/") return "/";
  const trimmed = isFolderRoute(route) ? route.slice(0, -1) : route;
  return trimmed.slice(0, trimmed.lastIndexOf("/") + 1);
}

/** The last part of a route: `/a/b/` is `b`, `/a/b.html` is `b.html`. */
export function routeSlug(route: string): string {
  return route.split("/").filter(Boolean).at(-1) ?? "";
}

/** The URL a page at `route` has under `parent`: its last part moved there. */
export function movedRoute(parent: string, route: string): string {
  return `${parent}${routeSlug(route)}${isFolderRoute(route) ? "/" : ""}`;
}

/** Whether `route` is `base` or under it (`/about/us/` is under `/about/`; `/about-us/` is not). */
export function isRouteWithin(route: string, base: string): boolean {
  return base !== "/" && (route === base || (isFolderRoute(base) && route.startsWith(base)));
}

/** The folder a folder route's page and subpages are in: `/a/b/` is `a/b/`. */
export const routeFolder = (route: string) => route.slice(1);

export interface PageMoveInput {
  /** Every file of the site now: the branch's not deleted, and new ones drafted. */
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
  /** Every file that moves: the page, and for a folder page everything in its folder. */
  moves: FileMove[];
  /** Every route in the moved subtree, old → new, the page's first. */
  routes: [string, string][];
  /** Said beside the plan, not in its way. */
  warnings: string[];
}

/**
 * What changing the URL of the page at `from` to `to` (a normalized route)
 * does to the files, or why it cannot be done. A folder page
 * (`about/index.html`) moves with its whole folder to the new URL's folder;
 * a single-file page (`notes.html`) moves alone, to `<to>index.html` for a
 * folder URL or the file a `.html` URL names.
 */
export function planPageMove(input: PageMoveInput): Checked<PageMovePlan> {
  const { from, to, routes } = input;
  const files = [...new Set(input.files)];
  const file = routes[from];
  if (!file) return { ok: false, error: `No page has the URL ${from}.` };
  if (from === "/") return { ok: false, error: "The home page's URL is always /." };
  if (to === from) return { ok: false, error: "That is the page's URL now." };
  if (to === "/") return { ok: false, error: "/ is the home page's URL." };
  if (isRouteWithin(to, from)) return { ok: false, error: "A page cannot go under itself or its own subpages." };
  const target = nativeRouteFile(to);
  if (nativePageRoute(target) !== to) return { ok: false, error: `No page file can give the URL ${to}.` };
  const parent = parentRoute(to);
  if (parent !== "/" && !isFolderRoute(parent)) return { ok: false, error: `${parent} is a single-file page, so nothing can go under it.` };

  const moves = new Map<string, string>();
  const folder = isFolderRoute(from) ? routeFolder(from) : undefined;
  const inside = folder === undefined ? [] : files.filter((path) => path.startsWith(folder) && path !== file);
  if (folder !== undefined && !isFolderRoute(to)) {
    // A folder page at a single-file URL: only when its folder holds nothing else.
    if (inside.length) return { ok: false, error: `${from} has other files in its folder; give it a URL that ends in /.` };
  }
  moves.set(file, target);
  if (folder !== undefined && isFolderRoute(to)) {
    const toFolder = routeFolder(to);
    for (const path of inside) moves.set(path, `${toFolder}${path.slice(folder.length)}`);
  }

  // Every route in the subtree, and where it goes.
  const routeOf = new Map(Object.entries(routes).map(([route, page]) => [page, route]));
  const pairs: [string, string][] = [[from, to]];
  for (const [source, destination] of moves) {
    const route = routeOf.get(source);
    if (route === undefined || route === from) continue;
    const next = nativePageRoute(destination);
    if (next !== undefined) pairs.push([route, next]);
  }
  const leaving = new Set(pairs.map(([route]) => route));
  for (const [, route] of pairs) {
    const taken = routes[route];
    if (taken && !leaving.has(route)) return { ok: false, error: `The URL ${route} is taken by ${taken}.` };
  }

  const warnings: string[] = [];
  if (to === NATIVE_NOT_FOUND_ROUTE) warnings.push(`${NATIVE_NOT_FOUND_ROUTE} is the page shown for addresses the site does not have.`);
  if (from === NATIVE_NOT_FOUND_ROUTE) warnings.push("The site will have no page for addresses it does not have.");

  // Nothing lands on a file that stays.
  const present = new Set(files);
  for (const [source, destination] of moves)
    if (present.has(destination) && !moves.has(destination)) return { ok: false, error: `${destination} is already there (moving ${source}).` };
  // A file where a folder must go (`x.html` is fine; a file named `x` is not).
  const folders = (path: string) => {
    const parts = path.split("/");
    return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
  };
  const blocked = [...moves.values()].flatMap(folders).find((folder) => present.has(folder) && !moves.has(folder));
  if (blocked) return { ok: false, error: `${blocked} is a file, so nothing can go in it.` };

  return {
    ok: true,
    value: {
      from, to, file, target,
      moves: [...moves].map(([source, destination]) => ({ from: source, to: destination })),
      routes: pairs,
      warnings,
    },
  };
}

// Links in HTML (`href`, `src`) and CSS (`url()`), with where their value is.
const LINK = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))|\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;

export interface LinkRewrite {
  text: string;
  /** How many links changed. */
  count: number;
  /** The edits made, as ranges of the text before, last first not assumed. */
  edits: { start: number; end: number; text: string }[];
}

/**
 * `source` (a page, a template or a stylesheet) with every root link to the
 * page at `from` pointing at `to` instead: `/about/` → `/company/`,
 * `/about/#team` → `/company/#team`, `/about` → `/company`, and, with
 * `subtree`, anything under a folder page (`/about/us/`,
 * `/about/team.jpg`, in `href`, `src` and CSS `url()` alike) under the new
 * URL. Only whole parts match (`/about-us/` is not under `/about/`); only
 * the path in each link changes, so the rest of the markup stays as written.
 */
export function rewriteRouteLinks(source: string, from: string, to: string, subtree = true): LinkRewrite {
  const edits: LinkRewrite["edits"] = [];
  if (from === "/" || from === to) return { text: source, count: 0, edits };
  const folder = isFolderRoute(from);
  const bare = folder ? from.slice(0, -1) : undefined;
  for (const match of source.matchAll(LINK)) {
    const index = [1, 2, 3, 4, 5, 6].find((group) => match[group] !== undefined);
    if (index === undefined) continue;
    const value = match[index];
    const valueStart = match.index! + match[0].indexOf(value, match[0].search(/[=(]/) + 1);
    // Leading spaces in a quoted value are kept.
    const lead = value.length - value.trimStart().length;
    const trimmed = value.slice(lead);
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) continue;
    const path = trimmed.split(/[?#\s]/)[0];
    let next: string | undefined;
    if (path === from || (bare !== undefined && path === bare)) next = path === bare ? to.replace(/\/$/, "") : to;
    else if (path === `${from}index.html` && folder) next = `${to}${isFolderRoute(to) ? "index.html" : ""}`;
    else if (folder && subtree && path.startsWith(from) && isFolderRoute(to)) next = `${to}${path.slice(from.length)}`;
    if (next === undefined || next === path) continue;
    const start = valueStart + lead;
    edits.push({ start, end: start + path.length, text: next });
  }
  let text = source;
  for (const edit of [...edits].reverse()) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return { text, count: edits.length, edits };
}

/**
 * `_redirects` at the site root (Cloudflare Pages and Workers, Netlify)
 * after the page at `from` moved to `to`: one `old new 301` line for each route in
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
  const folder = isFolderRoute(from);
  const bare = folder ? from.slice(0, -1) : undefined;
  const move = (path: string) => {
    const [route, rest] = splitPath(path);
    if (bare !== undefined && route === bare) return `${to.replace(/\/$/, "")}${rest}`;
    if (route === from) return `${to}${rest}`;
    if (folder && subtree && route.startsWith(from) && isFolderRoute(to)) return `${to}${route.slice(from.length)}${rest}`;
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
    if ((subtree ? isRouteWithin(sourceRoute, to) : sourceRoute === to) || (isFolderRoute(to) && sourceRoute === to.slice(0, -1))) continue;
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
