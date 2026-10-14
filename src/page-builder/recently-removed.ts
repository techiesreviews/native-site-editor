import { removeMediaRecords, type MediaRecords, type RemovedMedia, type RemovedPath } from "../../shared/media-records";
import { mediaFamilyOf } from "./media-families";
import type { UploadBytes } from "../uploads";

export const RECENTLY_REMOVED_DAYS = 30;
export const removedToday = (now: number) => new Date(now).toISOString().slice(0, 10);
const expired = (date: string, today: string) => Date.parse(today) - Date.parse(date) > RECENTLY_REMOVED_DAYS * 86400000;
const identity = (entry: RemovedPath) => entry.sha ?? entry.browserKey;
/** The Git blob SHA of a removed file's bytes: its history blob, or the one inside its browser key. */
export const removedBlob = (entry: RemovedPath) => entry.sha ?? /^removed:\d{4}-\d{2}-\d{2}:(.+)$/.exec(entry.browserKey ?? "")?.[1];
/** Every path a removed entry names, to look up which of them are back. */
export const removedPaths = (records: MediaRecords) => records.removed?.flatMap(entry => [entry.path, ...entry.family?.map(member => member.path) ?? []]) ?? [];

export function recordRemoval(records: MediaRecords, removal: { main: string; family: RemovedPath[]; date: string }): MediaRecords {
  const members = removal.family.map(member => ({ ...member, ...(records.files[member.path] ? { record: records.files[member.path] } : {}) }));
  const main = members.find(member => member.path === removal.main);
  if (!main) throw new Error(`${removal.main} has no removal identity.`);
  return { ...removeMediaRecords(records, members.map(member => member.path)), removed: [
    ...records.removed ?? [], { ...main, date: removal.date, family: members.filter(member => member.path !== removal.main) },
  ] };
}

/**
 * Drops expired entries and entries whose file is back already (the Files tab's or Save's Restore of an
 * unsaved deletion): their records return to the files, so a description or collection is never lost.
 * `current` gives the Git blob SHA of a path's present bytes (undefined when it is not there).
 */
export function pruneRemoved(records: MediaRecords, today: string, current?: (path: string) => string | undefined): MediaRecords {
  let files = records.files;
  const removed = records.removed?.filter(entry => {
    if (expired(entry.date, today)) return false;
    const blob = removedBlob(entry);
    if (!blob || current?.(entry.path) !== blob) return true;
    for (const member of [entry, ...entry.family ?? []]) {
      if (!member.record || Object.hasOwn(files, member.path) || (member !== entry && current(member.path) === undefined)) continue;
      files = Object.assign(Object.create(null), files, { [member.path]: member.record });
    }
    return false;
  });
  return { ...records, files, removed };
}

export function recentlyRemoved(records: MediaRecords, today: string, current: (path: string) => string | undefined): RemovedMedia[] {
  // Same-day removals have only their append order to tell which came last.
  return [...pruneRemoved(records, today, current).removed ?? []].reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function planRestore(records: MediaRecords, entry: { path: string; id: string }, paths: readonly string[], today: string) {
  const next = pruneRemoved(records, today);
  // Repeated removals can have the same blob identity; choose the newest entry, as the list does.
  const found = recentlyRemoved(next, today, () => undefined).find(item => item.path === entry.path && identity(item) === entry.id);
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

/** The Files tab's removals, one entry per family; a member without a blob SHA or browser key is not recorded. */
export function recordFileRemovals(records: MediaRecords, files: RemovedPath[], paths: string[], today: string, current: (path: string) => string | undefined): MediaRecords {
  let next = pruneRemoved(records, today, current);
  const members = new Map(files.filter(file => file.sha || file.browserKey).map(file => [file.path, file]));
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
