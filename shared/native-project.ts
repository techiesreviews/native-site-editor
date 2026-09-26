// A native site as the editor, and the agent context, read it
// (docs/adr/0001-the-repository-is-the-site.md): the repository root is the
// site root.
//
// - a repository is a native site when it has a home page, `index.html`
//   (`isNativeProject`);
// - pages are the `.html` files, routed by where they are
//   (shared/native-routes.ts), and each is a full document: its `<head>`
//   holds the title, the description and the stylesheet links, its `<body>`
//   the page;
// - every `components/<tag>/<tag>.html` (or flat `components/<tag>.html`)
//   whose `<tag>` is a valid, unreserved custom-element name is the
//   component `<tag>`, with a sibling `.css`;
// - the shared stylesheets of a page are the ones its `<head>` links
//   (`<link rel="stylesheet" href>`, resolved against the page's path to
//   repository paths; `nativePageStylesheets`), each with its `@import`s;
// - `.editor/config.json` holds editor-only settings.
//
// The module takes plain path lists and text; it has no DOM and no I/O.
import { resolveImportPath } from "./css-imports";
import { startTagAttribute, startTags, type StartTag } from "./html-source";
import { NATIVE_HOME_PAGE, deriveNativeRoutes } from "./native-routes";

export { NATIVE_HOME_PAGE, NATIVE_NOT_FOUND_PAGE, NATIVE_NOT_FOUND_ROUTE } from "./native-routes";

/** Editor-only site settings: `{ "site": { "name": "…", "url": "https://…" } }`. */
export const NATIVE_CONFIG_PATH = ".editor/config.json";

/** The site settings `.editor/config.json` gives. */
export interface NativeSiteSettings {
  /** The site's name. */
  name?: string;
  /** Its address, an http(s) URL; no address is guessed. */
  url?: string;
}

/** The settings in the text of `.editor/config.json`; none when it is missing or not JSON. */
export function nativeSiteSettings(text: string | undefined): NativeSiteSettings {
  if (text === undefined) return {};
  let value: unknown;
  try { value = JSON.parse(text); } catch { return {}; }
  const site = value && typeof value === "object" ? (value as { site?: unknown }).site : undefined;
  if (!site || typeof site !== "object") return {};
  const { name, url } = site as { name?: unknown; url?: unknown };
  const out: NativeSiteSettings = {};
  if (typeof name === "string" && name.trim()) out.name = name.trim();
  if (typeof url === "string" && url.trim()) {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol === "https:" || parsed.protocol === "http:") out.url = parsed.href;
    } catch {
      // Not a URL: no address.
    }
  }
  return out;
}

/** The address of the page at `route` on the site at `siteUrl` (`https://x.example` and `/about/` give `https://x.example/about/`). */
export function nativePageUrl(siteUrl: string | undefined, route: string): string | undefined {
  return siteUrl ? `${siteUrl.replace(/\/+$/, "")}${route}` : undefined;
}
/** Redirects at the site root (Cloudflare Pages and Workers, Netlify). */
export const NATIVE_REDIRECTS_PATH = "_redirects";
export const NATIVE_COMPONENTS_DIR = "components/";

const FOLDER_COMPONENT = /^components\/([\w.-]+)\/([\w.-]+)\.html$/;
const FLAT_COMPONENT = /^components\/([\w.-]+)\.html$/;
// Custom element names: at least one dash, lowercase, starts with a letter.
const TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
// Names the spec reserves; `customElements.define` throws on these.
const RESERVED_TAGS = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

/** Whether `tag` can name a component: a valid custom-element name the spec does not reserve. */
export function isNativeComponentTag(tag: string): boolean {
  return TAG.test(tag) && !RESERVED_TAGS.has(tag);
}

/** Whether the repository paths make a native site: it has a home page. */
export function isNativeProject(paths: Iterable<string>): boolean {
  for (const path of paths) if (path === NATIVE_HOME_PAGE) return true;
  return false;
}

/**
 * The components among `paths`, tag to template file: each
 * `components/<tag>/<tag>.html`, and each flat `components/<tag>.html`
 * whose tag has no folder, for a tag `isNativeComponentTag` accepts.
 */
export function nativeConventionComponents(paths: Iterable<string>): { components: Record<string, string>; warnings: string[] } {
  const folder = new Map<string, string>();
  const flat = new Map<string, string>();
  for (const path of new Set(paths)) {
    const nested = FOLDER_COMPONENT.exec(path);
    if (nested && nested[1] === nested[2] && isNativeComponentTag(nested[1])) folder.set(nested[1], path);
    const single = FLAT_COMPONENT.exec(path);
    if (single && isNativeComponentTag(single[1])) flat.set(single[1], path);
  }
  const warnings: string[] = [];
  const components: Record<string, string> = {};
  for (const tag of [...new Set([...folder.keys(), ...flat.keys()])].sort()) {
    const chosen = folder.get(tag) ?? flat.get(tag)!;
    components[tag] = chosen;
    if (folder.has(tag) && flat.has(tag))
      warnings.push(`${flat.get(tag)} and ${chosen} both give the component <${tag}>; ${chosen} is used. Remove or rename one.`);
  }
  return { components, warnings };
}

/** A native site: its pages by route, and its components by tag. */
export interface NativeSite {
  /** Route (`/`, `/about/`, `/404.html`) to page file, in route order. */
  routes: Record<string, string>;
  /** Custom-element tag to template file. */
  components: Record<string, string>;
}

export type NativeSiteResult =
  | { ok: true; site: NativeSite; warnings: string[] }
  | { ok: false; error: string };

/** The site whose repository paths (and new files drafted in the browser) are `paths`. */
export function resolveNativeProject(paths: Iterable<string>): NativeSiteResult {
  const files = [...new Set(paths)];
  const routes = deriveNativeRoutes(files);
  if (!Object.hasOwn(routes, "/")) return { ok: false, error: `The site has no home page: add ${NATIVE_HOME_PAGE}.` };
  const { components, warnings } = nativeConventionComponents(files);
  return { ok: true, site: { routes, components }, warnings };
}

/** Every page and component template of the site, for prefetching. */
export function nativeSitePaths(site: NativeSite): string[] {
  return [...new Set([...Object.values(site.routes), ...Object.values(site.components)])];
}

/** The route to show when the open file is not itself a page: the home page. */
export function nativeDefaultRoute(site: NativeSite): string {
  return Object.hasOwn(site.routes, "/") ? "/" : Object.keys(site.routes)[0];
}

/** A component's stylesheet: its template's sibling `.css`. */
export const nativeComponentCssPath = (template: string) => template.replace(/\.html$/, ".css");

// ---- Page documents ----

/**
 * Where the page is in a document: the content of its `<body>` (after the
 * start tag, before `</body>`); without a `<body>` start tag, everything
 * after `</head>` (or the whole text). The preview renders exactly this
 * range, and element-child indexes count from its start.
 */
export function nativePageBody(html: string): { start: number; end: number } {
  const body = startTags(html).find((tag) => tag.name === "body");
  const htmlClose = lastEndTag(html, "html");
  if (body) {
    const close = lastEndTag(html, "body");
    return { start: body.end, end: close >= body.end ? close : htmlClose >= body.end ? htmlClose : html.length };
  }
  // `</head>`, not `</header>`.
  const head = /<\/head\s*>/i.exec(html);
  const start = head ? head.index + head[0].length : 0;
  return { start, end: htmlClose >= start ? htmlClose : html.length };
}

/** Where the last `</name>` end tag starts, or -1. */
function lastEndTag(html: string, name: string) {
  let at = -1;
  for (const match of html.matchAll(new RegExp(`</${name}\\s*>`, "gi"))) at = match.index;
  return at;
}

/** The start tags of a document's `<head>` part: everything before its `<body>` (or its page, without one). */
function headTags(html: string): { tags: StartTag[]; end: number } {
  const end = nativePageBody(html).start;
  return { tags: startTags(html).filter((tag) => tag.start < end && tag.name !== "body"), end };
}

/**
 * The stylesheets the document at `path` links in its head, in order, as
 * repository paths: each `<link rel="stylesheet" href>` resolved against
 * the page's own path (`/styles/site.css` from anywhere, `../site.css` from
 * `about/index.html`). External and unresolvable ones are left out.
 */
export function nativePageStylesheets(html: string, path: string): string[] {
  const out: string[] = [];
  for (const tag of headTags(html).tags) {
    if (tag.name !== "link") continue;
    const rel = startTagAttribute(html, tag, "rel")?.value.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes("stylesheet") || rel.includes("alternate")) continue;
    const href = startTagAttribute(html, tag, "href")?.value;
    const resolved = href === undefined ? undefined : resolveImportPath(path, href);
    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
function decodeText(text: string) {
  return text
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, name) => {
      if (dec || hex) return String.fromCodePoint(Number.parseInt(dec ?? hex, dec ? 10 : 16) || 32);
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}
const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The details a page's head gives. */
export type NativePageDetail = "title" | "description";

interface HeadParts {
  title?: { tag: StartTag; inner: { start: number; end: number } };
  meta: Partial<Record<"description" | "og:title" | "og:description" | "og:url", StartTag>>;
  /** `<link rel="canonical">`. */
  canonical?: StartTag;
  head?: StartTag;
}

function headParts(html: string): HeadParts {
  const { tags, end } = headTags(html);
  const parts: HeadParts = { meta: {} };
  for (const tag of tags) {
    if (tag.name === "head" && !parts.head) parts.head = tag;
    if (tag.name === "title" && !parts.title) {
      const close = html.toLowerCase().indexOf("</title", tag.end);
      if (close >= 0 && close <= end) parts.title = { tag, inner: { start: tag.end, end: close } };
    }
    if (tag.name === "link" && !parts.canonical && startTagAttribute(html, tag, "rel")?.value.toLowerCase().split(/\s+/).includes("canonical"))
      parts.canonical = tag;
    if (tag.name !== "meta") continue;
    const key = (startTagAttribute(html, tag, "name") ?? startTagAttribute(html, tag, "property"))?.value.trim().toLowerCase();
    if ((key === "description" || key === "og:title" || key === "og:description" || key === "og:url") && !parts.meta[key]) parts.meta[key] = tag;
  }
  return parts;
}

/** A page's title (its `<title>`) and description (`<meta name="description">`), as text. */
export function nativePageHead(html: string): { title?: string; description?: string } {
  const parts = headParts(html);
  const out: { title?: string; description?: string } = {};
  if (parts.title) out.title = decodeText(html.slice(parts.title.inner.start, parts.title.inner.end));
  const description = parts.meta.description && startTagAttribute(html, parts.meta.description, "content");
  if (description) out.description = decodeText(description.value);
  return out;
}

/** A replacement of `start`..`end` of a text by `text`. */
export interface NativeTextEdit {
  start: number;
  end: number;
  text: string;
}

/** `html` with `edit` made. */
export function applyTextEdit(html: string, edit: NativeTextEdit | null | undefined): string {
  return edit ? html.slice(0, edit.start) + edit.text + html.slice(edit.end) : html;
}

/** The smallest edit that turns `before` into `after`; null when they are the same. */
export function minimalTextEdit(before: string, after: string): NativeTextEdit | null {
  if (before === after) return null;
  let start = 0;
  const limit = Math.min(before.length, after.length);
  while (start < limit && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < limit - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { start, end: before.length - tail, text: after.slice(start, after.length - tail) };
}

/** `html` with the attribute `name` (`content` of a meta tag) of the start tag `tag` set to `value`. */
function withContent(html: string, tag: StartTag, value: string, name = "content") {
  const content = startTagAttribute(html, tag, name);
  const escaped = escapeAttribute(value);
  if (!content) {
    const at = html.slice(tag.start, tag.end).replace(/\s*\/?>$/, "").length + tag.start;
    return `${html.slice(0, at)} ${name}="${escaped}"${html.slice(at)}`;
  }
  // A value written bare or in single quotes is written in double quotes.
  const quoted = html[content.valueStart - 1] === "\"" && html[content.valueEnd] === "\"";
  return quoted
    ? html.slice(0, content.valueStart) + escaped + html.slice(content.valueEnd)
    : `${html.slice(0, content.start)} ${name}="${escaped}"${html.slice(content.end)}`;
}

/** `html` without the start tag `tag` (a void element), and its line when it has one to itself. */
function withoutTag(html: string, tag: StartTag) {
  const lineStart = html.lastIndexOf("\n", tag.start - 1) + 1;
  const lineEnd = /^[ \t]*(?:\r?\n|$)/.exec(html.slice(tag.end))?.[0].length;
  if (/^[ \t]*$/.test(html.slice(lineStart, tag.start)) && lineEnd !== undefined)
    return html.slice(0, lineStart) + html.slice(tag.end + lineEnd);
  return html.slice(0, tag.start) + html.slice(tag.end);
}

/** The indentation of the line `at` is on, when only indentation precedes it there. */
function lineIndent(html: string, at: number) {
  const lead = html.slice(html.lastIndexOf("\n", at - 1) + 1, at);
  return /^[ \t]*$/.test(lead) ? lead : undefined;
}

/** `html` with `line` inserted on its own line right after the element ending at `after`, indented like `like`. */
function insertLine(html: string, after: number, like: number | undefined, line: string) {
  const newline = html.includes("\r\n") ? "\r\n" : "\n";
  const indent = like === undefined ? "  " : lineIndent(html, like) ?? "  ";
  return `${html.slice(0, after)}${newline}${indent}${line}${html.slice(after)}`;
}

/**
 * The page with its `field` set to `value` in its head, as small a change
 * as it can be: the title is the `<title>`'s text (a `<title>` is added
 * after the `<head>` start tag when there is none), the description the
 * `content` of `<meta name="description">` (added after the title when
 * there is none and `value` is not empty); `og:title` and `og:description`
 * follow when the page has them.
 */
export function nativePageWithDetail(html: string, field: NativePageDetail, value: string): string {
  const wanted = value.replace(/[\r\n]+/g, " ").trim();
  let text = html;
  const og = field === "title" ? "og:title" : "og:description";
  const ogTag = headParts(text).meta[og];
  if (ogTag) text = withContent(text, ogTag, wanted);
  const parts = headParts(text);
  if (field === "title") {
    if (parts.title) return text.slice(0, parts.title.inner.start) + escapeText(wanted) + text.slice(parts.title.inner.end);
    const line = `<title>${escapeText(wanted)}</title>`;
    if (parts.head) {
      const next = startTags(text).find((tag) => tag.start >= parts.head!.end);
      return insertLine(text, parts.head.end, next && lineIndent(text, next.start) !== undefined ? next.start : undefined, line);
    }
    // No <head>: before the <body> start tag, else before the page.
    const at = startTags(text).find((tag) => tag.name === "body")?.start ?? nativePageBody(text).start;
    return `${text.slice(0, at)}${line}${text.includes("\r\n") ? "\r\n" : "\n"}${text.slice(at)}`;
  }
  if (parts.meta.description) return withContent(text, parts.meta.description, wanted);
  if (!wanted) return text;
  const line = `<meta name="description" content="${escapeAttribute(wanted)}">`;
  if (parts.title) {
    const close = text.indexOf(">", parts.title.inner.end);
    return insertLine(text, close + 1, parts.title.tag.start, line);
  }
  if (parts.head) {
    const next = startTags(text).find((tag) => tag.start >= parts.head!.end);
    return insertLine(text, parts.head.end, next && lineIndent(text, next.start) !== undefined ? next.start : undefined, line);
  }
  return text;
}

/** The page with each detail given set (`nativePageWithDetail`). */
export function nativePageWithDetails(html: string, details: Partial<Record<NativePageDetail, string>>): string {
  let text = html;
  for (const field of ["title", "description"] as const) {
    const value = details[field];
    if (value !== undefined) text = nativePageWithDetail(text, field, value);
  }
  return text;
}

/**
 * The page with its own address: the `href` of `<link rel="canonical">`
 * and the `content` of `og:url` set to `url`, or both removed when there is
 * no `url` (a site with no address in `.editor/config.json`). Neither is
 * added to a page that has none.
 */
export function nativePageWithUrl(html: string, url: string | undefined): string {
  let text = html;
  for (const which of ["og:url", "canonical"] as const) {
    const parts = headParts(text);
    const tag = which === "canonical" ? parts.canonical : parts.meta["og:url"];
    if (!tag) continue;
    text = url === undefined ? withoutTag(text, tag) : withContent(text, tag, url, which === "canonical" ? "href" : "content");
  }
  return text;
}

/**
 * A page that moved from the URL `from` to `to`, with its own address
 * following it: with the site's address (`siteUrl`, from
 * `.editor/config.json`) its canonical link and `og:url` become that
 * address plus `to` (`nativePageWithUrl`); without one, each of them that
 * points at `from` on whatever host it names points at `to` there instead,
 * and the rest are left alone.
 */
export function nativePageMovedUrl(html: string, from: string, to: string, siteUrl: string | undefined): string {
  if (siteUrl) return nativePageWithUrl(html, nativePageUrl(siteUrl, to));
  let text = html;
  for (const which of ["og:url", "canonical"] as const) {
    const parts = headParts(text);
    const tag = which === "canonical" ? parts.canonical : parts.meta["og:url"];
    const name = which === "canonical" ? "href" : "content";
    const value = tag && startTagAttribute(text, tag, name)?.value;
    if (!tag || !value) continue;
    let url: URL;
    try { url = new URL(value.trim()); } catch { continue; }
    if (decodeURI(url.pathname) !== from) continue;
    text = withContent(text, tag, `${url.origin}${to}`, name);
  }
  return text;
}
