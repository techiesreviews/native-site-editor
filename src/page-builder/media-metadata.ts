export const MEDIA_METADATA_PATH = ".editor/media.json";
export interface MediaMetadata { tags: string[]; alt: string }
export type MediaMetadataMap = Record<string, MediaMetadata>;

/** Invalid metadata is reported, never silently overwritten. */
export function parseMediaMetadata(source = "{}"): MediaMetadataMap {
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("media.json must contain an object of image paths.");
  const out: MediaMetadataMap = Object.create(null);
  for (const [path, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid image metadata for ${path}.`);
    const item = entry as Partial<MediaMetadata>;
    if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string"))) throw new Error(`Invalid tags for ${path}.`);
    if (item.alt !== undefined && typeof item.alt !== "string") throw new Error(`Invalid alt text for ${path}.`);
    out[path] = { tags: cleanMediaTags(item.tags ?? []), alt: item.alt ?? "" };
  }
  return out;
}

export function cleanMediaTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function mergeMediaMetadata(source: string | undefined, changes: Record<string, Partial<MediaMetadata> | null>): string {
  const validated = parseMediaMetadata(source);
  const merged = JSON.parse(source ?? "{}") as Record<string, Record<string, unknown>>;
  for (const [path, update] of Object.entries(changes)) {
    if (update === null) { delete merged[path]; continue; }
    const before = validated[path] ?? { tags: [], alt: "" };
    Object.defineProperty(merged, path, { value: { ...merged[path], tags: cleanMediaTags(update.tags ?? before.tags), alt: update.alt ?? before.alt }, enumerable: true, configurable: true, writable: true });
  }
  return `${JSON.stringify(Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`;
}
