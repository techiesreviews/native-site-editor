export interface MediaFamily {
  main: string;
  copies: { path: string; width: number }[];
  originals: string[];
  /** A video's still picture or a PDF's first-page picture: a picture beside it with the same name. */
  still?: string;
  /** A video's or audio file's subtitles: `.vtt`/`.srt` beside it with the same name. */
  subtitles: string[];
}

/** Every file of a family, the main first: removing, restoring or renaming it takes them all. */
export const familyMembers = (family: MediaFamily): string[] =>
  [family.main, ...family.copies.map(copy => copy.path), ...family.originals, ...family.still ? [family.still] : [], ...family.subtitles];

/** The widths responsive copies are made at when an image is added (ticket 07). */
export const RESPONSIVE_COPY_WIDTHS = [480, 960, 1600] as const;

const imageExtension = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|bmp|tiff?|heic|heif)$/i;
const originalPath = (path: string) => /^media\/originals\//i.test(path);
// Videos and PDFs own a still picture; videos and audio own subtitles (ticket 12 "Connecting details").
const stillOwner = /\.(?:mp4|m4v|webm|mov|ogv|mkv|avi|pdf)$/i;
const subtitlesOwner = /\.(?:mp4|m4v|webm|mov|ogv|mkv|avi|mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;
const subtitlesFile = /\.(?:vtt|srt)$/i;
const stem = (path: string) => path.replace(/\.[^./]+$/, "");
const base = (path: string) => stem(path).slice(stem(path).lastIndexOf("/") + 1);
const extension = (path: string) => path.slice(stem(path).length);
const format = (path: string) => extension(path).toLowerCase().replace(".jpeg", ".jpg");

function responsiveCopyName(path: string): { stem: string; width: number } | undefined {
  const match = /^(.*)-([1-9][0-9]*)(w?)$/.exec(stem(path));
  if (!match) return;
  const width = Number(match[2]);
  // Bare numbers are copies only at generated widths; "w" allows any positive width.
  if (!Number.isSafeInteger(width) || (!match[3] && !(RESPONSIVE_COPY_WIDTHS as readonly number[]).includes(width))) return;
  return { stem: match[1], width };
}

function adoptedCopyName(path: string): { stem: string; width: number; set?: boolean } | undefined {
  const wordpress = /^(.*)-([1-9][0-9]*)x([1-9][0-9]*)$/.exec(stem(path));
  if (wordpress && Number(wordpress[2]) <= 10000 && Number.isSafeInteger(Number(wordpress[3])))
    return { stem: wordpress[1], width: Number(wordpress[2]) };
  const bare = /^(.*)-([1-9][0-9]*)$/.exec(stem(path)), width = Number(bare?.[2]);
  if (bare && width >= 100 && width <= 10000 && !(RESPONSIVE_COPY_WIDTHS as readonly number[]).includes(width)) return { stem: bare[1], width, set: true };
}

/** A responsive copy whose main image is gone: no other image outside `media/originals/` has its base name. */
export function isLeftoverCopy(path: string, paths: readonly string[]): boolean {
  const copy = imageExtension.test(path) && !originalPath(path) ? responsiveCopyName(path) : undefined;
  return !!copy && !paths.some(other => other !== path && !originalPath(other) && imageExtension.test(other) && stem(other) === copy.stem);
}

export function mediaFamilies(paths: string[]): MediaFamily[] {
  const images = [...new Set(paths)].filter(path => !originalPath(path) && imageExtension.test(path));
  const families = new Map<string, MediaFamily>(images.map(main => [main, { main, copies: [], originals: [], subtitles: [] }]));
  const byStem = new Map<string, string[]>();
  for (const path of images) byStem.set(stem(path), [...(byStem.get(stem(path)) ?? []), path]);
  const setFormats = new Map<string, string[]>();
  // Every bare number from 100 counts toward a set, the copy widths included.
  for (const path of images) {
    const bare = /^(.*)-([1-9][0-9]*)$/.exec(stem(path)), width = Number(bare?.[2]);
    if (bare && width >= 100 && width <= 10000) setFormats.set(bare[1], [...setFormats.get(bare[1]) ?? [], format(path)]);
  }
  // Shorter stems are resolved first, so an attached copy cannot claim another copy.
  for (const path of [...images].sort((a, b) => stem(a).length - stem(b).length)) {
    const copy = responsiveCopyName(path) ?? adoptedCopyName(path);
    if (!copy) continue;
    const candidates = (byStem.get(copy.stem) ?? []).filter(main => families.has(main));
    const sameExtension = candidates.find(main => extension(main).toLowerCase() === extension(path).toLowerCase());
    const main = sameExtension ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!main) continue;
    // A hand-made set: two or more bare numbers beside a main in another format.
    if ("set" in copy && copy.set && (sameExtension || format(path) === format(main)
      || (setFormats.get(copy.stem) ?? []).filter(other => other !== format(main)).length < 2)) continue;
    families.get(main)!.copies.push({ path, width: copy.width });
    families.delete(path);
  }
  const byBase = new Map<string, MediaFamily[]>();
  for (const family of families.values()) byBase.set(base(family.main), [...(byBase.get(base(family.main)) ?? []), family]);
  for (const path of new Set(paths.filter(originalPath))) {
    const candidates = byBase.get(base(path)) ?? [];
    if (candidates.length === 1) candidates[0].originals.push(path);
    else families.set(path, { main: path, copies: [], originals: [], subtitles: [] });
  }
  // A still or subtitles file joins the one video, audio file or PDF beside it with its exact name;
  // a still must be a lone picture (no copies or original of its own). Two possible owners: neither.
  const owners = [...new Set(paths)].filter(path => !originalPath(path) && (stillOwner.test(path) || subtitlesOwner.test(path)));
  const ownersByStem = new Map<string, string[]>();
  for (const owner of owners) ownersByStem.set(stem(owner), [...ownersByStem.get(stem(owner)) ?? [], owner]);
  const attached = new Map<string, MediaFamily>(owners.map(main => [main, { main, copies: [], originals: [], subtitles: [] }]));
  const stills = new Map<string, string[]>();
  for (const [path, family] of families) {
    const owner = ownersByStem.get(stem(path))?.filter(main => stillOwner.test(main));
    if (owner?.length === 1 && !family.copies.length && !family.originals.length) stills.set(owner[0], [...stills.get(owner[0]) ?? [], path]);
  }
  // Two pictures beside one owner: neither is its still.
  for (const [main, [still, ...others]] of stills) if (!others.length) { attached.get(main)!.still = still; families.delete(still); }
  const loose = [...new Set(paths)].filter(path => !originalPath(path) && subtitlesFile.test(path));
  for (const path of loose) {
    const owner = ownersByStem.get(stem(path))?.filter(main => subtitlesOwner.test(main));
    if (owner?.length === 1) attached.get(owner[0])!.subtitles.push(path);
  }
  for (const [main, family] of attached) { family.subtitles.sort(); families.set(main, family); }
  for (const family of families.values()) family.copies.sort((a, b) => a.width - b.width || a.path.localeCompare(b.path));
  return [...families.values()];
}

/** Only a main owns the family; operating on a member alone leaves its siblings alone. */
export function mediaFamilyOf(path: string, paths: string[]): MediaFamily | undefined {
  return mediaFamilies(paths).find(family => family.main === path);
}

export function renamedFamily(family: MediaFamily, toMain: string): { from: string; to: string }[] {
  return [
    { from: family.main, to: toMain },
    ...family.copies.map(copy => ({
      from: copy.path,
      to: stem(toMain) + stem(copy.path).slice(stem(family.main).length) + extension(copy.path),
    })),
    ...family.originals.map(from => ({
      from, to: from.slice(0, from.lastIndexOf("/") + 1) + base(toMain) + extension(from),
    })),
    // A still and subtitles stay beside the main, with its new name.
    ...[...family.still ? [family.still] : [], ...family.subtitles].map(from => ({ from, to: stem(toMain) + extension(from) })),
  ];
}

/** The files that show the Always keep mark: each kept file, and the main of every Image
 * family with a kept member (a kept copy or original protects the whole family's tile). */
export function alwaysKeptFiles(paths: string[], kept: ReadonlySet<string>): Set<string> {
  const marked = new Set(paths.filter(path => kept.has(path)));
  for (const family of mediaFamilies(paths)) {
    if (familyMembers(family).some(path => kept.has(path))) marked.add(family.main);
  }
  return marked;
}
