import { mediaKind as fileKind, TEXT_PATH } from "../../shared/agent";
import { uploadImageType } from "../uploads";
import { mediaFamilies, familyMembers } from "./media-families";
import type { MediaLibrary } from "./media-picker";

export function accepts(path: string, accept?: string) {
  if (!accept) return true;
  const type = uploadImageType(path) ?? "";
  return accept.split(",").some((part) => {
    const value = part.trim().toLowerCase();
    return value.startsWith(".") ? path.toLowerCase().endsWith(value)
      : value.endsWith("/*") ? type.startsWith(value.slice(0, -1)) : type === value;
  });
}

/** What a file is, from its extension: the kinds More offers. Documents are PDFs and other downloads. */
export type MediaKind = "image" | "video" | "audio" | "document";
export type MediaKindChoice = MediaKind | "all";
/** The agents' classifier (slice 20), so Media and agents agree; everything else is a download. */
export const mediaKind = (path: string): MediaKind => { const kind = fileKind(path); return kind === "other" ? "document" : kind; };

/** What Media lists, and agents too (slice 20): pictures, video, audio, PDFs and other downloads;
 * never pages, styles, scripts, fonts, source files or the editor's own files. */
export function isMediaLibraryPath(path: string) {
  return !/^(?:node_modules|\.github|\.editor)\//.test(path) && !/(?:^|\/)\.[^/]*$/.test(path) &&
    (fileKind(path) !== "other" || !TEXT_PATH.test(path) && /\.[^/]+$/.test(path) && !/\.(?:[cm]?ts|tsx|jsx|cjs|map|lock|ya?ml|toml|jsonc|json5|ini|env|sh|ps1|py|rb|php|vue|svelte|astro|s[ac]ss|less|njk|liquid|hbs|woff2?|ttf|otf|eot)$/i.test(path));
}

export interface MediaLibraryFilter {
  query: string;
  /** A collection's name; empty for All collections. */
  collection: string;
  kind: MediaKindChoice;
  accept?: string;
}

/** Search respects the kind and the collection; results are in name order. */
export function filterMediaLibrary(library: MediaLibrary, options: MediaLibraryFilter) {
  const query = options.query.trim().toLowerCase();
  return library.items.filter((item) => {
    const meta = library.metadata[item.path];
    return accepts(item.path, options.accept) && (options.kind === "all" || mediaKind(item.path) === options.kind) &&
      (!options.collection || meta?.tags.includes(options.collection)) &&
      `${item.path} ${meta?.alt ?? ""} ${meta?.tags.join(" ") ?? ""} ${library.usage[item.path]?.alts.join(" ") ?? ""}`.toLowerCase().includes(query);
  }).sort((a, b) => a.path.localeCompare(b.path));
}

/** When nothing matches, the one step back towards all media: first the kind, then the
 * collection, then the search. Nothing when no filter is narrowing (an empty library). */
export function mediaLibraryRecovery(options: MediaLibraryFilter): { label: string; change: Partial<MediaLibraryFilter> } | undefined {
  const searching = Boolean(options.query.trim());
  if (options.kind !== "all") return { label: searching ? "Search all media" : "Show all media", change: { kind: "all" } };
  if (options.collection) return { label: searching ? "Search all collections" : "Show all collections", change: { collection: "" } };
  if (searching) return { label: "Clear search", change: { query: "" } };
}

/** One tile per Image family: each family's copies and kept originals are left out,
 * its main stays. Files outside any family (not images) pass through. */
export function mediaLibraryTiles<T extends { path: string }>(items: T[]): T[] {
  const members = new Set(mediaFamilies(items.map(item => item.path)).flatMap(family => familyMembers(family).slice(1)));
  return items.filter(item => !members.has(item.path));
}

/** Each video's or PDF's still picture, by its main: the tile draws it instead of the file. */
export function mediaTileStills(paths: string[]): Map<string, string> {
  return new Map(mediaFamilies(paths).flatMap(family => family.still ? [[family.main, family.still] as const] : []));
}

/** A length as the browser's player shows it: 0:05, 12:34, 1:02:03 (whole seconds counted down, at least 1). */
export function formatMediaLength(seconds: number): string {
  const total = Math.max(1, Math.floor(seconds)), s = String(total % 60).padStart(2, "0"), m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The type picture a file without a picture shows (ticket 12 "In the editor"). */
export type MediaTypePicture = "file" | "video" | "audio" | "pdf" | "archive" | "text" | "sheet" | "slides" | "subtitles";
const TYPE_PICTURES: [MediaTypePicture, RegExp][] = [
  ["pdf", /\.pdf$/i], ["archive", /\.(?:zip|gz|tgz|tar|7z|rar|bz2|xz)$/i], ["sheet", /\.(?:xlsx?|ods|csv|numbers)$/i],
  ["slides", /\.(?:pptx?|odp|key)$/i], ["text", /\.(?:docx?|odt|rtf|pages|txt|md|epub)$/i], ["subtitles", /\.(?:vtt|srt)$/i],
];

/** How a tile shows its file: the picture it draws (an image itself, a video's still, a PDF's first
 * page), the type picture otherwise, its type, its length and the corner fact (the length, or the type
 * of a picture that is not an image). */
export function mediaTileLook(path: string, still?: string, duration?: number) {
  const kind = mediaKind(path), type = /\.([^./]+)$/.exec(path)?.[1].toUpperCase() ?? "FILE";
  const length = (kind === "video" || kind === "audio") && duration && Number.isFinite(duration) && duration > 0 ? formatMediaLength(duration) : undefined;
  const picture = kind === "image" ? path : still;
  const icon: MediaTypePicture = kind === "video" || kind === "audio" ? kind : kind === "image" ? "file" : TYPE_PICTURES.find(([, test]) => test.test(path))?.[0] ?? "file";
  return { picture, icon, type, length, fact: length ?? (picture && kind !== "image" ? type : undefined) };
}

/** Each Image family's main carries the usage of all its members (a page that shows only a
 * responsive copy uses the family), each page, file and alt once, in first-seen order. */
export function mediaFamilyUsage(library: Pick<MediaLibrary, "items" | "usage">): MediaLibrary["usage"] {
  const usage = { ...library.usage };
  const once = (values: string[]) => [...new Set(values)];
  for (const family of mediaFamilies(library.items.map(item => item.path))) {
    const found = familyMembers(family)
      .flatMap(path => library.usage[path] ? [library.usage[path]] : []);
    if (found.length < 2 && (found.length === 0 || library.usage[family.main])) continue;
    usage[family.main] = {
      pages: once(found.flatMap(entry => entry.pages)), files: once(found.flatMap(entry => entry.files)), alts: once(found.flatMap(entry => entry.alts)),
    };
  }
  return usage;
}

export const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
export const basename = (path: string) => path.split("/").pop()!;

/** A file name's two ends, for shortening it in the middle: the head may shorten; the tail (an
 *  extension of up to 5 letters, after the last 4 letters of a stem longer than 8) always shows,
 *  so "summer-workshop-poster.png" can read "summer-work…ster.png". */
export function nameEnds(name: string): [head: string, tail: string] {
  const letters = [...name], dot = letters.lastIndexOf(".");
  const extension = dot > 0 && letters.length - dot <= 6 ? letters.length - dot : 0;
  const stem = letters.length - extension, kept = stem > 8 ? 4 : 0;
  return [letters.slice(0, stem - kept).join(""), letters.slice(stem - kept).join("")];
}
