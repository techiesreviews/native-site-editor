import test from "node:test";
import assert from "node:assert/strict";
import type { DraftScope, SavedDraft } from "../src/drafts";
import { addGuardedUpload } from "../src/page-builder/guarded-upload";
import { gitBlobSha, holdUploadKey, memoryUploadBytes, uploadKey } from "../src/uploads";

function harness() {
  const scope: DraftScope = { account: "owner", repoId: 1, repo: "owner/a", branch: "main" };
  const records = new Map<string, SavedDraft>();
  const key = (where: DraftScope, path: string) => `${where.repoId}:${path}`;
  const bytes = memoryUploadBytes();
  let current = true;
  const drafts = {
    get: (where: DraftScope, path: string) => records.get(key(where, path)),
    save: (record: SavedDraft) => { records.set(key(record, record.path), record); return true; },
    remove: (where: DraftScope, path: string) => records.delete(key(where, path)),
    list: (where: DraftScope) => [...records.values()].filter(record => record.repoId === where.repoId),
  };
  const options = { scope, drafts, bytes, folder: "images", file: new File(["png"], "a.png", { type: "image/png" }), isCurrent: () => current, exists: () => false, checkPath: async () => undefined };
  return { options, records, key, setCurrent: (value: boolean) => { current = value; } };
}

test("a scope switch after byte storage leaves no original-scope draft or owned bytes", async () => {
  const h = harness(), originalPut = h.options.bytes.put;
  h.options.bytes.put = async (key, blob) => { await originalPut(key, blob); h.setCurrent(false); };
  const result = await addGuardedUpload(h.options);
  assert.match(result.error!, /repository or branch changed/);
  assert.equal(h.records.size, 0);
  assert.equal(h.options.bytes.map.size, 0);
});
test("path collision at the final save preserves the other draft and drops only owned bytes", async () => {
  const h = harness(), originalPut = h.options.bytes.put;
  const other: SavedDraft = { ...h.options.scope, path: "images/a.png", version: 1, baseSha: null, original: "", content: "other", updatedAt: 1 };
  h.options.bytes.put = async (key, blob) => { await originalPut(key, blob); h.options.drafts.save(other); };
  const result = await addGuardedUpload(h.options);
  assert.match(result.error!, /already exists/);
  assert.equal(h.options.drafts.get(h.options.scope, other.path), other);
  assert.equal(h.options.bytes.map.size, 0);
});
test("receipt cleanup uses the originating scope and exact draft identity", async () => {
  const h = harness(), result = await addGuardedUpload(h.options);
  assert.ok(result.receipt);
  const otherScope = { ...h.options.scope, repoId: 2 }, path = result.path!;
  const other: SavedDraft = { ...otherScope, path, version: 1, baseSha: null, original: "", content: "other repo", updatedAt: 2 };
  h.options.drafts.save(other); h.setCurrent(false);
  await result.receipt.undo();
  assert.equal(h.options.drafts.get(h.options.scope, path), undefined);
  assert.equal(h.options.drafts.get(otherScope, path), other);
  assert.equal(h.options.bytes.map.size, 0);
});
test("cleanup preserves bytes that existed before this upload or are referenced by another draft", async () => {
  for (const preexisting of [true, false]) {
    const h = harness(), sha = await gitBlobSha(new TextEncoder().encode("png")), key = uploadKey(h.options.scope, sha);
    if (preexisting) await h.options.bytes.put(key, new Blob(["png"]));
    const result = await addGuardedUpload(h.options);
    assert.ok(result.receipt);
    if (!preexisting) h.options.drafts.save({ ...h.options.scope, path: "images/shared.png", version: 1, baseSha: null, original: "", content: "", updatedAt: 2, sourceSha: sha, opaque: true });
    await result.receipt.undo();
    assert.ok(await h.options.bytes.get(key));
  }
});
test("cleanup preserves another operation's byte hold and a changed own draft", async () => {
  const h = harness(), result = await addGuardedUpload(h.options);
  assert.ok(result.receipt);
  const record = h.options.drafts.get(h.options.scope, result.path!)!, key = uploadKey(h.options.scope, record.sourceSha!);
  const release = holdUploadKey(key);
  h.options.drafts.save({ ...record, updatedAt: 2 });
  assert.equal(await result.receipt.undo(), false);
  assert.ok(await h.options.bytes.get(key));
  release();
});
