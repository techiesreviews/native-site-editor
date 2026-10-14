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
    own, byAgent: own ? place?.agentText === alt : Boolean(alt && record?.description?.byAgent) };
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
function placeField(records: MediaRecords, file: string, page: string, change: (place: MediaPlaceRecord) => void) {
  const record = { ...records.files[file] }, place: MediaPlaceRecord = { ...record.places?.[page] };
  change(place);
  const places: Record<string, MediaPlaceRecord> = Object.assign(Object.create(null), record.places);
  if (Object.keys(place).length) places[page] = place; else delete places[page];
  if (Object.keys(places).length) record.places = places; else delete record.places;
  return updateFile(records, file, record);
}
export function setMediaPlaceDecorative(records: MediaRecords, file: string, page: string, decorative: boolean) {
  const next = placeField(records, file, page, place => { if (decorative) place.decorative = true; else delete place.decorative; });
  return decorative ? setMediaPlaceAgentText(next, file, page, undefined) : next;
}
/**
 * Agent-written own words for a place. The mark is the text itself, so Lex's
 * edit of the alt clears it without a second write (and Undo brings both back).
 */
export function setMediaPlaceAgentText(records: MediaRecords, file: string, page: string, text: string | undefined) {
  return placeField(records, file, page, place => { if (text) place.agentText = text; else delete place.agentText; });
}
export function confirmMediaDescription(records: MediaRecords, file: string, page?: string) {
  if (page !== undefined) return setMediaPlaceAgentText(records, file, page, undefined);
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
  const edits = placeImages(source, file, page).flatMap(({ tag, attribute, alt }) => {
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

/** One row of To check (ticket 13): agent-written words Lex has not checked yet. Without
 * `page` it is the file's description; with it, the agent's own words for that place. */
export interface MediaToCheckRow { file: string; page?: string; text: string }

/** The img tags on `page` that show `file`, with their decoded alt. */
function placeImages(source: string, file: string, page: string) {
  return startTags(source).flatMap(tag => {
    if (tag.name !== "img" || source[tag.end - 1] !== ">") return [];
    const src = startTagAttribute(source, tag, "src");
    if (!src || mediaResolvePath(decodeHtmlEntities(src.value, true), page) !== file) return [];
    const attribute = startTagAttribute(source, tag, "alt");
    return [{ tag, attribute, alt: attribute ? decodeHtmlEntities(attribute.value, true) : undefined }];
  });
}

/** To check, in file order: each listed file whose description an agent wrote, then each
 * place where the agent's own words are still on the page (`sources` holds the pages). */
export function mediaToCheck(records: MediaRecords, files: string[], sources: Record<string, string>): MediaToCheckRow[] {
  const rows: MediaToCheckRow[] = [];
  for (const file of [...files].sort()) {
    const record = records.files[file];
    if (!record) continue;
    if (record.description?.byAgent && record.description.text) rows.push({ file, text: record.description.text });
    for (const [page, place] of Object.entries(record.places ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const text = place.agentText, source = sources[page];
      if (text && source !== undefined && /\.html$/i.test(page) && placeImages(source, file, page).some(image => image.alt === text))
        rows.push({ file, page, text });
    }
  }
  return rows;
}

/** Lex's words for a place replace the agent's wherever they still show `file` on the page. */
export function placeWordsEdits(source: string, file: string, page: string, from: string, to: string): string {
  const edits = placeImages(source, file, page).filter(image => image.alt === from && image.attribute)
    .map(image => ({ start: image.attribute!.start, end: image.attribute!.end, text: ` alt="${mediaEscape(to)}"` }));
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
