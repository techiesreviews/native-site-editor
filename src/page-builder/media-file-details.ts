import { trimmableImages } from "../../shared/media-kinds";
import { formatBytes } from "../uploads";
import { mediaFamilyOf, renamedFamily } from "./media-families";
import { mediaFileName, suggestMediaName } from "./media-names";
import { basename, formatMediaLength, mediaKind, parent } from "./media-library-filter";
import type { MediaMetadata, MediaMetadataMap } from "./media-metadata";

/** The pure rules behind File details (media build slice 14): its facts, the Image family
 * rows, what Save details writes and the new name it asks for. */

export type MediaFactKey = "format" | "dimensions" | "length" | "size" | "folder";
export interface MediaDetailFact { key: MediaFactKey; value: string }

/** A file's format as people name it: "WebP", else its extension in capitals ("JPG", "PDF", "ZIP"). */
export const mediaFormatName = (path: string) => {
  const extension = /\.([^./]+)$/.exec(path)?.[1].toLowerCase();
  return !extension ? "File" : extension === "webp" ? "WebP" : extension.toUpperCase();
};

/** When a file was added, as the reader's calendar says it (slice 108, as Shopify and Squarespace):
 * "Added 14 Oct", with the year only when it is not this year. */
export function formatMediaAdded(time: number, locale?: string, timeZone?: string, now = Date.now()) {
  const year = (at: number) => new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(at);
  return `Added ${new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "short", timeZone, ...year(time) === year(now) ? {} : { year: "numeric" },
  }).format(time)}`;
}

/** The facts of File details' one line (slice 108): format, dimensions (when read), length (a
 * video's or audio file's, when known), size (when known) and folder, in that order. */
export function mediaDetailFacts(file: { path: string; size?: number; width?: number; height?: number; duration?: number }): MediaDetailFact[] {
  const kind = mediaKind(file.path), facts: MediaDetailFact[] = [{ key: "format", value: mediaFormatName(file.path) }];
  if (file.width && file.height) facts.push({ key: "dimensions", value: `${file.width} × ${file.height}` });
  if ((kind === "video" || kind === "audio") && file.duration && file.duration > 0) facts.push({ key: "length", value: formatMediaLength(file.duration) });
  if (file.size !== undefined) facts.push({ key: "size", value: formatBytes(file.size) });
  facts.push({ key: "folder", value: parent(file.path) || "Site root" });
  return facts;
}

/** Provenance remains visible when the original has been removed. */
export function mediaMadeFrom(record: Pick<MediaMetadata, "trimmedFrom">): string | undefined {
  return record.trimmedFrom ? `Made from ${basename(record.trimmedFrom.source)}` : undefined;
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
    ...family.copies.map(copy => ({ path: copy.path, label: `Smaller copy · ${copy.width} px`, ...size(copy.path) })),
    ...family.sharing ? [{ path: family.sharing, label: "Sharing picture", ...size(family.sharing) }] : [],
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
  return trimmableImages.test(path) && !/^media\/originals\//i.test(path) &&
    !metadata[path]?.trimmedFrom && Boolean(mediaFamilyOf(path, paths));
}

/** What File details' fields hold, as one comparable value (slice 123): the Save bar shows while it
 * differs from the value the screen opened with. A tick box counts by its tick, a field by its words. */
export function mediaDetailFormState(controls: { checkbox: boolean; checked: boolean; value: string }[]): string {
  return JSON.stringify(controls.map(control => control.checkbox ? control.checked : control.value));
}

/** The ⋯ menu of a file in File details (slices 108, 123): Copy path, Download, then Remove… last, in red. */
export function mediaFileMenu(run: { copy: () => void; download: () => void; remove: () => void }) {
  return [
    { label: "Copy path", run: run.copy },
    { label: "Download", run: run.download },
    { label: "Remove…", run: run.remove, danger: true },
  ];
}
