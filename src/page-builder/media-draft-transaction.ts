import { refuse as showRefusal } from "../components/refusal-note";
import type { Stamp } from "../guarded-edit";
import type { DraftScope, SavedDraft } from "../drafts";
import { deleteFile, moveFile, type DraftAccess, type MovableFile } from "../file-changes";
import { gitBlobSha, holdUploadDrafts, holdUploadKey, uploadKey, uploadKeyHeld, type UploadBytes } from "../uploads";
import type { MediaWorkspaceBatch, MediaBatchTransaction } from "./media-workspace";

interface SourceReceipt { apply(): boolean; undo(): boolean; redo(): boolean; isCurrent(): boolean }
export interface MediaDraftHost {
  scope: DraftScope;
  store: DraftAccess & { list(scope: DraftScope): SavedDraft[]; error: string | null };
  bytes: UploadBytes;
  stamp: Stamp;
  paths(): string[];
  source(path: string): string | undefined;
  assetVersion(path: string): string | undefined;
  entry(path: string): Promise<MovableFile | undefined>;
  mounted(path: string): boolean;
  prepareSources(edits: { path: string; expectedSource: string; text: string }[]): SourceReceipt | undefined;
  modelState(path: string): { isCurrent(): boolean };
  evictModel(path: string, proof: { isCurrent(): boolean }): { isCurrent(): boolean } | undefined;
  historyCurrent(): boolean;
  history(undo: () => boolean, redo: () => boolean | Promise<boolean>, dispose: () => void): boolean;
  refresh(): void;
  announce(message: string): void;
}
interface State {
  before: Map<string, SavedDraft | undefined>;
  after: Map<string, SavedDraft | undefined>;
  entries: Map<string, MovableFile | undefined>;
  sources: SourceReceipt;
  modelStates: Map<string, { isCurrent(): boolean }>;
  mountedStates: Map<string, boolean>;
  staged: Map<string, { sha: string; blob: Blob; text?: string }>;
  ownedKeys: Set<string>;
  releases: (() => void)[];
  dispose?: () => void;
  committed: boolean;
  planned?: Map<string, SavedDraft | undefined>;
  releaseFence?: () => void;
  agent?: boolean;
  published?: boolean;
}

/** Owns only the captured draft records, source steps, and newly staged bytes. */
export function mediaDraftTransaction(host: MediaDraftHost): MediaBatchTransaction<State> {
  const assertLive = () => { if (!host.stamp.holds()) throw new Error("The repository changed. Close Media and open it again."); };
  const refuse = (reason: string, history?: "undo" | "redo") => { host.announce(reason); showRefusal(reason, { history }); };
  const changedSince = "The images or pages of this change were edited since; edit them directly instead.";
  const scope = { ...host.scope };
  const pathsOf = (batch: MediaWorkspaceBatch) => [...new Set([
    ...batch.edits.keys(), ...batch.moves.flatMap(move => [move.from, move.to]), ...batch.deletes, ...batch.restores.map(restore => restore.path), ...batch.uploads.map(upload => upload.path),
  ])];
  const unchanged = (records: Map<string, SavedDraft | undefined>) => [...records].every(([path, record]) => host.store.get(scope, path) === record);
  const write = (path: string, record: SavedDraft | undefined) => {
    if (!(record ? host.store.save(record) : host.store.remove(scope, path))) throw new Error(host.store.error ?? `Could not update ${path}.`);
  };
  const release = (state: State) => {
    // Failed/unpublished agent staging has no durable orphan proof. Keep it held in this tab
    // so the ordinary memory-based sweep cannot delete it after a refusal or uncertain outcome.
    if (state.agent && !state.published) return;
    for (const done of state.releases.splice(0)) done();
  };
  const cleanup = async (state: State) => {
    state.dispose?.();
    release(state);
    // Agent staging is retained unless a separate durable orphan proof permits deletion.
    if (state.agent) return;
    for (const key of state.ownedKeys) {
      if (uploadKeyHeld(key) || host.store.list(scope).some(record => record.sourceSha && uploadKey(scope, record.sourceSha) === key)) continue;
      await host.bytes.delete(key);
    }
  };
  const modelsCurrent = (state: State) => [...state.modelStates].every(([path, proof]) => proof.isCurrent() && host.mounted(path) === state.mountedStates.get(path));
  const advanceOwnedSources = (batch: MediaWorkspaceBatch, state: State) => {
    if (!state.sources.isCurrent()) return;
    // Capture only the verified receipt transition, before any host/store callback.
    for (const path of batch.edits.keys()) if (state.mountedStates.get(path)) state.modelStates.set(path, host.modelState(path));
  };
  const evictOwnedCaches = (batch: MediaWorkspaceBatch, state: State) => {
    for (const path of batch.edits.keys()) if (!state.mountedStates.get(path)) {
      const proof = state.modelStates.get(path)!;
      const next = host.evictModel(path, proof);
      if (next) state.modelStates.set(path, next);
      // A refused eviction preserves the old proof and therefore refuses stale history.
    }
  };
  const capture = (records: Map<string, SavedDraft | undefined>) => new Map([...records.keys()].map(path => [path, host.store.get(scope, path)]));
  const restoreOwn = (expected: Map<string, SavedDraft | undefined>, desired: Map<string, SavedDraft | undefined>) => {
    for (const [path, record] of desired) if (host.store.get(scope, path) === expected.get(path)) write(path, record);
  };
  const plan = (batch: MediaWorkspaceBatch, state: State) => {
    const planned = new Map(state.before);
    const local: DraftAccess = { get: (_, path) => planned.get(path), save: record => { planned.set(record.path, record); return true; }, remove: (_, path) => { planned.set(path, undefined); return true; } };
    for (const move of batch.moves) {
      if (host.paths().includes(move.to) || planned.get(move.to)) throw new Error(`${move.to} already exists.`);
      if (moveFile(local, scope, state.entries.get(move.from) ?? { path: move.from }, move.to) === "none") throw new Error(`${move.from} cannot be moved.`);
    }
    for (const path of batch.deletes) if (deleteFile(local, scope, state.entries.get(path) ?? { path }) === "none") throw new Error(`${path} cannot be deleted.`);
    for (const { path, sha } of batch.restores) {
      const previous = planned.get(path);
      if (previous?.deleted && !previous.movedTo && previous.baseSha === sha) planned.set(path, undefined);
      else if (!host.paths().includes(path) && !previous) planned.set(path, {
        ...scope, version: 1, path, baseSha: null, original: "", content: "", sourceSha: sha, opaque: true, updatedAt: Date.now(),
      });
      else throw new Error(`${path} already exists.`);
    }
    for (const [path, content] of batch.edits) {
      const previous = planned.get(path), original = host.source(path) ?? "";
      const textDraft = previous?.opaque ? { ...previous, opaque: undefined, sourceSha: undefined, upload: undefined } : previous;
      planned.set(path, textDraft ? { ...textDraft, content, updatedAt: Date.now() } : { ...scope, version: 1, path, baseSha: state.entries.get(path)?.sha ?? null, original, content, updatedAt: Date.now() });
    }
    for (const [path, upload] of state.staged) {
      const previous = planned.get(path);
      if (batch.overwrites?.includes(path)) {
        if (!batch.expectedAssets.has(path) || !batch.expectedPaths.includes(path) || batch.deletes.includes(path) || previous?.deleted)
          throw new Error(`${path} cannot be replaced without its captured image revision.`);
        planned.set(path, { ...previous, ...scope, version: 1, path, baseSha: previous?.baseSha ?? state.entries.get(path)?.sha ?? null,
          original: previous?.original ?? "", content: "", sourceSha: upload.sha, opaque: true,
          upload: { size: upload.blob.size, type: upload.blob.type }, updatedAt: Date.now() });
        continue;
      }
      if (host.paths().includes(path) || previous && (!previous.deleted || previous.movedTo)) throw new Error(`${path} already exists.`);
      if (previous?.deleted && previous.baseSha === upload.sha) planned.set(path, undefined);
      else if (previous?.deleted && upload.text !== undefined) planned.set(path, { ...previous, deleted: undefined, content: upload.text, updatedAt: Date.now() });
      else if (previous) throw new Error(`${path} already exists.`);
      else planned.set(path, { ...scope, version: 1, path, baseSha: null, original: "", content: "", sourceSha: upload.sha, opaque: true, upload: { size: upload.blob.size, type: upload.blob.type }, updatedAt: Date.now() });
    }
    return planned;
  };
  return {
    assertLive, paths: () => host.paths(), source: (path) => host.source(path), assetVersion: (path) => host.assetVersion(path),
    async snapshot(batch) {
      const paths = pathsOf(batch);
      for (const path of [...paths]) {
        const record = host.store.get(scope, path);
        for (const paired of [record?.movedFrom, record?.movedTo]) if (paired && !paths.includes(paired)) paths.push(paired);
      }
      const releaseFence = batch.agent ? await batch.agent.fence(scope, paths) : undefined;
      try {
        assertLive();
        const before = new Map(pathsOf(batch).map(path => [path, host.store.get(scope, path)]));
        // Renamed drafts can carry a paired origin outside this batch's visible paths.
        for (const record of before.values()) for (const path of [record?.movedFrom, record?.movedTo])
          if (path && !before.has(path)) before.set(path, host.store.get(scope, path));
        const edits = [...batch.edits].filter(([path]) => host.mounted(path)).map(([path, text]) => {
          const expectedSource = host.source(path);
          if (expectedSource === undefined) throw new Error(`${path} source is unavailable.`);
          const draft = before.get(path);
          if (batch.agent && draft && (draft.deleted || draft.opaque || draft.content !== expectedSource))
            throw new Error(`${path} source changed in the editor meanwhile.`);
          return { path, expectedSource, text };
        });
        const sources = host.prepareSources(edits);
        if (!sources) throw new Error("The editor source changed while preparing image changes.");
        const state: State = { mountedStates: new Map([...before.keys()].map(path => [path, host.mounted(path)])), modelStates: new Map([...before.keys()].map(path => [path, host.modelState(path)])), before, after: new Map(), entries: new Map(), sources, staged: new Map(), ownedKeys: new Set(), releases: [], committed: false, releaseFence, agent: Boolean(batch.agent) };
        for (const path of before.keys()) {
          assertLive();
          state.entries.set(path, await host.entry(path));
          assertLive();
          if (!unchanged(before) || !sources.isCurrent() || !modelsCurrent(state) || !host.historyCurrent()) throw new Error("The files changed while preparing image changes.");
        }
        return state;
      } catch (error) { releaseFence?.(); throw error; }
    },
    async stage(batch, state) {
      for (const upload of batch.uploads) {
        assertLive();
        const sha = await gitBlobSha(new Uint8Array(await upload.blob.arrayBuffer()));
        assertLive();
        const key = uploadKey(scope, sha);
        state.releases.push(holdUploadKey(key));
        const existing = await host.bytes.get(key);
        assertLive();
        if (!existing) { state.ownedKeys.add(key); await host.bytes.put(key, upload.blob); }
        assertLive();
        const previous = state.before.get(upload.path);
        // A removed text draft keeps its edited text. Recover it as an edit when Save has not removed its branch blob yet.
        const text = previous?.deleted && await gitBlobSha(new TextEncoder().encode(previous.content)) === sha ? previous.content : undefined;
        assertLive();
        state.staged.set(upload.path, { sha, blob: upload.blob, text });
      }
    },
    async persist(batch, state) {
      const agent = batch.agent!;
      const current = () => host.stamp.holds() && (batch.live?.() ?? true) && unchanged(state.before)
        && state.sources.isCurrent() && modelsCurrent(state) && host.historyCurrent();
      if (!current()) throw new Error("The files changed before image changes could be applied.");
      state.planned = plan(batch, state);
      const fresh = await agent.commit(state.before, state.planned, current);
      state.committed = true;
      if (!fresh || !current()) {
        await agent.settle(state.planned);
        host.refresh();
        return false;
      }
      return true;
    },
    release(state) { state.releaseFence?.(); release(state); },
    commit(batch, state) {
      assertLive();
      if (!unchanged(state.before) || !state.sources.isCurrent() || !modelsCurrent(state) || !host.historyCurrent()) throw new Error("The files changed before image changes could be applied.");
      const planned = state.planned ?? plan(batch, state);
      const publish = () => {
        // Undo writes `before` back: its uploads' bytes stay while the step lives (Redo re-stages its own).
        state.dispose = holdUploadDrafts(scope, state.before.values());
        if (!state.sources.apply()) throw new Error("The editor source changed before image changes could be applied.");
        advanceOwnedSources(batch, state);
        state.after = capture(state.before);
        try {
          for (const [path, record] of planned) { try { write(path, record); } finally { state.after.set(path, host.store.get(scope, path)); } }
        } catch (error) {
          if (batch.agent) throw error;
          const restored = state.sources.undo();
          const desired = new Map(state.before);
          for (const [path] of batch.edits) if (host.mounted(path)) {
            if (restored) state.after.set(path, host.store.get(scope, path));
            else desired.delete(path);
          }
          if (!restored) refuse("The editor changed during rollback; its newer source was kept.");
          restoreOwn(state.after, desired);
          throw error;
        }
        state.committed = true;
        release(state);
        let applied = true;
        const moveHistory = (undo: boolean) => {
          try {
            assertLive();
            const expected = applied ? state.after : state.before;
            if (undo !== applied || !unchanged(expected) || !state.sources.isCurrent() || !modelsCurrent(state) || !host.historyCurrent()) { refuse(changedSince, undo ? "undo" : "redo"); return false; }
            const desired = undo ? state.before : state.after;
            if (!(undo ? state.sources.undo() : state.sources.redo())) { refuse(changedSince, undo ? "undo" : "redo"); return false; }
            advanceOwnedSources(batch, state);
            const writes = capture(expected);
            try { for (const [path, record] of desired) { try { write(path, record); } finally { writes.set(path, host.store.get(scope, path)); } } }
            catch (error) {
              const restored = undo ? state.sources.redo() : state.sources.undo();
              const desired = new Map(expected);
              for (const [path] of batch.edits) if (host.mounted(path)) {
                if (restored) writes.set(path, host.store.get(scope, path));
                else desired.delete(path);
              }
              if (!restored) refuse("The editor changed during rollback; its newer source was kept.");
              restoreOwn(writes, desired);
              throw error;
            }
            if (undo) state.before = capture(desired); else state.after = capture(desired);
            applied = !undo;
            evictOwnedCaches(batch, state);
            host.refresh();
            return true;
          } catch (error) { refuse(error instanceof Error ? error.message : "The image history action could not be applied."); return false; }
        };
        evictOwnedCaches(batch, state);
        const registered = host.history(() => moveHistory(true), async () => {
          const restaged = { ...state, published: false, dispose: undefined, ownedKeys: new Set<string>(), releases: [] as (() => void)[] };
          try {
            assertLive();
            if (applied || !unchanged(state.before) || !state.sources.isCurrent() || !modelsCurrent(state) || !host.historyCurrent()) { refuse(changedSince, "redo"); return false; }
            for (const upload of state.staged.values()) {
              const key = uploadKey(scope, upload.sha);
              restaged.releases.push(holdUploadKey(key));
              const existing = await host.bytes.get(key);
              assertLive();
              if (!unchanged(state.before) || !state.sources.isCurrent() || !modelsCurrent(state) || !host.historyCurrent()) throw new Error("The files changed while restoring image bytes.");
              if (!existing) { restaged.ownedKeys.add(key); await host.bytes.put(key, upload.blob); }
              assertLive();
            }
            const restored = moveHistory(false);
            if (!restored) await cleanup(restaged);
            return restored;
          } catch (error) {
            await cleanup(restaged);
            refuse(error instanceof Error ? error.message : "The image history action could not be restored.");
            return false;
          } finally { release(restaged); }
        }, state.dispose);
        if (!registered || !host.historyCurrent()) {
          if (batch.agent) throw new Error("The change was saved, but its editor history could not be updated.");
          state.committed = false;
          const restored = state.sources.undo();
          const desired = new Map(state.before);
          for (const [path] of batch.edits) if (host.mounted(path)) {
            if (restored) state.after.set(path, host.store.get(scope, path)); else desired.delete(path);
          }
          restoreOwn(state.after, desired);
          throw new Error("The initiating editor changed; image changes were rolled back.");
        }
        host.refresh();
      };
      if (batch.agent) { batch.agent.publish(planned, publish); state.published = true; }
      else publish();
    },
    async rollback(batch, state) {
      if (batch.agent) {
        if (state.committed) { await batch.agent.settle(state.planned!); host.refresh(); }
        else { state.dispose?.(); release(state); }
      } else if (!state.committed) await cleanup(state);
    },
  };
}
