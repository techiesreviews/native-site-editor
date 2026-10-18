import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { AgentRecordsError, indexedDbAgentRecords, unavailableAgentRecords } from "../src/agent-records.ts";
import { DraftStore, draftDatabaseName, draftDatabaseVersion, draftKey, draftStores, indexedDbDrafts, openDraftDatabase, type SavedDraft } from "../src/drafts.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";
import { forEachAwait } from "./support/await-race.ts";
import { payloadIdentity, workspaceKey } from "../shared/agent-command.ts";

// Deliberately partial DOM implementations: only the IDB surface this storage layer uses.
const partial = <T>(value: Partial<T>): T => value as T;

const draft: SavedDraft = { version: 1, account: "Lex", repoId: 1, repo: "lex/site", branch: "main", path: "index.html", baseSha: null, original: "", content: "draft", updatedAt: 1 };
const key = draftKey(draft, draft.path);
const command = () => ({ workspace: { account: draft.account, repoId: draft.repoId, branch: draft.branch }, generation: 0, expectedRevision: 0, expectedDrafts: [[key, null]] as [string, SavedDraft | null][], drafts: [[key, { ...draft }]] as [string, SavedDraft | null][], receipt: { authorizationId: "grant-1", operationId: "operation-1", payloadIdentity: payloadIdentity({ edit: "draft" }), outcome: { changed: 1 }, createdAt: 100 } });
const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; } };
};
function range(t: TestContext) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: { bound: (lower: string, upper: string) => ({ lower, upper }) } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "IDBKeyRange", descriptor); else Reflect.deleteProperty(globalThis, "IDBKeyRange"); });
}
const code = (expected: AgentRecordsError["code"]) => (error: unknown) => error instanceof AgentRecordsError && error.code === expected;

test("v1 upgrade preserves drafts, adds stores and stays readable by the manual editor", async (t) => {
  range(t);
  const fake = fakeIndexedDB(draft), manual = indexedDbDrafts(draftDatabaseName, fake.factory);
  const store = new DraftStore(storage(), manual);
  await store.load("lex");
  assert.equal(fake.state.version, draftDatabaseVersion);
  assert.deepEqual([...fake.stores.keys()], Object.values(draftStores));
  assert.deepEqual(store.get(draft, draft.path), draft);
  const records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  assert.deepEqual(await records.workspace(draft), { revision: 0, generation: 0 });
  const input = command(); input.expectedDrafts = [[key, draft]]; input.drafts[0][1]!.content = "agent draft";
  await records.commit(input);
  await store.refresh([key]);
  assert.equal(store.get(draft, draft.path)?.content, "agent draft");
});

for (const failure of ["AbortError", "QuotaExceededError"]) for (const failPutAt of [2, 3]) test(`${failure} on put ${failPutAt} rolls back deletes, puts, receipt and revision`, async () => {
  const fake = fakeIndexedDB(draft), records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  const input = command(), other = { ...draft, path: "about.html" };
  input.expectedDrafts = [[key, draft], [draftKey(other, other.path), null]];
  input.drafts = [[key, null], [draftKey(other, other.path), other]];
  fake.state.failure = failure; fake.state.failPutAt = failPutAt; // Fail receipt or workspace after the draft writes.
  await assert.rejects(records.commit(input), code("aborted"));
  assert.deepEqual([...fake.stores.get("drafts")!], [[key, draft]]);
  assert.equal(await records.receipt(draft, input.receipt.operationId, "grant-1"), undefined);
  assert.deepEqual(await records.workspace(draft), { revision: 0, generation: 0 });
});

test("missing factory and open errors refuse agent operations while manual fallback still works", async () => {
  const fake = fakeIndexedDB(); fake.state.openError = true;
  for (const records of [unavailableAgentRecords(), indexedDbAgentRecords(), indexedDbAgentRecords(draftDatabaseName, partial<IDBFactory>({ open() { throw new DOMException("Denied", "SecurityError"); } })), indexedDbAgentRecords(draftDatabaseName, fake.factory)]) {
    await assert.rejects(records.commit(command()), code("unavailable"));
    await assert.rejects(records.cancel(draft, "operation-1", "grant-1"), code("unavailable"));
    await assert.rejects(records.workspace(draft), code("unavailable"));
    await assert.rejects(records.receipt(draft, "operation-1", "grant-1"), code("unavailable"));
    await assert.rejects(records.setGeneration(draft, 0, 1), code("unavailable"));
    await assert.rejects(records.putConversation(draft, { id: "one", content: "hello", unfinished: true, updatedAt: 1 }), code("unavailable"));
    await assert.rejects(records.conversations(draft), code("unavailable"));
  }
  const disk = storage(), manual = new DraftStore(disk, indexedDbDrafts(draftDatabaseName, fake.factory));
  await manual.load("lex"); assert.equal(manual.save(draft), true);
  assert.deepEqual(new DraftStore(disk).get(draft, draft.path), draft);
});

test("stale revisions, generations and expected drafts abort without changing records", async () => {
  const fake = fakeIndexedDB(draft), records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  for (const change of [{ expectedRevision: 1 }, { generation: 1 }, { expectedDrafts: [[key, { ...draft, updatedAt: 2 }]] }, { expectedDrafts: [[key, { ...draft, content: "same time, other text" }]] }, { expectedDrafts: [[key, null]] }]) {
    await assert.rejects(records.commit({ ...command(), ...change } as ReturnType<typeof command>), code("conflict"));
    assert.deepEqual([...fake.stores.get("drafts")!], [[key, draft]]);
    assert.equal(await records.receipt(draft, "operation-1", "grant-1"), undefined);
    assert.deepEqual(await records.workspace(draft), { revision: 0, generation: 0 });
  }
});

test("changed drafts require workspace-scoped expectations, including deletions", async () => {
  const fake = fakeIndexedDB(draft), records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  const foreign = { ...draft, branch: "other" }, foreignKey = draftKey(foreign, foreign.path);
  for (const input of [
    { ...command(), expectedDrafts: [] },
    { ...command(), expectedDrafts: [[foreignKey, null]], drafts: [[foreignKey, null]] },
    { ...command(), expectedDrafts: [[key, draft]], drafts: [[key, foreign]] },
  ]) await assert.rejects(records.commit(input as ReturnType<typeof command>), code("conflict"));
  assert.deepEqual([...fake.stores.get("drafts")!], [[key, draft]]);
  assert.deepEqual(await records.workspace(draft), { revision: 0, generation: 0 });
  const other = { ...draft, path: "about.html" }, otherKey = draftKey(other, other.path);
  await records.commit({ ...command(), expectedDrafts: [[key, draft], [otherKey, null]], drafts: [[key, null], [otherKey, other]] });
  assert.deepEqual([...fake.stores.get("drafts")!], [[otherKey, other]]);
  assert.deepEqual(await records.workspace(draft), { revision: 1, generation: 0 });
});

test("contending commits cannot both pass the same revision proof", async () => {
  const fake = fakeIndexedDB(), one = indexedDbAgentRecords(draftDatabaseName, fake.factory), two = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  const input = command(); input.receipt.operationId = "operation-2";
  const outcomes = await Promise.allSettled([one.commit(command()), two.commit(input)]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  assert.ok(rejected && code("conflict")(rejected.reason));
  assert.equal(fake.stores.get("receipts")!.size, 1);
  assert.deepEqual(await one.workspace(draft), { revision: 1, generation: 0 });
});

test("duplicate commands return committed receipt; reused ids with different payloads refuse", async () => {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(draftDatabaseName, fake.factory), input = command();
  const first = await records.commit(input);
  assert.equal(first.duplicate, false); assert.equal(first.receipt.revision, 1);
  input.drafts[0][1]!.content = "must not apply";
  assert.deepEqual(await records.commit(input), { receipt: first.receipt, duplicate: true });
  input.receipt.payloadIdentity = payloadIdentity({ edit: "different" });
  await assert.rejects(records.commit(input), code("duplicate-id"));
  assert.equal((await indexedDbDrafts(draftDatabaseName, fake.factory).get(key) as SavedDraft).content, "draft");
  assert.deepEqual(await records.workspace(draft), { revision: 1, generation: 0 });
});

test("generation CAS serializes contenders; workspace keys and conversations remain isolated", async () => {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  const outcomes = await Promise.allSettled([records.setGeneration(draft, 0, 1), records.setGeneration(draft, 0, 2)]);
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "rejected");
  if (outcomes[1].status === "rejected") assert.ok(code("conflict")(outcomes[1].reason));
  assert.deepEqual(await records.workspace({ ...draft, account: "lex" }), { revision: 0, generation: 1 });
  // Equal or lower generations refuse, so generation 0's commands stay fenced.
  for (const next of [1, 0]) await assert.rejects(records.setGeneration(draft, 1, next), code("conflict"));
  await assert.rejects(records.commit(command()), code("conflict"));
  const others = [{ ...draft, account: "other" }, { ...draft, repoId: 2 }, { ...draft, branch: "other" }];
  const conversation = { id: "one", content: { question: "hello" }, unfinished: true, updatedAt: 1 };
  await records.putConversation(draft, conversation); conversation.content.question = "changed later";
  for (const workspace of others) {
    assert.deepEqual(await records.workspace(workspace), { revision: 0, generation: 0 });
    assert.equal(await records.receipt(workspace, "operation-1", "grant-1"), undefined);
    assert.deepEqual(await records.conversations(workspace), []);
    await records.putConversation(workspace, { id: "one", content: "other", unfinished: true, updatedAt: 1 });
  }
  assert.deepEqual(await records.conversations(draft), [{ id: "one", content: { question: "hello" }, unfinished: true, updatedAt: 1 }]);
  await records.putConversation(draft, { id: "one", content: "updated", unfinished: true, updatedAt: 1 });
  assert.deepEqual(await records.conversations(draft), [{ id: "one", content: "updated", unfinished: true, updatedAt: 1 }]);
});

test("proofs and draft writes are captured before every opener await", async () => {
  const count = await forEachAwait((race) => {
    const fake = fakeIndexedDB(undefined, race.port("open", async () => {}));
    const records = indexedDbAgentRecords(draftDatabaseName, fake.factory), input = command();
    return { fake, input, done: records.commit(input) };
  }, ({ input }) => {
    input.workspace.branch = "other"; input.generation = 99; input.expectedRevision = 99;
    input.expectedDrafts[0][1] = { ...draft, content: "changed later" }; input.drafts[0][1]!.content = "changed later"; input.receipt.operationId = "changed later";
  }, ({ fake }) => {
    assert.deepEqual(fake.stores.get("drafts")!.get(key), draft);
    assert.deepEqual(fake.stores.get("workspaces")!.get(workspaceKey(draft)), { revision: 1, generation: 0 });
    assert.equal([...fake.stores.get("receipts")!.values()].length, 1);
    assert.equal(([...fake.stores.get("receipts")!.values()][0] as { operationId: string }).operationId, "operation-1");
  });
  assert.equal(count, 1);
});

test("connection closes on versionchange, reopens, and handles blocked upgrades without leaked connections", async () => {
  const fake = fakeIndexedDB(), connection = openDraftDatabase(draftDatabaseName, fake.factory);
  await connection.open(); fake.versionChange(); assert.equal(connection.current, undefined);
  await connection.open(); assert.equal(fake.state.closed, 1);
  const blocked = fakeIndexedDB(); blocked.state.blocked = true;
  const records = indexedDbAgentRecords(draftDatabaseName, blocked.factory);
  await assert.rejects(records.commit(command()), code("unavailable"));
  assert.equal(blocked.state.closed, 1);
  assert.deepEqual(await records.workspace(draft), { revision: 0, generation: 0 });
});

test("canonical payload identities ignore object order but preserve arrays and workspace boundaries", () => {
  assert.equal(payloadIdentity({ b: { d: 2, c: 1 }, a: [1, 2] }), payloadIdentity({ a: [1, 2], b: { c: 1, d: 2 } }));
  assert.notEqual(payloadIdentity([1, 2]), payloadIdentity([2, 1]));
  assert.throws(() => payloadIdentity({ n: NaN }), TypeError);
  assert.equal(workspaceKey(draft), workspaceKey({ ...draft, account: "lex" }));
  assert.notEqual(workspaceKey({ ...draft, branch: "a/b" }), workspaceKey({ ...draft, account: "lex/a", branch: "b" }));
});
