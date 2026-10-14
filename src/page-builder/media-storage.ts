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

const base = (path: string) => stem(path.slice(path.lastIndexOf("/") + 1));

/** Reserve a whole family: adding it must neither adopt nor detach existing members.
 * Compared in lower case, since sites are cloned onto case-insensitive disks. */
export function chooseMediaPath(options: { folder: string; name: string; copies: number[]; original?: string; paths: Iterable<string> }): string {
  const paths = [...new Set([...options.paths].map(path => path.toLowerCase()))];
  const existing = new Set(paths), stems = new Set(paths.map(stem));
  const folders = new Set(paths.flatMap(path => path.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))));
  // Originals match their main by base in any folder, so a base used there is never free.
  const originalBases = new Set(paths.filter(path => path.startsWith(MEDIA_ORIGINALS_FOLDER + "/")).map(base));
  const before = signatures(paths);
  const folder = options.folder.replace(/^\/+|\/+$/g, "");
  const main = (folder ? folder + "/" : "") + options.name;
  const taken = (candidate: string) => {
    const planned = [candidate, ...options.copies.map(width => mediaCopyName(candidate, width)),
      ...options.original ? [MEDIA_ORIGINALS_FOLDER + "/" + base(candidate) + "." + options.original] : []]
      .map(path => path.toLowerCase());
    if (planned.some(member => existing.has(member) || folders.has(member))) return true;
    // A same-named file of another format keeps the base free for previews and unambiguous originals.
    if (stems.has(stem(candidate.toLowerCase())) || originalBases.has(base(candidate.toLowerCase()))) return true;
    const after = signatures([...paths, ...planned]);
    for (const [family, members] of before) if (after.get(family) !== members) return true;
    // No family the new files are in may take an existing file. (Files dropped into media/originals/
    // stay apart from each other, so this must not require them to form one family.)
    const own = new Set(planned);
    return [...after.values()].some(members => {
      const list = members.split("\n");
      return list.some(path => own.has(path)) && list.some(path => !own.has(path));
    });
  };
  return taken(main) ? suggestMediaName(main, taken) : main;
}
