import type { MediaOtherUseKind, MediaUsageRecord, MediaUsageRecords } from "./media-usage";

/** The record of the family `path` belongs to; a path the check has not reached is Not checked yet. */
export function mediaUsageFor(records: MediaUsageRecords | undefined, path: string): MediaUsageRecord {
  return records?.families.find(family => family.members.includes(path))
    ?? { main: path, members: [path], checked: false, pages: [], otherUses: [] };
}

export type MediaUsageState = "not-checked" | "used-on-pages" | "other-uses-only" | "no-uses-found";
/** Zero page uses alone never means unused: other uses and an unfinished check are their own states. */
export function mediaUsageState(record: MediaUsageRecord): MediaUsageState {
  if (!record.checked) return "not-checked";
  if (record.pages.length) return "used-on-pages";
  return record.otherUses.length ? "other-uses-only" : "no-uses-found";
}

/** A tile's usage badge (media-manager ticket 06): the number of distinct pages, and the words
 * hover, focus and screen readers get. Not checked yet shows "?", never 0. */
export function mediaUsageBadge(record: MediaUsageRecord): { state: MediaUsageState; count: string; label: string } {
  const state = mediaUsageState(record), pages = record.pages.length;
  const label = state === "not-checked" ? "Not checked yet"
    : state === "used-on-pages" ? `Used on ${pages} ${pages === 1 ? "page" : "pages"}`
    : state === "other-uses-only" ? "0 pages · Other uses found"
    : "No uses found";
  return { state, count: state === "not-checked" ? "?" : String(pages), label };
}

const OTHER_USES: Record<MediaOtherUseKind, string> = {
  stylesheet: "Style sheet", component: "Component", sharing: "Sharing preview", settings: "Site settings",
  file: "Other file", script: "Script", data: "Data file", feed: "Feed or sitemap", notes: "Notes",
};
/** Where an other use was found, in plain words. */
export const mediaOtherUseLabel = (kind: MediaOtherUseKind) => OTHER_USES[kind];
