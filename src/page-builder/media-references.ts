import { startTags } from "../../shared/html-source";
import { mediaAttribute as startTagAttribute } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";
import { mediaUrl } from "./media-markup";

export interface MediaReference { file: string; start: number; end: number; path: string; value: string; alt?: string; attributeQuote?: string; cssQuote?: string }
export interface MediaUsage { files: string[]; pages: string[]; alts: string[] }

export function mediaResolvePath(value: string, file: string): string | undefined {
  const decoded = value.trim();
  if (!decoded || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(decoded)) return undefined;
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
  let at = 0;
  while (at < text.length) {
    if (text.startsWith("/*", at)) { at = whitespace(at); continue; }
    if (text[at] === '"' || text[at] === "'") { at = quoted(at)?.after ?? text.length; continue; }
    if (text[at] === "@" && /^@import\b/i.test(text.slice(at))) {
      const begin = whitespace(at + 7);
      if (text[begin] === '"' || text[begin] === "'") {
        const value = quoted(begin);
        if (value) { add(cssDecode(text.slice(value.start, value.end)), value.start, value.end, text[begin]); at = value.after; continue; }
      }
    }
    if (/[a-z_-]/i.test(text[at])) {
      const token = /^[\w-]+/.exec(text.slice(at))![0];
      const after = whitespace(at + token.length);
      if (token.toLowerCase() === "url" && text[after] === "(") {
        const begin = whitespace(after + 1);
        if (text[begin] === '"' || text[begin] === "'") {
          const value = quoted(begin);
          if (value && text[whitespace(value.after)] === ")") add(cssDecode(text.slice(value.start, value.end)), value.start, value.end, text[begin]);
          at = value?.after ?? text.length; continue;
        }
        let end = begin;
        while (end < text.length && text[end] !== ")") { if (text[end] === "\\") end++; end++; }
        const raw = text.slice(begin, end), value = raw.trimEnd();
        if (text[end] === ")" && value && !/[\s"'(]/.test(value.replace(/\\(?:[\da-f]{1,6}\s?|.)/gi, ""))) add(cssDecode(value), begin, begin + value.length, "");
        at = end + 1; continue;
      }
      at += token.length; continue;
    }
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

export function scanMediaReferences(file: string, source: string): MediaReference[] {
  const out: MediaReference[] = [];
  const add = (value: string, start: number, end: number, alt?: string, attributeQuote?: string, cssQuote?: string) => {
    const path = mediaResolvePath(value, file);
    if (path) out.push({ file, start, end, value, path, alt, attributeQuote, cssQuote });
  };
  if (/\.css$/i.test(file)) { cssUrls(source, (value, start, end, quote) => add(value, start, end, undefined, undefined, quote)); return out; }
  for (const tag of startTags(source)) {
    const rawAlt = startTagAttribute(source, tag, "alt")?.value;
    const alt = rawAlt === undefined ? undefined : decodeHtmlEntities(rawAlt, true);
    for (const name of ["src", "href", "poster", "content", "srcset"]) {
      if (name === "content") {
        const key = startTagAttribute(source, tag, "property") ?? startTagAttribute(source, tag, "name") ?? startTagAttribute(source, tag, "itemprop");
        if (tag.name !== "meta" || !/^(?:og:image(?::url|:secure_url)?|twitter:image(?::src)?|msapplication-tileimage|image)$/i.test(decodeHtmlEntities(key?.value ?? "", true))) continue;
      }
      const attr = startTagAttribute(source, tag, name);
      if (!attr) continue;
      const quote = ["'", '"'].includes(source[attr.valueStart - 1]) ? source[attr.valueStart - 1] : "";
      if (name === "srcset") {
        const decoded = attributeText(attr.value);
        srcsetUrls(decoded.text, (value, start, end) => add(value, attr.valueStart + decoded.starts[start], attr.valueStart + decoded.ends[end - 1], alt, quote));
      } else add(decodeHtmlEntities(attr.value, true), attr.valueStart, attr.valueEnd, alt, quote);
    }
    const style = startTagAttribute(source, tag, "style");
    if (style) {
      const decoded = attributeText(style.value);
      const quote = ["'", '"'].includes(source[style.valueStart - 1]) ? source[style.valueStart - 1] : "";
      cssUrls(decoded.text, (value, start, end, cssQuote) => add(value, style.valueStart + decoded.starts[start], style.valueStart + decoded.ends[end - 1], undefined, quote, cssQuote));
    }
    if (tag.name === "style") {
      const end = source.toLowerCase().indexOf("</style", tag.end);
      if (end >= 0) cssUrls(source.slice(tag.end, end), (value, start, finish, quote) => add(value, tag.end + start, tag.end + finish, undefined, undefined, quote));
    }
  }
  return out;
}

/** Page usage includes nested components, linked styles and CSS imports, once per page. */
export function mediaUsageIndex(paths: string[], sources: Record<string, string | undefined>, pages: string[], components: Record<string, string> = {}): Record<string, MediaUsage> {
  const images = new Set(paths);
  const out: Record<string, MediaUsage> = Object.create(null);
  const dependencies = new Map<string, Set<string>>();
  const references = new Map<string, MediaReference[]>();
  for (const path of paths) out[path] = { files: [], pages: [], alts: [] };
  for (const [file, source] of Object.entries(sources)) {
    if (source === undefined) continue;
    const refs = scanMediaReferences(file, source);
    references.set(file, refs);
    const deps = new Set(refs.map((ref) => ref.path).filter((path) => Object.hasOwn(sources, path)));
    if (/\.html$/i.test(file)) for (const tag of startTags(source)) if (components[tag.name]) {
      deps.add(components[tag.name]);
      const sheet = components[tag.name].replace(/\.html$/i, ".css");
      if (Object.hasOwn(sources, sheet)) deps.add(sheet);
    }
    dependencies.set(file, deps);
    for (const ref of refs) if (images.has(ref.path)) {
      const item = out[ref.path];
      if (!item.files.includes(file)) item.files.push(file);
      if (ref.alt && !item.alts.includes(ref.alt)) item.alts.push(ref.alt);
    }
  }
  for (const page of pages) {
    const visited = new Set<string>();
    const visit = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);
      for (const ref of references.get(file) ?? []) if (images.has(ref.path) && !out[ref.path].pages.includes(page)) out[ref.path].pages.push(page);
      for (const dependency of dependencies.get(file) ?? []) visit(dependency);
    };
    visit(page);
  }
  return out;
}

export function rewriteMediaReferences(file: string, source: string, from: string, to: string): string {
  let text = source;
  const refs = scanMediaReferences(file, source).filter((ref) => ref.path === from);
  for (const ref of refs.sort((a, b) => b.start - a.start)) {
    const suffix = /[?#].*$/.exec(ref.value)?.[0] ?? "";
    let value = mediaUrl(to) + suffix;
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
