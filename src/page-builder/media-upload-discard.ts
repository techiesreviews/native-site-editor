import { MEDIA_RECORDS_PATH, parseMediaRecords, removeMediaRecords, serializeMediaRecords } from "../../shared/media-records";
import type { DraftScope } from "../drafts";
import { deleteFile, type DraftAccess } from "../file-changes";

/** Drop every per-file field, preserving other edits and the saved file's exact formatting. */
export function recordsAfterDiscard(content: string, original: string, paths: string[]): string {
  const next = serializeMediaRecords(removeMediaRecords(parseMediaRecords(content), paths));
  return next === serializeMediaRecords(parseMediaRecords(original || undefined)) ? original : next;
}

/** No Undo step: Discard must release its bytes, just as discarding a text draft does.
 * The host batches these synchronous writes; a failed upload removal restores the records. */
export function discardUploadDraft(store: DraftAccess, scope: DraftScope, path: string): boolean {
  const upload = store.get(scope, path);
  if (!upload?.upload || upload.baseSha !== null) return false;
  const records = store.get(scope, MEDIA_RECORDS_PATH);
  if (records && !records.deleted) {
    const content = recordsAfterDiscard(records.content, records.original, [path]);
    if (content !== records.content) {
      const ok = records.baseSha === null && content === "" ? store.remove(scope, MEDIA_RECORDS_PATH)
        : store.save({ ...records, content, updatedAt: Date.now() });
      if (!ok) throw new Error("Media records could not be updated. Nothing was discarded.");
    }
  }
  try {
    if (deleteFile(store, scope, { path }) === "none" || store.get(scope, path) === upload)
      throw new Error("The upload could not be discarded.");
  } catch (error) {
    if (records) store.save(records);
    throw error;
  }
  return true;
}
