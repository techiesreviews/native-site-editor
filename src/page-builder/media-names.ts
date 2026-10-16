import { renamableMedia } from "../../shared/media-kinds";
// Media naming rules shared by every rename (Images, Files, agents): small, so the Files tab
// checks a typed name at once while the rename plan (media-rename.ts) loads on demand.
const stem = (path: string) => path.replace(/\.[^./]+$/, "");
const extension = (path: string) => path.slice(stem(path).length);

/** Media kinds the media plan renames (what the Media screen lists); fonts, archives and the rest are plain files. */
export const isRenamableMedia = (path: string) => renamableMedia.test(path);

/** Basename only; the caller supplies the actual file format. */
export function tidyMediaName(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? "";
  const tidy = (value: string) => value.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  const ext = extension(base).slice(1).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return (tidy(stem(base)) || "media") + (ext ? "." + ext : "");
}

export class MediaNameTakenError extends Error {
  constructor(public taken: string, public suggestion: string) {
    super(`${taken} is taken. Try ${suggestion}.`);
    this.name = "MediaNameTakenError";
  }
}

/** The candidates describe the entire destination family, not just its main. */
export function suggestMediaName(to: string, taken: (candidate: string) => boolean, from = 2): string {
  for (let number = Math.max(2, from); ; number++) {
    const candidate = `${stem(to)}-${number}${extension(to)}`;
    if (!taken(candidate)) return candidate;
  }
}

/** A typed new name for the media file at `path`: tidied, in the file's own format when none is typed. */
export function mediaFileName(path: string, name: string): string {
  return tidyMediaName(/\.[^./]+$/.test(name) ? name : name + extension(path));
}
