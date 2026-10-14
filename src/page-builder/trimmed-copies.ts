import { removeMediaRecords, type MediaRecords, type MediaTrim } from "../../shared/media-records";
import { mediaFamilyOf } from "./media-families";
import { chooseMediaPath, mediaCopyName, mediaStorageName, MEDIA_IMAGES_FOLDER } from "./media-storage";
import { isTrim } from "./trim-geometry";

/** The pure rules behind Trimmed copies (media build slice 40). The geometry lives apart, so the
 * image worker loads it without the naming and records code. */
export { validTrim, isTrim, trimGeometry } from "./trim-geometry";

export function trimStart(records: MediaRecords, path: string, paths: Iterable<string>): { source: string; trim?: MediaTrim; previous?: string } {
  const from = records.files[path]?.trimmedFrom;
  return from && new Set(paths).has(from.source) ? { source: from.source, trim: structuredClone(from.trim), previous: path } : { source: path };
}

export function trimmedCopyPath(options: { source: string; extension: string; copies: number[]; paths: Iterable<string>; previous?: string }): string {
  if (!/^[a-z0-9]+$/i.test(options.extension)) throw new Error("Choose a supported image extension.");
  const source = mediaStorageName(options.source, options.extension).replace(/\.[^./]+$/, "");
  const base = source + "-crop", name = mediaStorageName(base + "." + options.extension, options.extension);
  const previous = options.previous && mediaStorageName(options.previous).replace(/\.[^./]+$/, "");
  const suffix = previous?.startsWith(base + "-") ? previous.slice(base.length + 1) : undefined;
  const number = previous === base ? 1 : suffix && /^[1-9]\d*$/.test(suffix) ? Number(suffix) : 0;
  if (!Number.isSafeInteger(number) || number >= Number.MAX_SAFE_INTEGER) throw new Error("This trim's name has too many numbered copies.");
  const paths = [...options.paths];
  const path = chooseMediaPath({ folder: MEDIA_IMAGES_FOLDER, name, copies: options.copies, paths,
    minimum: number + 1 });
  const taken = new Set(paths.map(path => path.toLowerCase()));
  if ([path, ...options.copies.map(width => mediaCopyName(path, width))].some(member => taken.has(member.toLowerCase())) ||
    path.toLowerCase() === options.previous?.toLowerCase()) throw new Error("A trimmed copy must have a fresh address.");
  return path;
}

/** Pass actual repository paths for family removal; records alone need not list every copy. */
export function planTrimmedCopy(options: { records: MediaRecords; source: string; trim: MediaTrim; path: string; previous?: string; previousStillUsed: boolean; paths?: Iterable<string> }): { records: MediaRecords; removes: string[] } {
  const { records, source, trim, path, previous } = options;
  if (!isTrim(trim)) throw new Error("The picture has not been trimmed.");
  if (path === source || path === previous) throw new Error("A trimmed copy must have a fresh address.");
  const paths = [...options.paths ?? Object.keys(records.files)];
  const family = previous ? mediaFamilyOf(previous, paths) : undefined;
  const members = previous ? [previous, ...family?.copies.map(copy => copy.path) ?? [], ...family?.originals ?? []] : [];
  const removes = !options.previousStillUsed && !members.some(member => records.files[member]?.alwaysKeep) ?
    members.filter(member => member !== source) : [];
  const carry = records.files[previous ?? source];
  const next = removeMediaRecords(records, removes);
  return { records: { ...next, files: { ...next.files, [path]: {
    trimmedFrom: { source, trim: structuredClone(trim) },
    ...(carry?.description ? { description: structuredClone(carry.description) } : {}),
    ...(carry?.decorative ? { decorative: true as const } : {}),
  } } }, removes };
}
