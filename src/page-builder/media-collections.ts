import { parseMediaRecords, setMediaCollections, type MediaFileRecord, type MediaRecords } from "../../shared/media-records";
import { mediaFamilies } from "./media-families";

export type MediaCollectionChange =
  | { kind: "new"; name: string; paths?: string[] }
  | { kind: "add" | "take-out"; name: string; paths: string[] }
  | { kind: "rename"; from: string; to: string }
  | { kind: "delete"; name: string };

export function mediaCollectionNameProblem(records: MediaRecords, name: string, renaming?: string): "empty" | "taken" | undefined {
  const clean = name.trim();
  if (!clean) return "empty";
  if (records.collections.some(existing => existing !== renaming && existing.toLowerCase() === clean.toLowerCase())) return "taken";
}
function checkedName(records: MediaRecords, name: string, renaming?: string): string {
  const problem = mediaCollectionNameProblem(records, name, renaming);
  if (problem === "empty") throw new Error("Enter a collection name.");
  if (problem === "taken") throw new Error(`A collection called "${name.trim()}" already exists.`);
  return name.trim();
}
export function createMediaCollection(records: MediaRecords, name: string, paths: string[] = []): MediaRecords {
  const clean = checkedName(records, name);
  return addToMediaCollection({ ...records, collections: [...records.collections, clean] }, clean, paths);
}
export function addToMediaCollection(records: MediaRecords, name: string, paths: string[]): MediaRecords {
  requireCollection(records, name);
  let next = records;
  for (const path of paths) {
    const memberships = next.files[path]?.collections ?? [];
    if (!memberships.includes(name)) next = setMediaCollections(next, path, [...memberships, name]);
  }
  return next;
}
export function takeOutOfMediaCollection(records: MediaRecords, name: string, paths: string[]): MediaRecords {
  let next = records;
  for (const path of paths) {
    const memberships = next.files[path]?.collections;
    if (memberships?.includes(name)) next = setMediaCollections(next, path, memberships.filter(item => item !== name));
  }
  return next;
}
/** Also update restore metadata, or the next parse would resurrect the old collection. */
function replaceMembership(records: MediaRecords, from: string, to?: string): MediaRecords {
  const replace = (record: MediaFileRecord) => {
    if (!record.collections?.includes(from)) return record;
    const collections = [...new Set(record.collections.flatMap(name => name === from ? (to ? [to] : []) : [name]))].sort((a, b) => a.localeCompare(b));
    const next = { ...record };
    if (collections.length) next.collections = collections; else delete next.collections;
    return next;
  };
  return { ...records,
    collections: records.collections.flatMap(name => name === from ? (to ? [to] : []) : [name]),
    files: Object.assign(Object.create(null), Object.fromEntries(Object.entries(records.files).map(([path, record]) => [path, replace(record)]))),
    ...(records.removed ? { removed: records.removed.map(item => item.record ? { ...item, record: replace(item.record) } : item) } : {}),
  };
}
function requireCollection(records: MediaRecords, name: string) {
  if (!records.collections.includes(name)) throw new Error(`There is no collection called "${name}".`);
}
export function renameMediaCollection(records: MediaRecords, from: string, to: string): MediaRecords {
  requireCollection(records, from);
  const clean = checkedName(records, to, from);
  if (from === clean) return records;
  return replaceMembership(records, from, clean);
}
export function deleteMediaCollection(records: MediaRecords, name: string): MediaRecords {
  requireCollection(records, name);
  return replaceMembership(records, name);
}

const storageFolders = new Set("media images image img imgs videos video audio downloads documents files uploads assets static public originals wp-content".split(" "));
const dateFolder = /^(?:\d{4}|\d{1,2}|\d{4}-\d{1,2}(?:-\d{1,2})?)$/;
export function startingMediaCollections(paths: string[]): MediaRecords {
  let records = parseMediaRecords(undefined);
  const families = mediaFamilies(paths);
  const members = new Set(families.flatMap(family => [...family.copies.map(copy => copy.path), ...family.originals]));
  for (const path of paths) {
    if (members.has(path) || /^media\/originals\//i.test(path)) continue;
    const folder = path.split("/").slice(0, -1).reverse().find(part => !part.startsWith(".") && !storageFolders.has(part.toLowerCase()) && !dateFolder.test(part));
    if (!folder) continue;
    const readable = folder.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    if (!readable) continue;
    const name = readable[0].toUpperCase() + readable.slice(1);
    const existing = records.collections.find(item => item.toLowerCase() === name.toLowerCase());
    records = existing ? addToMediaCollection(records, existing, [path]) : createMediaCollection(records, name, [path]);
  }
  return records;
}

/** Derivation is read-only until the first real edit; version 2 always wins. */
export function readSiteMediaRecords(source: string | undefined, mediaPaths: string[]): MediaRecords {
  let records = parseMediaRecords(source);
  if (source !== undefined && Object.hasOwn(JSON.parse(source), "version")) return records;
  const starting = startingMediaCollections(mediaPaths);
  for (const name of starting.collections) {
    const existing = records.collections.find(item => item.toLowerCase() === name.toLowerCase());
    const paths = Object.keys(starting.files).filter(path => starting.files[path].collections?.includes(name));
    records = existing ? addToMediaCollection(records, existing, paths) : createMediaCollection(records, name, paths);
  }
  return records;
}
