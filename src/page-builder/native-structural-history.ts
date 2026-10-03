import type { DraftScope, SavedDraft } from "../drafts";
import { deleteFile, moveFile, type DraftAccess, type MovableFile } from "../file-changes";

/** Build a compound file operation without publishing any intermediate draft. */
export function planNativeStructuralDrafts(input: {
  scope: DraftScope;
  before: ReadonlyMap<string, SavedDraft | undefined>;
  movable: ReadonlyMap<string, MovableFile>;
  bases: ReadonlyMap<string, { sha: string; text: string } | undefined>;
  moves: readonly { from: string; to: string }[];
  deletes: readonly string[];
  creates: readonly { path: string; content: string }[];
  edits: ReadonlyMap<string, string>;
  now: number;
}) {
  const { scope, movable, bases, now } = input;
  const after = new Map(input.before);
  const overlay: DraftAccess = {
    get: (_scope, path) => after.get(path),
    save: draft => { after.set(draft.path, draft); return true; },
    remove: (_scope, path) => { after.set(path, undefined); return true; },
  };
  for (const move of input.moves) {
    const file = movable.get(move.from);
    if (!file) throw new Error(`${move.from} is not there any more.`);
    moveFile(overlay, scope, file, move.to, now);
  }
  for (const path of input.deletes) {
    const file = movable.get(path);
    if (!file) throw new Error(`${path} is not there any more.`);
    deleteFile(overlay, scope, file, now);
  }
  for (const file of input.creates) overlay.save({ ...scope, version: 1, path: file.path, baseSha: null, original: "", content: file.content, updatedAt: now });
  for (const [path, content] of input.edits) {
    const draft = after.get(path), base = bases.get(path);
    if (draft && !draft.deleted && draft.baseSha !== null && !draft.movedFrom && content === draft.original) after.set(path, undefined);
    else if (draft && !draft.deleted) after.set(path, { ...draft, content, updatedAt: now });
    else if (base && content === base.text) continue;
    else if (draft?.deleted) after.set(path, { ...scope, version: 1, path, baseSha: draft.baseSha, original: draft.original, content, updatedAt: now });
    else if (base) after.set(path, { ...scope, version: 1, path, baseSha: base.sha, original: base.text, content, updatedAt: now });
    else after.set(path, { ...scope, version: 1, path, baseSha: null, original: "", content, updatedAt: now });
  }
  return after;
}
