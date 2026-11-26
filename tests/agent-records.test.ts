import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { AgentRecordsError, indexedDbAgentRecords, unavailableAgentRecords, unknownOutcome } from "../src/agent-records.ts";
import { DraftStore, draftDatabaseName, draftDatabaseVersion, draftKey, draftStores, indexedDbDrafts, openDraftDatabase, type SavedDraft } from "../src/drafts.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";
import { forEachAwait } from "./support/await-race.ts";
import { payloadIdentity, workspaceKey } from "../shared/agent-command.ts";

// Deliberately partial DOM implementations: only the IDB surface this storage layer uses.
const partial = <T>(value: Partial<T>): T => value as T;

const draft: SavedDraft = { version: 1, account: "Lex", repoId: 1, repo: "lex/site", branch: "main", path: "index.html", baseSha: null, original: "", content: "draft", updatedAt: 1 };
const key = draftKey(draft, draft.path);
/** Where the database keeps the discard record of the draft at `key`, and that record for a discard at `at`. */
const discardKey = "astro-site-editor:discard:v1:" + key.slice("astro-site-editor:draft:v1:".length);
const discardAt = (at: number): SavedDraft => ({ version: 1, account: "lex", repoId: draft.repoId, repo: "", branch: draft.branch, path: draft.path, baseSha: null, original: "", content: "", updatedAt: at });
// Issue times only increase, as an issuer's clock does between commands.
let issued = Date.now();
const command = () => ({ workspace: { account: draft.account, repoId: draft.repoId, branch: draft.branch }, fence: 0, expectedRevision: 0, expectedDrafts: [[key, null]] as [string, SavedDraft | null][], drafts: [[key, { ...draft }]] as [string, SavedDraft | null][], receipt: { authorizationId: "grant-1", operationId: "operation-1", payloadIdentity: payloadIdentity({ edit: "draft" }), outcome: { changed: 1 }, createdAt: 100, issuedAt: ++issued } });
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
  await store.load("lex", () => import("../src/drafts-recovery.ts"));
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

for (const failure of ["AbortError", "QuotaExceededError"]) for (const failPutAt of [3, 4]) test(`${failure} on put ${failPutAt} rolls back deletes, puts, receipt and revision`, async () => {
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
    await assert.rejects(records.setFence(draft, 0, 1), code("unavailable"));
    await assert.rejects(records.putConversation(draft, { id: "one", content: "hello", unfinished: true, updatedAt: 1 }), code("unavailable"));
    await assert.rejects(records.conversations(draft), code("unavailable"));
  }
  const disk = storage(), manual = new DraftStore(disk, indexedDbDrafts(draftDatabaseName, fake.factory));
  await manual.load("lex", () => import("../src/drafts-recovery.ts")); assert.equal(manual.save(draft), true);
  assert.deepEqual(new DraftStore(disk).get(draft, draft.path), draft);
});

test("stale revisions, generations and expected drafts abort without changing records", async () => {
  const fake = fakeIndexedDB(draft), records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  for (const change of [{ expectedRevision: 1 }, { fence: 1 }, { expectedDrafts: [[key, { ...draft, updatedAt: 2 }]] }, { expectedDrafts: [[key, { ...draft, content: "same time, other text" }]] }, { expectedDrafts: [[key, null]] }]) {
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
  // The removal leaves its discard record; the save leaves none.
  assert.deepEqual([...fake.stores.get("drafts")!.keys()], [discardKey, otherKey]);
  assert.deepEqual((await records.snapshot(draft)).drafts, [[otherKey, other]]);
  assert.deepEqual(await records.workspace(draft), { revision: 1, generation: 0 });
});

test("a draft its discard record hides is absent for agents too: commits, snapshots and takeover proofs", async (t) => {
  range(t);
  const fake = fakeIndexedDB(draft), records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  // An old copy stayed in the database beside the record of its discard (a move that raced the discard).
  await indexedDbDrafts(draftDatabaseName, fake.factory).write([[discardKey, discardAt(draft.updatedAt)]]);
  const manual = new DraftStore(storage(), indexedDbDrafts(draftDatabaseName, fake.factory));
  await manual.load("lex");
  assert.equal(manual.get(draft, draft.path), undefined, "the editor shows no draft");
  // Reading the key again reads the draft with its record, in one transaction of the real database.
  await manual.refresh([key]);
  assert.equal(manual.get(draft, draft.path), undefined, "nor after another tab's announcement");
  assert.deepEqual((await records.snapshot(draft)).drafts, []);
  // A plan made against the hidden copy is stale; one made against "no draft" is what the editor shows.
  await assert.rejects(records.commit({ ...command(), expectedDrafts: [[key, draft]] }), code("conflict"));
  assert.deepEqual(await records.setFence(draft, 0, 1, { revision: 0, generation: 0, drafts: [] }), { revision: 0, generation: 1 });
  const fresh = { ...draft, content: "agent edit", updatedAt: 2 };
  await records.commit({ ...command(), fence: 1, drafts: [[key, fresh]] });
  // The save ends the discard in the same transaction, like a save made by hand.
  assert.deepEqual([...fake.stores.get("drafts")!], [[key, fresh]]);
  assert.deepEqual((await records.snapshot(draft)).drafts, [[key, fresh]]);
});

test("an agent's removal commits with its discard record: a copy left in localStorage never brings the draft back", async (t) => {
  range(t);
  const fake = fakeIndexedDB(draft), records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => 50), disk = storage();
  // The copy a start without the recovery code left behind.
  disk.setItem(key, JSON.stringify(draft));
  await records.commit({ ...command(), expectedDrafts: [[key, draft]], drafts: [[key, null]] });
  assert.deepEqual([...fake.stores.get("drafts")!], [[discardKey, discardAt(50)]]);
  const loaded = new DraftStore(disk, indexedDbDrafts(draftDatabaseName, fake.factory));
  await loaded.load("lex", () => import("../src/drafts-recovery.ts"));
  assert.equal(loaded.get(draft, draft.path), undefined);
  assert.deepEqual(loaded.list(draft), []);
  assert.equal(disk.getItem(key), null);
});

test("only an agent's removal of a draft the database shows writes a discard record, and never an earlier time", async () => {
  const fake = fakeIndexedDB(draft), records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => 50);
  const other = { ...draft, path: "about.html" }, otherKey = draftKey(other, other.path);
  fake.stores.get("drafts")!.set(discardKey, discardAt(90));
  // The stored copy is hidden (no newer than the discard at 90) and no draft is stored for the other
  // path: a plan that leaves both without a draft removes the hidden copy and writes no record.
  await records.commit({ ...command(), expectedDrafts: [[key, null], [otherKey, null]], drafts: [[key, null], [otherKey, null]] });
  assert.deepEqual([...fake.stores.get("drafts")!], [[discardKey, discardAt(90)]]);
  // A draft dated after that discard shows; its removal at 50 leaves the later discard time as it is.
  const later = { ...draft, updatedAt: 95 };
  fake.stores.get("drafts")!.set(key, later);
  const second = command(); second.receipt.operationId = "operation-2";
  await records.commit({ ...second, expectedRevision: 1, expectedDrafts: [[key, later]], drafts: [[key, null]] });
  assert.deepEqual([...fake.stores.get("drafts")!], [[discardKey, discardAt(90)]]);
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
  const outcomes = await Promise.allSettled([records.setFence(draft, 0, 1), records.setFence(draft, 0, 2)]);
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "rejected");
  if (outcomes[1].status === "rejected") assert.ok(code("conflict")(outcomes[1].reason));
  assert.deepEqual(await records.workspace({ ...draft, account: "lex" }), { revision: 0, generation: 1 });
  // Equal or lower generations refuse, so generation 0's commands stay fenced.
  for (const next of [1, 0]) await assert.rejects(records.setFence(draft, 1, next), code("conflict"));
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
    input.workspace.branch = "other"; input.fence = 99; input.expectedRevision = 99;
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

test("one rule tells an unknown outcome for edits, media and the transport alike (TOOLS-264 B1)", () => {
  for (const message of ["The outcome is unproven.", "The edit outcome is unknown.", "The editor could not prove the change landed.",
    "The media outcome could not be proven.", "This browser's storage is full and could not confirm whether the change was kept."])
    assert.equal(unknownOutcome(new Error(message)), true, message);
  assert.equal(unknownOutcome(new AgentRecordsError("unknown", "Anything.")), true);
  for (const refused of [new Error("This file changed since it was read."), new Error("Could not read hero.jpg's dimensions. Nothing was improved."),
    new AgentRecordsError("capacity", "Full."), "could not prove"])
    assert.equal(unknownOutcome(refused), false, String(refused));
});
