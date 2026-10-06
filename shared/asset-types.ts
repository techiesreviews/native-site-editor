// Repository images and fonts the preview shows, by extension, and the
// address the editor reads a file's bytes from: `/api/blob` (worker/app.ts)
// by repository and blob SHA. A blob never changes, so the browser caches
// each address for good and the preview loads images itself, lazily, rather
// than the editor reading them before the page is drawn.

export const ASSET_TYPES: Readonly<Record<string, string>> = {
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
};

/** The lower-case extension of `path` ("" when it has none). */
export const assetExtension = (path: string) => {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** The media type of an image or font path, or undefined for anything else. */
export const assetType = (path: string): string | undefined =>
  Object.hasOwn(ASSET_TYPES, assetExtension(path)) ? ASSET_TYPES[assetExtension(path)] : undefined;

/** Fonts are not loaded by URL in the preview (see src/main.ts), only images are. */
export const isFontType = (type: string | undefined) => Boolean(type?.startsWith("font/"));

/**
 * The address of blob `sha` of `repo` ("owner/name"): an image or font as its
 * type (from `path`'s extension), any other file as plain bytes.
 */
export function blobUrl(repo: string, sha: string, path?: string) {
  const type = path ? assetExtension(path) : "";
  const params = new URLSearchParams({ repo, sha });
  if (type && Object.hasOwn(ASSET_TYPES, type)) params.set("type", type);
  return `/api/blob?${params}`;
}
