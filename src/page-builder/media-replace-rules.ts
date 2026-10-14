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
  /** The new picture: its name and the format it arrives in (after preparation). */
  next: { name: string; extension: string; inMedia?: boolean };
  pages: number;
  /** Places that show a Trimmed copy of the old picture. */
  trims: number;
  /** The file or a member of its family is Always keep. */
  kept: boolean;
}

export interface ReplaceNotice {
  title: string;
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
  const name = basename(path);
  const lines = [
    pages ? `${pages === 1 ? "1 page shows" : `${pages} pages show`} ${name}. ${pages === 1 ? "It" : "They"} will show the new picture instead, as will links to it from other sites.`
      : `No page shows ${name} yet. Links to it will show the new picture.`,
    same ? `It keeps the name and address /${path}. Visitors' browsers fetch the new picture at once.`
      : `The new picture is ${FORMATS[extension] ?? `a ${extension.toUpperCase()}`} picture, so its address becomes /${address}. Every mention on the site is updated.`,
  ];
  if (pages) lines.push("Each place keeps its shape; its focus point goes back to the middle.");
  if (trims) lines.push(`${trims === 1 ? "1 trimmed copy of it is" : `${trims} trimmed copies of it are`} replaced by the new picture in the same shape.`);
  if (next.inMedia) lines.push(`${next.name} also stays in Media as it is.`);
  lines.push("The old picture goes to Recently removed for 30 days.");
  return {
    title: `Replace ${name} everywhere?`, lines, address,
    ...same ? {} : { forward: {
      label: "Keep the old address working",
      hint: `Links from other sites to /${path} forward to the new address, on hosts that read the site's _redirects file.`,
      checked: kept,
    } },
  };
}

/** After replacing: what changed, and where the old picture went. */
export function replacedMessage(path: string, pages: number): string {
  const where = pages ? ` on ${pages === 1 ? "1 page" : `${pages} pages`}` : "";
  return `Replaced ${basename(path)} everywhere${where}, as a draft. The old picture is in More → Recently removed.`;
}

/** How many Trimmed copies were made from the old picture's family. */
export function trimsOf(path: string, paths: string[], metadata: MediaMetadataMap): number {
  const family = mediaFamilyOf(path, paths);
  const members = new Set(family ? familyMembers(family) : [path]);
  return Object.values(metadata).filter(meta => meta.trimmedFrom && members.has(meta.trimmedFrom.source)).length;
}
