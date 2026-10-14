export const MEDIA_RECORDS_PATH = ".editor/media.json";

export interface MediaTrim {
  x: number; y: number; width: number; height: number;
  turn?: 0 | 90 | 180 | 270; straighten?: number; flipX?: true; flipY?: true;
  [key: string]: unknown;
}
export interface MediaFileRecord {
  collections?: string[];
  description?: { text: string; byAgent?: true; [key: string]: unknown };
  decorative?: true; alwaysKeep?: true;
  trimmedFrom?: { source: string; trim: MediaTrim; [key: string]: unknown };
  still?: string; subtitles?: string;
  [key: string]: unknown;
}
export interface OnlineVideoRecord {
  service: "youtube" | "vimeo"; id: string; title?: string; still?: string;
  [key: string]: unknown;
}
interface RemovedPath {
  path: string; sha?: string; browserKey?: string;
  [key: string]: unknown;
}
export interface RemovedMedia extends RemovedPath {
  date: string; family?: RemovedPath[]; record?: MediaFileRecord;
}
export interface AddingSettings {
  image?: "smaller" | "balanced" | "higher" | "smallest";
  video?: "smaller" | "balanced" | "higher";
  audio?: "balanced" | "higher" | "speech";
  keepOriginal?: boolean;
  [key: string]: unknown;
}
export interface MediaRecords {
  version: 2; collections: string[]; files: Record<string, MediaFileRecord>;
  onlineVideos?: OnlineVideoRecord[]; removed?: RemovedMedia[]; adding?: AddingSettings;
  [key: string]: unknown;
}

function invalid(field: string, detail = "has an invalid type"): never {
  throw new Error(`${MEDIA_RECORDS_PATH}: ${field} ${detail}.`);
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field, "must be an object");
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string): string {
  if (typeof value !== "string") invalid(field, "must be a string");
  return value;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field, "must be an array");
  return value;
}
function names(value: unknown, field: string, sorted = false): string[] {
  const result = [...new Set(array(value, field).map((name, index) => string(name, `${field}[${index}]`).trim()).filter(Boolean))];
  return sorted ? result.sort((a, b) => a.localeCompare(b)) : result;
}
function optionalStrings(out: Record<string, unknown>, keys: string[], field: string) {
  for (const key of keys) if (out[key] !== undefined) {
    const value = string(out[key], `${field}.${key}`);
    if (!value) delete out[key];
  }
}
function flags(out: Record<string, unknown>, keys: string[], field: string) {
  for (const key of keys) if (out[key] !== undefined) {
    if (typeof out[key] !== "boolean") invalid(`${field}.${key}`, "must be a boolean");
    if (!out[key]) delete out[key];
  }
}
const hasUnknown = (description: Record<string, unknown>) => Object.keys(description).some(key => key !== "text" && key !== "byAgent");
function trimRecord(value: unknown, field: string): MediaTrim {
  const out = { ...object(value, field) };
  for (const key of ["x", "y", "width", "height", "straighten"]) {
    if (key === "straighten" && out[key] === undefined) continue;
    if (typeof out[key] !== "number" || !Number.isFinite(out[key])) invalid(`${field}.${key}`, "must be a finite number");
  }
  if (out.turn !== undefined && ![0, 90, 180, 270].includes(out.turn as number)) invalid(`${field}.turn`);
  flags(out, ["flipX", "flipY"], field);
  return out as MediaTrim;
}
function fileRecord(value: unknown, field: string): MediaFileRecord {
  const out = { ...object(value, field) };
  if (out.collections !== undefined) {
    const list = names(out.collections, `${field}.collections`, true);
    if (list.length) out.collections = list; else delete out.collections;
  }
  if (out.description !== undefined) {
    const description = { ...object(out.description, `${field}.description`) };
    string(description.text, `${field}.description.text`);
    flags(description, ["byAgent"], `${field}.description`);
    // An empty description is dropped unless it carries unknown keys, which are kept.
    if (description.text || hasUnknown(description)) out.description = description; else delete out.description;
  }
  flags(out, ["decorative", "alwaysKeep"], field);
  optionalStrings(out, ["still", "subtitles"], field);
  if (out.trimmedFrom !== undefined) {
    const from = { ...object(out.trimmedFrom, `${field}.trimmedFrom`) };
    string(from.source, `${field}.trimmedFrom.source`);
    from.trim = trimRecord(from.trim, `${field}.trimmedFrom.trim`);
    out.trimmedFrom = from;
  }
  return out as MediaFileRecord;
}
function removedPath(value: unknown, field: string): RemovedPath {
  const out = { ...object(value, field) };
  string(out.path, `${field}.path`);
  optionalStrings(out, ["sha", "browserKey"], field);
  if ((out.sha === undefined) === (out.browserKey === undefined)) invalid(field, "must have exactly one of sha or browserKey");
  return out as RemovedPath;
}
function readRecords(value: Record<string, unknown>): MediaRecords {
  const collections = names(value.collections, "collections");
  const files: Record<string, MediaFileRecord> = Object.create(null);
  for (const [path, entry] of Object.entries(object(value.files, "files"))) {
    files[path] = fileRecord(entry, `files[${path}]`);
    for (const name of files[path].collections ?? []) if (!collections.includes(name)) collections.push(name);
  }
  const out: MediaRecords = { ...value, version: 2, collections, files };
  if (value.onlineVideos !== undefined) {
    const seen = new Set<string>();
    const videos = array(value.onlineVideos, "onlineVideos").map((entry, index) => {
      const field = `onlineVideos[${index}]`, video = { ...object(entry, field) };
      if (video.service !== "youtube" && video.service !== "vimeo") invalid(`${field}.service`);
      string(video.id, `${field}.id`);
      optionalStrings(video, ["title", "still"], field);
      return video as OnlineVideoRecord;
    }).filter(video => {
      const key = JSON.stringify([video.service, video.id]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    if (videos.length) out.onlineVideos = videos; else delete out.onlineVideos;
  }
  if (value.removed !== undefined) {
    const removed = array(value.removed, "removed").map((entry, index) => {
      const field = `removed[${index}]`, item = removedPath(entry, field);
      const date = string(item.date, `${field}.date`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) invalid(`${field}.date`, "must be YYYY-MM-DD");
      const result: RemovedMedia = { ...item, date };
      if (item.family !== undefined) {
        const family = array(item.family, `${field}.family`).map((member, i) => removedPath(member, `${field}.family[${i}]`));
        if (family.length) result.family = family; else delete result.family;
      }
      if (item.record !== undefined) result.record = fileRecord(item.record, `${field}.record`);
      for (const name of result.record?.collections ?? []) if (!collections.includes(name)) collections.push(name);
      return result;
    });
    if (removed.length) out.removed = removed; else delete out.removed;
  }
  if (value.adding !== undefined) {
    const adding = { ...object(value.adding, "adding") };
    const options = { image: ["smaller", "balanced", "higher", "smallest"], video: ["smaller", "balanced", "higher"], audio: ["balanced", "higher", "speech"] };
    for (const [key, choices] of Object.entries(options)) if (adding[key] !== undefined && !choices.includes(adding[key] as string)) invalid(`adding.${key}`);
    flags(adding, ["keepOriginal"], "adding");
    if (Object.keys(adding).length) out.adding = adding as AddingSettings; else delete out.adding;
  }
  return out;
}

/** Invalid records are reported; callers must never overwrite unreadable metadata. */
export function parseMediaRecords(source: string | undefined): MediaRecords {
  if (source === undefined) return { version: 2, collections: [], files: Object.create(null) };
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { invalid("JSON", "is malformed"); }
  const value = object(parsed, "root");
  if (Object.hasOwn(value, "version")) {
    if (typeof value.version === "number" && value.version > 2) invalid("version", "was written by a newer editor");
    if (value.version !== 2) invalid("version", "must be 2");
    return readRecords(value);
  }
  const files: Record<string, MediaFileRecord> = Object.create(null), collections = new Set<string>();
  for (const [path, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid image metadata for ${path}.`);
    const item = entry as Record<string, unknown>;
    if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== "string"))) throw new Error(`Invalid tags for ${path}.`);
    if (item.alt !== undefined && typeof item.alt !== "string") throw new Error(`Invalid alt text for ${path}.`);
    const { tags, alt, ...record } = item;
    if (tags !== undefined) {
      const memberships = names(tags, `${path}.tags`, true);
      if (memberships.length) record.collections = memberships;
      memberships.forEach(name => collections.add(name));
    }
    if (alt) record.description = { text: alt };
    // Kept old keys must also be valid new fields, or the next read would refuse the file.
    files[path] = fileRecord(record, `files[${path}]`);
  }
  return { version: 2, collections: [...collections].sort((a, b) => a.localeCompare(b)), files };
}

export function serializeMediaRecords(records: MediaRecords): string {
  const { version, collections, files, onlineVideos, removed, adding, ...unknown } = records;
  return `${JSON.stringify({ version, collections, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))), onlineVideos, removed, adding, ...unknown }, null, 2)}\n`;
}

export function renameMediaRecord(records: MediaRecords, from: string, to: string): MediaRecords {
  if (from === to) return records;
  // Callers refuse taken file paths, so a record already at `to` belongs to no file and is dropped.
  let changed = Object.hasOwn(records.files, to);
  const files: Record<string, MediaFileRecord> = Object.create(null);
  for (const [path, record] of Object.entries(records.files)) {
    let next = record;
    if (record.trimmedFrom?.source === from) { next = { ...next, trimmedFrom: { ...record.trimmedFrom, source: to } }; changed = true; }
    for (const key of ["still", "subtitles"] as const) if (record[key] === from) { next = { ...next, [key]: to }; changed = true; }
    if (path === to) continue;
    files[path === from ? to : path] = next;
    if (path === from) changed = true;
  }
  const onlineVideos = records.onlineVideos?.map(video => {
    if (video.still !== from) return video;
    changed = true; return { ...video, still: to };
  });
  return changed ? { ...records, files, ...(onlineVideos ? { onlineVideos } : {}) } : records;
}
export function removeMediaRecords(records: MediaRecords, paths: string[]): MediaRecords {
  const removed = new Set(paths);
  if (!paths.some(path => Object.hasOwn(records.files, path))) return records;
  return { ...records, files: Object.assign(Object.create(null), Object.fromEntries(Object.entries(records.files).filter(([path]) => !removed.has(path)))) };
}
export function setMediaCollections(records: MediaRecords, path: string, names: string[]): MediaRecords {
  const memberships = [...new Set(names.map(name => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const record = { ...records.files[path] };
  if (memberships.length) record.collections = memberships; else delete record.collections;
  const collections = [...records.collections];
  memberships.forEach(name => { if (!collections.includes(name)) collections.push(name); });
  return { ...records, collections, files: Object.assign(Object.create(null), records.files, { [path]: record }) };
}
export function setMediaDescription(records: MediaRecords, path: string, text: string, byAgent = false): MediaRecords {
  const record = { ...records.files[path] };
  if (text || (record.description && hasUnknown(record.description))) record.description = { ...record.description, text, ...(byAgent ? { byAgent: true as const } : {}) };
  else delete record.description;
  if (!byAgent && record.description) delete record.description.byAgent;
  return { ...records, files: Object.assign(Object.create(null), records.files, { [path]: record }) };
}
