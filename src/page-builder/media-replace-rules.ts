import { mediaFamilyOf, familyMembers } from "./media-families";
import { basename } from "./media-library-filter";
import type { MediaMetadataMap } from "./media-metadata";

/** The pure rules behind Replace everywhere in File details (media build slice 54; ticket 15
 * "Replace everywhere"): what the picker may choose, and what the confirmation says. The engine is slice 53's. */

/** The picker shows what the engine accepts as a new picture: photos and screenshots. */
export const REPLACE_ACCEPT = "image/png,image/jpeg,image/webp,image/avif";

const FORMATS: Record<string, string> = { webp: "a WebP", png: "a PNG", jpg: "a JPEG", jpeg: "a JPEG", avif: "an AVIF" };
const format = (path: string) => /\.([^./]+)$/.exec(path)?.[1].toLowerCase() ?? "";

/** A refusal for the picture chosen in the picker, or undefined when it can take the old one's place. */
export function replaceChoiceProblem(path: string, chosen: string, paths: string[]): string | undefined {
  const family = mediaFamilyOf(path, paths);
  const members = family ? familyMembers(family) : [path];
  if (members.includes(chosen)) return "That is the picture being replaced. Choose a different one.";
  if (!/^(?:png|jpe?g|webp|avif)$/.test(format(chosen))) return "Choose a JPEG, PNG, WebP or AVIF picture.";
  return undefined;
}

export interface ReplaceNoticeInput {
  path: string;
  /** The format the new picture arrives in (after preparation). */
  next: { extension: string };
  pages: number;
  /** Places that show a Trimmed copy of the old picture. */
  trims: number;
  /** The file or a member of its family is Always keep. */
  kept: boolean;
}

export interface ReplaceNotice {
  title: string;
  /** Under the box naming the pages (slice 113): the address line, then focus points, trimmed copies and where the old picture goes. */
  lines: string[];
  /** The address after replacing: the same, or the same name in the new format. */
  address: string;
  /** Present when the format changes: the old address can forward ("Keep the old address working"). */
  forward?: { label: string; hint: string; checked: boolean };
}

/** What Replace everywhere will do, in plain words, before it is confirmed. */
export function replaceNotice({ path, next, pages, trims, kept }: ReplaceNoticeInput): ReplaceNotice {
  const extension = next.extension.toLowerCase().replace(/^\./, "");
  // As the engine decides: any other extension (even .jpg for .jpeg) is a new address.
  const same = extension === format(path);
  const address = same ? path : path.replace(/\.[^./]+$/, `.${extension}`);
  const lines = [same ? "Same name and address, so links from other sites show it too."
    : `It's ${FORMATS[extension] ?? `a ${extension.toUpperCase()}`}, so its address becomes /${address}. Every mention is updated.`];
  if (pages) lines.push("Focus points go back to the middle.");
  if (trims) lines.push(`${trims === 1 ? "1 trimmed copy of it is" : `${trims} trimmed copies of it are`} replaced by the new picture in the same shape.`);
  lines.push("The old picture goes to Recently removed for 30 days.");
  return {
    title: `Replace ${basename(path)} everywhere?`, lines, address,
    ...same ? {} : { forward: {
      label: "Keep the old address working",
      hint: `Links from other sites to /${path} forward to the new address, on hosts that read the site's _redirects file.`,
      checked: kept,
    } },
  };
}

/** The confirm's box (slice 113): the pages named, up to `limit`, then how many more ("Shows on: Home, About and 3 more"). */
export function shownPages<T>(pages: T[], limit = 5): { shown: T[]; more: number } {
  return { shown: pages.slice(0, limit), more: Math.max(0, pages.length - limit) };
}

/** "Home", "Home and About", "Home, About and Work"; past three, "Home, About, Work and 2 more pages". */
export function pageList(names: string[]): string {
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more ${names.length === 4 ? "page" : "pages"}`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
}

/** After replacing, the toast (slice 113): "red-acer.webp now shows the bluebells picture on Home and About." */
export function replacedMessage(path: string, newName: string, pages: string[]): string {
  const picture = basename(newName).replace(/\.[^.]+$/, "");
  return `${basename(path)} now shows the ${picture} picture${pages.length ? ` on ${pageList(pages)}` : ""}.`;
}

/** How many Trimmed copies were made from the old picture's family. */
export function trimsOf(path: string, paths: string[], metadata: MediaMetadataMap): number {
  const family = mediaFamilyOf(path, paths);
  const members = new Set(family ? familyMembers(family) : [path]);
  return Object.values(metadata).filter(meta => meta.trimmedFrom && members.has(meta.trimmedFrom.source)).length;
}
