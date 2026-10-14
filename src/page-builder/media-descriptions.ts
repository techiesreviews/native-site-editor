import { startTags, startTagAttribute } from "../../shared/html-source";
import { type MediaFileRecord, type MediaPlaceRecord, type MediaRecords } from "../../shared/media-records";
import { mediaResolvePath } from "./media-references";
import { decodeHtmlEntities } from "./html-entities";
import { mediaEscape } from "./media-markup";

export function fileDescriptionState(record?: MediaFileRecord) {
  const text = record?.description?.text ?? "";
  return { state: record?.decorative ? "decorative" as const : text ? "described" as const : "missing" as const,
    text, byAgent: Boolean(record?.description?.byAgent) };
}
export function placeDescriptionState(records: MediaRecords, file: string, page: string, alt: string | undefined) {
  const record = records.files[file], place = record?.places?.[page];
  const own = Boolean(alt && alt !== record?.description?.text);
  return { state: alt ? "described" as const : alt !== undefined && (record?.decorative || place?.decorative) ? "decorative" as const : "missing" as const,
    own, byAgent: Boolean(own ? place?.byAgent : alt && record?.description?.byAgent) };
}
export function newPlaceAlt(records: MediaRecords, file: string): string | undefined {
  const state = fileDescriptionState(records.files[file]);
  return state.state === "decorative" ? "" : state.text || undefined;
}
function updateFile(records: MediaRecords, file: string, record: MediaFileRecord) {
  if (JSON.stringify(records.files[file] ?? {}) === JSON.stringify(record)) return records;
  return { ...records, files: Object.assign(Object.create(null), records.files, { [file]: record }) };
}
export function setMediaFileDecorative(records: MediaRecords, file: string, decorative: boolean): MediaRecords {
  const record = { ...records.files[file] };
  if (decorative) { record.decorative = true; delete record.description; }
  else delete record.decorative;
  return updateFile(records, file, record);
}
function placeFlag(records: MediaRecords, file: string, page: string, key: "decorative" | "byAgent", value: boolean) {
  const record = { ...records.files[file] }, place: MediaPlaceRecord = { ...record.places?.[page] };
  if (value) place[key] = true; else delete place[key];
  const places: Record<string, MediaPlaceRecord> = Object.assign(Object.create(null), record.places);
  if (Object.keys(place).length) places[page] = place; else delete places[page];
  if (Object.keys(places).length) record.places = places; else delete record.places;
  return updateFile(records, file, record);
}
export function setMediaPlaceDecorative(records: MediaRecords, file: string, page: string, decorative: boolean) {
  const next = placeFlag(records, file, page, "decorative", decorative);
  return decorative ? setMediaPlaceByAgent(next, file, page, false) : next;
}
export function setMediaPlaceByAgent(records: MediaRecords, file: string, page: string, byAgent: boolean) {
  return placeFlag(records, file, page, "byAgent", byAgent);
}
export function confirmMediaDescription(records: MediaRecords, file: string, page?: string) {
  if (page !== undefined) return setMediaPlaceByAgent(records, file, page, false);
  const description = records.files[file]?.description;
  if (!description?.byAgent) return records;
  const confirmed = { ...description };
  delete confirmed.byAgent;
  return updateFile(records, file, { ...records.files[file], description: confirmed });
}
export interface DescriptionValue { text: string; decorative: boolean }
/** Rewrite only matching img alt attributes; all other source spelling survives. */
export function descriptionPlaceEdits(records: MediaRecords, file: string, page: string, source: string, before: DescriptionValue, after: DescriptionValue): string {
  if (!/\.html$/i.test(page) || before.text === after.text && before.decorative === after.decorative) return source;
  const target = after.decorative ? "" : after.text;
  const placeDecorative = Boolean(records.files[file]?.places?.[page]?.decorative);
  const edits = startTags(source).flatMap(tag => {
    if (tag.name !== "img" || source[tag.end - 1] !== ">") return [];
    const src = startTagAttribute(source, tag, "src");
    if (!src || mediaResolvePath(decodeHtmlEntities(src.value, true), page) !== file) return [];
    const attribute = startTagAttribute(source, tag, "alt");
    const alt = attribute ? decodeHtmlEntities(attribute.value, true) : undefined;
    // Places using the description follow it; own words and Decorative places stay.
    // Not described yet (absent, or empty without a Decorative mark) takes new text;
    // an emptied, undecorated description never writes alt="" over an absent alt.
    const follows = alt ? alt === before.text && !before.decorative : alt === "" ? !placeDecorative && !(before.decorative && after.decorative) : Boolean(target) || after.decorative;
    if (!follows || alt === target) return [];
    const text = ` alt="${mediaEscape(target)}"`;
    return [{ start: attribute?.start ?? tag.nameEnd, end: attribute?.end ?? tag.nameEnd, text }];
  });
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
