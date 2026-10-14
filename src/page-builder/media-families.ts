export interface MediaFamily {
  main: string;
  copies: { path: string; width: number }[];
  originals: string[];
  // Phase 5 adds video stills and subtitles alongside these members.
}

/** The widths responsive copies are made at when an image is added (ticket 07). */
export const RESPONSIVE_COPY_WIDTHS = [480, 960, 1600] as const;

const imageExtension = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|bmp|tiff?|heic|heif)$/i;
const originalPath = (path: string) => /^media\/originals\//i.test(path);
const stem = (path: string) => path.replace(/\.[^./]+$/, "");
const base = (path: string) => stem(path).slice(stem(path).lastIndexOf("/") + 1);
const extension = (path: string) => path.slice(stem(path).length);

function responsiveCopyName(path: string): { stem: string; width: number } | undefined {
  const match = /^(.*)-([1-9][0-9]*)(w?)$/.exec(stem(path));
  if (!match) return;
  const width = Number(match[2]);
  // Bare numbers are copies only at generated widths; "w" allows any positive width.
  if (!Number.isSafeInteger(width) || (!match[3] && !(RESPONSIVE_COPY_WIDTHS as readonly number[]).includes(width))) return;
  return { stem: match[1], width };
}

/** A responsive copy whose main image is gone: no other image outside `media/originals/` has its base name. */
export function isLeftoverCopy(path: string, paths: readonly string[]): boolean {
  const copy = imageExtension.test(path) && !originalPath(path) ? responsiveCopyName(path) : undefined;
  return !!copy && !paths.some(other => other !== path && !originalPath(other) && imageExtension.test(other) && stem(other) === copy.stem);
}

export function mediaFamilies(paths: string[]): MediaFamily[] {
  const images = [...new Set(paths)].filter(path => !originalPath(path) && imageExtension.test(path));
  const families = new Map<string, MediaFamily>(images.map(main => [main, { main, copies: [], originals: [] }]));
  const byStem = new Map<string, string[]>();
  for (const path of images) byStem.set(stem(path), [...(byStem.get(stem(path)) ?? []), path]);
  // Shorter stems are resolved first, so an attached copy cannot claim another copy.
  for (const path of [...images].sort((a, b) => stem(a).length - stem(b).length)) {
    const copy = responsiveCopyName(path);
    if (!copy) continue;
    const candidates = (byStem.get(copy.stem) ?? []).filter(main => families.has(main));
    const sameExtension = candidates.find(main => extension(main).toLowerCase() === extension(path).toLowerCase());
    const main = sameExtension ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!main) continue;
    families.get(main)!.copies.push({ path, width: copy.width });
    families.delete(path);
  }
  const byBase = new Map<string, MediaFamily[]>();
  for (const family of families.values()) byBase.set(base(family.main), [...(byBase.get(base(family.main)) ?? []), family]);
  for (const path of new Set(paths.filter(originalPath))) {
    const candidates = byBase.get(base(path)) ?? [];
    if (candidates.length === 1) candidates[0].originals.push(path);
    else families.set(path, { main: path, copies: [], originals: [] });
  }
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
  ];
}
