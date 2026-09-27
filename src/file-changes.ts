// Pending file changes as browser drafts: edits, new files, deletions and
// renames, and what Save to GitHub commits for them.
//
// A draft is one path (src/drafts.ts). An edit (M) has the blob it began
// from; a new file (A) has none. A deletion (D) is a draft marking the path
// removed (`deleted`), with the blob it removes, so a file GitHub changed
// meanwhile conflicts rather than being lost. A rename or move (R) is two
// drafts: the new path, a new file carrying the old text (`movedFrom`), and a
// deletion of the old path (`movedTo`); it is listed, selected, saved and
// discarded as one change. A draft that began from a blob GitHub has since
// deleted is settled on loading (settleDeletedUpstream): a deletion is done
// already and is dropped; an edit is held back from saving until it is
// discarded or kept as a new file. A file renamed and not edited is saved as the blob
// it came from, so binary files move too. A folder is renamed, moved or
// deleted file by file. This module has no DOM and no I/O: it reads and
// writes a draft store given to it.
import type { DraftScope, SavedDraft } from "./drafts";
import type { PublishFile } from "../shared/types";

export type ChangeKind = "A" | "M" | "R" | "D";

/** One change as Save to GitHub lists it: a path, or both paths of a rename. */
export interface FileChange {
  kind: ChangeKind;
  /** The path the change leaves (a rename's new path; a deletion's removed path). */
  path: string;
  /** A rename's old path. */
  from?: string;
  /** The drafts it is made of: one, or a rename's new path and its deletion. */
  drafts: SavedDraft[];
}

export const CHANGE_WORDS: Record<ChangeKind, string> = { A: "Added", M: "Modified", R: "Renamed", D: "Deleted" };

export interface DraftAccess {
  get(scope: DraftScope, path: string): SavedDraft | undefined;
  save(value: SavedDraft): boolean;
  remove(scope: DraftScope, path: string): boolean;
}

/** A file an operation acts on: on the branch (with its blob), drafted, or both. */
export interface MovableFile {
  path: string;
  /** Its blob on the branch, when the branch has it. */
  sha?: string;
  mode?: string;
  /** Its text on the branch, when it was read; undefined for a binary or large file. */
  text?: string;
}

/** Whether a draft is a change at all. */
export function isChanged(draft: SavedDraft) {
  return Boolean(draft.deleted) || draft.baseSha === null || draft.content !== draft.original;
}

/** The drafts as changes, by path: a rename's two drafts are one change. */
export function listChanges(drafts: SavedDraft[]): FileChange[] {
  const byPath = new Map(drafts.map((draft) => [draft.path, draft]));
  const out: FileChange[] = [];
  for (const draft of drafts) {
    if (!isChanged(draft)) continue;
    if (draft.deleted) {
      const target = draft.movedTo ? byPath.get(draft.movedTo) : undefined;
      // The deletion half of a rename is listed with its new path.
      if (target?.movedFrom === draft.path && target.baseSha === null) continue;
      out.push({ kind: "D", path: draft.path, drafts: [draft] });
    } else if (draft.baseSha === null) {
      const origin = draft.movedFrom ? byPath.get(draft.movedFrom) : undefined;
      if (origin?.deleted && origin.movedTo === draft.path) out.push({ kind: "R", path: draft.path, from: origin.path, drafts: [draft, origin] });
      else out.push({ kind: "A", path: draft.path, drafts: [draft] });
    } else out.push({ kind: "M", path: draft.path, drafts: [draft] });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Drafts of files GitHub deleted since they began: `missing` are the paths
 * of `drafts` with a base that the branch no longer has. A deletion (a
 * rename's old path too, whose new path is then a new file) is dropped: the
 * file is gone already. Returns the edits, which only Discard draft or
 * {@link keepAsNewFile} can settle; saved as they are, they would be refused.
 */
export function settleDeletedUpstream(store: DraftAccess, scope: DraftScope, drafts: SavedDraft[], missing: ReadonlySet<string>): string[] {
  const gone: string[] = [];
  for (const draft of drafts) {
    if (draft.baseSha === null || !missing.has(draft.path)) continue;
    if (draft.deleted) store.remove(scope, draft.path);
    else gone.push(draft.path);
  }
  return gone;
}

/** The git blob SHA of text as UTF-8, as GitHub names a file with it. */
export async function textBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", all)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Drafts that are no change against the branch as it is now, dropped: a
 * file whose draft is GitHub's blob at its path (whatever blob it began
 * from, a new file GitHub now has too), a deletion of a file GitHub no
 * longer has. `entry` is each path's file on the branch (undefined: none),
 * compared by blob SHA, so nothing is read. Returns the paths dropped.
 */
export async function pruneUnchanged(
  store: DraftAccess, scope: DraftScope, drafts: SavedDraft[],
  entry: (path: string) => { sha: string; mode?: string } | undefined,
  shaOf: (text: string) => Promise<string> = textBlobSha,
): Promise<string[]> {
  const dropped: string[] = [];
  for (const draft of drafts) {
    const file = entry(draft.path);
    let same: boolean;
    if (draft.deleted) same = !file;
    else if (!file || (draft.mode && file.mode !== draft.mode)) same = false;
    else if (draft.baseSha === null && savedAsBlob(draft)) same = draft.sourceSha === file.sha;
    else same = !draft.opaque && (await shaOf(draft.content)) === file.sha;
    if (!same) continue;
    const latest = store.get(scope, draft.path);
    // Changed while the SHAs were worked out: left for the next check.
    if (!latest || latest.content !== draft.content || Boolean(latest.deleted) !== Boolean(draft.deleted)) continue;
    store.remove(scope, draft.path);
    dropped.push(draft.path);
  }
  return dropped;
}

/** An edit of a file GitHub deleted, as a new file: saving recreates the file with the draft's text. */
export function keepAsNewFile(store: DraftAccess, scope: DraftScope, path: string, now = Date.now()): boolean {
  const draft = store.get(scope, path);
  if (!draft || draft.deleted || draft.baseSha === null) return false;
  return store.save({ ...draft, baseSha: null, updatedAt: now });
}

/** Whether a new path's draft is saved as the blob it came from rather than as text. */
export function savedAsBlob(draft: SavedDraft) {
  return Boolean(draft.sourceSha && (draft.opaque || draft.content === draft.original));
}

/** What `/api/publish` is sent for the changes: every draft of each, one commit. */
export function publishFiles(changes: FileChange[]): PublishFile[] {
  const out: PublishFile[] = [];
  for (const change of changes)
    for (const draft of change.drafts) {
      const mode = draft.mode ? { mode: draft.mode } : {};
      if (draft.deleted) out.push({ path: draft.path, baseSha: draft.baseSha, content: "", delete: true });
      else if (draft.baseSha === null && savedAsBlob(draft))
        out.push({ path: draft.path, baseSha: null, content: "", sha: draft.sourceSha, ...mode, ...(draft.movedFrom ? { movedFrom: draft.movedFrom } : {}) });
      else out.push({ path: draft.path, baseSha: draft.baseSha, content: draft.content, ...mode, ...(draft.movedFrom ? { movedFrom: draft.movedFrom } : {}) });
    }
  return out;
}

const stamp = (scope: DraftScope, now: number) => ({
  account: scope.account, repoId: scope.repoId, repo: scope.repo, branch: scope.branch, version: 1 as const, updatedAt: now,
});

/**
 * Deletes `file`: a new file's draft is dropped (it was never on GitHub; a
 * renamed one leaves its old path deleted), anything else becomes a
 * deletion that keeps the text it had, for Restore. Returns what happened.
 */
export function deleteFile(store: DraftAccess, scope: DraftScope, file: MovableFile, now = Date.now()): "deleted" | "discarded" | "none" {
  const draft = store.get(scope, file.path);
  if (draft?.deleted) return "none";
  if (draft && draft.baseSha === null) {
    store.remove(scope, file.path);
    const origin = draft.movedFrom ? store.get(scope, draft.movedFrom) : undefined;
    if (origin?.deleted && origin.movedTo === file.path) {
      const { movedTo: _, ...plain } = origin;
      store.save({ ...plain, updatedAt: now });
      return "deleted";
    }
    return "discarded";
  }
  const baseSha = draft?.baseSha ?? file.sha;
  if (!baseSha) return "none";
  const original = draft?.original ?? file.text ?? "";
  store.save({
    ...stamp(scope, now), path: file.path, baseSha, original, content: draft?.content ?? original, deleted: true,
  });
  return "deleted";
}

/**
 * Renames or moves `file` to `to` (a path nothing is at): its text, edits
 * included, goes to a new-path draft and the old path is deleted. A new
 * file simply moves; a renamed file moved back where it came from is the
 * old path again, keeping its edits as an edit there.
 */
export function moveFile(store: DraftAccess, scope: DraftScope, file: MovableFile, to: string, now = Date.now()): "moved" | "returned" | "none" {
  if (to === file.path) return "none";
  const draft = store.get(scope, file.path);
  if (draft?.deleted) return "none";
  if (draft && draft.baseSha === null) {
    store.remove(scope, file.path);
    const origin = draft.movedFrom ? store.get(scope, draft.movedFrom) : undefined;
    const paired = origin?.deleted && origin.movedTo === file.path ? origin : undefined;
    if (paired && draft.movedFrom === to) {
      store.remove(scope, to);
      if (!draft.opaque && draft.content !== draft.original)
        store.save({ ...stamp(scope, now), path: to, baseSha: paired.baseSha, original: draft.original, content: draft.content });
      return "returned";
    }
    store.save({ ...draft, path: to, updatedAt: now, ...(paired ? {} : { movedFrom: undefined }) });
    if (paired) store.save({ ...paired, movedTo: to, updatedAt: now });
    return "moved";
  }
  const baseSha = draft?.baseSha ?? file.sha;
  if (!baseSha) return "none";
  const text = draft?.original ?? file.text;
  const opaque = text === undefined;
  const moved: SavedDraft = {
    ...stamp(scope, now), path: to, baseSha: null, original: text ?? "", content: draft?.content ?? text ?? "",
    movedFrom: file.path, sourceSha: baseSha,
  };
  if (opaque) moved.opaque = true;
  if (file.mode === "100755") moved.mode = "100755";
  store.save(moved);
  store.save({
    ...stamp(scope, now), path: file.path, baseSha, original: text ?? "", content: "", deleted: true, movedTo: to,
  });
  return "moved";
}

/** A copy of `file` at `to` (a path nothing is at), as a new file: its current text, or its blob when the text is not held. */
export function duplicateFile(store: DraftAccess, scope: DraftScope, file: MovableFile, to: string, now = Date.now()): boolean {
  const draft = store.get(scope, file.path);
  if (draft?.deleted) return false;
  let copy: SavedDraft;
  if (draft && !draft.opaque) copy = { ...stamp(scope, now), path: to, baseSha: null, original: draft.content, content: draft.content };
  else {
    // The branch's file (or a moved binary one): saved as the same blob while unchanged.
    const blob = draft?.sourceSha ?? file.sha;
    if (!blob) return false;
    const text = draft ? undefined : file.text;
    copy = { ...stamp(scope, now), path: to, baseSha: null, original: text ?? "", content: text ?? "", sourceSha: blob };
    if (text === undefined) copy.opaque = true;
    // A copy of an upload is one too: its bytes are still only in this browser.
    if (draft?.upload) copy.upload = draft.upload;
  }
  if (file.mode === "100755" || draft?.mode) copy.mode = "100755";
  store.save(copy);
  return true;
}

/**
 * Undoes the deletion at `path`: the file is back, with the edits it had
 * when it was deleted. A rename's old path is undone by moving the file
 * back. Returns the paths involved.
 */
export function restoreFile(store: DraftAccess, scope: DraftScope, path: string, now = Date.now()): { path: string; from?: string } | undefined {
  const marker = store.get(scope, path);
  if (!marker?.deleted) return undefined;
  if (marker.movedTo) {
    const back = moveBack(store, scope, marker.movedTo, now);
    if (back) return back;
  }
  store.remove(scope, path);
  if (marker.content !== marker.original)
    store.save({ ...stamp(scope, now), path, baseSha: marker.baseSha, original: marker.original, content: marker.content });
  return { path };
}

/**
 * Undoes the rename that made `path`: the file is at its old path again,
 * its edits kept there as an edit (a binary file has none). Returns the old
 * path (`path`) and the new one (`from`).
 */
export function moveBack(store: DraftAccess, scope: DraftScope, path: string, now = Date.now()): { path: string; from: string } | undefined {
  const draft = store.get(scope, path);
  if (!draft || draft.baseSha !== null || !draft.movedFrom) return undefined;
  const origin = store.get(scope, draft.movedFrom);
  store.remove(scope, path);
  const paired = origin?.deleted && origin.movedTo === path;
  if (paired) store.remove(scope, draft.movedFrom);
  const baseSha = paired ? origin!.baseSha : draft.sourceSha;
  if (baseSha && !draft.opaque && draft.content !== draft.original)
    store.save({ ...stamp(scope, now), path: draft.movedFrom, baseSha, original: draft.original, content: draft.content });
  return { path: draft.movedFrom, from: path };
}
