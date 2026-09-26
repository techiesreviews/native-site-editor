// The repository is the site (docs/adr/0001-the-repository-is-the-site.md):
// a page's URL is its file's path. The editor and the agent context route
// pages through this one rule:
//
// - `index.html` is `/`;
// - `<dir>/index.html` is `/<dir>/`;
// - any other `<path>.html` is `/<path>.html` (`404.html` at the root is the
//   page hosts show for addresses the site does not have);
// - nothing under `components/` or `node_modules/` is a page, nor is a file
//   or folder whose name starts with `.` or `_`, nor a name outside the safe
//   path characters (letters, digits, `_`, `.`, `-`).
//
// Two files never give one route. The module takes a plain list of paths, so
// repository files and new files drafted in the browser route alike; it has
// no DOM and no I/O.

export const NATIVE_HOME_PAGE = "index.html";
export const NATIVE_NOT_FOUND_PAGE = "404.html";
/** The route of the not-found page. */
export const NATIVE_NOT_FOUND_ROUTE = "/404.html";

const SEGMENT = /^[\w.-]+$/;
const NOT_PAGES = new Set(["components", "node_modules"]);

/** The route `path` serves; undefined when it is not a page. */
export function nativePageRoute(path: string): string | undefined {
  if (typeof path !== "string" || path.length > 1024 || !path.endsWith(".html")) return undefined;
  const parts = path.split("/");
  if (NOT_PAGES.has(parts[0]) && parts.length > 1) return undefined;
  if (parts.some((part) => !SEGMENT.test(part) || part.startsWith("_") || part.startsWith("."))) return undefined;
  if (parts[parts.length - 1] !== "index.html") return `/${path}`;
  parts.pop();
  return parts.length ? `/${parts.join("/")}/` : "/";
}

/** The file that gives `route`: `/` is `index.html`, `/a/b/` is `a/b/index.html`, `/x.html` is `x.html`. */
export function nativeRouteFile(route: string): string {
  if (route.endsWith("/")) return `${route.slice(1)}index.html`;
  return route.slice(1);
}

/** Whether `route` is a folder's (`/`, `/a/b/`), which can have subpages, rather than a file's (`/x.html`). */
export const isFolderRoute = (route: string) => route.endsWith("/");

/** Every page among `paths` by its route, in route order. */
export function deriveNativeRoutes(paths: Iterable<string>): Record<string, string> {
  const found: [string, string][] = [];
  for (const path of new Set(paths)) {
    const route = nativePageRoute(path);
    if (route !== undefined) found.push([route, path]);
  }
  found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(found);
}

const SITE = "https://site.invalid";

/**
 * The route a link on the page at `from` goes to, among `routes`: a root
 * link (`/about/`, `/about/#team`), a relative one (`../about/`) resolved
 * against `from`, `/about` and `/about/index.html` for `/about/`. Undefined
 * for an external link, a link within the page (`#team`), or no page.
 */
export function nativeLinkTarget(href: string, from: string, routes: Record<string, string>): string | undefined {
  const value = href.trim();
  if (!value || value.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return undefined;
  let path: string;
  try {
    const url = new URL(value, `${SITE}${from.startsWith("/") ? from : `/${from}`}`);
    if (url.origin !== SITE) return undefined;
    path = decodeURI(url.pathname);
  } catch {
    return undefined;
  }
  const candidates = [path];
  if (path.endsWith("/index.html")) candidates.push(path.slice(0, -"index.html".length));
  else if (!path.endsWith("/") && !path.endsWith(".html")) candidates.push(`${path}/`);
  return candidates.find((candidate) => Object.hasOwn(routes, candidate));
}

/** The element id a link's fragment names (`/about/#contact` gives `contact`), decoded; none without one. */
export function nativeLinkFragment(href: string): string | undefined {
  const at = href.indexOf("#");
  const raw = at < 0 ? "" : href.slice(at + 1).trim();
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
