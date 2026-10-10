// New drafts all or none (src/new-drafts.ts): an agent's first file before the repository is a native site.
// (Moved from the component draft transaction's suite: Make component's files are now a guarded step's creates.)
import assert from "node:assert/strict";
import test from "node:test";
import { writeNewDrafts, type NewDraftsPort } from "../src/new-drafts.ts";
import type { DraftScope, SavedDraft } from "../src/drafts.ts";

const files = [{ path: "index.html", content: "<p>Home</p>" }, { path: "styles/site.css", content: "p { margin: 0 }" }];
function harness() {
  const scope: DraftScope = { account: "owner", repoId: 1, repo: "owner/a", branch: "main" };
  const records = new Map<string, SavedDraft>();
  const key = (scope: DraftScope, path: string) => `${scope.repoId}:${scope.branch}:${path}`;
  let current = true, saves = 0, fail = 0, refresh = 0;
  const store = {
    error: null as string | null,
    get: (scope: DraftScope, path: string) => records.get(key(scope, path)),
    save: (record: SavedDraft) => { records.set(key(record, record.path), record); if (++saves === fail) { store.error = "storage failed"; return false; } return true; },
  };
  const port: NewDraftsPort = { scope, store, isCurrent: () => current, exists: () => false, checkPath: async () => undefined, drop: (scope, path) => records.delete(key(scope, path)), refresh: () => { refresh++; } };
  return { scope, records, key, port, setCurrent: (value: boolean) => { current = value; }, failOn: (count: number) => { fail = count; }, refresh: () => refresh };
}

test("every file is written as a new draft, and the host refreshes once", async () => {
  const h = harness();
  assert.equal(await writeNewDrafts(files, h.port), undefined);
  assert.deepEqual([...h.records.values()].map(record => [record.path, record.content, record.baseSha]), files.map(file => [file.path, file.content, null]));
  assert.equal(h.refresh(), 1);
});

test("the final lookup switching repositories saves no file", async () => {
  const h = harness(); let calls = 0;
  h.port.checkPath = async () => { if (++calls === files.length) h.setCurrent(false); return undefined; };
  assert.match((await writeNewDrafts(files, h.port))!, /repository or branch changed/);
  assert.equal(h.records.size, 0);
});

test("read failures and a collision introduced during a lookup save no partial batch", async () => {
  const h = harness(); h.port.checkPath = async () => { throw new Error("lookup failed"); };
  assert.equal(await writeNewDrafts(files, h.port), "lookup failed");
  assert.equal(h.records.size, 0);
  const collision = { ...h.scope, ...files[0], version: 1 as const, baseSha: null, original: "", updatedAt: 10 };
  h.port.checkPath = async () => { h.records.set(h.key(h.scope, collision.path), collision); return undefined; };
  assert.match((await writeNewDrafts(files, h.port))!, /already exists/);
  assert.equal(h.records.size, 1);
  assert.equal(h.records.get(h.key(h.scope, collision.path)), collision);
});

test("a storage failure takes back only the exact drafts it saved", async () => {
  const h = harness(); h.failOn(2);
  assert.equal(await writeNewDrafts(files, h.port), "storage failed");
  assert.equal(h.records.size, 0);
});
