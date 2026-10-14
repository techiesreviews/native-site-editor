import { formatBytes } from "../uploads";
import { mediaFamilyOf, renamedFamily } from "./media-families";
import { mediaFileName, suggestMediaName } from "./media-names";
import { basename, formatMediaLength, mediaKind, parent } from "./media-library-filter";
import type { MediaMetadata, MediaMetadataMap } from "./media-metadata";

/** The pure rules behind File details (media build slice 14): its facts, the Image family
 * rows, what Save details writes and the new name it asks for. */

const KIND_NAMES = { image: "Image", video: "Video", audio: "Audio", document: "Document" } as const;

export interface MediaDetailFact { label: string; value: string }

/** Kind, size, length (a video's or audio file's, when recorded), dimensions (when the picture was
 * read) and folder, in that order. */
export function mediaDetailFacts(file: { path: string; size?: number; width?: number; height?: number; duration?: number }): MediaDetailFact[] {
  const kind = mediaKind(file.path), facts: MediaDetailFact[] = [{ label: "Kind", value: KIND_NAMES[kind] }];
  if (file.size !== undefined) facts.push({ label: "Size", value: formatBytes(file.size) });
  if ((kind === "video" || kind === "audio") && file.duration && file.duration > 0) facts.push({ label: "Length", value: formatMediaLength(file.duration) });
  if (file.width && file.height) facts.push({ label: "Dimensions", value: `${file.width} × ${file.height}` });
  facts.push({ label: "Folder", value: parent(file.path) || "Site root" });
  return facts;
}

/** Provenance remains visible when the original has been removed. */
export function mediaMadeFrom(record: Pick<MediaMetadata, "trimmedFrom">): MediaDetailFact[] {
  return record.trimmedFrom ? [{ label: "Made from", value: basename(record.trimmedFrom.source) }] : [];
}

export interface MediaFamilyRow { path: string; label: string; size?: string; original?: true }

/** The responsive copies (narrowest first) and kept originals of the image whose main is `path`, or
 * a video's or PDF's still picture and subtitles; undefined for anything that is not a family's main. */
export function mediaFamilyRows(path: string, items: { path: string; size?: number }[]): MediaFamilyRow[] | undefined {
  const family = mediaFamilyOf(path, items.map(item => item.path));
  if (!family) return undefined;
  const size = (member: string) => {
    const bytes = items.find(item => item.path === member)?.size;
    return bytes === undefined ? {} : { size: formatBytes(bytes) };
  };
  return [
    ...family.copies.map(copy => ({ path: copy.path, label: `Smaller copy · ${copy.width} px wide`, ...size(copy.path) })),
    ...family.originals.map(original => ({ path: original, label: "Original, kept", original: true as const, ...size(original) })),
    ...family.still ? [{ path: family.still, label: /\.pdf$/i.test(path) ? "First page picture" : "Still picture", ...size(family.still) }] : [],
    ...family.subtitles.map(subtitles => ({ path: subtitles, label: "Subtitles", ...size(subtitles) })),
  ];
}

export interface MediaDetailForm { name: string; description: string; decorative: boolean; alwaysKeep: boolean }

/** What Save details writes: the description fields only for images, and Always keep for every kind.
 * A Decorative file has no description. */
export function mediaDetailChanges(path: string, form: MediaDetailForm): Partial<MediaMetadata> {
  const keep = { alwaysKeep: form.alwaysKeep };
  if (mediaKind(path) !== "image") return keep;
  return { alt: form.decorative ? "" : form.description, decorative: form.decorative, ...keep };
}

/** The new name Save details asks for: undefined when unchanged, an error when empty or
 * holding a folder. The rename itself tidies the name and refuses taken names and new formats. */
export function mediaDetailRename(path: string, name: string): { name: string } | { error: string } | undefined {
  const next = name.trim();
  if (next === basename(path)) return undefined;
  if (!next) return { error: "Enter a file name." };
  if (/[\\/]/.test(next)) return { error: "Enter a file name without a folder." };
  return { name: next };
}

/** Where a renamed file ends up: the same folder, under the name tidied as the rename does (slice 52). */
export const mediaRenamedPath = (path: string, name: string) => {
  const folder = parent(path), file = mediaFileName(path, name);
  return folder ? `${folder}/${file}` : file;
};

export type MediaNameCheck =
  | { state: "same" }
  | { state: "problem"; message: string }
  | { state: "taken"; taken: string; suggestion: string }
  | { state: "free"; to: string };

/** What the File name field says before saving (ticket 15 "Renaming a media file"): nothing for the
 * same name, a problem, a name taken by any member of the renamed family with the next numbered
 * one, or where the file will go. The same family rule as the rename itself, over the listed `paths`;
 * the rename still checks every repository path when saving. */
export function mediaNameCheck(path: string, name: string, paths: string[]): MediaNameCheck {
  const rename = mediaDetailRename(path, name);
  if (!rename) return { state: "same" };
  if ("error" in rename) return { state: "problem", message: rename.error };
  const format = /\.[^./]+$/.exec(path)?.[0] ?? "", typed = /\.[^./]+$/.exec(rename.name)?.[0];
  if (typed && typed.toLowerCase() !== format.toLowerCase())
    return { state: "problem", message: `Keep the ${format.slice(1).toLowerCase()} format: only the name changes.` };
  const to = mediaRenamedPath(path, rename.name);
  if (to === path) return { state: "same" };
  const family = mediaFamilyOf(path, paths);
  const taken = (target: string) => (family ? renamedFamily(family, target) : [{ from: path, to: target }])
    .some(move => move.from !== move.to && paths.includes(move.to));
  return taken(to) ? { state: "taken", taken: to, suggestion: suggestMediaName(to, taken) } : { state: "free", to };
}

/** Whether File details offers Replace everywhere: a picture's main, not a Trimmed copy, not SVG. */
export function canReplaceEverywhere(path: string, paths: string[], metadata: MediaMetadataMap): boolean {
  return /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(path) && !/^media\/originals\//i.test(path) &&
    !metadata[path]?.trimmedFrom && Boolean(mediaFamilyOf(path, paths));
}
