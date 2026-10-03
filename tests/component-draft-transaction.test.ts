import assert from "node:assert/strict";
import test from "node:test";
import { createComponentFileDrafts, type ComponentDraftTransaction } from "../src/page-builder/component-draft-transaction.ts";
import type { DraftScope, SavedDraft } from "../src/drafts.ts";

const files = [{ path: "components/test-card/test-card.html", content: "<p>Card</p>" }, { path: "components/test-card/test-card.css", content: ":host { display:block }" }];
function harness() {
  const scope: DraftScope = { account: "owner", repoId: 1, repo: "owner/a", branch: "main" };
  const records = new Map<string, SavedDraft>();
  const key = (scope: DraftScope, path: string) => `${scope.repoId}:${scope.branch}:${path}`;
  let current = true, saves = 0, fail = 0, refresh = 0;
  const messages: string[] = [];
  const store = {
    error: null as string | null,
    get: (scope: DraftScope, path: string) => records.get(key(scope, path)),
    save: (record: SavedDraft) => { records.set(key(record, record.path), record); if (++saves === fail) { store.error = "storage failed"; return false; } return true; },
  };
  const transaction: ComponentDraftTransaction = { scope, store, isCurrent: () => current, exists: () => false, checkPath: async () => undefined, drop: (scope, path) => records.delete(key(scope, path)), refresh: () => { refresh++; }, announce: message => messages.push(message) };
  return { scope, records, key, transaction, messages, setCurrent: (value: boolean) => { current = value; }, failOn: (count: number) => { fail = count; }, refresh: () => refresh };
}

test("the final lookup switching repositories saves no file", async () => {
  const h = harness(); let calls = 0;
  h.transaction.checkPath = async () => { if (++calls === files.length) h.setCurrent(false); return undefined; };
  const result = await createComponentFileDrafts(files, h.transaction);
  assert.match(result.error!, /repository or branch changed/);
  assert.equal(h.records.size, 0);
});

test("read failures and a collision introduced during a lookup save no partial batch", async () => {
  const h = harness(); h.transaction.checkPath = async () => { throw new Error("lookup failed"); };
  assert.deepEqual(await createComponentFileDrafts(files, h.transaction), { error: "lookup failed" });
  assert.equal(h.records.size, 0);
  const collision = { ...h.scope, ...files[0], version: 1 as const, baseSha: null, original: "", updatedAt: 10 };
  h.transaction.checkPath = async () => { h.records.set(h.key(h.scope, collision.path), collision); return undefined; };
  assert.match((await createComponentFileDrafts(files, h.transaction)).error!, /already exists/);
  assert.equal(h.records.size, 1);
  assert.equal(h.records.get(h.key(h.scope, collision.path)), collision);
});

test("a storage failure rolls back only the exact draft records this transaction saved", async () => {
  const h = harness(); h.failOn(2);
  assert.deepEqual(await createComponentFileDrafts(files, h.transaction), { error: "storage failed" });
  assert.equal(h.records.size, 0);
});

test("cleanup retains a replaced draft and leaves the same path in another repository alone", async () => {
  const h = harness(); const result = await createComponentFileDrafts(files, h.transaction);
  assert.ok(result.receipt?.isCurrent());
  const otherScope = { ...h.scope, repoId: 2, repo: "owner/b" };
  const own = h.transaction.store.get(h.scope, files[0].path)!;
  const replacement = { ...own, content: "Later draft", updatedAt: 11 };
  const other = { ...own, ...otherScope, content: "Other repository" };
  h.records.set(h.key(h.scope, own.path), replacement);
  h.records.set(h.key(otherScope, own.path), other);
  h.setCurrent(false); result.receipt!.undo();
  assert.equal(h.records.size, 2);
  assert.equal(h.records.get(h.key(h.scope, own.path)), replacement);
  assert.equal(h.records.get(h.key(otherScope, own.path)), other);
  assert.equal(h.refresh(), 1);
});

test("undo and redo retain scope and refuse a later colliding draft", async () => {
  const h = harness(); const { receipt } = await createComponentFileDrafts(files, h.transaction);
  receipt!.undo(); assert.equal(h.records.size, 0);
  await receipt!.redo(); assert.equal(h.records.size, 2); assert.equal(receipt!.isCurrent(), true);
  receipt!.undo(); h.setCurrent(false); await receipt!.redo(); assert.equal(h.records.size, 0);
  h.setCurrent(true);
  const collision = { ...h.scope, ...files[0], version: 1 as const, baseSha: null, original: "", updatedAt: 20 };
  h.records.set(h.key(h.scope, collision.path), collision);
  await receipt!.redo(); assert.equal(h.records.size, 1); assert.equal(h.records.get(h.key(h.scope, collision.path)), collision);
});

test("an open component model prevents cleanup of its exact draft", async () => {
  const h = harness(); const { receipt } = await createComponentFileDrafts(files, h.transaction);
  h.transaction.drop = () => false; receipt!.undo();
  assert.equal(h.records.size, 2); assert.match(h.messages[0], /is open/);
});
