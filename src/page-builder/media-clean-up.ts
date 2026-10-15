import { MEDIA_RECORDS_PATH, type MediaRecords } from "../../shared/media-records";
import { isLeftoverCopy, onlineStillMembers } from "./media-families";
import { mediaUsageState, type MediaUsageRecords } from "./media-usage";

export type MediaCleanUpKind = "unused" | "trimmed" | "leftover";
export interface MediaCleanUpItem { main: string; members: string[]; size: number }
export interface MediaCleanUpGroup { kind: MediaCleanUpKind; items: MediaCleanUpItem[]; count: number; size: number }
export interface MediaCleanUpSuggestions {
  state: "ready" | "not-checked" | "blocked";
  blockedBy: string[];
  groups: MediaCleanUpGroup[];
  count: number;
  size: number;
}

export function mediaCleanUpSuggestions(input: {
  usage: MediaUsageRecords | undefined;
  records: MediaRecords | null;
  sizes?: Readonly<Record<string, number | undefined>>;
}): MediaCleanUpSuggestions {
  const { usage, records, sizes } = input;
  const result: MediaCleanUpSuggestions = { state: "ready", blockedBy: [], groups: [], count: 0, size: 0 };
  if (usage?.unreadable.length || records === null) {
    result.state = "blocked";
    result.blockedBy = usage?.unreadable.length ? [...usage.unreadable] : [MEDIA_RECORDS_PATH];
    return result;
  }
  if (!usage || usage.pending.length) {
    result.state = "not-checked";
    return result;
  }

  const items: Record<MediaCleanUpKind, MediaCleanUpItem[]> = { unused: [], trimmed: [], leftover: [] };
  const paths = usage.families.flatMap(family => family.members);
  const onlineStills = onlineStillMembers(paths, records.onlineVideos);
  for (const family of usage.families) {
    if (mediaUsageState(family) !== "no-uses-found" || family.members.some(path => records.files[path]?.alwaysKeep || onlineStills.has(path))) continue;
    if (family.members.length === 1 && /^media\/originals\//i.test(family.main)) continue;
    const kind = records.files[family.main]?.trimmedFrom ? "trimmed"
      : family.members.length === 1 && isLeftoverCopy(family.main, paths) ? "leftover" : "unused";
    items[kind].push({
      main: family.main,
      members: [...family.members],
      size: family.members.reduce((sum, path) => sum + (sizes?.[path] ?? 0), 0),
    });
  }
  for (const kind of ["unused", "trimmed", "leftover"] as const) {
    const group = items[kind];
    if (!group.length) continue;
    group.sort((a, b) => a.main.localeCompare(b.main));
    const size = group.reduce((sum, item) => sum + item.size, 0);
    result.groups.push({ kind, items: group, count: group.length, size });
    result.count += group.length;
    result.size += size;
  }
  return result;
}
