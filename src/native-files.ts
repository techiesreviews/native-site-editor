// The rules around deleting, renaming, moving and duplicating files: what a
// native site cannot lose, how many pages link to a page that moves or goes,
// and the names a copy and an inline rename start from. No DOM, no I/O.
import { NATIVE_PAGES_DIR } from "../shared/native-routes";

export const NATIVE_MANIFEST = ".astro-editor/native.json";

export type FileOperation = "delete" | "rename" | "move";
const PAST: Record<FileOperation, string> = { delete: "deleted", rename: "renamed", move: "moved" };

/**
 * Why `paths` (the files an operation takes, a folder's included) cannot be
 * deleted, renamed or moved: the home page is the site's `/`, and the
 * manifest can only be deleted, and only when `src/pages/index.html` keeps
 * the site native without it (`homePage`). Undefined when nothing stands in
 * the way.
 */
export function protectedPathProblem(paths: Iterable<string>, operation: FileOperation, home: string | undefined, native: boolean, homePage = false): string | undefined {
  if (!native) return undefined;
  for (const path of paths) {
    if (path === NATIVE_MANIFEST && operation === "delete" && !homePage)
      return `${NATIVE_MANIFEST} cannot be deleted: without src/pages/index.html the site needs it.`;
    if (path === NATIVE_MANIFEST && operation !== "delete") return `${NATIVE_MANIFEST} cannot be ${PAST[operation]}: it defines the site.`;
    if (home && path === home) return `The home page ${home} cannot be ${PAST[operation]}: the site needs a page at /.`;
  }
  return undefined;
}

/** The route a link's `href` points to, when it is a preview route (`#/about/`, `#/about`); undefined otherwise. */
export function linkRoute(href: string): string | undefined {
  const value = href.trim();
  if (!value.startsWith("#/")) return undefined;
  const path = value.slice(1).split(/[?#]/)[0];
  if (!/^\/(?:[\w.-]+\/?)*$/.test(path)) return undefined;
  return path.endsWith("/") ? path : `${path}/`;
}

/**
 * The files among `sources` whose markup links to one of `routes` (a page
 * moving or going: `#/about/`), leaving out `except` (the files moving or
 * going themselves). `complete` is false when a source is not loaded, so the
 * count is a lower bound.
 */
export function filesLinkingTo(sources: Record<string, string | undefined>, routes: Iterable<string>, except: Set<string> = new Set()): { files: string[]; complete: boolean } {
  const wanted = new Set(routes);
  const files: string[] = [];
  let complete = true;
  if (!wanted.size) return { files, complete };
  for (const [path, source] of Object.entries(sources)) {
    if (except.has(path)) continue;
    if (source === undefined) { complete = false; continue; }
    for (const match of source.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const route = linkRoute(match[1] ?? match[2] ?? match[3] ?? "");
      if (route && wanted.has(route)) { files.push(path); break; }
    }
  }
  return { files: files.sort(), complete };
}

/** A sentence for a confirmation: which pages and components link to what is moving or going. */
export function linkNote(found: { files: string[]; complete: boolean }, routes: string[], action: "deleted" | "moved"): string | undefined {
  const pages = found.files.filter((path) => path.startsWith(NATIVE_PAGES_DIR)).length;
  const others = found.files.length - pages;
  if (!found.files.length && found.complete) return undefined;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const least = found.complete ? "" : "at least ";
  const who = [pages || !others ? count(pages, "page", "pages") : "", others ? count(others, "component", "components") : ""].filter(Boolean).join(" and ");
  const target = routes.length === 1 ? `#${routes[0]}` : "these pages";
  const verb = pages + others === 1 ? "links" : "link";
  return `${least}${who} ${verb} to ${target}; ${action === "deleted" ? "those links will lead nowhere" : "those links are not updated"}.`.replace(/^./, (c) => c.toUpperCase());
}

/** A free path for a copy of `path`: `name-copy.ext`, then `name-copy-2.ext`, … */
export function copyPath(path: string, taken: (path: string) => boolean): string {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; ; n++) {
    const candidate = `${folder}${stem}-copy${n > 1 ? `-${n}` : ""}${extension}`;
    if (!taken(candidate)) return candidate;
  }
}

/** The part of a name an inline rename selects first: a file's name without its extension. */
export function renameSelection(name: string, folder: boolean): { start: number; end: number } {
  const dot = name.lastIndexOf(".");
  return { start: 0, end: !folder && dot > 0 ? dot : name.length };
}

/** Where a file lands when the folder `from` becomes `to`. */
export function movedPath(path: string, from: string, to: string): string {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}
