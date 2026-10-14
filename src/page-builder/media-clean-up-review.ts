import type { RemovedMedia } from "../../shared/media-records";
import { formatBytes } from "../uploads";
import type { MediaCleanUpGroup, MediaCleanUpItem, MediaCleanUpKind, MediaCleanUpSuggestions } from "./media-clean-up";
import { mediaUsageState } from "./media-usage-text";
import { RECENTLY_REMOVED_DAYS } from "./recently-removed";
import type { MediaUsageRecords } from "./media-usage";

/** The Clean up review's words and sums (ticket 10, the Tiles mockup's clean-up screens). */

export const cleanUpGroupNames: Record<MediaCleanUpKind, string> = {
  unused: "Nothing uses these",
  trimmed: "Trimmed copies nothing uses",
  leftover: "Copies whose main image is gone",
};

const name = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const filesCount = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

/** Suggestions with each item's size summed from the library's file sizes (copies included). */
export function sizedSuggestions(suggestions: MediaCleanUpSuggestions, sizes: Readonly<Record<string, number | undefined>>): MediaCleanUpSuggestions {
  const groups = suggestions.groups.map(group => {
    const items = group.items.map(item => ({ ...item, size: item.members.reduce((sum, path) => sum + (sizes[path] ?? 0), 0) }));
    return { ...group, items, size: items.reduce((sum, item) => sum + item.size, 0) };
  });
  return { ...suggestions, groups, size: groups.reduce((sum, group) => sum + group.size, 0) };
}

/** A group card's line: "2 files · 3 KB". */
export const groupLine = (group: Pick<MediaCleanUpGroup, "count" | "size">) => `${filesCount(group.count)} · ${formatBytes(group.size)}`;

/** Under a reviewed file: what the check found, and the copies that go with it. */
export function itemLine(item: MediaCleanUpItem) {
  const copies = item.members.length - 1;
  return `${formatBytes(item.size)} · No uses found${copies ? ` · with its ${copies} ${copies === 1 ? "copy" : "copies"}` : ""}`;
}

/** What the check covered and what it kept apart, so "no uses found" is read for what it is:
 * checked files with no uses (offered), files only other site files use (kept), and files not
 * checked yet (never offered). Families count once. */
export function cleanUpScope(records: MediaUsageRecords | undefined, kept: number) {
  const tally = { checked: 0, otherUses: 0, notChecked: 0 };
  for (const family of records?.families ?? []) {
    const state = mediaUsageState(family);
    if (state === "not-checked") tally.notChecked++;
    else { tally.checked++; if (state === "other-uses-only") tally.otherUses++; }
  }
  const lines = [`Checked ${filesCount(tally.checked)} against every page, style, script, feed, data and notes file on the site.`];
  if (tally.otherUses) lines.push(`${filesCount(tally.otherUses)} only other site files use ${tally.otherUses === 1 ? "is" : "are"} kept out of Clean up.`);
  if (tally.notChecked) lines.push(`${filesCount(tally.notChecked)} not checked yet ${tally.notChecked === 1 ? "is" : "are"} never suggested.`);
  if (kept) lines.push(`${filesCount(kept)} marked Always keep ${kept === 1 ? "is" : "are"} never suggested.`);
  return { ...tally, lines };
}

/** The limit of any check, said once on the first screen. */
export const cleanUpLimit = "No uses found is not a guarantee. A file used from outside the site (a shared PDF, a newsletter picture) or by an address a script builds cannot be seen. Mark such files Always keep in their details.";

/** The review's footer: "2 selected · 3 KB". */
export function selectionLine(items: readonly MediaCleanUpItem[], selected: ReadonlySet<string>) {
  const chosen = items.filter(item => selected.has(item.main));
  return `${chosen.length} selected · ${formatBytes(chosen.reduce((sum, item) => sum + item.size, 0))}`;
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
