import { uploadImageType } from "../uploads";
import { mediaFamilies } from "./media-families";
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
const KINDS: [MediaKind, RegExp][] = [
  ["image", /\.(?:svg|png|jpe?g|gif|webp|avif|ico|bmp|tiff?|heic|heif)$/i],
  ["video", /\.(?:mp4|m4v|webm|mov|ogv|mkv|avi)$/i],
  ["audio", /\.(?:mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i],
];
export const mediaKind = (path: string): MediaKind => KINDS.find(([, pattern]) => pattern.test(path))?.[0] ?? "document";

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
  const members = new Set(mediaFamilies(items.map(item => item.path)).flatMap(family => [...family.copies.map(copy => copy.path), ...family.originals]));
  return items.filter(item => !members.has(item.path));
}

/** Each Image family's main carries the usage of all its members (a page that shows only a
 * responsive copy uses the family), each page, file and alt once, in first-seen order. */
export function mediaFamilyUsage(library: Pick<MediaLibrary, "items" | "usage">): MediaLibrary["usage"] {
  const usage = { ...library.usage };
  const once = (values: string[]) => [...new Set(values)];
  for (const family of mediaFamilies(library.items.map(item => item.path))) {
    const found = [family.main, ...family.copies.map(copy => copy.path), ...family.originals]
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
