import type { FileOperationsPorts } from "../controllers/file-operations-controller";
import type { Reads, Stamp } from "../guarded-edit";
import type { MovableFile } from "../file-changes";
import { isRenamableMedia } from "./media-names";
import * as records from "../../shared/media-records";

type RemovalPlan = { edits?: Map<string, string>; creates?: { path: string; content: string }[] } | { refuse: string };

/** Read the records through the guarded plan so deletion and its recovery undo together. */
export async function filesRemovalPlan(ports: FileOperationsPorts, r: Reads, found: MovableFile[], since: Stamp): Promise<RemovalPlan> {
  const changed = "The repository or source changed meanwhile. Try again.";
  const removed = await import("./recently-removed");
  if (!since.holds()) return { refuse: changed };
  const path = records.MEDIA_RECORDS_PATH, exists = r.exists(path), source = r.source(path);
  if (exists && source === undefined) return { refuse: `${path} could not be read; nothing was deleted.` };
  try {
    const before = records.parseMediaRecords(source), date = removed.removedToday(Date.now());
    const scope = ports.draftScope();
    const draft = (path: string) => scope ? ports.draftStore().get(scope, path) : undefined;
    const current = new Map<string, string>();
    for (const entry of before.removed ?? []) if (r.exists(entry.path)) {
      r.source(entry.path);
      const held = draft(entry.path), file = held ? undefined : await ports.findEntry(entry.path);
      if (!since.holds()) return { refuse: changed };
      const sha = held?.opaque && !held.upload ? held.sourceSha : file?.sha;
      if (sha) current.set(entry.path, sha);
    }
    const files = found.filter(file => isRenamableMedia(file.path)).map(file => {
      const held = draft(file.path);
      return { path: file.path, sha: held?.opaque && !held.upload ? held.sourceSha ?? file.sha : file.sha };
    });
    const next = removed.recordFileRemovals(before, files, ports.nativeFiles(), date, path => current.get(path));
    const content = records.serializeMediaRecords(next);
    if (content !== records.serializeMediaRecords(before)) return exists ? { edits: new Map([[path, content]]) } : { creates: [{ path, content }] };
  } catch (error) { return { refuse: error instanceof Error ? error.message : "Media records could not be read." }; }
  return {};
}
