import { binaryFiles, textMediaFiles } from "../../shared/media-kinds";
import { sitePathOf } from "../../shared/site-path-prefix";
import { decodeHtmlEntities } from "./html-entities";
import type { MediaOtherUseKind } from "./media-usage";
import { mediaOwnAddress, type MediaSite } from "./media-origins";
export { mediaOwnOrigins, type MediaSite } from "./media-origins";
const binaryFile = (path: string) => binaryFiles.test(path);
const siteFile = (path: string) => !/(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(path) && path !== ".editor/media.json";
/** Unknown formats are text: retaining an extra file is safer than missing a use. */
export function isMediaTextFile(path: string): boolean { return siteFile(path) && !binaryFile(path); }
/** Known media formats for the on-open check; callers can supply additional downloads. Subtitles
 * count too (text, like SVG), so a use of a video's subtitles keeps its family. */
export function isMediaFile(path: string): boolean { return siteFile(path) && (binaryFile(path) || textMediaFiles.test(path)); }
function kindFor(file: string): MediaOtherUseKind {
  if (file.startsWith(".editor/") || /^(?:_redirects|_headers|CNAME)$/i.test(file)) return "settings";
  if (/\.(?:[cm]?js|jsx|tsx?)$/i.test(file)) return "script";
  if (/\.(?:json|webmanifest|ya?ml|toml|csv|tsv|jsonl|ndjson)$/i.test(file)) return "data";
  if (/\.(?:xml|rss|atom)$/i.test(file)) return "feed";
  if (/\.(?:md|mdx|txt|rst)$/i.test(file) || /(?:^|\/)(?:README|AGENTS)$/i.test(file)) return "notes";
  if (/\.css$/i.test(file)) return "stylesheet";
  return "file";
}
/** Raw mentions deliberately include comments, examples and unexecuted code. */
export function mediaMentions(input: { media: readonly string[]; sources: Readonly<Record<string, string | undefined>>; site?: MediaSite }): Map<string, { file: string; kind: MediaOtherUseKind }[]> {
  const result = new Map<string, { file: string; kind: MediaOtherUseKind }[]>();
  const names = new Map<string, string[]>();
  for (const path of input.media) {
    const name = path.split("/").at(-1)!;
    const paths = names.get(name) ?? [];
    paths.push(path); names.set(name, paths);
  }
  // Names holding a separator (space, parentheses, quotes, commas…) are swapped for a
  // placeholder before tokenising, so "photo (1).jpg" is still one mention.
  const aliases = [...names.keys()].filter(name => /[\s"'`<>()[\]{},;=]/.test(name)).sort((a, b) => b.length - a.length)
    .map((name, index) => ({ name, alias: `\u{F0000}${index}\u{F0001}` }));
  const restore = (value: string) => aliases.reduce((text, { name, alias }) => text.replaceAll(alias, name), value);
  for (const [file, source] of Object.entries(input.sources)) {
    if (source === undefined || !isMediaTextFile(file)) continue;
    let text = source.replace(/\\\//g, "/");
    // Markup (HTML, XML sitemaps and feeds, SVG) may spell addresses with entities such as &amp;.
    if (/\.(?:html?|xml|rss|atom|svg)$/i.test(file)) text = decodeHtmlEntities(text);
    for (const { name, alias } of aliases) {
      text = text.replaceAll(name, alias);
      if (encodeURIComponent(name) !== name) text = text.replaceAll(encodeURIComponent(name), alias);
    }
    const regions: { start: number; end: number; kind: MediaOtherUseKind }[] = [];
    if (/\.html?$/i.test(file)) for (const script of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      regions.push({ start: script.index!, end: script.index! + script[0].length, kind: /application\/ld\+json/i.test(script[1]) ? "sharing" : "script" });
    }
    for (const match of text.matchAll(/(?:https?:\/\/|\/\/)?[^\s"'`<>()[\]{},;=]+/g)) {
      let value = match[0];
      if (/^(?:https?:)?\/\//i.test(value)) {
        if (!mediaOwnAddress(value, input.site)) continue;
        try {
          const address = value.startsWith("//") ? "https:" + value : value;
          const url = new URL(address);
          if (input.site?.prefix && sitePathOf(restore(address), { prefix: input.site.prefix, origins: [url.origin] }) === undefined) continue;
          value = url.pathname;
        } catch { continue; }
      }
      value = value.split(/[?#]/)[0];
      if (!names.has(restore(value).split("/").at(-1)!)) value = value.replace(/[.!:]+$/, "");
      const path = value.startsWith("/") && input.site?.prefix ? sitePathOf(restore(value), input.site) : undefined;
      if (path !== undefined) value = path;
      else try { value = decodeURIComponent(value); } catch { /* Keep malformed encodings as written. */ }
      value = restore(value);
      // Dot segments resolve as in a URL; leading ones are dropped, so the rest is compared as a path suffix.
      const parts: string[] = [];
      for (const part of value.split("/")) {
        if (part === "" || part === ".") continue;
        if (part === "..") parts.pop(); else parts.push(part);
      }
      value = parts.join("/");
      const name = value.split("/").at(-1)!;
      for (const path of names.get(name) ?? []) {
        if (value !== name && path !== value && !path.endsWith("/" + value)) continue;
        const kind = regions.find(region => match.index! >= region.start && match.index! < region.end)?.kind ?? kindFor(file);
        const uses = result.get(path) ?? [];
        if (!uses.some(use => use.file === file && use.kind === kind)) uses.push({ file, kind });
        result.set(path, uses);
      }
    }
  }
  return result;
}
