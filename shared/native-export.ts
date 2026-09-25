// Static export of a native project: the editor-owned exporter that turns the
// manifest, pages, components, shared stylesheets and images into a standalone
// site with no JavaScript. Every site that opens in the editor gets the same
// output rules, so no starter needs its own build script:
//
// - each page under `src/pages/` is routed by its path there (`about.html` and
//   `about/index.html` are `/about/`; see native-routes.ts), and each route
//   becomes `<route>/index.html`, except the `/404/` route, which
//   becomes `404.html` (served for unknown paths by Cloudflare's
//   `not_found_handling: "404-page"`);
// - each custom element is expanded into declarative shadow DOM
//   (`<template shadowrootmode="open">`) that links the site stylesheet and
//   then the component's own, in the order the preview runtime adopts them,
//   so the cascade matches the preview. A slot the page fills is written
//   without its fallback content, and template parts the page leaves empty
//   are left out;
// - `#/route/` links become real paths, the nav link for the current route
//   gets `aria-current="page"`, and the editor's `data-key` attributes go;
// - the shared stylesheets (the manifest's `styles`, else by convention; see
//   native-project.ts, which also finds the components) are joined into one `site.[hash].css`,
//   with the repository files they `@import` inlined; that, each component's
//   stylesheet and `src/images/` are written under `/assets/` with
//   content-hashed names and immutable cache headers (`_headers`, which also
//   carries the security headers); HTML is always revalidated;
// - images get `width`/`height` from the file and `loading="lazy"` after the
//   first section;
// - the document head takes its title and description from the manifest's
//   per-route metadata, else a leading `key: value` comment in the page, else
//   the page's first `h1` and `p`; site-wide values come from
//   `.astro-editor/site.json`, else `src/site.json`, when present, including Organization and
//   WebSite JSON-LD for the home page and the indexing switch;
// - with a site URL, `sitemap.xml` and `robots.txt` are generated unless
//   `src/public/` supplies them; everything in `src/public/` is copied to the
//   site root.
//
// The module is pure: it takes a map of repository files and returns a map of
// output files, so it runs in Node (see native-export-cli.ts) and in the
// browser alike.
import type { NativeManifest } from "../src/native-manifest";
import { NATIVE_MANIFEST_PATH, NATIVE_SITE_PATHS, nativePageComment, resolveNativeProject } from "./native-project";
import { assignedSlotNames, dropFilledFallbacks, pruneEmptyTemplate } from "./native-conditionals";
import { isExternalImport, parseCssImports, resolveImportPath, rewriteCssUrls, supportsCondition, wrapImported, type CssImport, type ImportWrapper } from "./css-imports";

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
  /** Alternative text for the social image (`og:image:alt`). */
  imageAlt?: string;
  locale?: string;
  /** `false` asks search engines not to index the site (header and meta tag). */
  indexable?: boolean;
  /** Cloudflare Content Signals for robots.txt, e.g. `{ "search": "yes", "ai-train": "no" }`. */
  contentSignals?: Record<string, "yes" | "no">;
  /** The business behind the site, for Organization JSON-LD on the home page. */
  organization?: SiteOrganization;
}

export interface SiteOrganization {
  /** schema.org type, e.g. "ProfessionalService"; default "Organization". */
  type?: string;
  name?: string;
  email?: string;
  telephone?: string;
  /** A one-line address, or PostalAddress fields (`streetAddress`, `addressLocality`, `postalCode`, `addressCountry`, …). */
  address?: string | Record<string, string>;
  areaServed?: string | string[];
  foundingDate?: string;
  sameAs?: string[];
  /** An image under src/images/ or an absolute URL. */
  logo?: string;
}

export const MANIFEST_PATH = NATIVE_MANIFEST_PATH;
/** Where site settings are read from: `.astro-editor/site.json`, else `src/site.json`. */
export const SITE_PATHS = NATIVE_SITE_PATHS;
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
export const pageMeta = nativePageComment;

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
  const sitePath = SITE_PATHS.find((path) => files[path] !== undefined);
  if (sitePath === undefined) return {};
  const raw = files[sitePath];
  let value: unknown;
  try {
    value = JSON.parse(typeof raw === "string" ? raw : decoder.decode(raw));
  } catch {
    throw new ExportError(`${sitePath} is not valid JSON.`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ExportError(`${sitePath} must be a JSON object.`);
  const record = value as Record<string, unknown>;
  const site: SiteMeta = {};
  for (const key of ["name", "url", "description", "themeColor", "favicon", "image", "imageAlt", "locale"] as const) {
    const field = record[key];
    if (field === undefined) continue;
    if (typeof field !== "string") throw new ExportError(`${sitePath} "${key}" must be a string.`);
    site[key] = field;
  }
  if (record.indexable !== undefined) {
    if (typeof record.indexable !== "boolean") throw new ExportError(`${sitePath} "indexable" must be true or false.`);
    site.indexable = record.indexable;
  }
  if (record.contentSignals !== undefined) {
    const signals = record.contentSignals;
    if (!isPlainObject(signals) || !Object.entries(signals).every(([key, value]) => /^[a-z][a-z-]*$/.test(key) && (value === "yes" || value === "no")))
      throw new ExportError(`${sitePath} "contentSignals" must map signal names to "yes" or "no".`);
    site.contentSignals = signals as SiteMeta["contentSignals"];
  }
  if (record.organization !== undefined) site.organization = readOrganization(record.organization, sitePath);
  return site;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readOrganization(input: unknown, sitePath: string): SiteOrganization {
  const where = `${sitePath} "organization"`;
  if (!isPlainObject(input)) throw new ExportError(`${where} must be an object.`);
  let value = input;
  const org: SiteOrganization = {};
  // `@type` is accepted too, as it is written in JSON-LD itself.
  if (value.type === undefined && value["@type"] !== undefined) value = { ...value, type: value["@type"] };
  for (const key of ["type", "name", "email", "telephone", "foundingDate", "logo"] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "string") throw new ExportError(`${where} "${key}" must be a string.`);
    org[key] = value[key];
  }
  const strings = (field: unknown) => Array.isArray(field) && field.every((item) => typeof item === "string");
  if (value.address !== undefined) {
    const address = value.address;
    if (typeof address !== "string" && !(isPlainObject(address) && Object.values(address).every((item) => typeof item === "string")))
      throw new ExportError(`${where} "address" must be a string or an object of strings.`);
    org.address = address as SiteOrganization["address"];
  }
  if (value.areaServed !== undefined) {
    if (typeof value.areaServed !== "string" && !strings(value.areaServed)) throw new ExportError(`${where} "areaServed" must be a string or an array of strings.`);
    org.areaServed = value.areaServed as SiteOrganization["areaServed"];
  }
  if (value.sameAs !== undefined) {
    if (!strings(value.sameAs)) throw new ExportError(`${where} "sameAs" must be an array of URLs.`);
    org.sameAs = value.sameAs as string[];
  }
  return org;
}

/** The route whose page becomes `404.html`, served for every unknown path. */
export const NOT_FOUND_ROUTE = "/404/";
/** Files under this folder are copied to the site root as they are (`src/public/robots.txt` → `robots.txt`). */
const PUBLIC_DIR = "src/public/";
const RASTER = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]);

/** JSON for a `<script type="application/ld+json">`, safe to put inside the element. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** What an import wraps its file in: its layer, supports() and media; undefined for a bare import. */
function importWrapper(item: CssImport): ImportWrapper | undefined {
  const wrapper: ImportWrapper = {};
  if (item.layer !== undefined) wrapper.layer = item.layer;
  if (item.supports !== undefined) wrapper.supports = item.supports;
  if (item.media !== undefined) wrapper.media = item.media;
  return Object.keys(wrapper).length ? wrapper : undefined;
}

export function exportNativeSite(input: ExportInput): ExportResult {
  const { files } = input;
  const out: Record<string, FileContent> = {};
  const log: string[] = [];
  const warnings: string[] = [];
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

  // Pages are routed by where they are under src/pages/ (shared/native-routes.ts);
  // components and styles the manifest leaves out are found by convention.
  const parsed = resolveNativeProject(Object.keys(files), files[MANIFEST_PATH] === undefined ? undefined : text(MANIFEST_PATH));
  if (!parsed.ok) throw new ExportError(parsed.error);
  const manifest: NativeManifest = parsed.manifest;
  warnings.push(...parsed.warnings.map((warning) => `warning: ${warning}`));
  const site = readSiteMeta(files);
  const siteUrl = (input.siteUrl || site.url || "").replace(/\/$/, "");
  const indexable = site.indexable !== false;

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

  // Stylesheets. Every stylesheet is served from /assets/, so each `url()`
  // is resolved from the file it is written in: an image becomes its hashed
  // copy, a file under src/public/ its path at the site root, and another
  // repository file (a font, say) is copied to a hashed name of its own.
  let stylesheets = 0;
  function writeAsset(name: string, css: string) {
    const file = `assets/${name}.${contentHash(css)}.css`;
    if (out[file] === undefined) stylesheets++;
    out[file] = css;
    return `/${file}`;
  }
  const fileAssets = new Map<string, string>();
  function cssUrl(from: string, url: string): string | undefined {
    const written = url.trim();
    if (!written || written.startsWith("#") || written.startsWith("/") || isExternalImport(written)) return undefined;
    const target = resolveImportPath(from, written);
    const suffix = /[?#][\s\S]*$/.exec(written)?.[0] ?? "";
    if (target === undefined) {
      warnings.push(`warning: ${from} refers to ${written}, which is outside the repository.`);
      return undefined;
    }
    const image = imageMap.get(target);
    if (image) return image + suffix;
    if (target.startsWith(PUBLIC_DIR)) return `/${target.slice(PUBLIC_DIR.length)}${suffix}`;
    const content = files[target];
    if (content === undefined) {
      warnings.push(`warning: ${from} refers to ${written}, which is missing.`);
      return undefined;
    }
    let asset = fileAssets.get(target);
    if (!asset) {
      const ext = extname(target);
      asset = `/assets/${basename(target, ext)}.${contentHash(content)}${ext}`;
      out[asset.slice(1)] = content;
      fileAssets.set(target, asset);
    }
    return asset + suffix;
  }
  const urlsRewritten = (path: string, css: string) => rewriteCssUrls(css, (url) => cssUrl(path, url));

  // A stylesheet's `@import`s of repository files are inlined where they
  // stand, recursively, each file once, inside the blocks its import asks
  // for (`@media …`, `@supports (…)`, then `@layer name` or an anonymous
  // `@layer`, as the preview wraps them), so a page loads one stylesheet and
  // no chain of imports. Only `@charset`, `@layer` statements and `@import`
  // may come before other rules, and no layer statement after an import, so
  // an external import that remains leads the bundle, after the first
  // file's layer statements (and those of each later file with an external
  // import): declare the layer order first and import into named layers,
  // and the order is unchanged. An unlayered one that moves ahead of other
  // styles gets a warning.
  function bundleStyles(paths: readonly string[], name: string, labelled: boolean) {
    const layers: string[] = [];
    const externals: string[] = [];
    const bodies: string[] = [];
    const seen = new Set<string>();
    let hasRules = false;
    function external(path: string, css: string, item: CssImport, wrappers: ImportWrapper[]) {
      const own = importWrapper(item);
      if (!wrappers.length) return { statement: css.slice(item.start, item.end), layered: own?.layer !== undefined };
      const chain = own ? [...wrappers, own] : wrappers;
      const parts = [css.slice(item.urlStart, item.urlEnd)];
      const layerNames = chain.filter((wrapper) => wrapper.layer !== undefined).map((wrapper) => wrapper.layer!);
      if (layerNames.length > 1 && layerNames.includes(""))
        warnings.push(`warning: ${path} imports ${item.url} inside an anonymous layer, which an import at the head of ${name}.css cannot name; it is kept in the named layers only.`);
      const named = layerNames.filter(Boolean);
      if (named.length) parts.push(`layer(${named.join(".")})`);
      else if (layerNames.length) parts.push("layer");
      const supports = chain.flatMap((wrapper) => wrapper.supports === undefined ? [] : [wrapper.supports]);
      if (supports.length === 1) parts.push(`supports(${supports[0]})`);
      else if (supports.length) parts.push(`supports(${supports.map((condition) => `(${supportsCondition(condition)})`).join(" and ")})`);
      const media = chain.flatMap((wrapper) => wrapper.media === undefined ? [] : [wrapper.media]);
      if (media.length === 1) parts.push(media[0]);
      else if (media.length) {
        if (media.every((query) => !query.includes(",")) && media.slice(1).every((query) => query.startsWith("("))) parts.push(media.join(" and "));
        else {
          warnings.push(`warning: ${path} imports ${item.url} under media queries that cannot be combined at the head of ${name}.css; only "${media[media.length - 1]}" is kept.`);
          parts.push(media[media.length - 1]);
        }
      }
      return { statement: `@import ${parts.join(" ")};`, layered: layerNames.length > 0 };
    }
    // The file's leading layer statements, and the rest of it with its
    // repository imports inlined.
    function inline(path: string, chain: string[], wrappers: ImportWrapper[]) {
      const css = text(path);
      const head = parseCssImports(css);
      const headEnd = Math.max(0, ...[...head.layers, ...head.imports].map((range) => range.end));
      const leading = head.layers.map((range) => css.slice(range.start, range.end));
      const externalsBefore = externals.length;
      let body = "";
      for (const item of head.imports) {
        const target = resolveImportPath(path, item.url);
        if (target === undefined) {
          if (!isExternalImport(item.url)) throw new ExportError(`${path} imports ${item.url}, which is outside the repository.`);
          const kept = external(path, css, item, wrappers);
          if (hasRules && !kept.layered)
            warnings.push(`warning: ${path} imports ${item.url} outside a layer after other styles; in ${name}.css that import moves ahead of them.`);
          externals.push(kept.statement);
          continue;
        }
        if (chain.includes(target)) throw new ExportError(`${path} imports ${target}, which imports it back.`);
        if (files[target] === undefined) throw new ExportError(`${path} imports ${target}, which is missing.`);
        const wrapper = importWrapper(item);
        const inner = wrapper ? [...wrappers, wrapper] : wrappers;
        const key = `${target} ${JSON.stringify(inner)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const child = inline(target, [...chain, target], inner);
        const content = (labelled ? `/* ${target} */\n` : "") + [...child.leading, child.body].join("\n").trimEnd();
        body += wrapImported(content, wrapper ? [wrapper] : []) + "\n";
      }
      const rest = urlsRewritten(path, css.slice(headEnd).replace(/^\s*\n/, ""));
      if (/\S/.test(rest.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ""))) hasRules = true;
      return { leading, body: body + rest, externals: externals.length - externalsBefore };
    }
    paths.forEach((path, index) => {
      seen.add(`${path} []`);
      const file = inline(path, [path], []);
      let body = file.body;
      if (index === 0 || file.externals) layers.push(...file.leading);
      else body = [...file.leading, body].join("\n");
      bodies.push((labelled ? `/* ${path} */\n` : "") + body);
    });
    return [...layers, ...externals, ...bodies].join("\n");
  }

  // The shared stylesheets (the manifest's `styles`, else by convention)
  // become one `site.[hash].css`, in order, so a page and each shadow root
  // link a single file.
  const siteCss = manifest.styles.length ? writeAsset("site", bundleStyles(manifest.styles, "site", true)) : undefined;
  const siteLink = siteCss ? `<link rel="stylesheet" href="${siteCss}">` : "";

  // Components, expanded recursively into declarative shadow DOM. Each shadow
  // root links the site stylesheet and then the component's own, the order the
  // preview runtime adopts them in.
  const components: Record<string, { html: string; cssUrl?: string }> = {};
  for (const [tag, path] of Object.entries(manifest.components)) {
    const cssPath = path.replace(/\.html$/, ".css");
    const source = files[cssPath] !== undefined ? text(cssPath) : "";
    const css = !source ? "" : parseCssImports(source).imports.length ? bundleStyles([cssPath], tag, false) : urlsRewritten(cssPath, source);
    components[tag] = { html: text(path), cssUrl: css ? writeAsset(tag, css) : undefined };
  }
  const styleBlock = (tag: string) =>
    siteLink + (components[tag].cssUrl ? `<link rel="stylesheet" href="${components[tag].cssUrl}">` : "");

  function expand(html: string, used: Set<string>, depth = 0): string {
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
      used.add(tag);
      result += html.slice(cursor, match.index) + open;
      // Template parts the page's slot content leaves empty are left out, and
      // so is the fallback of each slot the page fills.
      const inner = html.slice(match.index + open.length, close.innerEnd);
      const assigned = assignedSlotNames(inner);
      const template = dropFilledFallbacks(pruneEmptyTemplate(components[tag].html, assigned), assigned);
      result += `<template shadowrootmode="open">${styleBlock(tag)}${expand(template, used, depth + 1)}</template>`;
      result += expand(inner, used, depth + 1);
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

  // `data-key` marks elements for the editor; the published site has no use for it.
  const stripEditorKeys = (html: string) =>
    html.replace(/<[a-zA-Z][^>]*>/g, (tag) => tag.replace(/\sdata-key(?:=(?:"[^"]*"|'[^']*'|[^\s"'>]+))?(?=[\s/>])/g, ""));

  const homeName = () => firstText(text(manifest.routes["/"]), "h1");
  const siteName = site.name || homeName() || "Site";
  const absolute = (url: string) => (siteUrl && url.startsWith("/") ? siteUrl + url : url);

  // Organization (or a subtype such as ProfessionalService) and WebSite, for the home page.
  function siteJsonLd() {
    const graph: Record<string, unknown>[] = [];
    const org = site.organization;
    const orgId = siteUrl ? `${siteUrl}/#organization` : undefined;
    if (org) {
      const node: Record<string, unknown> = { "@type": org.type || "Organization" };
      if (orgId) node["@id"] = orgId;
      node.name = org.name || siteName;
      if (siteUrl) node.url = `${siteUrl}/`;
      if (site.description) node.description = site.description;
      if (org.logo) node.logo = absolute(org.logo.startsWith(IMAGES_DIR) ? assetUrl(org.logo) : org.logo);
      for (const key of ["email", "telephone", "foundingDate", "areaServed", "sameAs"] as const) if (org[key] !== undefined) node[key] = org[key];
      if (org.address !== undefined) node.address = typeof org.address === "string" ? org.address : { "@type": "PostalAddress", ...org.address };
      graph.push(node);
    }
    const website: Record<string, unknown> = { "@type": "WebSite", name: siteName };
    if (siteUrl) website.url = `${siteUrl}/`;
    if (site.description) website.description = site.description;
    if (site.locale) website.inLanguage = site.locale.replace(/_/g, "-");
    if (org && orgId) website.publisher = { "@id": orgId };
    graph.push(website);
    return { "@context": "https://schema.org", "@graph": graph };
  }

  let svgImageWarned = false;
  function document(route: string, body: string, meta: Record<string, string>, used: Set<string>) {
    const routeMeta = manifest.pages[route] ?? {};
    const notFound = route === NOT_FOUND_ROUTE;
    const pageTitle = routeMeta.title || meta.title || firstText(body, "h1") || siteName;
    const title = pageTitle === siteName ? siteName : `${pageTitle} · ${siteName}`;
    const description = routeMeta.description || meta.description || firstText(body, "p") || site.description || "";
    const canonical = siteUrl && !notFound ? siteUrl + route : "";
    const image = meta.image || site.image;
    const imageExt = image ? extname(image) : "";
    const imageDims = image && RASTER.has(imageExt) ? imageSize.get(image) : undefined;
    if (image && imageExt === ".svg" && !svgImageWarned) {
      svgImageWarned = true;
      warnings.push(`warning: the social image ${image} is an SVG, which Facebook, LinkedIn, X, Slack and WhatsApp do not show; use a PNG or JPEG (1200×630).`);
    }
    const faviconExt = site.favicon ? extname(site.favicon) : "";
    const jsonLd: unknown[] = [];
    if (route === "/") jsonLd.push(siteJsonLd());
    if (routeMeta.jsonLd) jsonLd.push(routeMeta.jsonLd);
    const head = [
      `<meta charset="utf-8">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}">`,
      (!indexable || notFound) && `<meta name="robots" content="noindex">`,
      canonical && `<link rel="canonical" href="${escapeHtml(canonical)}">`,
      site.themeColor && `<meta name="theme-color" content="${escapeHtml(site.themeColor)}">`,
      site.favicon &&
        `<link rel="icon" href="${assetUrl(site.favicon)}" type="image/${faviconExt === ".svg" ? "svg+xml" : faviconExt.slice(1)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      canonical && `<meta property="og:url" content="${escapeHtml(canonical)}">`,
      site.locale && `<meta property="og:locale" content="${escapeHtml(site.locale)}">`,
      image && siteUrl && `<meta property="og:image" content="${escapeHtml(siteUrl + assetUrl(image))}">`,
      image && siteUrl && imageDims && `<meta property="og:image:width" content="${imageDims.width}">`,
      image && siteUrl && imageDims && `<meta property="og:image:height" content="${imageDims.height}">`,
      image && siteUrl && site.imageAlt && `<meta property="og:image:alt" content="${escapeHtml(site.imageAlt)}">`,
      `<meta name="twitter:card" content="${image && siteUrl ? "summary_large_image" : "summary"}">`,
      siteLink,
      // Start fetching the component stylesheets the shadow roots link while
      // the site stylesheet blocks rendering.
      ...[...used].filter((tag) => components[tag].cssUrl).map((tag) => `<link rel="preload" href="${components[tag].cssUrl}" as="style">`),
      ...jsonLd.map((data) => `<script type="application/ld+json">${scriptJson(data)}</script>`),
    ].filter(Boolean);
    return `<!doctype html>
<html lang="${escapeHtml((site.locale || "en").replace(/_/g, "-"))}">
<head>
${head.join("\n")}
</head>
<body>
${body}
</body>
</html>
`;
  }

  // Files under src/public/ go to the site root unchanged.
  const publicFiles = Object.keys(files).filter((path) => path.startsWith(PUBLIC_DIR)).sort();

  const pages: string[] = [];
  for (const [route, path] of Object.entries(manifest.routes)) {
    const { meta, body: source } = pageMeta(text(path));
    const used = new Set<string>();
    const body = stripEditorKeys(annotateImages(markCurrent(rewriteLinks(expand(source, used)), route)));
    const outPath = route === NOT_FOUND_ROUTE ? "404.html" : `${route.slice(1)}index.html`;
    const html = document(route, body, meta, used);
    out[outPath] = html;
    pages.push(html);
    log.push(`${route} -> ${outPath}`);
  }

  for (const source of publicFiles) {
    const path = source.slice(PUBLIC_DIR.length);
    if (out[path] !== undefined) throw new ExportError(`${source} would overwrite the exported ${path}.`);
    out[path] = files[source];
  }

  // Search engines: a sitemap of the routes and a robots.txt that points at
  // it, unless the repository supplies its own in src/public/.
  const extras: string[] = [];
  if (siteUrl) {
    const routes = Object.keys(manifest.routes).filter((route) => route !== NOT_FOUND_ROUTE);
    if (out["sitemap.xml"] === undefined) {
      out["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${escapeHtml(siteUrl + route)}</loc></url>`).join("\n")}
</urlset>
`;
      extras.push("sitemap.xml");
    }
    if (out["robots.txt"] === undefined) {
      const signals = Object.entries(site.contentSignals ?? {}).map(([name, value]) => `${name}=${value}`).join(", ");
      out["robots.txt"] = [
        "User-agent: *",
        signals && `Content-Signal: ${signals}`,
        "Allow: /",
        indexable && `\nSitemap: ${siteUrl}/sitemap.xml`,
      ].filter(Boolean).join("\n") + "\n";
      extras.push("robots.txt");
    }
  }

  // Headers for Cloudflare's static assets. HTML is always revalidated and
  // hashed files are immutable. The content security policy allows no
  // scripts (JSON-LD is data, not script) and only this site's stylesheets;
  // inline styles are allowed only when a page carries a `style` attribute
  // or element.
  const inlineStyles = pages.some((html) => /<style[\s>]|<[^>]+\sstyle=/i.test(html));
  const csp = [
    "default-src 'self'",
    "img-src 'self' data:",
    `style-src 'self'${inlineStyles ? " 'unsafe-inline'" : ""}`,
    "script-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  out["_headers"] = `/*
  Cache-Control: max-age=0, must-revalidate
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
${indexable ? "" : "  X-Robots-Tag: noindex, nofollow\n"}/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`;
  log.push(
    `assets -> ${imageMap.size} images, ${stylesheets} stylesheets, _headers` +
      (extras.length ? `, ${extras.join(", ")}` : "") +
      (publicFiles.length ? `, ${publicFiles.length} public files` : ""),
  );
  log.push(...warnings);
  return { files: out, log };
}
