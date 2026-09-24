// Static export of a native project: the editor-owned exporter that turns the
// manifest, pages, components, shared stylesheets and images into a standalone
// site with no JavaScript. Every site that opens in the editor gets the same
// output rules, so no starter needs its own build script:
//
// - each route becomes `<route>/index.html`;
// - each custom element is expanded into declarative shadow DOM
//   (`<template shadowrootmode="open">`) that links the shared stylesheets and
//   inlines the component's own stylesheet, in the order the preview runtime
//   adopts them, so the cascade matches the preview;
// - `#/route/` links become real paths, and the nav link for the current
//   route gets `aria-current="page"`;
// - shared stylesheets and `src/images/` are written under `/assets/` with
//   content-hashed names and immutable cache headers (`_headers`); HTML is
//   always revalidated;
// - images get `width`/`height` from the file and `loading="lazy"` after the
//   first section;
// - the document head takes its title and description from the manifest's
//   per-route metadata, else a leading `key: value` comment in the page, else
//   the page's first `h1` and `p`; site-wide values come from
//   `.astro-editor/site.json` when present.
//
// The module is pure: it takes a map of repository files and returns a map of
// output files, so it runs in Node (see native-export-cli.ts) and in the
// browser alike.
import { parseNativeManifest, type NativeManifest } from "../src/native-manifest";

export type FileContent = string | Uint8Array;

export interface ExportInput {
  /** Repository files by path: text for HTML, CSS and JSON; bytes for images. */
  files: Record<string, FileContent>;
  /** Canonical site URL; overrides `site.json`'s `url`. */
  siteUrl?: string;
}

export interface ExportResult {
  /** Output files by path relative to the site root (`index.html`, `about/index.html`, `assets/…`, `_headers`). */
  files: Record<string, FileContent>;
  /** One line per written page and a summary, for the CLI to print. */
  log: string[];
}

export interface SiteMeta {
  name?: string;
  url?: string;
  description?: string;
  themeColor?: string;
  favicon?: string;
  image?: string;
  locale?: string;
}

export const MANIFEST_PATH = ".astro-editor/native.json";
export const SITE_PATH = ".astro-editor/site.json";
const IMAGES_DIR = "src/images/";

export class ExportError extends Error {}

const escapeHtml = (text: string) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** FNV-1a (64-bit) of the content as 10 hex digits, for cache-busting file names. */
export function contentHash(content: FileContent): string {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return hash.toString(16).padStart(16, "0").slice(0, 10);
}

/** Intrinsic pixel size from SVG, PNG, JPEG, GIF and WebP headers. */
export function imageDimensions(bytes: Uint8Array, ext: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16be = (o: number) => view.getUint16(o);
  const u16le = (o: number) => view.getUint16(o, true);
  const u32be = (o: number) => view.getUint32(o);
  const u32le = (o: number) => view.getUint32(o, true);
  try {
    if (ext === ".svg") {
      const text = decoder.decode(bytes);
      const attr = (name: string) => {
        const match = new RegExp(`<svg[^>]*\\s${name}=["']([^"']+)["']`).exec(text);
        return match ? match[1] : null;
      };
      const number = (value: string | null) => (value && /^\d+(\.\d+)?(px)?$/.test(value) ? Math.round(parseFloat(value)) : null);
      const w = number(attr("width")), h = number(attr("height"));
      if (w && h) return { width: w, height: h };
      const viewBox = attr("viewBox");
      if (viewBox) {
        const [, , vw, vh] = viewBox.trim().split(/[\s,]+/).map(Number);
        if (vw && vh) return { width: Math.round(vw), height: Math.round(vh) };
      }
      return null;
    }
    if (ext === ".png" && u32be(12) === 0x49484452) return { width: u32be(16), height: u32be(20) };
    if (ext === ".gif") return { width: u16le(6), height: u16le(8) };
    if (ext === ".jpg" || ext === ".jpeg") {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        const length = u16be(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
          return { height: u16be(offset + 5), width: u16be(offset + 7) };
        offset += 2 + length;
      }
      return null;
    }
    if (ext === ".webp") {
      const chunk = decoder.decode(bytes.subarray(12, 16));
      if (chunk === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = u32le(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X")
        return {
          width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
          height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
        };
    }
  } catch {
    return null;
  }
  return null;
}

const extname = (path: string) => {
  const match = /\.[^./]+$/.exec(path);
  return match ? match[0].toLowerCase() : "";
};
const basename = (path: string, ext = "") => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
};

/** A page's leading `<!-- key: value -->` comment, and the page without it. */
export function pageMeta(html: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  const match = /^\s*<!--([\s\S]*?)-->\s*/.exec(html);
  if (!match) return { meta, body: html };
  for (const line of match[1].split("\n")) {
    const kv = /^\s*([a-z-]+):\s*(.+?)\s*$/i.exec(line);
    if (kv) meta[kv[1].toLowerCase()] = kv[2];
  }
  return { meta, body: html.slice(match[0].length) };
}

const firstText = (html: string, tag: string) =>
  new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(html)?.[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const OPEN = /<([a-z][a-z0-9]*-[a-z0-9-]*)(\s[^>]*)?>/g;
const MAX_DEPTH = 20;

function closeOf(html: string, tag: string, openEnd: number) {
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "g");
  re.lastIndex = openEnd;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return { innerEnd: match.index, outerEnd: re.lastIndex };
  }
  return null;
}

/** The site-wide metadata file, or an empty object when the project has none. */
export function readSiteMeta(files: Record<string, FileContent>): SiteMeta {
  const raw = files[SITE_PATH];
  if (raw === undefined) return {};
  let value: unknown;
  try {
    value = JSON.parse(typeof raw === "string" ? raw : decoder.decode(raw));
  } catch {
    throw new ExportError(`${SITE_PATH} is not valid JSON.`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ExportError(`${SITE_PATH} must be a JSON object.`);
  const site: SiteMeta = {};
  for (const key of ["name", "url", "description", "themeColor", "favicon", "image", "locale"] as const) {
    const field = (value as Record<string, unknown>)[key];
    if (field === undefined) continue;
    if (typeof field !== "string") throw new ExportError(`${SITE_PATH} "${key}" must be a string.`);
    site[key] = field;
  }
  return site;
}

export function exportNativeSite(input: ExportInput): ExportResult {
  const { files } = input;
  const out: Record<string, FileContent> = {};
  const log: string[] = [];
  const text = (path: string) => {
    const content = files[path];
    if (content === undefined) throw new ExportError(`Missing file ${path}`);
    return typeof content === "string" ? content : decoder.decode(content);
  };
  const bytes = (path: string) => {
    const content = files[path];
    if (content === undefined) throw new ExportError(`Missing file ${path}`);
    return typeof content === "string" ? encoder.encode(content) : content;
  };

  const parsed = parseNativeManifest(text(MANIFEST_PATH));
  if (!parsed.ok) throw new ExportError(parsed.error);
  const manifest: NativeManifest = parsed.manifest;
  const site = readSiteMeta(files);
  const siteUrl = (input.siteUrl || site.url || "").replace(/\/$/, "");

  // Shared stylesheets: one hashed file each, linked in manifest order.
  const sharedLinks = manifest.styles.map((path) => {
    const css = text(path);
    const name = `${basename(path, ".css")}.${contentHash(css)}.css`;
    out[`assets/${name}`] = css;
    return `<link rel="stylesheet" href="/assets/${name}">`;
  });
  const sharedLinkTags = sharedLinks.join("");

  // Images: copied to hashed names; the map rewrites references in HTML.
  const imageMap = new Map<string, string>();
  const imageSize = new Map<string, { width: number; height: number }>();
  for (const source of Object.keys(files).filter((path) => path.startsWith(IMAGES_DIR)).sort()) {
    const buffer = bytes(source);
    const ext = extname(source);
    const name = `${basename(source, ext)}.${contentHash(buffer)}${ext}`;
    out[`assets/images/${name}`] = buffer;
    imageMap.set(source, `/assets/images/${name}`);
    const size = imageDimensions(buffer, ext);
    if (size) imageSize.set(source, size);
  }
  const assetUrl = (source: string) => {
    const url = imageMap.get(source);
    if (!url) throw new ExportError(`Missing image ${source}`);
    return url;
  };

  // Components, expanded recursively into declarative shadow DOM.
  const components: Record<string, { html: string; css: string }> = {};
  for (const [tag, path] of Object.entries(manifest.components)) {
    const cssPath = path.replace(/\.html$/, ".css");
    components[tag] = { html: text(path), css: files[cssPath] !== undefined ? text(cssPath) : "" };
  }
  const styleBlock = (tag: string) => sharedLinkTags + (components[tag].css ? `<style>${components[tag].css}</style>` : "");

  function expand(html: string, depth = 0): string {
    if (depth > MAX_DEPTH) throw new ExportError("Recursive component templates detected");
    let result = "";
    let cursor = 0;
    const re = new RegExp(OPEN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      const [open, tag] = match;
      if (match.index < cursor || !components[tag]) continue;
      const close = closeOf(html, tag, match.index + open.length);
      if (!close) throw new ExportError(`Unclosed <${tag}> in page or template`);
      result += html.slice(cursor, match.index) + open;
      result += `<template shadowrootmode="open">${styleBlock(tag)}${expand(components[tag].html, depth + 1)}</template>`;
      result += expand(html.slice(match.index + open.length, close.innerEnd), depth + 1);
      result += html.slice(close.innerEnd, close.outerEnd);
      cursor = close.outerEnd;
      re.lastIndex = cursor;
    }
    return result + html.slice(cursor);
  }

  const rewriteLinks = (html: string) =>
    html
      .replace(/(href=["'])#\/([^"']*)/g, "$1/$2")
      .replace(/((?:src|href)=["'])(src\/images\/[^"']+)/g, (_, prefix: string, source: string) => prefix + assetUrl(source));

  // Marks the nav link for the current route.
  const markCurrent = (html: string, route: string) =>
    html.replace(/<nav[\s\S]*?<\/nav>/g, (nav) =>
      nav.replace(/<a\b([^>]*)>/g, (tag, attrs: string) => {
        const href = /\shref=["']([^"']*)["']/.exec(attrs)?.[1];
        return href === route && !/aria-current=/.test(attrs) ? `<a${attrs} aria-current="page">` : tag;
      }),
    );

  // Adds width/height from the file, and lazy loading below the first section.
  function annotateImages(html: string) {
    const firstSectionEnd = html.indexOf("</section>");
    return html.replace(/<img\b([^>]*)>/g, (tag, attrs: string, offset: number) => {
      const src = /\ssrc=["']([^"']*)["']/.exec(attrs)?.[1];
      const source = [...imageMap].find(([, url]) => url === src)?.[0];
      let extra = "";
      const size = source && imageSize.get(source);
      if (size && !/\swidth=/.test(attrs)) extra += ` width="${size.width}"`;
      if (size && !/\sheight=/.test(attrs)) extra += ` height="${size.height}"`;
      if (firstSectionEnd !== -1 && offset > firstSectionEnd && !/\sloading=/.test(attrs)) extra += ` loading="lazy"`;
      return `<img${attrs}${extra}>`;
    });
  }

  const homeName = () => firstText(text(manifest.routes["/"]), "h1");

  function document(route: string, body: string, meta: Record<string, string>) {
    const routeMeta = manifest.pages[route] ?? {};
    const siteName = site.name || homeName() || "Site";
    const pageTitle = routeMeta.title || meta.title || firstText(body, "h1") || siteName;
    const title = pageTitle === siteName ? siteName : `${pageTitle} · ${siteName}`;
    const description = routeMeta.description || meta.description || firstText(body, "p") || site.description || "";
    const canonical = siteUrl ? siteUrl + route : "";
    const image = meta.image || site.image;
    const faviconExt = site.favicon ? extname(site.favicon) : "";
    const head = [
      `<meta charset="utf-8">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}">`,
      canonical && `<link rel="canonical" href="${escapeHtml(canonical)}">`,
      site.themeColor && `<meta name="theme-color" content="${escapeHtml(site.themeColor)}">`,
      site.favicon &&
        `<link rel="icon" href="${assetUrl(site.favicon)}" type="image/${faviconExt === ".svg" ? "svg+xml" : faviconExt.slice(1)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
      `<meta property="og:title" content="${escapeHtml(pageTitle)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      canonical && `<meta property="og:url" content="${escapeHtml(canonical)}">`,
      site.locale && `<meta property="og:locale" content="${escapeHtml(site.locale)}">`,
      image && canonical && `<meta property="og:image" content="${escapeHtml(siteUrl + assetUrl(image))}">`,
      `<meta name="twitter:card" content="${image && canonical ? "summary_large_image" : "summary"}">`,
      ...sharedLinks,
    ].filter(Boolean);
    return `<!doctype html>
<html lang="${escapeHtml((site.locale || "en").split("_")[0])}">
<head>
${head.join("\n")}
</head>
<body>
${body}
</body>
</html>
`;
  }

  for (const [route, path] of Object.entries(manifest.routes)) {
    const { meta, body: source } = pageMeta(text(path));
    const body = annotateImages(markCurrent(rewriteLinks(expand(source)), route));
    const outPath = `${route.slice(1)}index.html`;
    out[outPath] = document(route, body, meta);
    log.push(`${route} -> ${outPath}`);
  }

  // Cache policy for Cloudflare's static assets: hashed files are immutable,
  // HTML is always revalidated.
  out["_headers"] = `/*
  Cache-Control: max-age=0, must-revalidate
/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`;
  log.push(`assets -> ${imageMap.size} images, ${sharedLinks.length} stylesheets, _headers`);
  return { files: out, log };
}
