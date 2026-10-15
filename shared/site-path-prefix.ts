function webAddress(value?: string): URL | undefined {
  try {
    const url = new URL(value ?? "");
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : undefined;
  } catch { return undefined; }
}

/** The encoded folder prefix of a site's HTTP(S) address, or empty at the domain root. */
export function sitePathPrefix(siteUrl: string | undefined): string {
  return (webAddress(siteUrl)?.pathname ?? "").replace(/\/+/g, "/").replace(/\/index\.html?\/?$/i, "").replace(/\/+$/, "");
}

/** A repository path encoded as a root address under the site's prefix. */
export function siteAddress(path: string, prefix: string): string {
  return `${prefix}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** An unprefixed internal route identity, never a published site address. */
export function rootRoute(path: string): string {
  return "/" + path.replace(/^\/+/, "");
}

/** Publish an internal rootRoute key: even a route named like the prefix gets the folder. */
export function routeAddress(route: string, prefix: string): string {
  return prefix + route;
}

/** Prefix an encoded root address once, preserving its query, fragment and trailing slash. */
export function withSitePrefix(rootAddress: string, prefix: string): string {
  if (!prefix || !rootAddress.startsWith("/") || rootAddress.startsWith("//")) return rootAddress;
  const path = rootAddress.split(/[?#]/, 1)[0];
  return path === prefix || path.startsWith(`${prefix}/`) ? rootAddress : prefix + rootAddress;
}

/**
 * Read a root or own-origin address as a decoded repository path; url supplies prefix and origin.
 * Root links count with or without the prefix; a full address must be inside the site's folder.
 */
export function sitePathOf(address: string, site: { prefix?: string; url?: string; origins?: Iterable<string> }): string | undefined {
  const prefix = site.prefix ?? sitePathPrefix(site.url);
  let path: string, full = false;
  if (/^https?:\/\//i.test(address)) {
    full = true;
    const url = webAddress(address);
    if (!url) return undefined;
    const origins = [site.url, ...site.origins ?? []].map(webAddress);
    if (!origins.some(own => own?.origin === url.origin)) return undefined;
    // Read before URL normalizes dot segments: an escape must not disappear during parsing.
    path = /^https?:\/\/[^/?#]*(\/[^?#]*)?/i.exec(address)?.[1] ?? "/";
  } else {
    if (!address.startsWith("/") || address.startsWith("//")) return undefined;
    path = address.split(/[?#]/, 1)[0];
  }
  if (path.includes("\\")) return undefined;
  // Compared decoded: `/café`, `/caf%C3%A9` and `/caf%c3%a9` are one prefix.
  let folder: string;
  try { path = decodeURIComponent(path); folder = decodeURIComponent(prefix); } catch { return undefined; }
  if (path.includes("\\")) return undefined;
  if (folder && (path === folder || path.startsWith(`${folder}/`))) path = path.slice(folder.length);
  // A full address on the site's host outside its folder is another site there (`user.github.io/other-site/`).
  else if (folder && full) return undefined;
  const parts: string[] = [];
  for (const part of path.replace(/^\/+/, "").split("/")) {
    if (part === "..") {
      while (parts.at(-1) === "") parts.pop();
      if (!parts.length) return undefined;
      parts.pop();
    } else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/** `sitePathOf` as a decoded root route (`/about/`), as readers compare it with the site's routes. */
export function siteRouteOf(address: string, site: { prefix?: string; url?: string; origins?: Iterable<string> }): string | undefined {
  const path = sitePathOf(address, site);
  return path === undefined ? undefined : "/" + path;
}
