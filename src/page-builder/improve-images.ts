import type { MediaRecords } from "../../shared/media-records";
import { startTags } from "../../shared/html-source";
import { decodeHtmlEntities } from "./html-entities";
import { mediaAttribute } from "./media-attributes";
import { mediaFamilies } from "./media-families";
import { olderCopyWidths } from "./media-older-copies";
import { mediaImageRecipe } from "./media-optimise";
import type { MediaSite } from "./media-origins";
import { mediaResolvePath, scanMediaReferences, scanMediaUrlTokens, walkMediaReferencePages } from "./media-references";
import { mediaAddingSettings } from "./media-settings";
import { parseSource, type SourceElement, type SourceNode } from "./source-tree";

export const IMPROVE_HEAVY_BYTES = 200 * 1024;
export type ImproveChange = "bring-in" | "lighten" | "copies" | "size" | "sizes" | "loading" | "loop" | "first-frame" | "player";
type LeftReason = "script" | "sample-code" | "structured-data" | "template-fallback" | "missing";
export interface ImprovePicture {
  key: string; address: string; path?: string; url?: string; host?: string;
  kind: "image" | "svg" | "gif" | "outside" | "youtube" | "vimeo" | "sharing";
  tag: { start: number; end: number }; link?: string; adopted?: string[]; videoId?: string;
  changes: ImproveChange[]; ticked: boolean;
}
type Counts = Record<ImproveChange, number>;
export interface ImproveImagesRow {
  kind: "page" | "component"; file: string; label: string; reach?: number; pages: string[];
  pictures: ImprovePicture[]; leftAlone: { address: string; reason: LeftReason }[];
  count: number; counts: Counts; summary: string;
}
export interface ImproveImagesPlan { rows: ImproveImagesRow[]; count: number; totals: Counts; missingFacts: string[] }
interface Facts { size?: number; width?: number; height?: number; animated?: boolean }
interface Input {
  sources: Readonly<Record<string, string | undefined>>; pages: readonly string[];
  components: Readonly<Record<string, string>>; files: Readonly<Record<string, Facts>>;
  records: MediaRecords; site?: MediaSite;
}
const counts = (): Counts => ({ "bring-in": 0, lighten: 0, copies: 0, size: 0, sizes: 0, loading: 0, loop: 0, "first-frame": 0, player: 0 });
const inert = new Set(["pre", "code", "samp", "kbd", "xmp", "textarea", "template", "noscript"]);
const raster = /\.(?:jpe?g|png|bmp|tiff?|webp|avif|gif)$/i;
const elements = (nodes: SourceNode[]): SourceElement[] => nodes.flatMap(node => node.type === "element" ? [node, ...elements(node.children)] : []);
function ancestry(node: SourceElement): SourceElement[] { return [node, ...node.parent ? ancestry(node.parent) : []]; }
const attribute = (source: string, node: SourceElement, name: string) => {
  const found = mediaAttribute(source, node.tag, name);
  return found && decodeHtmlEntities(found.value, true);
};
function onlineVideo(address: string): { kind: "youtube" | "vimeo"; videoId: string } | undefined {
  try {
    const url = new URL(address.startsWith("//") ? "https:" + address : address);
    const host = url.hostname.replace(/^www\./, "");
    if (!["https:", "http:"].includes(url.protocol)) return;
    if (["youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? url.pathname.split("/")[1] : /^\/(?:embed|shorts)\/([^/]+)/.exec(url.pathname)?.[1] ?? (url.pathname === "/watch" ? url.searchParams.get("v") : undefined);
      if (id && /^[\w-]+$/.test(id)) return { kind: "youtube", videoId: id };
    }
    if (["player.vimeo.com", "vimeo.com"].includes(host)) {
      const id = /^\/(?:video\/)?(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
      if (id) return { kind: "vimeo", videoId: id + (url.searchParams.has("h") ? `?h=${url.searchParams.get("h")}` : "") };
    }
  } catch { /* Other iframe addresses are not online videos. */ }
}
function scriptDriven(source: string, node: SourceElement, scripts: string): boolean {
  if (["data-src", "data-srcset"].some(name => attribute(source, node, name) !== undefined)) return true;
  return ancestry(node).some(parent => {
    const id = attribute(source, parent, "id");
    const escaped = id?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (id && new RegExp(`#${escaped}(?![\\w-])|getElementById\\(\\s*["']${escaped}["']\\s*\\)`).test(scripts)) return true;
    // Attribute names come from the tokenizer, not text inside quoted values.
    const names = source.slice(parent.tag.nameEnd, parent.tag.end).match(/\bdata-[\w-]+/g) ?? [];
    return names.some(name => attribute(source, parent, name) !== undefined && (scripts.includes(name) || new RegExp(`\\bdataset\\s*(?:\\.\\s*${name.slice(5).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())}\\b|\\[\\s*["']${name.slice(5).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())}["'])`).test(scripts)));
  });
}
function heavy(path: string, facts: Facts, maxWidth: number | null): boolean {
  // Unknown facts must be measured before trusting a heavy/copies decision.
  return facts.size !== undefined && facts.width !== undefined && (facts.size > IMPROVE_HEAVY_BYTES || (maxWidth !== null && facts.width > maxWidth) || /\.(?:bmp|tiff?)$/i.test(path));
}
function summary(row: ImproveImagesRow): string {
  const c = row.counts, parts: string[] = [];
  if (c["bring-in"]) parts.push(`${c["bring-in"]} picture${c["bring-in"] === 1 ? "" : "s"} from other websites`);
  if (c.lighten) parts.push(`${c.lighten} heavy${parts.length ? "" : ` picture${c.lighten === 1 ? "" : "s"}`}`);
  const gifs = row.pictures.filter(p => p.ticked && p.changes.some(c => c === "loop" || c === "first-frame")).length;
  if (gifs) parts.push(`${gifs} GIF${gifs === 1 ? "" : "s"}`);
  if (c.player) parts.push(`${c.player} player${c.player === 1 ? "" : "s"}`);
  if (c.copies) parts.push(`${c.copies} picture${c.copies === 1 ? "" : "s"} missing copies`);
  const details = row.pictures.filter(p => p.ticked && p.changes.some(c => ["size", "sizes", "loading"].includes(c))).length;
  if (details) parts.push(`${details} picture${details === 1 ? "" : "s"} missing size details`);
  return `${row.label}${row.kind === "component" ? `, on ${row.reach} page${row.reach === 1 ? "" : "s"}` : ""}: ${parts.join(", ") || "0 pictures"}`;
}

/** Read-only source plan. Import only from an on-demand Improve images entry. */
export function improveImagesPlan(input: Input): ImproveImagesPlan {
  const { sources, components, files, records, site } = input;
  const paths = Object.keys(files), families = mediaFamilies(paths);
  const maxWidth = mediaImageRecipe(mediaAddingSettings(records.adding).image).maxWidth;
  const parsed = new Map(Object.entries(sources).filter(([file]) => /\.html$/i.test(file)).map(([file, source]) => [file, elements(parseSource(source ?? ""))]));
  const reach = new Map<string, string[]>();
  for (const page of input.pages) {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      if (file !== page) reach.set(file, [...reach.get(file) ?? [], page]);
      for (const node of parsed.get(file) ?? []) if (!ancestry(node).some(p => inert.has(p.name)) && Object.hasOwn(components, node.name)) visit(components[node.name]);
    };
    visit(page);
  }
  const references = new Map(Object.entries(sources).map(([file, source]) => [file, scanMediaReferences(file, source ?? "", site)]));
  const resolved = new Map<string, Set<string>>();
  walkMediaReferencePages({ ...sources }, references, [...input.pages], { ...components }, (page, ref) => {
    if (reach.has(ref.file) && !reach.get(ref.file)!.includes(page)) return;
    const key = `${ref.file}:${ref.start}`;
    if (!resolved.has(key)) resolved.set(key, new Set());
    resolved.get(key)!.add(ref.path);
  });
  const scriptMemo = new Map<string, string>();
  const pageScripts = (page: string) => scriptMemo.get(page) ?? scriptMemo.set(page, (parsed.get(page) ?? []).filter(n => n.name === "script" && !ancestry(n).some(p => inert.has(p.name))).map(n => {
    const src = attribute(sources[page] ?? "", n, "src");
    return src ? sources[mediaResolvePath(src, page, site) ?? ""] ?? "" : (sources[page] ?? "").slice(n.tag.end, n.close?.start ?? n.end);
  }).join("\n")).get(page)!;
  const rows: ImproveImagesRow[] = [];
  const templates = new Map<string, string>();
  for (const [tag, file] of Object.entries(components)) if (!templates.has(file)) templates.set(file, tag);
  for (const file of [...templates.keys(), ...input.pages.filter(p => !templates.has(p))]) {
    const source = sources[file] ?? "", nodes = parsed.get(file) ?? [], component = templates.get(file);
    const pages = component ? reach.get(file) ?? [] : [file];
    const title = nodes.find(n => n.name === "title");
    const text = title ? decodeHtmlEntities(source.slice(title.tag.end, title.close?.start ?? title.end)).replace(/\s+/g, " ").trim().split(/ · | \| | - /)[0] : "";
    const label = component ? component.replace(/-/g, " ").replace(/^./, char => char.toUpperCase()) : text || (file === "index.html" ? "Home" : "/" + file.replace(/index\.html$/, ""));
    const row: ImproveImagesRow = { kind: component ? "component" : "page", file, label, ...(component ? { reach: pages.length } : {}), pages, pictures: [], leftAlone: [], count: 0, counts: counts(), summary: "" };
    const scripts = [pageScripts(file), ...pages.map(pageScripts)].join("\n");
    const tokens = scanMediaUrlTokens(file, source);
    const leave = (address: string, reason: LeftReason) => row.leftAlone.push({ address, reason });
    for (const node of nodes) {
      if (node.name === "script" && attribute(source, node, "type") === "application/ld+json" && !ancestry(node).some(n => inert.has(n.name))) {
        const collect = (value: unknown, image = false) => {
          if (typeof value === "string" && image) leave(value, "structured-data");
          else if (Array.isArray(value)) value.forEach(v => collect(v, image));
          else if (value && typeof value === "object") for (const [key, v] of Object.entries(value)) collect(v, /^(?:image|thumbnailUrl|contentUrl|url)$/.test(key) && (image || /^(?:image|thumbnailUrl)$/.test(key)));
        };
        try { collect(JSON.parse(source.slice(node.tag.end, node.close?.start ?? node.end))); } catch { /* Invalid JSON remains untouched. */ }
      }
      // Raw-text sample containers hide their literal tags from the HTML parser.
      if (["xmp", "textarea"].includes(node.name)) for (const tag of startTags(source.slice(node.tag.end, node.close?.start ?? node.end))) {
        const inner = source.slice(node.tag.end, node.close?.start ?? node.end);
        const address = mediaAttribute(inner, tag, "src")?.value;
        if (address) leave(address, "sample-code");
      }
      // A <picture>'s <source> sets belong to its <img>; <video>/<audio> sources are not pictures.
      if (!["img", "iframe", "meta"].includes(node.name)) continue;
      const candidates = tokens.filter(t => t.start >= node.tag.start && t.end <= node.tag.end && (node.name === "meta" ? t.attribute === "content" && attribute(source, node, "property") === "og:image" : ["src", "srcset", "data-src", "data-srcset"].includes(t.attribute ?? "")));
      // src is the main picture; srcset-only markup uses its largest candidate.
      const main = candidates.find(t => t.attribute === "src") ?? [...candidates].sort((a, b) => {
        const width = (end: number) => Number(/^\s+(\d+(?:\.\d+)?)[wx]\b/.exec(source.slice(end, node.tag.end))?.[1] ?? 1);
        return width(b.end) - width(a.end);
      })[0];
      if (!main) continue;
      const address = main.value;
      const parents = ancestry(node);
      const reason = parents.some(n => inert.has(n.name)) ? "sample-code" : component && parents.some(n => n.name === "slot") ? "template-fallback" : scriptDriven(source, node, scripts) ? "script" : undefined;
      if (reason) { for (const token of candidates) leave(token.value, reason); continue; }
      const video = node.name === "iframe" ? onlineVideo(address) : undefined;
      if (node.name === "iframe" && !video) continue;
      const local = mediaResolvePath(address, file, site);
      const localPaths = local ? [...resolved.get(`${file}:${main.start}`) ?? [local]] : [undefined];
      for (const path of localPaths) {
        if (path && !Object.hasOwn(files, path)) { leave(address, "missing"); continue; }
        const url = path ? undefined : address.startsWith("//") ? "https:" + address : address;
        if (url && !/^https?:\/\//i.test(url)) continue;
        const extension = (path ?? new URL(url!).pathname).toLowerCase();
        const svg = /\.svg$/i.test(extension), gif = /\.gif$/i.test(extension);
        if (node.name === "meta" && (!path || !gif || component)) continue;
        const changes: ImproveChange[] = [];
        const facts = path ? files[path] : undefined;
        // An existing set is adopted: the family's copies, the <img>'s own srcset and its <picture> sources.
        const setSources = node.parent?.name === "picture" ? node.parent.children.filter((n): n is SourceElement => n.type === "element" && n.name === "source") : [];
        const written = tokens.filter(t => t.attribute === "srcset" && (t.start >= node.tag.start && t.end <= node.tag.end || setSources.some(n => t.start >= n.tag.start && t.end <= n.tag.end)))
          .map(t => mediaResolvePath(t.value, file, site) ?? t.value).filter(other => other !== path);
        const adopted = path ? [...new Set([...families.find(f => f.main === path || f.copies.some(c => c.path === path))?.copies.map(c => c.path) ?? [], ...written])] : undefined;
        if (video) changes.push("player");
        else if (node.name === "meta") changes.push("first-frame");
        else {
          if (!path && !svg) changes.push("bring-in");
          else if (path && gif && facts?.animated !== false) changes.push("loop");
          else if (path && raster.test(path)) {
            if (heavy(path, facts!, maxWidth)) changes.push("lighten");
            else if (!adopted?.length && facts?.size !== undefined && olderCopyWidths({ path, width: facts.width, paths }).length) changes.push("copies");
          }
          // A GIF becomes a Looping video with its own markup; image size details do not apply.
          const image = node.name === "img" && !changes.includes("loop");
          if (image && (attribute(source, node, "width") === undefined || attribute(source, node, "height") === undefined)) changes.push("size");
          if (image && !svg) {
            if (attribute(source, node, "sizes") === undefined && (attribute(source, node, "srcset") !== undefined || changes.some(c => ["bring-in", "lighten", "copies"].includes(c)))) changes.push("sizes");
            if (attribute(source, node, "loading") === undefined && attribute(source, node, "sizes") === undefined) changes.push("loading");
          }
        }
        const key = path ?? url!;
        row.pictures.push({ key, address, ...(path ? { path } : { url, host: new URL(url!).host }), kind: video?.kind ?? (node.name === "meta" ? "sharing" : svg ? "svg" : path ? gif ? "gif" : "image" : "outside"), tag: { start: node.tag.start, end: node.tag.end }, link: parents.find(n => n.name === "a") ? attribute(source, parents.find(n => n.name === "a")!, "href") : undefined, ...(adopted?.length ? { adopted } : {}), ...(video ? { videoId: video.videoId } : {}), changes, ticked: !records.leftAsIs?.some(item => item.picture === key && (item.row === undefined || item.row === file)) });
      }
    }
    if (!row.pictures.some(p => p.changes.length)) continue;
    for (const picture of row.pictures) if (picture.ticked && picture.changes.length) {
      row.count++;
      for (const change of picture.changes) row.counts[change]++;
    }
    row.summary = summary(row);
    rows.push(row);
  }
  rows.sort((a, b) => a.kind !== b.kind ? a.kind === "component" ? -1 : 1 : (b.reach ?? 0) - (a.reach ?? 0) || a.label.localeCompare(b.label) || a.file.localeCompare(b.file));
  const totals = counts(), missingFacts = new Set<string>();
  for (const row of rows) {
    for (const change of Object.keys(totals) as ImproveChange[]) totals[change] += row.counts[change];
    for (const p of row.pictures) if (p.path && raster.test(p.path) && (files[p.path].size === undefined || files[p.path].width === undefined)) missingFacts.add(p.path);
  }
  return { rows, count: rows.filter(r => r.count > 0).length, totals, missingFacts: [...missingFacts].sort() };
}
