import { formatBytes, uploadFileName } from "../uploads";
import { mediaFamilyOf } from "./media-families";
import { basename, mediaKind, parent } from "./media-library-filter";
import type { MediaMetadata } from "./media-metadata";

/** The pure rules behind File details (media build slice 14): its facts, the Image family
 * rows, what Save details writes and the new name it asks for. */

const KIND_NAMES = { image: "Image", video: "Video", audio: "Audio", document: "Document" } as const;

export interface MediaDetailFact { label: string; value: string }

/** Kind, size, dimensions (when the picture was read) and folder, in that order. */
export function mediaDetailFacts(file: { path: string; size?: number; width?: number; height?: number }): MediaDetailFact[] {
  const facts: MediaDetailFact[] = [{ label: "Kind", value: KIND_NAMES[mediaKind(file.path)] }];
  if (file.size !== undefined) facts.push({ label: "Size", value: formatBytes(file.size) });
  if (file.width && file.height) facts.push({ label: "Dimensions", value: `${file.width} × ${file.height}` });
  facts.push({ label: "Folder", value: parent(file.path) || "Site root" });
  return facts;
}

/** Provenance remains visible when the original has been removed. */
export function mediaMadeFrom(record: Pick<MediaMetadata, "trimmedFrom">): MediaDetailFact[] {
  return record.trimmedFrom ? [{ label: "Made from", value: basename(record.trimmedFrom.source) }] : [];
}

export interface MediaFamilyRow { path: string; label: string; size?: string; original?: true }

/** The responsive copies (narrowest first) and kept originals of the image whose main is
 * `path`; undefined for anything that is not an image family's main. */
export function mediaFamilyRows(path: string, items: { path: string; size?: number }[]): MediaFamilyRow[] | undefined {
  if (mediaKind(path) !== "image") return undefined;
  const family = mediaFamilyOf(path, items.map(item => item.path));
  if (!family) return undefined;
  const size = (member: string) => {
    const bytes = items.find(item => item.path === member)?.size;
    return bytes === undefined ? {} : { size: formatBytes(bytes) };
  };
  return [
    ...family.copies.map(copy => ({ path: copy.path, label: `Smaller copy · ${copy.width} px wide`, ...size(copy.path) })),
    ...family.originals.map(original => ({ path: original, label: "Original, kept", original: true as const, ...size(original) })),
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

/** Where a renamed file ends up: the same folder, under the tidied name. */
export const mediaRenamedPath = (path: string, name: string) => {
  const folder = parent(path), file = uploadFileName(name);
  return folder ? `${folder}/${file}` : file;
};
