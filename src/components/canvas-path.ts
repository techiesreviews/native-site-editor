import { siteRouteOf } from "../../shared/site-path-prefix";

const SITE = "https://site.invalid";

/**
 * The decoded root route (`/media/x.png`, `/about/`) an address on the page at
 * `base` names on the canvas. With the site's sub-folder `prefix`, prefixed and
 * plain root addresses both name the repository's files; at a domain root
 * (no prefix) it is the address's own path, as it always was.
 */
export function canvasRoute(src: string, base: string, prefix = ""): string | undefined {
  try {
    const url = new URL(src, SITE + (base || "/"));
    if (url.origin !== SITE) return undefined;
    return prefix ? siteRouteOf(url.pathname, { prefix }) : decodeURI(url.pathname);
  } catch {
    return undefined;
  }
}

/** The repository path an address names on the canvas (`canvasRoute` without its leading slash). */
export function canvasPath(src: string, base: string, prefix = ""): string | undefined {
  return canvasRoute(src, base, prefix)?.slice(1);
}
