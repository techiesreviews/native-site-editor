import { removeMediaRecords, type MediaRecords, type RemovedMedia, type RemovedPath } from "../../shared/media-records";
import { mediaFamilyOf } from "./media-families";
import type { UploadBytes } from "../uploads";

export const RECENTLY_REMOVED_DAYS = 30;
export const removedToday = (now: number) => new Date(now).toISOString().slice(0, 10);
const expired = (date: string, today: string) => Date.parse(today) - Date.parse(date) > RECENTLY_REMOVED_DAYS * 86400000;
const identity = (entry: RemovedPath) => entry.sha ?? entry.browserKey;

export function recordRemoval(records: MediaRecords, removal: { main: string; family: RemovedPath[]; date: string }): MediaRecords {
  const members = removal.family.map(member => ({ ...member, ...(records.files[member.path] ? { record: records.files[member.path] } : {}) }));
  const main = members.find(member => member.path === removal.main);
  if (!main) throw new Error(`${removal.main} has no removal identity.`);
  return { ...removeMediaRecords(records, members.map(member => member.path)), removed: [
    ...records.removed ?? [], { ...main, date: removal.date, family: members.filter(member => member.path !== removal.main) },
  ] };
}

export function pruneRemoved(records: MediaRecords, today: string, current?: (path: string) => string | undefined): MediaRecords {
  return { ...records, removed: records.removed?.filter(entry => !expired(entry.date, today) && !(entry.sha && current?.(entry.path) === entry.sha)) };
}

export function recentlyRemoved(records: MediaRecords, today: string, current: (path: string) => string | undefined): RemovedMedia[] {
  // Same-day removals have only their append order to tell which came last.
  return [...pruneRemoved(records, today, current).removed ?? []].reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function planRestore(records: MediaRecords, entry: { path: string; id: string }, paths: readonly string[], today: string) {
  const next = pruneRemoved(records, today);
  const found = next.removed?.find(item => item.path === entry.path && identity(item) === entry.id);
  if (!found) throw new Error(`${entry.path} is no longer in Recently removed.`);
  const members = [found, ...found.family ?? []];
  for (const member of members) {
    const taken = paths.find(path => path === member.path || path.startsWith(member.path + "/") || member.path.startsWith(path + "/"));
    if (taken) throw new Error(`${taken} already exists.`);
  }
  const files = Object.assign(Object.create(null), next.files) as MediaRecords["files"];
  for (const member of members) if (member.record) files[member.path] = member.record;
  return {
    members: members.map(member => member.sha ? { path: member.path, sha: member.sha } : { path: member.path, browserKey: member.browserKey! }),
    records: { ...next, files, removed: next.removed!.filter(item => item !== found) },
  };
}

export async function sweepRemovedCopies(store: UploadBytes, today: string): Promise<void> {
  for (const key of await store.keys()) {
    const date = /^removed:(\d{4}-\d{2}-\d{2}):/.exec(key)?.[1];
    if (date && expired(date, today)) await store.delete(key);
  }
}

/** Files discards unsaved bytes; only repository blobs can return after saving. */
export function recordFileRemovals(records: MediaRecords, files: { path: string; sha?: string }[], paths: string[], today: string, current: (path: string) => string | undefined): MediaRecords {
  let next = pruneRemoved(records, today, current);
  const members = new Map(files.filter(file => file.sha).map(file => [file.path, file]));
  const familyPaths = (path: string) => {
    const family = mediaFamilyOf(path, paths);
    return [path, ...family?.copies.map(copy => copy.path) ?? [], ...family?.originals ?? []];
  };
  for (const file of [...members.values()].sort((a, b) => familyPaths(b.path).length - familyPaths(a.path).length)) {
    if (!members.has(file.path)) continue;
    const group = familyPaths(file.path).flatMap(path => members.has(path) ? [members.get(path)!] : []);
    next = recordRemoval(next, { main: file.path, family: group, date: today });
    for (const member of group) members.delete(member.path);
  }
  return next;
}
