import { startTags, startTagAttribute } from "../../shared/html-source";
import { type MediaFileRecord, type MediaPlaceRecord, type MediaRecords } from "../../shared/media-records";
import { mediaResolvePath } from "./media-references";
import { decodeHtmlEntities } from "./html-entities";
import { mediaEscape, mediaNameAlt } from "./media-markup";

export function fileDescriptionState(record?: MediaFileRecord) {
  const text = record?.description?.text ?? "";
  return { state: record?.decorative ? "decorative" as const : text ? "described" as const : "missing" as const,
    text, byAgent: Boolean(record?.description?.byAgent) };
}
export function placeDescriptionState(records: MediaRecords, file: string, page: string, alt: string | undefined) {
  const record = records.files[file], place = record?.places?.[page];
  // Name words an agent recorded are its own words; otherwise a name alt that is also the
  // file's description simply follows that description.
  const agentName = followsFileName(file, alt) && place?.agentText === alt;
  const name = agentName || alt !== record?.description?.text && followsFileName(file, alt);
  if (name && !agentName) return { state: "missing" as const, own: false, byAgent: false };
  const own = Boolean(alt && (agentName || alt !== record?.description?.text));
  return { state: alt ? "described" as const : alt !== undefined && (record?.decorative || place?.decorative) ? "decorative" as const : "missing" as const,
    own, byAgent: own ? place?.agentText === alt : Boolean(alt && record?.description?.byAgent) };
}
export function newPlaceAlt(records: MediaRecords, file: string): string {
  const state = fileDescriptionState(records.files[file]);
  return state.state === "decorative" ? "" : state.text;
}
/** Legacy name alts follow the file unless recorded as deliberately written agent words. */
export function followsFileName(file: string, alt: string | undefined): boolean {
  const name = file.split("/").pop() ?? file;
  return Boolean(alt && (alt === mediaNameAlt(file) || alt === name.replace(/\.[^.]+$/, "") || alt === name));
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
    const agentWords = records.files[file]?.places?.[page]?.agentText === alt;
    const name = followsFileName(file, alt) && (agentWords || alt !== before.text);
    const follows = name ? !agentWords && (Boolean(target) || after.decorative)
      : alt ? alt === before.text && !before.decorative : alt === "" ? !placeDecorative && !(before.decorative && after.decorative) : Boolean(target) || after.decorative;
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

/** One by-agent mark per file on a page: whether other words for the image at `target` (its start
 * tag's offset) would leave the agent's unchecked `marked` words on another image of `file` unmarked. */
export function strandsAgentWords(source: string, file: string, page: string, target: number, marked: string | undefined, words: string) {
  return Boolean(marked && marked !== words && placeImages(source, file, page).some(image => image.tag.start !== target && image.alt === marked));
}

export { mediaNameAlt };

/** Whether `page`'s source still shows `file` in one of its images. */
export function pageUsesFile(source: string, page: string, file: string) {
  return placeImages(source, file, page).length > 0;
}

/**
 * Swapping the picture at a place (the Media picker's Use). The place keeps its own words and
 * its Decorative mark, which moves to the new file on this page (map ticket 13: the mark can
 * belong to a place); a place that followed the old file follows the new one, so the new
 * file's description, or its own Decorative mark, applies there. An empty, unmarked alt stays a
 * gap unless the new file is described. `alt` is undefined when the existing alt stays as written.
 * `after` is the page's source once swapped: the old file's mark goes only if it left the page.
 */
export function swapPlaceImage(
  records: MediaRecords, page: string, from: string | undefined, to: string, alt: string | undefined, after: string,
): { alt: string | undefined; records: MediaRecords } {
  const old = from ? records.files[from] : undefined, target = fileDescriptionState(records.files[to]);
  if (from && old?.places?.[page]?.decorative) {
    let next = records;
    if (from !== to) {
      next = setMediaPlaceDecorative(records, to, page, true);
      if (!pageUsesFile(after, page, from)) next = setMediaPlaceDecorative(next, from, page, false);
    }
    return { alt: alt === undefined ? "" : undefined, records: next };
  }
  const own = target.state === "decorative" ? "" : target.text;
  if (alt === undefined) return { alt: own, records };
  if (alt === "") return { alt: own || undefined, records };
  // Words that were the old file's description describe the old picture, not this one.
  if (from && from !== to && (followsFileName(from, alt)
    ? old?.places?.[page]?.agentText !== alt : alt === old?.description?.text)) return { alt: own, records };
  // Own words an agent wrote keep their by-agent mark: it moves with the words to the new file on
  // this page (the old file keeps it only while it still shows on the page), so To check keeps them.
  if (from && from !== to && alt && old?.places?.[page]?.agentText === alt) {
    let next = setMediaPlaceAgentText(records, to, page, alt);
    if (!pageUsesFile(after, page, from)) next = setMediaPlaceAgentText(next, from, page, undefined);
    return { alt: undefined, records: next };
  }
  return { alt: undefined, records };
}
