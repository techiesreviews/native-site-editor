import { agentKeptRemovalProblem } from "./agent-media-removal";
import type { FileOperationsPorts } from "../controllers/file-operations-controller";
import type { Reads, Stamp } from "../guarded-edit";
import type { MovableFile } from "../file-changes";
import { gitBlobSha, removedCopies, uploadBytes, uploadKey, type UploadBytes } from "../uploads";
import { isRenamableMedia } from "./media-names";
import { isAgentMediaPath } from "../agent-media";
import { familyMembers, mediaFamilyOf } from "./media-families";
import * as records from "../../shared/media-records";

type RemovalPlan = { deletes?: string[]; edits?: Map<string, string>; creates?: { path: string; content: string }[]; keep?: () => Promise<void> } | { refuse: string };
export interface RemovalStores { uploads: UploadBytes; removed: UploadBytes }

/**
 * Read the records through the guarded plan so deletion and its recovery undo together. Bytes that
 * are only in this browser (an unsaved upload, an edited text file) are read now and kept by `keep`,
 * which the caller runs once Delete is confirmed.
 */
export async function filesRemovalPlan(ports: FileOperationsPorts, r: Reads, found: MovableFile[], since: Stamp,
  stores: () => RemovalStores = () => ({ uploads: uploadBytes(), removed: removedCopies() }), agent = false): Promise<RemovalPlan> {
  const changed = "The repository or source changed meanwhile. Try again.";
  const removed = await import("./recently-removed");
  if (!since.holds()) return { refuse: changed };
  const path = records.MEDIA_RECORDS_PATH, exists = r.exists(path), source = r.source(path);
  if (exists && source === undefined) return { refuse: `${path} could not be read; nothing was deleted.` };
  try {
    const before = records.parseMediaRecords(source), date = removed.removedToday(Date.now());
    const scope = ports.draftScope();
    const draft = (path: string) => scope ? ports.draftStore().get(scope, path) : undefined;
    // The present blob of every path an entry names (main and members), so a family back through
    // the Files tab's or Save's Restore gets every member's records again.
    const current = new Map<string, string>();
    for (const member of new Set(removed.removedPaths(before))) if (r.exists(member)) {
      r.source(member);
      const held = draft(member), file = held ? undefined : await ports.findEntry(member);
      if (!since.holds()) return { refuse: changed };
      const sha = !held ? file?.sha : held.opaque ? held.sourceSha : await gitBlobSha(new TextEncoder().encode(held.content));
      if (sha) current.set(member, sha);
    }
    // A family's members (a kept original of any format, a still, subtitles) go with its media main, as Files deletes them too.
    const paths = ports.nativeFiles();
    if (agent) {
      const problem = agentKeptRemovalProblem(found.map(file => file.path), paths, removed.pruneRemoved(before, date, path => current.get(path)));
      if (problem) return { refuse: problem };
    }
    const members = new Set(found.filter(file => isRenamableMedia(file.path)).flatMap(file => {
      const family = mediaFamilyOf(file.path, paths);
      return family ? familyMembers(family).slice(1) : [];
    }));
    const files: records.RemovedPath[] = [], copies: { key: string; blob: Blob }[] = [];
    for (const file of found) {
      if (!isRenamableMedia(file.path) && !members.has(file.path) && !(agent && isAgentMediaPath(file.path))) continue;
      const held = draft(file.path);
      let blob: Blob | undefined;
      if (held?.upload && held.sourceSha && scope) blob = await stores().uploads.get(uploadKey(scope, held.sourceSha));
      else if (held && !held.opaque && !held.deleted) blob = new Blob([held.content]);
      else {
        const sha = held?.opaque ? held.sourceSha ?? file.sha : file.sha;
        if (sha) files.push({ path: file.path, sha });
        continue;
      }
      if (!since.holds()) return { refuse: changed };
      // Bytes already missing from this browser cannot come back; the file is discarded as before.
      if (!blob) continue;
      const key = `removed:${date}:${await gitBlobSha(new Uint8Array(await blob.arrayBuffer()))}`;
      files.push({ path: file.path, browserKey: key });
      copies.push({ key, blob });
    }
    const discarded = found.filter(file => draft(file.path)?.baseSha === null && draft(file.path)?.upload).map(file => file.path);
    const next = records.removeMediaRecords(removed.recordFileRemovals(before, files, paths, date, path => current.get(path)), discarded);
    const serialized = records.serializeMediaRecords(next);
    if (serialized === records.serializeMediaRecords(before)) return {};
    const held = draft(path);
    const content = held && serialized === records.serializeMediaRecords(records.parseMediaRecords(held.original || undefined)) ? held.original : serialized;
    if (content === source) return {};
    if (held?.baseSha === null && content === "") return { deletes: [path] };
    const keep = copies.length ? async () => { for (const copy of copies) await stores().removed.put(copy.key, copy.blob); } : undefined;
    return { ...exists ? { edits: new Map([[path, content]]) } : { creates: [{ path, content }] }, ...keep ? { keep } : {} };
  } catch (error) { return { refuse: error instanceof Error ? error.message : "Media records could not be read." }; }
}
