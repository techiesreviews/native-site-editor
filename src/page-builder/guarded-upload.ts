import type { DraftScope, SavedDraft } from "../drafts";
import type { DraftAccess } from "../file-changes";
import { addUpload, holdUploadKey, uploadKeyHeld, uploadKey, type UploadBytes } from "../uploads";

interface GuardedUploadStore extends DraftAccess { list(scope: DraftScope): SavedDraft[] }
export interface GuardedUploadOptions {
  scope: DraftScope;
  drafts: GuardedUploadStore;
  bytes: UploadBytes;
  folder: string;
  file: File;
  isCurrent(): boolean;
  exists(path: string): boolean;
  checkPath(path: string): Promise<string | undefined>;
}

/** An upload owns only its exact new draft and newly stored, unreferenced bytes. */
export async function addGuardedUpload(options: GuardedUploadOptions) {
  const scope = { ...options.scope }, { drafts, bytes } = options;
  const own = new Map<string, SavedDraft>();
  const ownedBytes = new Set<string>();
  const holds = new Map<string, () => void>();
  const changed = "The repository or branch changed while uploading. No upload was kept.";
  const assertLive = () => { if (!options.isCurrent()) throw new Error(changed); };
  const release = () => { for (const done of holds.values()) done(); holds.clear(); };
  const cleanup = async () => {
    let complete = true;
    for (const [path, record] of own) {
      if (drafts.get(scope, path) !== record) { complete = false; continue; }
      if (drafts.remove(scope, path)) own.delete(path); else complete = false;
    }
    release();
    for (const key of ownedBytes) {
      if (uploadKeyHeld(key) || drafts.list(scope).some(record => record.sourceSha && uploadKey(scope, record.sourceSha) === key)) continue;
      await bytes.delete(key);
      ownedBytes.delete(key);
    }
    return complete;
  };
  try {
    assertLive();
    const result = await addUpload({
      scope, folder: options.folder, file: options.file,
      taken: async path => {
        assertLive();
        if (options.exists(path) || drafts.get(scope, path)) return true;
        const problem = await options.checkPath(path);
        assertLive();
        return problem !== undefined;
      },
      drafts: {
        get: (where, path) => drafts.get(where, path),
        save: record => {
          assertLive();
          if (options.exists(record.path) || drafts.get(scope, record.path)) throw new Error(`${record.path} already exists. The upload was not added.`);
          own.set(record.path, record);
          return drafts.save(record);
        },
        remove: (_where, path) => {
          const record = own.get(path);
          return !!record && drafts.get(scope, path) === record && drafts.remove(scope, path);
        },
      },
      bytes: {
        get: key => bytes.get(key),
        delete: key => bytes.delete(key),
        keys: () => bytes.keys(),
        put: async (key, blob) => {
          assertLive();
          if (!holds.has(key)) holds.set(key, holdUploadKey(key));
          const before = await bytes.get(key);
          assertLive();
          if (!before) ownedBytes.add(key);
          await bytes.put(key, blob);
          assertLive();
        },
      },
    });
    assertLive();
    if (!result.ok) throw new Error(result.error);
    release();
    return { path: result.path, warning: result.warning, receipt: { undo: cleanup } };
  } catch (error) {
    await cleanup();
    return { error: error instanceof Error ? error.message : "The upload could not be added." };
  }
}
