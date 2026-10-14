import { mediaKind } from "./media-library-filter";
import { mediaFamilies, type MediaFamily } from "./media-families";
import { mediaVariantName } from "./media-markup";
import { suggestMediaName, tidyMediaName } from "./media-names";

export const MEDIA_IMAGES_FOLDER = "media/images";
export const MEDIA_VIDEOS_FOLDER = "media/videos";
export const MEDIA_AUDIO_FOLDER = "media/audio";
export const MEDIA_DOWNLOADS_FOLDER = "media/downloads";
export const MEDIA_ORIGINALS_FOLDER = "media/originals";

/** Raster pictures use stored Optimise settings; other files retain their bytes. */
export const mediaNeedsPreparation = (name: string) => /\.(?:jpe?g|png|webp|avif|bmp)$/i.test(name);

/** No Files destination: new files go by the kind of the file stored, not the one dropped. */
export function mediaKindFolder(path: string): string {
  return { image: MEDIA_IMAGES_FOLDER, video: MEDIA_VIDEOS_FOLDER, audio: MEDIA_AUDIO_FOLDER, document: MEDIA_DOWNLOADS_FOLDER }[mediaKind(path)];
}

const stem = (path: string) => path.replace(/\.[^./]+$/, "");

export function mediaStorageName(incoming: string, outputExtension?: string): string {
  const name = tidyMediaName(incoming);
  return outputExtension ? tidyMediaName(stem(name) + "." + outputExtension.replace(/^\./, "")) : name;
}

export const mediaCopyName = (main: string, width: number): string => mediaVariantName(main, width);

const members = (family: MediaFamily) => [family.main, ...family.copies.map(copy => copy.path), ...family.originals].sort();
const signature = (family: MediaFamily) => members(family).join("\n");
const signatures = (paths: string[]) => new Map(mediaFamilies(paths).map(family => [family.main, signature(family)]));

/** Reserve a whole family: adding it must neither adopt nor detach existing members.
 * Compared in lower case, since sites are cloned onto case-insensitive disks. */
export function chooseMediaPath(options: { folder: string; name: string; copies: number[]; original?: string; paths: Iterable<string> }): string {
  const paths = [...new Set([...options.paths].map(path => path.toLowerCase()))];
  const existing = new Set(paths), stems = new Set(paths.map(stem));
  const folders = new Set(paths.flatMap(path => path.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))));
  const before = signatures(paths);
  const folder = options.folder.replace(/^\/+|\/+$/g, "");
  const main = (folder ? folder + "/" : "") + options.name;
  const taken = (candidate: string) => {
    const planned = [candidate, ...options.copies.map(width => mediaCopyName(candidate, width)),
      ...options.original ? [MEDIA_ORIGINALS_FOLDER + "/" + stem(candidate.split("/").at(-1)!) + "." + options.original] : []]
      .map(path => path.toLowerCase());
    if (planned.some(member => existing.has(member) || folders.has(member))) return true;
    // A same-named file of another format keeps the base free for previews and unambiguous originals.
    if (stems.has(stem(candidate.toLowerCase()))) return true;
    const after = signatures([...paths, ...planned]);
    for (const [family, members] of before) if (after.get(family) !== members) return true;
    const own = [...after].filter(([, members]) => members.split("\n").some(path => planned.includes(path)));
    // Non-image downloads have no Image family; images must own precisely their planned members.
    return own.length > 0 && (own.length !== 1 || own[0][1] !== [...planned].sort().join("\n"));
  };
  return taken(main) ? suggestMediaName(main, taken) : main;
}
