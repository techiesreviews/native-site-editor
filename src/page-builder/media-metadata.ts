import { removeMediaRecords, setMediaAlwaysKeep, setMediaCollections, setMediaDescription, type MediaRecords, type MediaFileRecord } from "../../shared/media-records";
import { setMediaFileDecorative } from "./media-descriptions";

export interface MediaMetadata {
  tags: string[]; alt: string; decorative?: boolean; alwaysKeep?: boolean;
  /** Read only: an agent wrote the description and Lex has not checked it (To check). */
  byAgent?: boolean;
  /** Read only: provenance of a trimmed copy, even when its source is gone. */
  trimmedFrom?: MediaFileRecord["trimmedFrom"];
  /** Read only: a video's or audio file's recorded length in seconds. */
  duration?: number;
  /** Read only: a video's recorded still picture and a video's or audio file's subtitles (slice 66). */
  still?: string; subtitles?: string; subtitlesByAgent?: boolean;
}
export type MediaMetadataMap = Record<string, MediaMetadata>;

export function cleanMediaTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** The current panel's vocabulary over the site's complete media records. */
export function mediaMetadataView(records: MediaRecords): MediaMetadataMap {
  const out: MediaMetadataMap = Object.create(null);
  for (const [path, record] of Object.entries(records.files)) out[path] = { tags: [...record.collections ?? []], alt: record.description?.text ?? "", ...(record.decorative ? { decorative: true } : {}), ...(record.alwaysKeep ? { alwaysKeep: true } : {}),
    ...(record.trimmedFrom ? { trimmedFrom: structuredClone(record.trimmedFrom) } : {}),
    // Read leniently: a wrong length is left out, never a reason to refuse the records.
    ...(typeof record.duration === "number" && Number.isFinite(record.duration) && record.duration > 0 ? { duration: record.duration } : {}),
    ...(record.description?.byAgent && record.description.text ? { byAgent: true } : {}),
    ...(record.still ? { still: record.still } : {}), ...(record.subtitles ? { subtitles: record.subtitles } : {}),
    ...(record.subtitles && record.subtitlesByAgent ? { subtitlesByAgent: true } : {}) };
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
    if (update.decorative !== undefined && update.decorative !== Boolean(before?.decorative)) next = setMediaFileDecorative(next, path, update.decorative);
    if (update.alwaysKeep !== undefined && update.alwaysKeep !== Boolean(before?.alwaysKeep)) next = setMediaAlwaysKeep(next, path, update.alwaysKeep);
  }
  return next;
}
