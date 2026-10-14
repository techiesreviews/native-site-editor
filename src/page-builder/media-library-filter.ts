import { uploadImageType } from "../uploads";
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

export const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
export const basename = (path: string) => path.split("/").pop()!;
