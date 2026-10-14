import type { RemovedMedia } from "../../shared/media-records";
import type { MediaUsage } from "./media-references";
import { RECENTLY_REMOVED_DAYS } from "./recently-removed";

/** One row of the Recently removed list (ticket 10): what Lex reads and what Restore sends. */
export interface RemovedRow {
  path: string; name: string;
  /** The engine's identity: the blob SHA, or the browser copy's key. */
  id: string;
  /** "Removed today", "Removed yesterday", "Removed 12 Oct". */
  when: string;
  /** "29 days left", "1 day left", "Last day". */
  left: string;
  /** The family members that come back with it (copies, kept original). */
  members: number;
  /** Local folders keep the bytes in this browser only. */
  browserOnly: boolean;
}

const DAY = 86400000;
const name = (path: string) => path.split("/").pop()!;

export function removedRows(removed: readonly RemovedMedia[], today: string): RemovedRow[] {
  return removed.flatMap(entry => {
    const id = entry.sha ?? entry.browserKey;
    if (!id) return [];
    const age = Math.max(0, Math.round((Date.parse(today) - Date.parse(entry.date)) / DAY));
    const left = RECENTLY_REMOVED_DAYS - age;
    const date = new Date(Date.parse(entry.date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return [{
      path: entry.path, name: name(entry.path), id,
      when: age === 0 ? "Removed today" : age === 1 ? "Removed yesterday" : `Removed ${date}`,
      left: left <= 0 ? "Last day" : `${left} ${left === 1 ? "day" : "days"} left`,
      members: entry.family?.length ?? 0, browserOnly: !entry.sha,
    }];
  });
}

/** The family line under a row's name. */
export const removedMembersLabel = (members: number) =>
  members ? `Comes back with its ${members} ${members === 1 ? "copy" : "copies"}` : "";

/** A restore refusal in plain words: a taken address, or a browser copy that is gone. */
export function restoreRefusal(error: unknown, path: string) {
  const message = error instanceof Error ? error.message : "";
  const taken = /^(.+) already exists\.$/.exec(message)?.[1];
  if (taken) return `${name(path)} cannot come back: ${taken} is there now. Rename or remove that file first, then restore.`;
  return message || `${name(path)} could not be restored.`;
}

/** What the Remove confirmation says (ticket 10): the pages using the files and that their pictures
 * will break, other mentions, and where the files go. Pages come once, in the order found. */
export function removalNotice(paths: readonly string[], usage: Record<string, MediaUsage | undefined>) {
  const pages = [...new Set(paths.flatMap(path => usage[path]?.pages ?? []))];
  const others = [...new Set(paths.flatMap(path => usage[path]?.files.filter(file => !usage[path]!.pages.includes(file)) ?? []))];
  const one = paths.length === 1, it = one ? "this file" : "these files", them = one ? "it" : "them";
  const title = one ? `Remove ${name(paths[0])}?` : `Remove ${paths.length} files?`;
  const warning = pages.length
    ? `${pages.length === 1 ? "1 page uses" : `${pages.length} pages use`} ${it}. ${pages.length === 1 ? "The picture on it" : "Their pictures"} will break until you choose another picture or restore ${them}. Open a page to swap the picture first, or remove ${them} anyway.`
    : others.length ? `No page uses ${it}, but other site files mention ${them}.` : `Nothing on the site uses ${it}.`;
  const note = `${one ? "It stays" : "They stay"} in More → Recently removed for ${RECENTLY_REMOVED_DAYS} days, and Restore brings ${them} back, even after publishing.`;
  return { title, pages, others, warning, note, confirm: one ? "Remove file" : `Remove ${paths.length} files`, used: pages.length > 0 };
}

/** What Media says after removing. */
export const removedMessage = (paths: readonly string[]) =>
  `Removed ${paths.length === 1 ? name(paths[0]) : `${paths.length} files`}. Restore ${paths.length === 1 ? "it" : "them"} from More → Recently removed.`;
