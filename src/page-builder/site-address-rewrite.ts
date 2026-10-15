// Changing the Site address's folder (`https://user.github.io/my-site/` → an own
// domain at its root, and every other way round): every root address in the
// site's text files moves from the old folder to the new one, in one plan.
// Loaded with Site settings' Apply only when the folder changes.
//
// Which addresses: everywhere the scanner reads a link (HTML attributes, srcset,
// meta images, inline and file CSS `url()` and `@import`), `_redirects` lines and
// `_headers` path lines, every root address moves, whether or not it names a file
// yet. Anywhere else (inline scripts, JS, JSON, XML, plain text) only an address
// that names one of the site's pages or files moves, and a bare root path only as a
// quoted string or a Markdown link, so `split("/")`, a regular expression or prose
// about paths is never mistaken for a link. A full address moves when it
// is on the old address's host inside its folder: another project site on the same
// host and outside links stay. `.editor/` (route keys, records) is not addresses.
import { sitePathPrefix } from "../../shared/site-path-prefix";
import { decodedSource, readMediaRenameSources } from "./media-rename";
import { isMediaTextFile } from "./media-mentions";
import { scanMediaUrlTokens } from "./media-references";

export interface SiteAddressRewrite {
  /** Changed files: path → new text. */
  edits: Map<string, string>;
  /** How many addresses changed, in all files. */
  count: number;
  /** A text file whose bytes were not loaded: nothing can be planned. */
  missing?: string;
}

const decoded = (value: string) => { try { return decodeURIComponent(value); } catch { return undefined; } };
const origin = (address: string) => {
  try { const url = new URL(address); return /^https?:$/.test(url.protocol) ? url.origin : undefined; } catch { return undefined; }
};

/** Whether the Site address's folder changes (compared decoded: `/café` and `/caf%C3%A9` are one). */
export function siteFolderChanges(from: string, to: string): boolean {
  return decoded(sitePathPrefix(from)) !== decoded(sitePathPrefix(to));
}

/**
 * The text files a folder change reads: the site's own, without `.editor/`, `CNAME` and Markdown
 * (README, AGENTS: notes about the repository, which a static server never shows as pages).
 */
export function siteAddressFiles(paths: Iterable<string>): string[] {
  return [...paths].filter(path => isMediaTextFile(path) && !path.startsWith(".editor/") && path !== "CNAME" && !/\.(?:md|markdown)$/i.test(path));
}

/** The raw root-path segments of `path` that spell `prefix` (any percent case), or undefined. */
function folderHead(path: string, prefix: string): string | undefined {
  if (!prefix) return "";
  const head = path.split("/").slice(0, prefix.split("/").length).join("/");
  return decoded(head) === decoded(prefix) && (path.length === head.length || path[head.length] === "/") ? head : undefined;
}

interface Context {
  oldPrefix: string; newPrefix: string; oldOrigin?: string; newOrigin?: string;
  /** A decoded repository path (`about/index.html`) is in the site. */
  has: (path: string) => boolean;
  /** The repository has a folder named like the new prefix: links under it name that folder, not the new address. */
  folderTaken: boolean;
}

/**
 * How one address (entities and CSS escapes already decoded) moves: how many of its
 * leading characters are replaced, and by what. `named`: it must name a page or file.
 */
export function movedAddress(value: string, context: Context, named = false): { head: number; text: string } | undefined {
  const full = /^(https?:\/\/[^/?#]*)/i.exec(value)?.[1];
  if (full === undefined && (!value.startsWith("/") || value.startsWith("//"))) return undefined;
  if (full !== undefined && (!context.oldOrigin || !context.newOrigin || origin(full) !== context.oldOrigin)) return undefined;
  const path = value.slice(full?.length ?? 0).split(/[?#]/, 1)[0];
  if (path.includes("\\")) return undefined;
  let head = folderHead(path, context.oldPrefix);
  if (head === undefined || !context.oldPrefix) {
    // Outside the old folder: on the old host that is another site there.
    if (full !== undefined && context.oldPrefix) return undefined;
    // A plain root link already under the new folder is left alone (unless a real folder has that name).
    if (context.newPrefix && folderHead(path, context.newPrefix) !== undefined && !context.folderTaken) return undefined;
    head = "";
  }
  const rest = path.slice(head.length);
  // A full address inside the old folder on the old host is this site's, the home page too.
  if (named && full === undefined) {
    const file = decoded(rest)?.replace(/^\/+/, "");
    if (!file || !(context.has(file) || context.has(file.replace(/\/?$/, "/index.html")))) return undefined;
  }
  let text = (full !== undefined ? context.newOrigin! : "") + context.newPrefix;
  // `/my-site` alone, at the domain root, is `/`.
  if (full === undefined && !text && !rest) text = "/";
  const before = (full ?? "") + head;
  return text === before ? undefined : { head: before.length, text };
}

interface Edit { start: number; end: number; text: string }

/** One text file with its addresses moved; `count` addresses changed. */
export function rewriteSiteAddressText(file: string, source: string, context: Context): { text: string; count: number } {
  const edits: Edit[] = [];
  const markup = /\.(?:html?|xml|rss|atom|svg)$/i.test(file);
  const taken: { start: number; end: number }[] = [];
  const overlaps = (start: number, end: number) => taken.some(range => start < range.end && end > range.start);
  // `start`/`end`: the value's raw range; `value`: its decoded text.
  const add = (value: string, start: number, end: number, named: boolean, css = false, attribute = false, entities = markup) => {
    const lead = value.length - value.trimStart().length;
    const moved = movedAddress(value.slice(lead), context, named);
    if (!moved) return;
    const raw = source.slice(start, end);
    const map = decodedSource(raw, entities, css, attribute);
    const from = map.starts[lead], to = moved.head ? map.ends[lead + moved.head - 1] : from;
    if (from === undefined || to === undefined) return;
    edits.push({ start: start + from, end: start + to, text: moved.text });
  };
  if (file === "_redirects") {
    // Both the address asked for and where it goes: the whole site moved.
    let offset = 0;
    for (const line of source.split(/(?<=\n)/)) {
      if (!/^\s*#/.test(line)) for (const token of [...line.matchAll(/\S+/g)].slice(0, 2)) {
        add(token[0], offset + token.index!, offset + token.index! + token[0].length, false);
        taken.push({ start: offset + token.index!, end: offset + token.index! + token[0].length });
      }
      offset += line.length;
    }
  } else {
    if (file === "_headers") {
      let offset = 0;
      for (const line of source.split(/(?<=\n)/)) {
        const path = /^\S+/.exec(line)?.[0];
        if (path && !path.startsWith("#")) { add(path, offset, offset + path.length, false); taken.push({ start: offset, end: offset + path.length }); }
        offset += line.length;
      }
    }
    // The scanner's links: every root address there moves.
    if (/\.(?:html?|css)$/i.test(file)) for (const token of scanMediaUrlTokens(file, source)) {
      // A `<style>` element's text is CSS only: its tokens carry no attribute and no entities.
      add(token.value, token.start, token.end, false, token.cssQuote !== undefined, token.attribute !== undefined, markup && (token.attribute !== undefined || token.cssQuote === undefined));
      taken.push({ start: token.start, end: token.end });
    }
    // Everything else: only addresses naming a page or file, with something after the folder.
    const text = decodedSource(source, markup);
    for (const match of text.text.matchAll(/(?:https?:\/\/)?[^\s"'`<>()[\]{},;=]+/g)) {
      const value = match[0].replace(/[.!:]+$/, "");
      const start = text.starts[match.index!], end = text.ends[match.index! + value.length - 1];
      if (start === undefined || end === undefined || overlaps(start, end)) continue;
      // A bare root path counts only as a string, a Markdown link or a header link (`"/about/"`, `(/about/)`, `</a.css>`): in prose,
      // `work/<slug>/index.html` or a table of routes is not a link.
      if (!/^https?:/i.test(value) && !/["'`(<]/.test(text.text[match.index! - 1] ?? "")) continue;
      add(value, start, end, true);
    }
  }
  let text = source, boundary = source.length;
  let count = 0;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > boundary) continue;
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    boundary = edit.start;
    count++;
  }
  return { text, count };
}

export interface SiteAddressInput {
  /** The Site address before and after (`""`: none). */
  from: string; to: string;
  /** Every file of the site now. */
  paths: Iterable<string>;
  /** A file's text as it will be written before the addresses move (Site settings' own edits included). */
  source: (path: string) => string | undefined;
  /** Between files: lets a large site's plan give the page its turn (after `slice` ms of work, default 12). */
  pause?: () => Promise<void> | undefined;
  slice?: number;
}

function context(input: Pick<SiteAddressInput, "from" | "to">, paths: string[]): Context {
  const oldPrefix = sitePathPrefix(input.from), newPrefix = sitePathPrefix(input.to);
  const folder = decoded(newPrefix)?.replace(/^\//, ""), files = new Set(paths);
  return {
    oldPrefix, newPrefix,
    oldOrigin: input.from ? origin(input.from) : undefined, newOrigin: input.to ? origin(input.to) : undefined,
    has: path => files.has(path),
    folderTaken: Boolean(folder) && paths.some(path => path.startsWith(`${folder}/`)),
  };
}

/** Every changed file when the Site address's folder changes; nothing when it does not. */
export function planSiteAddressRewrite(input: SiteAddressInput): SiteAddressRewrite {
  const plan: SiteAddressRewrite = { edits: new Map(), count: 0 };
  if (!siteFolderChanges(input.from, input.to)) return plan;
  const paths = [...input.paths], moving = context(input, paths);
  for (const file of siteAddressFiles(paths)) if (step(plan, file, input.source(file), moving)) break;
  return plan;
}

/** The same plan, pausing between files so a large site does not hold the page still. */
export async function planSiteAddressRewriteInSlices(input: SiteAddressInput): Promise<SiteAddressRewrite> {
  const plan: SiteAddressRewrite = { edits: new Map(), count: 0 };
  if (!siteFolderChanges(input.from, input.to)) return plan;
  const paths = [...input.paths], moving = context(input, paths);
  let since = performance.now();
  for (const file of siteAddressFiles(paths)) {
    if (step(plan, file, input.source(file), moving)) break;
    if (input.pause && performance.now() - since >= (input.slice ?? 12)) { await input.pause(); since = performance.now(); }
  }
  return plan;
}

/** One stored address (Site settings' default social image) moved like the links in the files. */
export function moveSiteAddress(value: string, input: Pick<SiteAddressInput, "from" | "to" | "paths">): string {
  if (!siteFolderChanges(input.from, input.to)) return value;
  const moved = movedAddress(value, context(input, [...input.paths]));
  return moved ? moved.text + value.slice(moved.head) : value;
}

function step(plan: SiteAddressRewrite, file: string, source: string | undefined, moving: Context): boolean {
  if (source === undefined) { plan.missing = file; plan.edits.clear(); plan.count = 0; return true; }
  const { text, count } = rewriteSiteAddressText(file, source, moving);
  if (count) { plan.edits.set(file, text); plan.count += count; }
  return false;
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** What the confirm says before the addresses move. */
export function siteAddressConfirm(plan: SiteAddressRewrite): string {
  return `This updates ${plural(plan.count, "link")} in ${plural(plan.edits.size, "file")} to the new address. Undo is available.`;
}

/** How many addresses Apply changed. */
export function siteAddressUpdated(plan: SiteAddressRewrite): string {
  return `Updated ${plural(plan.count, "link")} in ${plural(plan.edits.size, "file")} to the new address.`;
}

/** What Apply says after. */
export function siteAddressDone(plan: SiteAddressRewrite): string {
  return `Site settings applied as drafts. ${siteAddressUpdated(plan)} Publish to keep them.`;
}

/** Every text file read into the editor first (in batches, while `holds()`), as renaming does; a message when they cannot be. */
export function readSiteAddressFiles(paths: string[], read: (path: string) => Promise<unknown>, holds: () => boolean): Promise<string | undefined> {
  return readMediaRenameSources(siteAddressFiles(paths), read, holds);
}

export const SITE_ADDRESS_KEPT = "Kept the old site address. Nothing was applied.";
