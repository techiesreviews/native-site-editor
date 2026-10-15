import { MEDIA_RECORDS_PATH, parseMediaRecords, renameMediaRecord, serializeMediaRecords, type MediaRecords } from "../../shared/media-records";
import { editNativeRedirects } from "../native-page-moves";
import { mediaFamilyOf, renamedFamily, familyMembers } from "./media-families";
import { isMediaTextFile } from "./media-mentions";
import { mediaOwnAddress, type MediaSite } from "./media-origins";
import { mediaResolvePath, scanMediaUrlTokens, walkMediaReferencePages, scanMediaReferences } from "./media-references";
import { decodeHtmlEntity } from "./html-entities";
import { suggestMediaName } from "./media-names";
export { isRenamableMedia, mediaFileName, MediaNameTakenError, suggestMediaName, tidyMediaName } from "./media-names";


export interface RenameInput {
  from: string; to: string; paths: string[];
  sources: Readonly<Record<string, string | undefined>>;
  records: MediaRecords;
  site?: MediaSite & { pages?: string[]; components?: Record<string, string> };
  keepOldAddress?: boolean;
}
interface OffsetEdit { start: number; end: number; text: string }

/** Decoding keeps original offsets: edits leave query strings and escaping outside the path intact. */
function decodedSource(source: string, markup: boolean, css = false, attribute = false) {
  let text = "";
  const starts: number[] = [], ends: number[] = [];
  for (let at = 0; at < source.length;) {
    // The scanner's own reader: references without a semicolon (`&#105mages`, `&copy`) and the attribute rule.
    const entity = markup && source[at] === "&" ? decodeHtmlEntity(source, at, attribute) : undefined;
    const escaped = css && source[at] === "\\" ? /^\\(?:([\da-f]{1,6})(?:\r\n|[\t\n\r\f ])?|(\r\n|[\n\r\f])|([^\n\r\f]))/i.exec(source.slice(at)) : undefined;
    const raw = escaped?.[0] ?? (source.startsWith("\\/", at) ? "\\/" : entity ? source.slice(at, at + entity.length) : source[at]);
    const code = escaped?.[1] ? parseInt(escaped[1], 16) : 0;
    const value = escaped ? escaped[1] ? String.fromCodePoint(code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? code : 0xfffd) : escaped[2] ? "" : escaped[3] : raw === "\\/" ? "/" : entity ? entity.text : raw;
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
export interface MediaRewriteOptions {
  only?: string;
  versions?: ReadonlyMap<string, string>;
  widths?: ReadonlyMap<string, number>;
  skip?: Readonly<Record<string, readonly { start: number; end: number }[]>>;
  reference?: (file: string, start: number, end: number, path: string, attribute?: string) => void;
}
function rewriteText(file: string, source: string, input: RenameInput, moves: Map<string, string>, templatePaths: Map<number, Set<string>>, options: MediaRewriteOptions = {}): string {
  const edits: OffsetEdit[] = [];
  const structured = /\.(?:html?|css)$/i.test(file) ? scanMediaUrlTokens(file, source) : [];
  const decoded = decodedSource(source, /\.(?:html?|xml|rss|atom|svg)$/i.test(file));
  const known = new Set(input.paths);
  const add = (value: string, start: number, end: number, structuredStart?: number, css = false) => {
    if (options.skip?.[file]?.some(range => start < range.end && end > range.start)) return;
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
    options.reference?.(file, start, end, path, structured.find(token => token.start === structuredStart)?.attribute);
    const token = structured.find(token => token.start === structuredStart);
    const width = options.widths?.get(path);
    const descriptor = token?.attribute?.endsWith("srcset") && width ? /^(\s+)\d+w\b/.exec(source.slice(end)) : undefined;
    if (descriptor) edits.push({ start: end + descriptor[1].length, end: end + descriptor[0].length, text: `${width}w` });
    const raw = source.slice(start, end);
    const mapped = decodedSource(raw, /\.(?:html?|xml|rss|atom|svg)$/i.test(file), css, structuredStart !== undefined);
    const pathStart = mapped.starts[prefix.length], pathEnd = mapped.ends[prefix.length + address.length - 1];
    if (pathStart === undefined || pathEnd === undefined) return;
    const rawPath = raw.slice(pathStart, pathEnd);
    let next = path === to && !template ? address : full || address.startsWith("/") || template ? "/" + to : relativePath(file, to);
    // A unique unresolved suffix keeps its abbreviated spelling when its folder is unchanged.
    if (path !== to && !known.has(mediaResolvePath(value, file, input.site ?? { origins: [] }) ?? "") && !full && !template && !address.startsWith("/") && path.slice(0, path.lastIndexOf("/")) === to.slice(0, to.lastIndexOf("/"))) {
      next = address.slice(0, address.lastIndexOf("/") + 1) + to.split("/").at(-1)!;
    } else if (address.startsWith("./") && !next.startsWith(".")) next = "./" + next;
    if (path !== to && /%[\da-f]{2}/i.test(rawPath)) next = next.split("/").map(part => encodeURIComponent(part)).join("/");
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
    if (begin !== finish || replacement) edits.push({ start: start + begin, end: start + finish, text: replacement });
    const version = options.versions?.get(to);
    if (version) {
      const queryStart = value.indexOf("?"), hashStart = value.indexOf("#");
      const queryEnd = hashStart < 0 ? value.length : hashStart;
      const query = queryStart >= 0 && queryStart < queryEnd ? value.slice(queryStart + 1, queryEnd) : undefined;
      const parameter = query === undefined ? undefined : /(?:^|&)v=([^&]*)/.exec(query);
      if (parameter && queryStart >= 0) {
        const offset = queryStart + 1 + parameter.index + parameter[0].indexOf("v=") + 2;
        const from = mapped.starts[offset] ?? mapped.ends[offset - 1];
        const until = parameter[1].length ? mapped.ends[offset + parameter[1].length - 1] : from;
        edits.push({ start: start + from, end: start + until, text: version });
      } else {
        const at = mapped.starts[queryEnd] ?? raw.length;
        const separator = query === undefined ? "?" : query === "" || query.endsWith("&") ? "" : raw.includes("&amp;") ? "&amp;" : "&";
        edits.push({ start: start + at, end: start + at, text: separator + "v=" + version });
      }
    }
  };
  // Structured tokens own their ranges (srcset, CSS escapes and component page-relative URLs).
  for (const token of structured) add(token.value, token.start, token.end, token.start, token.cssQuote !== undefined);
  let searchable = decoded.text;
  for (const name of new Set(input.paths.map(path => path.split("/").at(-1)!))) {
    if (!/[\s"'`<>()[\]{},;=]/.test(name)) continue;
    searchable = searchable.replaceAll(name, name.replace(/[\s"'`<>()[\]{},;=]/g, "\uE000"));
  }
  for (const match of searchable.matchAll(options.versions ? /(?:https?:\/\/|\/\/)?[^\s"'`<>()[\]{},;=?]+(?:\?[^\s"'`<>()[\]{},;]*)?/g : /(?:https?:\/\/|\/\/)?[^\s"'`<>()[\]{},;=]+/g)) {
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

/** One scanner for renaming and replacing; callbacks see resolved paths before spelling changes. */
export function rewriteMediaMentions(input: RenameInput, mapping: Map<string, string>, options: MediaRewriteOptions = {}): Map<string, string> {
  const edits = new Map<string, string>();
  const { sources, site } = input;
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
    if (source === undefined || file === "_redirects" || !isMediaTextFile(file) || options.only && options.only !== file) continue;
    const text = rewriteText(file, source, input, mapping, templates.get(file) ?? new Map(), file === "_headers" ? { skip: options.skip } : options);
    if (text !== source) edits.set(mapping.get(file) ?? file, text);
  }
  return edits;
}

/** Redirect sources remain request paths; only destinations follow (with version marks when replacing). */
export function rewriteMediaRedirects(input: RenameInput, mapping: Map<string, string>, options: MediaRewriteOptions = {}): string | undefined {
  let offset = 0;
  const redirects = input.sources._redirects?.split(/(\r?\n)/).map(line => {
    const start = offset; offset += line.length;
    const match = /^(\s*[^#\s]\S*\s+)((?:https?:)?\/\S+)/i.exec(line);
    if (!match) return line;
    const at = start + match[1].length;
    const skip = options.skip?._redirects?.map(range => ({ start: range.start - at, end: range.end - at }));
    return match[1] + rewriteText("_redirects", match[2], input, mapping, new Map(), { ...options, skip: { _redirects: skip ?? [] } }) + line.slice(match[0].length);
  }).join("");
  return redirects;
}

export function planMediaRename(input: RenameInput): { taken: string; suggestion: string } | { moves: { from: string; to: string }[]; edits: Map<string, string>; records: MediaRecords; redirects?: string } {
  const { from, to, paths, sources } = input;
  const family = mediaFamilyOf(from, paths);
  const familyMoves = (target: string) => family ? renamedFamily(family, target) : [{ from, to: target }];
  const taken = (target: string) => familyMoves(target).some(move => move.from !== move.to && paths.includes(move.to));
  if (taken(to)) return { taken: to, suggestion: suggestMediaName(to, taken) };
  const moves = familyMoves(to).filter(move => move.from !== move.to);
  const mapping = new Map(moves.map(move => [move.from, move.to]));
  const edits = rewriteMediaMentions(input, mapping);
  // A destination follows like any mention, in whatever spelling (literal letters, any percent case, a
  // full address on the site's own host); sources are old addresses and stay.
  let redirects = rewriteMediaRedirects(input, mapping);
  // Forwarding lines name addresses as browsers request them: spaces and other characters encoded.
  const address = (path: string) => "/" + path.split("/").map(encodeURIComponent).join("/");
  for (const move of moves) redirects = editNativeRedirects(redirects, address(move.from), address(move.to), input.keepOldAddress ? [address(move.from)] : [], false);
  if (redirects === (sources._redirects ?? "")) redirects = undefined;
  const records = moves.reduce((records, move) => renameMediaRecord(records, move.from, move.to), input.records);
  return { moves, edits, records, redirects };
}

/** The Files tab and agent `move_file` read every text file first, in batches, while `holds()`; a message when they cannot. */
export async function readMediaRenameSources(paths: string[], read: (path: string) => Promise<unknown>, holds: () => boolean): Promise<string | undefined> {
  try {
    const files = [...new Set([...paths.filter(isMediaTextFile), MEDIA_RECORDS_PATH])];
    for (let at = 0; at < files.length; at += 12) {
      await Promise.all(files.slice(at, at + 12).map(read));
      if (!holds()) return "The repository changed meanwhile. Try again.";
    }
  } catch (error) { return error instanceof Error ? error.message : "The files that use this could not be read."; }
  return undefined;
}

/** The Files tab and agent `move_file`: the plan as a guarded edit's result, every file read through the edit's reads. */
export function filesMediaRenamePlan(input: {
  from: string; to: string; operation: "rename" | "move"; paths: string[];
  source(path: string): string | undefined; exists(path: string): boolean;
  site?: { routes: Record<string, string>; components: Record<string, string> } | null; origins: string[]; keepOldAddress?: boolean;
}) {
  const { from, to, operation, paths, site } = input;
  const sources: Record<string, string | undefined> = Object.fromEntries(paths.filter(isMediaTextFile).map(path => [path, input.source(path)]));
  const missing = Object.keys(sources).find(path => sources[path] === undefined);
  if (missing) return { refuse: `${missing} is not loaded, so the files that use this cannot be checked; nothing was moved.` };
  const records = parseMediaRecords(input.source(MEDIA_RECORDS_PATH));
  const family = mediaFamilyOf(from, paths);
  const kept = (family ? familyMembers(family) : [from]).some(path => Boolean(records.files[path]?.alwaysKeep));
  sources._redirects = input.source("_redirects");
  const plan = planMediaRename({ from, to, paths, sources, records,
    site: { origins: input.origins, pages: Object.values(site?.routes ?? {}), components: site?.components },
    keepOldAddress: input.keepOldAddress ?? kept });
  if ("taken" in plan) return { refuse: `${plan.taken} is taken. Try ${plan.suggestion}.` };
  if (serializeMediaRecords(records) !== serializeMediaRecords(plan.records)) plan.edits.set(MEDIA_RECORDS_PATH, serializeMediaRecords(plan.records));
  const creates: { path: string; content: string }[] = [];
  if (plan.redirects !== undefined) {
    if (sources._redirects === undefined) creates.push({ path: "_redirects", content: plan.redirects });
    else plan.edits.set("_redirects", plan.redirects);
  }
  if (plan.edits.has(MEDIA_RECORDS_PATH) && !input.exists(MEDIA_RECORDS_PATH)) {
    creates.push({ path: MEDIA_RECORDS_PATH, content: plan.edits.get(MEDIA_RECORDS_PATH)! });
    plan.edits.delete(MEDIA_RECORDS_PATH);
  }
  return { moves: plan.moves, edits: plan.edits, creates,
    done: `${operation === "rename" ? "Renamed" : "Moved"} ${from} to ${to}.`,
    undone: `Undid ${operation === "rename" ? "renaming" : "moving"} ${from} to ${to}.` };
}
