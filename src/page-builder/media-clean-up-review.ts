import type { RemovedMedia } from "../../shared/media-records";
import { formatBytes } from "../uploads";
import type { MediaCleanUpGroup, MediaCleanUpItem, MediaCleanUpKind, MediaCleanUpSuggestions } from "./media-clean-up";
import { RECENTLY_REMOVED_DAYS } from "./recently-removed";

/** The Clean up review's words and sums (ticket 10, the Tiles mockup's clean-up screens). */

export const cleanUpGroupNames: Record<MediaCleanUpKind, string> = {
  unused: "Nothing uses these",
  trimmed: "Trimmed copies nothing uses",
  leftover: "Copies whose main image is gone",
};

const name = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const filesCount = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

/** A suggested family with its bytes from the library's listing; `unknown` members have no listed size. */
export interface SizedItem extends MediaCleanUpItem { unknown: number }
export interface SizedGroup extends MediaCleanUpGroup { items: SizedItem[] }
export interface SizedSuggestions extends MediaCleanUpSuggestions { groups: SizedGroup[] }

/** Suggestions with each item's size summed from the library's file sizes (copies included). */
export function sizedSuggestions(suggestions: MediaCleanUpSuggestions, sizes: Readonly<Record<string, number | undefined>>): SizedSuggestions {
  const groups = suggestions.groups.map(group => {
    const items = group.items.map(item => ({ ...item,
      size: item.members.reduce((sum, path) => sum + (sizes[path] ?? 0), 0),
      unknown: item.members.filter(path => sizes[path] === undefined).length }));
    return { ...group, items, size: items.reduce((sum, item) => sum + item.size, 0) };
  });
  return { ...suggestions, groups, size: groups.reduce((sum, group) => sum + group.size, 0) };
}

/** The bytes of some families, never claiming more than is known: nothing when no size is
 * listed, "at least 3 KB" when some are missing. */
export function bytesText(items: readonly SizedItem[]) {
  const members = items.reduce((sum, item) => sum + item.members.length, 0);
  const unknown = items.reduce((sum, item) => sum + item.unknown, 0);
  if (members && unknown === members) return "";
  const bytes = formatBytes(items.reduce((sum, item) => sum + item.size, 0));
  return unknown ? `at least ${bytes}` : bytes;
}
const withBytes = (text: string, items: readonly SizedItem[]) => { const bytes = bytesText(items); return bytes ? `${text} · ${bytes}` : text; };

/** A group card's line: "2 files · 3 KB". */
export const groupLine = (group: SizedGroup) => withBytes(filesCount(group.count), group.items);

/** Under a reviewed file: its size when known, what the check found, and the copies that go with it. */
export function itemLine(item: SizedItem) {
  const copies = item.members.length - 1, bytes = bytesText([item]);
  return `${bytes ? `${bytes} · ` : ""}No uses found${copies ? ` · with its ${copies} ${copies === 1 ? "copy" : "copies"}` : ""}`;
}

/** The limit of any check, the groups screen's one helper line. */
export const cleanUpLimit = "Files used only from outside the site? Mark them Always keep.";

/** The groups screen's title names what every group frees together: "Clean up · 271 KB". */
export function cleanUpTitle(groups: readonly SizedGroup[]) {
  const items = [...new Map(groups.flatMap(group => group.items).map(item => [item.main, item])).values()];
  return items.length ? withBytes("Clean up", items) : "Clean up";
}

/** The review's footer: "2 selected · 3 KB". */
export function selectionLine(items: readonly SizedItem[], selected: ReadonlySet<string>) {
  return withBytes(`${items.filter(item => selected.has(item.main)).length} selected`, items.filter(item => selected.has(item.main)));
}

/** Selected files still suggested: a file used meanwhile drops out of the selection. */
export function keepSelected(selected: ReadonlySet<string>, items: readonly MediaCleanUpItem[]) {
  return new Set(items.filter(item => selected.has(item.main)).map(item => item.main));
}

/** Undo after removing: each removed main's newest Recently removed entry, as `restore` takes it. */
export function undoEntries(removed: readonly RemovedMedia[] | undefined, mains: readonly string[]) {
  const entries: { path: string; id: string }[] = [];
  for (const path of mains) {
    const entry = removed?.find(candidate => candidate.path === path && (candidate.sha ?? candidate.browserKey));
    if (entry) entries.push({ path, id: (entry.sha ?? entry.browserKey)! });
  }
  return entries;
}

/** What Media says after Clean up removed files, and after Undo. */
export const cleanedMessage = (mains: readonly string[]) =>
  `Removed ${mains.length === 1 ? name(mains[0]) : filesCount(mains.length)}. ${mains.length === 1 ? "It stays" : "They stay"} in Recently removed for ${RECENTLY_REMOVED_DAYS} days.`;
export const undoneMessage = (mains: readonly string[]) =>
  `Brought back ${mains.length === 1 ? name(mains[0]) : filesCount(mains.length)} to ${mains.length === 1 ? "its address" : "their addresses"}.`;
