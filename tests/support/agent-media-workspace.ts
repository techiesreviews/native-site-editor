import assert from "node:assert/strict";
import { DraftStore, indexedDbDrafts, type DraftScope } from "../../src/drafts";
import { indexedDbAgentRecords } from "../../src/agent-records";
import { memoryUploadBytes } from "../../src/uploads";
import { mediaDraftTransaction, type MediaDraftHost } from "../../src/page-builder/media-draft-transaction";
import { applyMediaWorkspaceBatch, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../../src/page-builder/media-workspace";
import { fakeIndexedDB } from "./fake-agent-indexeddb";

/** The source-only fixtures keep their visible maps; agent writes still use the production
 * transaction, DraftStore and owner-fenced IndexedDB records (including receipts). */
export function agentMediaStorage(scope: DraftScope) {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(undefined, fake.factory);
  const database = indexedDbDrafts(undefined, fake.factory);
  const store = new DraftStore({ getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 }, {
    ...database,
    // snapshot uses the real records adapter without a global DOM IDBKeyRange polyfill.
    load: async from => (await records.snapshot(scope)).drafts.filter(([key]) => key.startsWith(from)),
  });
  const ready = store.load(scope.account), uploads = memoryUploadBytes();
  const context = async (ctx: MediaWorkspaceContext): Promise<MediaWorkspaceContext> => {
    await ready;
    return { ...ctx, drafts: store, agentRecords: records, flushTyping() {} };
  };
  const apply = async (ctx: MediaWorkspaceContext, batch: MediaWorkspaceBatch, view: {
    text: Map<string, string>; bytes: Map<string, Blob>; paths(): string[];
    setPaths(paths: string[]): void; version(path: string): string | undefined;
    setVersion?(path: string, version: string | undefined): void;
    history: (() => void)[]; labels?: string[];
  }) => {
    await ready;
    const beforeText = new Map(view.text), beforeBytes = new Map(view.bytes), beforePaths = view.paths();
    const touched = new Set([...batch.edits.keys(), ...batch.deletes, ...batch.uploads.map(item => item.path), ...batch.restores.map(item => item.path)]);
    const versions = new Map([...touched].map(path => [path, view.version(path)]));
    const afterBytes = new Map(beforeBytes);
    for (const upload of batch.uploads) afterBytes.set(upload.path, upload.blob);
    for (const item of batch.restores) if (!afterBytes.has(item.path)) afterBytes.set(item.path, new Blob(["restored"]));
    let published = false;
    const refresh = () => {
      const paths = new Set(view.paths());
      for (const path of touched) {
        const draft = store.get(scope, path);
        const present = draft ? !draft.deleted : beforePaths.includes(path) || published && batch.restores.some(item => item.path === path);
        if (!present) { paths.delete(path); view.text.delete(path); view.bytes.delete(path); view.setVersion?.(path, undefined); continue; }
        paths.add(path);
        if (draft && !draft.opaque) view.text.set(path, draft.content);
        else if (beforeText.has(path)) view.text.set(path, beforeText.get(path)!);
        else view.text.delete(path);
        const blob = draft?.upload ? afterBytes.get(path) : beforeBytes.get(path) ?? afterBytes.get(path);
        if (blob) view.bytes.set(path, blob); else view.bytes.delete(path);
        view.setVersion?.(path, draft?.sourceSha ?? versions.get(path));
      }
      view.setPaths([...paths]);
    };
    const host = {
      scope, store, bytes: uploads, stamp: { holds: () => { ctx.assertLive(); return true; }, changed: () => undefined },
      paths: () => view.paths(), source: path => view.text.get(path), assetVersion: path => view.version(path),
      entry: async path => beforePaths.includes(path) ? { path, sha: store.get(scope, path)?.baseSha ?? versions.get(path) ?? path, text: beforeText.get(path) } : undefined,
      mounted: () => false, modelState: () => ({ isCurrent: () => true }), evictModel: (_path, proof) => proof,
      historyCurrent: () => true,
      prepareSources: () => ({ isCurrent: () => true, apply: () => true, undo: () => true, redo: () => true }),
      history(undo) {
        published = true;
        view.labels?.push(batch.label);
        view.history.push(() => { published = false; assert.equal(undo(), true); });
        return true;
      },
      refresh, announce() {},
    } satisfies MediaDraftHost;
    await applyMediaWorkspaceBatch(batch, mediaDraftTransaction(host));
    if (batch.agent) {
      const snapshot = await records.snapshot(scope);
      for (const [path, draft] of store.list(scope).map(draft => [draft.path, draft] as const))
        assert.deepEqual(snapshot.drafts.find(([, value]) => value.path === path)?.[1], draft, "visible draft must match the durable commit");
      assert.ok(fake.stores.get("receipts")?.size, "agent host must commit its receipt");
    }
  };
  return { store, records, ready, context, apply, uploads, fake };
}
