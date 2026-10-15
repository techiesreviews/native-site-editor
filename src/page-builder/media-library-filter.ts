import { mediaKind as fileKind, TEXT_PATH } from "../../shared/agent";
import { uploadImageType } from "../uploads";
import { mediaFamilies, familyMembers, onlineStillMembers } from "./media-families";
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

/** What a picker's words call its files: "image" for pictures only (the long-standing wording),
 * "video" for videos only, "image or video" for a picture spot, else "media" (Add → Media). */
export function pickerNoun(accept?: string): string {
  const parts = accept?.split(",").map(part => part.trim().toLowerCase()).filter(Boolean) ?? [];
  const video = (part: string) => part.startsWith("video/") || part.startsWith(".") && mediaKind(`x${part}`) === "video";
  const image = (part: string) => part.startsWith("image/") || part.startsWith(".") && mediaKind(`x${part}`) === "image";
  if (!parts.length) return "media";
  if (parts.every(image)) return "image";
  if (parts.every(video)) return "video";
  return parts.every(part => image(part) || video(part)) ? "image or video" : "media";
}
/** Use's word for a chosen file: "Use image", "Use video", "Use audio", "Use file". */
export const chosenNoun = (path: string) => ({ image: "image", video: "video", audio: "audio", document: "file" } as const)[mediaKind(path)];

export interface MediaLibraryFilter {
  query: string;
  /** A collection's name; empty for All collections. */
  collection: string;
  kind: MediaKindChoice;
  accept?: string;
}

/** A record's `added` time in milliseconds; undefined when it is missing or unreadable. */
export function mediaAddedTime(record?: { added?: unknown }): number | undefined {
  const time = typeof record?.added === "string" ? Date.parse(record.added) : NaN;
  return Number.isFinite(time) ? time : undefined;
}

/** Media's order everywhere (slice 103): newest first; files without a date after the dated ones,
 * by name (numbers in order, "photo-2" before "photo-10"), then by folder. */
export function mediaNewestFirst(a: { path: string; date?: number }, b: { path: string; date?: number }): number {
  if (a.date !== undefined && b.date !== undefined && a.date !== b.date) return b.date - a.date;
  if ((a.date === undefined) !== (b.date === undefined)) return a.date === undefined ? 1 : -1;
  return basename(a.path).localeCompare(basename(b.path), undefined, { numeric: true, sensitivity: "base" }) || a.path.localeCompare(b.path);
}

/** Search respects the kind and the collection; results are newest first. */
export function filterMediaLibrary(library: MediaLibrary, options: MediaLibraryFilter) {
  const query = options.query.trim().toLowerCase();
  return library.items.filter((item) => {
    const meta = library.metadata[item.path];
    return accepts(item.path, options.accept) && (options.kind === "all" || mediaKind(item.path) === options.kind) &&
      (!options.collection || meta?.tags.includes(options.collection)) &&
      `${item.path} ${meta?.alt ?? ""} ${meta?.tags.join(" ") ?? ""} ${library.usage[item.path]?.alts.join(" ") ?? ""}`.toLowerCase().includes(query);
  }).sort(mediaNewestFirst);
}

export const onlineServiceName = (service: "youtube" | "vimeo") => service === "youtube" ? "YouTube" : "Vimeo";
/** An online video's name in Media: its title, else "YouTube video". */
export const onlineVideoName = (video: { service: "youtube" | "vimeo"; title?: string }) => video.title?.trim() || `${onlineServiceName(video.service)} video`;
/** The online videos Media lists (slice 68): under All and Video, outside collections, and only where
 * every kind may be placed (Media and Add → Media, not a narrowed picker). Search reads the name and service. */
export function filterOnlineVideos<T extends { service: "youtube" | "vimeo"; title?: string }>(videos: T[] | undefined, options: MediaLibraryFilter): T[] {
  if (!videos?.length || options.accept || options.collection || (options.kind !== "all" && options.kind !== "video")) return [];
  const query = options.query.trim().toLowerCase();
  return videos.filter(video => `${onlineVideoName(video)} ${onlineServiceName(video.service)}`.toLowerCase().includes(query))
    .sort((a, b) => onlineVideoName(a).localeCompare(onlineVideoName(b)));
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
 * its main stays. Copied online-video still families belong to their video, so have no tile. */
export function mediaLibraryTiles<T extends { path: string }>(items: T[], onlineVideos?: MediaLibrary["onlineVideos"]): T[] {
  const paths = items.map(item => item.path);
  const members = new Set([...onlineStillMembers(paths, onlineVideos), ...mediaFamilies(paths).flatMap(family => familyMembers(family).slice(1))]);
  return items.filter(item => !members.has(item.path));
}

/** Each video's or PDF's still picture, by its main: the tile draws it instead of the file. A still
 * recorded for a video (a picture chosen from Media, slice 66) wins while it is in the site. */
export function mediaTileStills(paths: string[], metadata: Record<string, { still?: string }> = {}): Map<string, string> {
  const stills = new Map(mediaFamilies(paths).flatMap(family => family.still ? [[family.main, family.still] as const] : []));
  const present = new Set(paths);
  for (const path of paths) {
    const still = metadata[path]?.still;
    if (still && still !== path && present.has(still) && mediaKind(path) === "video") stills.set(path, still);
  }
  return stills;
}

/** A length as the browser's player shows it: 0:00, 0:05, 12:34, 1:02:03 (whole seconds counted down). */
export function formatMediaLength(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds)), s = String(total % 60).padStart(2, "0"), m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600);
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
