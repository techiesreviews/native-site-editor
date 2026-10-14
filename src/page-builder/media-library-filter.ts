import { uploadImageType } from "../uploads";
import { mediaFamilies } from "./media-families";
import type { MediaMetadataMap } from "./media-metadata";
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

export function mediaLibraryTags(metadata: MediaMetadataMap) {
  return [...new Set(Object.values(metadata).flatMap((entry) => entry.tags))].sort();
}

export interface MediaLibraryFilter {
  query: string; folder: string; tag: string; sort: string; accept?: string;
}

export function filterMediaLibrary(library: MediaLibrary, options: MediaLibraryFilter) {
  const query = options.query.trim().toLowerCase();
  return library.items.filter((item) => {
    const meta = library.metadata[item.path];
    return accepts(item.path, options.accept) && (!options.folder || parent(item.path) === (options.folder === "/" ? "" : options.folder)) &&
      (!options.tag || meta?.tags.includes(options.tag)) &&
      `${item.path} ${meta?.alt ?? ""} ${meta?.tags.join(" ") ?? ""} ${library.usage[item.path]?.alts.join(" ") ?? ""}`.toLowerCase().includes(query);
  }).sort((a, b) =>
    options.sort === "size" ? (b.size ?? 0) - (a.size ?? 0) || a.path.localeCompare(b.path)
    : options.sort === "date" ? (b.date ?? 0) - (a.date ?? 0) || a.path.localeCompare(b.path)
    : a.path.localeCompare(b.path));
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
