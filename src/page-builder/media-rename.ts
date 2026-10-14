import { renameMediaRecord, type MediaRecords } from "../../shared/media-records";
import { editNativeRedirects } from "../native-page-moves";
import { mediaFamilyOf, renamedFamily } from "./media-families";
import { isMediaTextFile } from "./media-mentions";
import { mediaOwnAddress, type MediaSite } from "./media-origins";
import { mediaResolvePath, scanMediaUrlTokens, walkMediaReferencePages, scanMediaReferences } from "./media-references";
import { decodeHtmlEntities } from "./html-entities";

const stem = (path: string) => path.replace(/\.[^./]+$/, "");
const extension = (path: string) => path.slice(stem(path).length);

/** Basename only; the caller supplies the actual file format. */
export function tidyMediaName(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? "";
  const tidy = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  const ext = extension(base).slice(1).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return (tidy(stem(base)) || "media") + (ext ? "." + ext : "");
}

export class MediaNameTakenError extends Error {
  constructor(public taken: string, public suggestion: string) {
    super(`${taken} is taken. Try ${suggestion}.`);
    this.name = "MediaNameTakenError";
  }
}

/** The candidates describe the entire destination family, not just its main. */
export function suggestMediaName(to: string, taken: (candidate: string) => boolean): string {
  for (let number = 2; ; number++) {
    const candidate = `${stem(to)}-${number}${extension(to)}`;
    if (!taken(candidate)) return candidate;
  }
}

interface RenameInput {
  from: string; to: string; paths: string[];
  sources: Readonly<Record<string, string | undefined>>;
  records: MediaRecords;
  site?: MediaSite & { pages?: string[]; components?: Record<string, string> };
  keepOldAddress?: boolean;
}
interface OffsetEdit { start: number; end: number; text: string }

/** Decoding keeps original offsets: edits leave query strings and escaping outside the path intact. */
function decodedSource(source: string, markup: boolean, css = false) {
  let text = "";
  const starts: number[] = [], ends: number[] = [];
  for (let at = 0; at < source.length;) {
    const entity = markup && source[at] === "&" ? /^&(?:#(?:x[\da-f]+|\d+)|[a-z][\da-z]*);/i.exec(source.slice(at))?.[0] : undefined;
    const escaped = css && source[at] === "\\" ? /^\\(?:([\da-f]{1,6})(?:\r\n|[\t\n\r\f ])?|(\r\n|[\n\r\f])|([^\n\r\f]))/i.exec(source.slice(at)) : undefined;
    const raw = escaped?.[0] ?? (source.startsWith("\\/", at) ? "\\/" : entity ?? source[at]);
    const code = escaped?.[1] ? parseInt(escaped[1], 16) : 0;
    const value = escaped ? escaped[1] ? String.fromCodePoint(code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? code : 0xfffd) : escaped[2] ? "" : escaped[3] : raw === "\\/" ? "/" : entity ? decodeHtmlEntities(entity) : raw;
    for (let i = 0; i < value.length; i++) { starts.push(at); ends.push(at + raw.length); }
    text += value; at += raw.length;
  }
  return { text, starts, ends };
}
function relativePath(file: string, to: string): string {
  const folder = file.split("/").slice(0, -1), target = to.split("/");
  while (folder.length && target.length && folder[0] === target[0]) { folder.shift(); target.shift(); }
  return "../".repeat(folder.length) + target.join("/");
}
function rewriteText(file: string, source: string, input: RenameInput, moves: Map<string, string>, templatePaths: Map<number, Set<string>>): string {
  const edits: OffsetEdit[] = [];
  const structured = /\.(?:html?|css)$/i.test(file) ? scanMediaUrlTokens(file, source) : [];
  const decoded = decodedSource(source, /\.(?:html?|xml|rss|atom|svg)$/i.test(file));
  const known = new Set(input.paths);
  const add = (value: string, start: number, end: number, structuredStart?: number, css = false) => {
    const full = /^(?:https?:)?\/\//i.test(value);
    if (full && (!input.site?.origins.length || !mediaOwnAddress(value, input.site))) return;
    if (!full && /^[a-z][\w+.-]*:/i.test(value)) return;
    const prefix = full ? /^(?:https?:)?\/\/[^/]+/i.exec(value)?.[0] ?? "" : "";
    const address = value.slice(prefix.length).split(/[?#]/)[0];
    let path = mediaResolvePath(value, file, input.site ?? { origins: [] });
    const template = structuredStart === undefined ? undefined : templatePaths.get(structuredStart);
    if (template) {
      if (template.size !== 1) return;
      path = [...template][0];
    }
    if (!path || !known.has(path)) {
      let suffix: string;
      try { suffix = decodeURIComponent(address); } catch { return; }
      const parts: string[] = [];
      for (const part of suffix.split("/")) if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part);
      suffix = parts.join("/");
      // Absolute addresses must resolve; suffix fallback is only for unresolvable relative mentions.
      if (full || address.startsWith("/")) return;
      const candidates = input.paths.filter(candidate => candidate === suffix || candidate.endsWith("/" + suffix));
      if (candidates.length !== 1) return;
      path = candidates[0];
    }
    const to = moves.get(path);
    if (!to) return;
    const raw = source.slice(start, end);
    const mapped = decodedSource(raw, /\.(?:html?|xml|rss|atom|svg)$/i.test(file), css);
    const pathStart = mapped.starts[prefix.length], pathEnd = mapped.ends[prefix.length + address.length - 1];
    if (pathStart === undefined || pathEnd === undefined) return;
    const rawPath = raw.slice(pathStart, pathEnd);
    let next = full || address.startsWith("/") || template ? "/" + to : relativePath(file, to);
    // A unique unresolved suffix keeps its abbreviated spelling when its folder is unchanged.
    if (!known.has(mediaResolvePath(value, file, input.site ?? { origins: [] }) ?? "") && !full && !template && !address.startsWith("/") && path.slice(0, path.lastIndexOf("/")) === to.slice(0, to.lastIndexOf("/"))) {
      next = address.slice(0, address.lastIndexOf("/") + 1) + to.split("/").at(-1)!;
    } else if (address.startsWith("./") && !next.startsWith(".")) next = "./" + next;
    if (/%[\da-f]{2}/i.test(rawPath)) next = next.split("/").map(part => encodeURIComponent(part)).join("/");
    // Keep every unchanged character's original spelling, including mixed literal and escaped slashes.
    let left = 0, right = 0;
    while (left < address.length && left < next.length && address[left] === next[left]) left++;
    while (right < address.length - left && right < next.length - left && address[address.length - 1 - right] === next[next.length - 1 - right]) right++;
    const begin = mapped.starts[prefix.length + left] ?? pathEnd;
    const finish = address.length - right === left ? begin : mapped.ends[prefix.length + address.length - right - 1];
    let replacement = next.slice(left, next.length - right);
    const slash = /\\\/|&#(?:47|x2f);|&sol;/i.exec(rawPath)?.[0];
    if (slash) replacement = replacement.replaceAll("/", slash);
    if (rawPath.includes("&")) replacement = replacement.replace(/&(?!#\d+;|#x[\da-f]+;|[a-z]+;)/gi, "&amp;");
    edits.push({ start: start + begin, end: start + finish, text: replacement });
  };
  // Structured tokens own their ranges (srcset, CSS escapes and component page-relative URLs).
  for (const token of structured) add(token.value, token.start, token.end, token.start, token.cssQuote !== undefined);
  let searchable = decoded.text;
  for (const name of new Set(input.paths.map(path => path.split("/").at(-1)!))) {
    if (!/[\s"'`<>()[\]{},;=]/.test(name)) continue;
    searchable = searchable.replaceAll(name, name.replace(/[\s"'`<>()[\]{},;=]/g, "\uE000"));
  }
  for (const match of searchable.matchAll(/(?:https?:\/\/|\/\/)?[^\s"'`<>()[\]{},;=]+/g)) {
    const value = decoded.text.slice(match.index!, match.index! + match[0].length).replace(/[.!:]+$/, "");
    const start = decoded.starts[match.index!], end = decoded.ends[match.index! + value.length - 1];
    if (structured.some(token => start < token.end && end > token.start)) continue;
    add(value, start, end);
  }
  let text = source, boundary = source.length;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > boundary) continue;
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    boundary = edit.start;
  }
  return text;
}

export function planMediaRename(input: RenameInput): { taken: string; suggestion: string } | { moves: { from: string; to: string }[]; edits: Map<string, string>; records: MediaRecords; redirects?: string } {
  const { from, to, paths, sources, site } = input;
  const family = mediaFamilyOf(from, paths);
  const familyMoves = (target: string) => family ? renamedFamily(family, target) : [{ from, to: target }];
  const taken = (target: string) => familyMoves(target).some(move => move.from !== move.to && paths.includes(move.to));
  if (taken(to)) return { taken: to, suggestion: suggestMediaName(to, taken) };
  const moves = familyMoves(to).filter(move => move.from !== move.to);
  const mapping = new Map(moves.map(move => [move.from, move.to]));
  const edits = new Map<string, string>();
  const templates = new Map<string, Map<number, Set<string>>>();
  if (site?.pages && site.components) {
    const refs = new Map(Object.entries(sources).filter((entry): entry is [string, string] => entry[1] !== undefined).map(([file, source]) => [file, scanMediaReferences(file, source, site)]));
    walkMediaReferencePages(sources, refs, site.pages, site.components, (_page, ref) => {
      if (!Object.values(site.components!).includes(ref.file)) return;
      const file = templates.get(ref.file) ?? new Map<number, Set<string>>();
      const targets = file.get(ref.start) ?? new Set<string>(); targets.add(ref.path); file.set(ref.start, targets); templates.set(ref.file, file);
    });
  }
  for (const [file, source] of Object.entries(sources)) {
    if (source === undefined || file === "_redirects" || !isMediaTextFile(file)) continue;
    const text = rewriteText(file, source, input, mapping, templates.get(file) ?? new Map());
    if (text !== source) edits.set(mapping.get(file) ?? file, text);
  }
  let redirects = sources._redirects;
  for (const move of moves) redirects = editNativeRedirects(redirects, "/" + move.from, "/" + move.to, input.keepOldAddress ? ["/" + move.from] : [], false);
  if (redirects === (sources._redirects ?? "")) redirects = undefined;
  const records = moves.reduce((records, move) => renameMediaRecord(records, move.from, move.to), input.records);
  return { moves, edits, records, redirects };
}
