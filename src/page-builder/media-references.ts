import { siteAddress, sitePathOf } from "../../shared/site-path-prefix";
import { mediaOwnAddress, type MediaSite } from "./media-origins";
import { startTags } from "../../shared/html-source";
import { mediaAttribute as startTagAttribute } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";

export interface MediaUrlToken { file: string; start: number; end: number; value: string; alt?: string; attribute?: "src" | "href" | "poster" | "content" | "srcset" | "data-src" | "data-srcset" | "imagesrcset" | "data" | "xlink:href" | "style"; tag?: string; attributeQuote?: string; cssQuote?: string }
export interface MediaReference extends MediaUrlToken { path: string }
export interface MediaUsage { files: string[]; pages: string[]; alts: string[] }

export function mediaResolvePath(value: string, file: string, site?: MediaSite, prefix = site?.prefix ?? ""): string | undefined {
  let decoded = value.trim();
  if (site && /^(?:https?:)?\/\//i.test(decoded) && mediaOwnAddress(decoded, site)) {
    try {
      const address = decoded.startsWith("//") ? "https:" + decoded : decoded;
      const url = new URL(address);
      // Ownership follows mediaOwnAddress (including empty origins); only folder validation is shared.
      if (prefix) return sitePathOf(address, { prefix, origins: [url.origin] });
      decoded = url.pathname;
    } catch { return undefined; }
  }
  if (!decoded || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(decoded)) return undefined;
  if (prefix) {
    try { return sitePathOf(new URL(decoded, `https://repo.invalid/${file}`).pathname, { prefix }); }
    catch { return undefined; }
  }
  try { return decodeURIComponent(new URL(decoded, `https://repo.invalid/${file}`).pathname).replace(/^\//, ""); }
  catch { return undefined; }
}

function cssDecode(value: string): string {
  return value.replace(/\\(?:([\da-f]{1,6})(?:\r\n|[\t\n\r\f ])?|(\r\n|[\n\r\f])|([^\n\r\f]))/gi, (_, hex: string | undefined, newline: string | undefined, literal: string | undefined) => {
    if (hex) { const code = parseInt(hex, 16); return String.fromCodePoint(code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? code : 0xfffd); }
    return newline ? "" : literal ?? "";
  });
}

/** Decoded attribute text with raw offsets, so entity spelling outside an edit survives. */
function attributeText(raw: string) {
  let text = "";
  const starts: number[] = [], ends: number[] = [];
  for (let at = 0; at < raw.length;) {
    const match = raw[at] === "&" ? /^&(?:#(?:[xX][\da-fA-F]+|\d+);?|[a-zA-Z][a-zA-Z\d]*;?)/.exec(raw.slice(at)) : undefined;
    const piece = match?.[0] ?? raw[at];
    const following = raw[at + piece.length] ?? "";
    const decoded = match ? decodeHtmlEntities(piece + following, true).slice(0, following ? -1 : undefined) : piece;
    for (let i = 0; i < decoded.length; i++) { starts.push(at); ends.push(at + piece.length); }
    text += decoded; at += piece.length;
  }
  return { text, starts, ends };
}

/** CSS token scan: comments and ordinary quoted strings cannot impersonate URLs. */
function cssUrls(text: string, add: (value: string, start: number, end: number, quote: string) => void) {
  const whitespace = (start: number) => {
    let at = start;
    while (at < text.length) {
      if (/\s/.test(text[at])) { at++; continue; }
      if (text.startsWith("/*", at)) { const end = text.indexOf("*/", at + 2); at = end < 0 ? text.length : end + 2; continue; }
      break;
    }
    return at;
  };
  const quoted = (start: number) => {
    const quote = text[start]; let end = start + 1;
    while (end < text.length) {
      if (text[end] === "\\") { end += text[end + 1] === "\r" && text[end + 2] === "\n" ? 3 : 2; continue; }
      if (text[end] === quote) return { start: start + 1, end, after: end + 1 };
      if (/[\r\n\f]/.test(text[end])) return undefined;
      end++;
    }
    return undefined;
  };
  let at = 0, depth = 0;
  const imageSets: { depth: number; candidate: boolean }[] = [];
  while (at < text.length) {
    if (text.startsWith("/*", at)) { at = whitespace(at); continue; }
    if (text[at] === '"' || text[at] === "'") {
      const value = quoted(at), imageSet = imageSets.at(-1);
      if (value && imageSet?.depth === depth && imageSet.candidate) {
        add(cssDecode(text.slice(value.start, value.end)), value.start, value.end, text[at]);
        imageSet.candidate = false;
      }
      at = value?.after ?? text.length; continue;
    }
    if (text[at] === "@" && /^@import\b/i.test(text.slice(at))) {
      const begin = whitespace(at + 7);
      if (text[begin] === '"' || text[begin] === "'") {
        const value = quoted(begin);
        if (value) { add(cssDecode(text.slice(value.start, value.end)), value.start, value.end, text[begin]); at = value.after; continue; }
      }
    }
    if (/[a-z_\\-]/i.test(text[at])) {
      const token = /^(?:[\w-]|\\(?:[\da-f]{1,6}(?:\r\n|[\t\n\r\f ])?|[^\r\n\f]))+/i.exec(text.slice(at))?.[0];
      if (!token) { at++; continue; }
      const name = cssDecode(token).toLowerCase();
      const after = whitespace(at + token.length);
      if (["image-set", "-webkit-image-set"].includes(name) && text[after] === "(") {
        imageSets.push({ depth: ++depth, candidate: true }); at = after + 1; continue;
      }
      if (name === "url" && text[after] === "(") {
        const imageSet = imageSets.at(-1);
        if (imageSet?.depth === depth) imageSet.candidate = false;
        const begin = whitespace(after + 1);
        if (text[begin] === '"' || text[begin] === "'") {
          const value = quoted(begin);
          if (value && text[whitespace(value.after)] === ")") add(cssDecode(text.slice(value.start, value.end)), value.start, value.end, text[begin]);
          at = value ? whitespace(value.after) + 1 : text.length; continue;
        }
        let end = begin;
        while (end < text.length && text[end] !== ")") { if (text[end] === "\\") end++; end++; }
        const raw = text.slice(begin, end), value = raw.trimEnd();
        if (text[end] === ")" && value && !/[\s"'(]/.test(value.replace(/\\(?:[\da-f]{1,6}(?:\r\n|[\t\n\r\f ])?|.)/gi, ""))) add(cssDecode(value), begin, begin + value.length, "");
        at = end + 1; continue;
      }
      at += token.length; continue;
    }
    if (text[at] === "(") depth++;
    else if (text[at] === ")") { if (imageSets.at(-1)?.depth === depth) imageSets.pop(); depth = Math.max(0, depth - 1); }
    else if (text[at] === "," && imageSets.at(-1)?.depth === depth) imageSets.at(-1)!.candidate = true;
    at++;
  }
}

/** HTML srcset tokenisation follows URL boundaries, including commas inside data URLs. */
function srcsetUrls(value: string, add: (url: string, start: number, end: number) => void) {
  let at = 0;
  while (at < value.length) {
    while (at < value.length && /[\s,]/.test(value[at])) at++;
    const begin = at;
    while (at < value.length && !/\s/.test(value[at])) at++;
    let end = at;
    while (end > begin && value[end - 1] === ",") end--;
    if (end > begin) add(value.slice(begin, end), begin, end);
    if (end < at) continue;
    let parentheses = 0;
    while (at < value.length) {
      const char = value[at++];
      if (char === "(") parentheses++; else if (char === ")") parentheses = Math.max(0, parentheses - 1);
      else if (char === "," && !parentheses) break;
    }
  }
}

/** Every decoded URL token, including values that do not resolve to a repository file. */
export function scanMediaUrlTokens(file: string, source: string): MediaUrlToken[] {
  const out: MediaUrlToken[] = [];
  const add = (value: string, start: number, end: number, alt?: string, attributeQuote?: string, cssQuote?: string, attribute?: MediaUrlToken["attribute"], tag?: string) => {
    out.push({ file, start, end, value, alt, attribute, tag, attributeQuote, cssQuote });
  };
  if (/\.css$/i.test(file)) { cssUrls(source, (value, start, end, quote) => add(value, start, end, undefined, undefined, quote)); return out; }
  let styleEnd = 0;
  for (const tag of startTags(source)) {
    if (tag.start < styleEnd) continue;
    const rawAlt = startTagAttribute(source, tag, "alt")?.value;
    const alt = rawAlt === undefined ? undefined : decodeHtmlEntities(rawAlt, true);
    for (const name of ["src", "href", "poster", "content", "srcset", "data-src", "data-srcset", "imagesrcset", "data", "xlink:href"] as const) {
      if (name === "data" && tag.name !== "object") continue;
      if (name === "content") {
        const key = startTagAttribute(source, tag, "property") ?? startTagAttribute(source, tag, "name") ?? startTagAttribute(source, tag, "itemprop");
        if (tag.name !== "meta" || !/^(?:og:image(?::url|:secure_url)?|twitter:image(?::src)?|msapplication-tileimage|image)$/i.test(decodeHtmlEntities(key?.value ?? "", true))) continue;
      }
      const attr = startTagAttribute(source, tag, name);
      if (!attr) continue;
      const quote = ["'", '"'].includes(source[attr.valueStart - 1]) ? source[attr.valueStart - 1] : "";
      if (name.endsWith("srcset")) {
        const decoded = attributeText(attr.value);
        srcsetUrls(decoded.text, (value, start, end) => add(value, attr.valueStart + decoded.starts[start], attr.valueStart + decoded.ends[end - 1], alt, quote, undefined, name, tag.name));
      } else add(decodeHtmlEntities(attr.value, true), attr.valueStart, attr.valueEnd, alt, quote, undefined, name, tag.name);
    }
    const style = startTagAttribute(source, tag, "style");
    if (style) {
      const decoded = attributeText(style.value);
      const quote = ["'", '"'].includes(source[style.valueStart - 1]) ? source[style.valueStart - 1] : "";
      cssUrls(decoded.text, (value, start, end, cssQuote) => add(value, style.valueStart + decoded.starts[start], style.valueStart + decoded.ends[end - 1], undefined, quote, cssQuote, "style", tag.name));
    }
    if (tag.name === "style") {
      const closing = /<\/style(?=[\t\n\f\r />])/i.exec(source.slice(tag.end));
      const end = closing ? tag.end + closing.index : -1;
      styleEnd = end >= 0 ? end + closing![0].length : source.length;
      if (end >= 0) cssUrls(source.slice(tag.end, end), (value, start, finish, quote) => add(value, tag.end + start, tag.end + finish, undefined, undefined, quote));
    }
  }
  return out;
}

export function scanMediaReferences(file: string, source: string, site?: MediaSite, prefix = site?.prefix ?? ""): MediaReference[] {
  return scanMediaUrlTokens(file, source).flatMap(({ file, start, end, value, alt, attribute, tag, attributeQuote, cssQuote }) => {
    const path = mediaResolvePath(value, file, site, prefix);
    return path ? [{ file, start, end, value, path, alt, attribute, tag, attributeQuote, cssQuote }] : [];
  });
}

/** Shared page walk over scanned references: linked and imported stylesheets, nested components and their styles, cycles once. */
export function walkMediaReferencePages(
  sources: Record<string, string | undefined>,
  references: Map<string, MediaReference[]>,
  pages: string[],
  components: Record<string, string>,
  visitReference: (page: string, reference: MediaReference) => void,
  prefix = "",
): void {
  const templates = new Set(Object.values(components));
  for (const page of pages) {
    const visited = new Set<string>();
    const visit = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);
      const refs = (references.get(file) ?? []).map(ref => {
        if (!templates.has(file) || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(ref.value.trim())) return ref;
        const path = mediaResolvePath(ref.value, page, undefined, prefix);
        return path ? { ...ref, path } : ref;
      });
      for (const ref of refs) visitReference(page, ref);
      for (const ref of refs) if ((ref.attribute === undefined || ref.attribute === "style" || (ref.tag === "link" && ref.attribute === "href")) && /\.css$/i.test(ref.path) && Object.hasOwn(sources, ref.path)) visit(ref.path);
      if (/\.html$/i.test(file)) for (const tag of startTags(sources[file] ?? "")) if (components[tag.name]) {
        visit(components[tag.name]);
        const sheet = components[tag.name].replace(/\.html$/i, ".css");
        if (Object.hasOwn(sources, sheet)) visit(sheet);
      }
    };
    visit(page);
  }
}

/** Page usage includes nested components, linked styles and CSS imports, once per page. */
export function mediaUsageIndex(paths: string[], sources: Record<string, string | undefined>, pages: string[], components: Record<string, string> = {}, site?: MediaSite): Record<string, MediaUsage> {
  const images = new Set(paths);
  const out: Record<string, MediaUsage> = Object.create(null);
  const references = new Map<string, MediaReference[]>();
  for (const path of paths) out[path] = { files: [], pages: [], alts: [] };
  for (const [file, source] of Object.entries(sources)) {
    if (source === undefined) continue;
    const refs = scanMediaReferences(file, source, site);
    references.set(file, refs);
    for (const ref of refs) if (images.has(ref.path)) {
      const item = out[ref.path];
      if (!item.files.includes(file)) item.files.push(file);
      if (ref.alt && !item.alts.includes(ref.alt)) item.alts.push(ref.alt);
    }
  }
  walkMediaReferencePages(sources, references, pages, components, (page, ref) => {
    if (images.has(ref.path)) {
      if (!out[ref.path].pages.includes(page)) out[ref.path].pages.push(page);
      if (!out[ref.path].files.includes(ref.file)) out[ref.path].files.push(ref.file);
    }
  }, site?.prefix ?? "");
  return out;
}

export function rewriteMediaReferences(file: string, source: string, from: string, to: string, prefix = ""): string {
  let text = source;
  const refs = scanMediaReferences(file, source, undefined, prefix).filter((ref) => ref.path === from);
  for (const ref of refs.sort((a, b) => b.start - a.start)) {
    const suffix = /[?#].*$/.exec(ref.value)?.[0] ?? "";
    let value = siteAddress(to, prefix) + suffix;
    if (ref.cssQuote !== undefined) value = value.replace(/[\\\r\n\f'"()\s]/g, (char) => {
      if (char === "\\" || char === ref.cssQuote) return `\\${char}`;
      if (!ref.cssQuote || /[\r\n\f]/.test(char)) return `\\${char.charCodeAt(0).toString(16)} `;
      return char;
    });
    if (ref.attributeQuote !== undefined) {
      value = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (ref.attributeQuote === "'") value = value.replace(/'/g, "&#39;");
      else if (ref.attributeQuote === '"') value = value.replace(/"/g, "&quot;");
      else value = value.replace(/[\s"'`=]/g, (char) => `&#${char.charCodeAt(0)};`);
    }
    text = text.slice(0, ref.start) + value + text.slice(ref.end);
  }
  return text;
}
