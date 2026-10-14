import { removeMediaRecords, setMediaCollections, setMediaDescription, type MediaRecords } from "../../shared/media-records";

export interface MediaMetadata { tags: string[]; alt: string }
export type MediaMetadataMap = Record<string, MediaMetadata>;

export function cleanMediaTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** The current panel's vocabulary over the site's complete media records. */
export function mediaMetadataView(records: MediaRecords): MediaMetadataMap {
  const out: MediaMetadataMap = Object.create(null);
  for (const [path, record] of Object.entries(records.files)) out[path] = { tags: [...record.collections ?? []], alt: record.description?.text ?? "" };
  return out;
}

export function applyMediaMetadata(records: MediaRecords, changes: Record<string, Partial<MediaMetadata> | null>): MediaRecords {
  let next = records;
  for (const [path, update] of Object.entries(changes)) {
    if (update === null) { next = removeMediaRecords(next, [path]); continue; }
    // Only changed fields are written, so an unchanged description keeps its by-agent mark.
    const before = next.files[path];
    if (update.tags !== undefined && cleanMediaTags(update.tags).join("\n") !== (before?.collections ?? []).join("\n")) next = setMediaCollections(next, path, update.tags);
    if (update.alt !== undefined && update.alt !== (before?.description?.text ?? "")) next = setMediaDescription(next, path, update.alt);
  }
  return next;
}
