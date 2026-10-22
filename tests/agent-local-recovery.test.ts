import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentRecordsError, COMMAND_MAX_AGE_MS, RECEIPT_BUDGET_BYTES, RECEIPT_LIMIT, RECEIPT_RETENTION_MS, agentStorageStatus,
  indexedDbAgentRecords, receiptRetention, unavailableAgentRecords, type AgentCommit,
} from "../src/agent-records.ts";
import { buildRecoveryExport, downloadUnsavedWork } from "../src/agent-recovery-export.ts";
import { draftDatabaseName, draftKey, type SavedDraft } from "../src/drafts.ts";
import { memoryUploadBytes, uploadKey } from "../src/uploads.ts";
import { unzipStored } from "../src/zip.ts";
import { payloadIdentity, workspaceKey, type AgentReceipt } from "../shared/agent-command.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";

// Ticket 10: receipts and their fences stay within 24 hours, 1,000 receipts and 1 MiB per
// workspace without letting a late delivery apply; a full browser storage is relieved and the
// edit tried once more, then agent edits stop; the export holds what this tab still has.

const DAY = RECEIPT_RETENTION_MS;
const scope = { account: "Lex", repoId: 1, repo: "lex/site", branch: "main" };
const workspace = { account: scope.account, repoId: scope.repoId, branch: scope.branch };
const ws = workspaceKey(workspace);
const draft = (path: string, content = path): SavedDraft => ({ version: 1, ...scope, path, baseSha: null, original: "", content, updatedAt: 1 });
let issued = Date.now();
/** A command that writes `path` (absent before), issued now unless `issuedAt` says otherwise. */
const command = (operationId: string, path = `${operationId}.html`, issuedAt = ++issued): AgentCommit => ({
  workspace, generation: 0, expectedRevision: 0, expectedDrafts: [[draftKey(scope, path), null]], drafts: [[draftKey(scope, path), draft(path)]],
  receipt: { operationId, authorizationId: "grant", payloadIdentity: payloadIdentity({ path }), outcome: { path }, createdAt: 0, issuedAt },
});
const code = (expected: AgentRecordsError["code"]) => (error: unknown) => error instanceof AgentRecordsError && error.code === expected;
function setup(start = Date.now()) {
  const fake = fakeIndexedDB();
  let time = start;
  const records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => time);
  return { fake, records, status: agentStorageStatus(fake.factory), clock: (next: number) => { time = next; }, now: () => time };
}
/** Commits `count` single-file edits one after another, each at the current revision. */
async function commitMany({ records, clock, now }: ReturnType<typeof setup>, count: number, prefix = "op") {
  for (let index = 0; index < count; index++) {
    clock(now() + 1);
    const input = command(`${prefix}-${index}`);
    input.expectedRevision = (await records.workspace(workspace)).revision;
    await records.commit(input);
  }
}
const receiptRow = (operationId: string, createdAt: number, issuedAt = createdAt, outcome: unknown = {}): [string, AgentReceipt] =>
  [JSON.stringify([ws, operationId]), { operationId, workspace: ws, authorizationId: "grant", payloadIdentity: "{}", generation: 0, revision: 1, outcome: outcome as AgentReceipt["outcome"], createdAt, issuedAt }];

test("retention keeps 1,000 receipts: the oldest leave retired markers and raise the horizon to their issue time", () => {
  const rows = Array.from({ length: RECEIPT_LIMIT }, (_, index) => receiptRow(`op-${index}`, 1000 + index, 500 + index));
  const decided = receiptRetention(rows, [], 2000, receiptRow("incoming", 2000));
  assert.deepEqual(decided.remove, [rows[0][0]]);
  assert.deepEqual(decided.retire.map(([, fence]) => fence), [{ retired: true, workspace: ws, operationId: "op-0", issuedAt: 500, createdAt: 1000 }]);
  assert.equal(decided.horizon, 500);
});

test("retention keeps 1 MiB: receipts become markers; markers, cancellations and revocations only age out", () => {
  const big = "x".repeat(220 * 1024);
  const rows = Array.from({ length: 4 }, (_, index) => receiptRow(`op-${index}`, 1000 + index, 1000 + index, big));
  const fences: Parameters<typeof receiptRetention>[1] = [
    [JSON.stringify(["cancelled", ws, "grant", "c"]), { cancelled: true, workspace: ws, at: 1000 }],
    [JSON.stringify(["revoked", ws, "old"]), { revoked: true, workspace: ws, at: 1000 }],
  ];
  const incoming = receiptRow("incoming", 2000, 2000, big);
  const decided = receiptRetention(rows, fences, 2000, incoming);
  // 5 × 220 KiB exceed 1 MiB: the oldest receipt goes, as a small marker.
  assert.deepEqual(decided.remove, [rows[0][0]]);
  assert.equal(decided.retire.length, 1);
  assert.equal(decided.horizon, 1000);
  // A day later the cancellation, the revocation and every older receipt have aged out.
  const later = receiptRetention(rows, fences, 1000 + DAY);
  assert.deepEqual(new Set(later.remove), new Set([...rows.map(([key]) => key).slice(0, 1), fences[0][0], fences[1][0]]));
  // Fences alone too big for a required receipt: refused before anything is written.
  const full = Array.from({ length: 12_000 }, (_, index): Parameters<typeof receiptRetention>[1][number] =>
    [JSON.stringify(["cancelled", ws, "grant", `operation-${index}-${"y".repeat(40)}`]), { cancelled: true, workspace: ws, at: 1500 }]);
  assert.throws(() => receiptRetention([], full, 2000, receiptRow("incoming", 2000)), code("capacity"));
  assert.deepEqual(receiptRetention([], full, 2000).remove, [], "a fence is never dropped early");
});

test("a commit past 1,000 receipts evicts the oldest; its late delivery and a reused id stay unknown", async () => {
  const fixture = setup(), { fake, records } = fixture;
  const first = command("first");
  await records.commit(first);
  await commitMany(fixture, RECEIPT_LIMIT, "fill");
  assert.equal(fake.stores.get("receipts")!.size, RECEIPT_LIMIT);
  assert.equal(await records.receipt(workspace, "first", "grant"), undefined);
  const revision = (await records.workspace(workspace)).revision;
  // The same delivery with fresh proofs, and an agent reusing the id for a new command: neither applies.
  for (const late of [{ ...first, expectedRevision: revision }, { ...command("first", "first.html"), expectedRevision: revision }]) {
    late.expectedDrafts = [[draftKey(scope, "first.html"), draft("first.html")]];
    await assert.rejects(records.commit(late), code("conflict"));
  }
  assert.equal((await records.workspace(workspace)).revision, revision);
  assert.equal(fake.stores.get("drafts")!.size, RECEIPT_LIMIT + 1, "drafts are never evicted");
});

test("an evicted id reused with a fresh issue time, other work and current proofs stays refused for the day", async () => {
  const fixture = setup(), { fake, records } = fixture;
  await records.commit(command("first"));
  await commitMany(fixture, RECEIPT_LIMIT, "fill");
  assert.equal(await records.receipt(workspace, "first", "grant"), undefined, "evicted");
  const { revision } = await records.workspace(workspace);
  const reused = command("first", "elsewhere.html");
  reused.expectedRevision = revision;
  reused.receipt.payloadIdentity = payloadIdentity({ other: "work" });
  await assert.rejects(records.commit(reused), code("conflict"));
  assert.equal((await records.workspace(workspace)).revision, revision);
  assert.equal(fake.stores.get("drafts")!.has(draftKey(scope, "elsewhere.html")), false);
});

test("fences age out after a day; deliveries they refused stay refused by age and horizon", async () => {
  const start = Date.now();
  const { fake, records, clock } = setup(start);
  const applied = command("applied", "applied.html", start - 1), cancelled = command("cancelled", "c.html", start - 1), revoked = command("revoked", "r.html", start - 1);
  revoked.receipt.authorizationId = "old-grant";
  await records.commit(applied);
  assert.deepEqual(await records.cancel(workspace, "cancelled", "grant"), { status: "unknown" });
  await records.revoke(workspace, "old-grant");
  await assert.rejects(records.commit({ ...cancelled, expectedRevision: 1 }), code("cancelled"));
  await assert.rejects(records.commit({ ...revoked, expectedRevision: 1 }), code("revoked"));
  clock(start + DAY + 1);
  assert.equal(await records.evictReceipts(workspace), 1);
  const fences = [...fake.stores.get("workspaces")!.keys()].filter((key) => !key.startsWith("[\"lex\""));
  assert.deepEqual(fences, [], "tombstone, revocation and receipt are gone");
  // Each late delivery was issued over 23 hours ago: unknown, never a fresh edit.
  for (const late of [applied, cancelled, revoked]) await assert.rejects(records.commit({ ...late, expectedRevision: 1 }), code("conflict"));
  assert.equal(fake.stores.get("drafts")!.size, 1);
  // A command issued now still applies.
  await records.commit({ ...command("fresh", "fresh.html", start + DAY), expectedRevision: 1 });
  assert.equal((await records.workspace(workspace)).revision, 2);
});

test("a command issued more than 23 hours ago is refused before mutation", async () => {
  // Age is measured on the records' clock; a second Date.now() drifted past it on a busy machine.
  const { fake, records, now } = setup();
  await assert.rejects(records.commit(command("old", "old.html", now() - COMMAND_MAX_AGE_MS - 1)), code("conflict"));
  assert.equal(fake.stores.get("drafts")!.size, 0);
});

test("full storage: expired receipts and completed history go, unfinished work stays, and the edit applies once on retry", async () => {
  const start = Date.now();
  const { fake, records, clock, status } = setup(start - DAY - 10);
  await records.commit(command("yesterday", "yesterday.html", start - DAY - 20));
  await records.putConversation(workspace, { id: "done", content: { state: "done" }, unfinished: false, updatedAt: start - 5 });
  await records.putConversation(workspace, { id: "open", content: { state: "open" }, unfinished: true, updatedAt: start - 5 });
  clock(start);
  await records.cancel(workspace, "cancelled", "grant");
  // Applied a minute ago: its receipt may still answer a lost reply, so relief keeps it.
  clock(start - 60_000);
  await records.commit({ ...command("recent"), expectedRevision: 1 });
  clock(start);
  fake.state.failure = "QuotaExceededError"; fake.state.failPutAt = 1;
  const result = await records.commit({ ...command("now"), expectedRevision: 2 });
  assert.equal(result.duplicate, false);
  assert.deepEqual([...fake.stores.get("receipts")!.values()].map((receipt) => (receipt as AgentReceipt).operationId).sort(), ["now", "recent"]);
  assert.deepEqual((await records.conversations(workspace)).map((item) => item.id), ["open"]);
  await assert.rejects(records.commit({ ...command("cancelled"), expectedRevision: 3 }), code("cancelled"));
  assert.deepEqual([...fake.stores.get("drafts")!.keys()].sort(), ["now.html", "recent.html", "yesterday.html"].map((path) => draftKey(scope, path)));
  assert.equal(status.problem, undefined);
});

test("quota relief turns a live receipt over ten minutes old into a marker: its id stays refused, other workspaces keep their state", async () => {
  const start = Date.now();
  const { fake, records, clock } = setup(start - 11 * 60 * 1000);
  const old = command("old");
  await records.commit(old);
  const elsewhere = { ...workspace, branch: "other" }, otherKey = draftKey({ ...scope, branch: "other" }, "x.html");
  await records.commit({ ...command("other-op", "x.html"), workspace: elsewhere, expectedDrafts: [[otherKey, null]],
    drafts: [[otherKey, { ...draft("x.html"), branch: "other" }]] });
  await records.setGeneration(elsewhere, 0, 3);
  clock(start);
  fake.state.failure = "QuotaExceededError"; fake.state.failPutAt = 1;
  await records.commit({ ...command("now"), expectedRevision: 1 });
  assert.equal(await records.receipt(workspace, "old", "grant"), undefined, "converted, not kept");
  assert.deepEqual([...fake.stores.get("workspaces")!.keys()].filter((key) => key.startsWith('["retired"')).length, 2);
  // Redelivered, or reused with a fresh issue time and current proofs: refused, nothing written.
  for (const late of [{ ...old, expectedRevision: 2 }, { ...command("old", "again.html"), expectedRevision: 2 }])
    await assert.rejects(records.commit(late), code("conflict"));
  assert.deepEqual([...fake.stores.get("drafts")!.keys()].sort(), [draftKey(scope, "now.html"), draftKey(scope, "old.html"), otherKey].sort());
  const other = await records.workspace(elsewhere);
  assert.deepEqual([other.revision, other.generation], [1, 3]);
});

test("storage still full after relief stops agent edits before any write; Try again lets them through", async () => {
  const { fake, records, status } = setup();
  await records.putConversation(workspace, { id: "done", content: {}, unfinished: false, updatedAt: Date.now() });
  await records.commit(command("before"));
  let told = 0;
  const unsubscribe = status.subscribe(() => told++);
  fake.state.failure = "QuotaExceededError"; fake.state.failPutsInto = "receipts";
  await assert.rejects(records.commit({ ...command("full"), expectedRevision: 1 }), (error: unknown) =>
    code("aborted")(error) && /storage is full/.test((error as Error).message));
  assert.equal(status.problem?.reason, "full");
  assert.equal(told, 1);
  // Unsaved drafts stay; the failed edit left nothing.
  assert.deepEqual([...fake.stores.get("drafts")!.keys()], [draftKey(scope, "before.html")]);
  assert.equal(await records.receipt(workspace, "full", "grant"), undefined);
  // Stopped: refused before a transaction, even with space again.
  fake.state.failPutsInto = undefined;
  await assert.rejects(records.commit({ ...command("next"), expectedRevision: 1 }), code("unavailable"));
  assert.equal(fake.stores.get("drafts")!.size, 1);
  status.resume();
  assert.equal(status.problem, undefined);
  await records.commit({ ...command("next"), expectedRevision: 1 });
  assert.equal(fake.stores.get("drafts")!.size, 2);
  unsubscribe();
});

test("full storage with nothing to evict stops without a second attempt", async () => {
  const { fake, records, status } = setup();
  fake.state.failure = "QuotaExceededError"; fake.state.failPutsInto = "receipts";
  await assert.rejects(records.commit(command("full")), code("aborted"));
  assert.equal(fake.state.refusedPuts, 1, "one attempt");
  assert.equal(status.problem?.reason, "full");
  assert.equal(fake.stores.get("drafts")!.size, 0);
});

test("an uncertain commit that landed is settled from its receipt and applied exactly once", async () => {
  const { fake, records, status } = setup();
  fake.state.abortAfterCommit = "QuotaExceededError";
  const input = command("uncertain");
  const result = await records.commit(input);
  assert.equal(result.duplicate, false, "this commit's own: still to be published");
  assert.equal(result.receipt.revision, 1);
  assert.equal(fake.stores.get("drafts")!.size, 1);
  assert.equal(fake.stores.get("receipts")!.size, 1);
  assert.equal((await records.workspace(workspace)).revision, 1);
  assert.equal(status.problem, undefined);
  // Redelivered: the recorded outcome, nothing written again.
  const again = await records.commit({ ...input, expectedRevision: 0 });
  assert.equal(again.duplicate, true);
  assert.equal((await records.workspace(workspace)).revision, 1);
});

test("a retry that lands but reports a full storage is settled from its receipt: applied once, no stop", async () => {
  const { fake, records, status } = setup();
  await records.putConversation(workspace, { id: "done", content: {}, unfinished: false, updatedAt: Date.now() });
  fake.state.failure = "QuotaExceededError"; fake.state.failPutAt = 1;
  // The relief transaction completes; the retry after it commits, then reports the abort.
  fake.state.abortAfterCommit = "QuotaExceededError"; fake.state.abortAfterCommitSkip = 1;
  const result = await records.commit(command("retried"));
  assert.equal(result.duplicate, false);
  assert.equal((await records.workspace(workspace)).revision, 1);
  assert.equal(fake.stores.get("drafts")!.size, 1);
  assert.equal(status.problem, undefined);
});

test("a full storage whose receipt cannot be read reports the outcome unknown, never nothing changed", async () => {
  const { fake, records, status } = setup();
  fake.state.failure = "QuotaExceededError"; fake.state.failPutsInto = "receipts"; fake.state.failReadonly = true;
  await assert.rejects(records.commit(command("unproven")), (error: unknown) =>
    code("unknown")(error) && /could not confirm whether the change was kept/.test((error as Error).message) && !/Nothing was changed/.test((error as Error).message));
  assert.equal(status.problem?.reason, "full");
});

test("a download saves the open workspace's drafts, and nothing once the workspace moved on meanwhile", async () => {
  const saved: string[] = [], asked: string[] = [];
  const ports = { drafts: (wanted: typeof scope) => { asked.push(wanted.repo); return [draft("index.html", "unsaved")]; },
    bytes: () => undefined, saver: async () => (_zip: Uint8Array, name: string) => { saved.push(name); } };
  const input = { account: scope.account, repository: { id: scope.repoId, fullName: scope.repo, branch: scope.branch } };
  // The workspace changes while the export is built, or while the save itself loads: nothing is saved.
  let open = true;
  assert.equal(await downloadUnsavedWork(input, () => false, ports), undefined);
  assert.equal(await downloadUnsavedWork(input, () => open, { ...ports, saver: async () => { open = false; return ports.saver(); } }), undefined);
  assert.deepEqual(saved, []);
  const done = await downloadUnsavedWork(input, () => true, ports);
  assert.deepEqual(saved, ["site-unsaved-changes.zip"]);
  assert.deepEqual(done?.entries.map((entry) => [entry.path, entry.status]), [["index.html", "included"]]);
  assert.deepEqual(asked, ["lex/site", "lex/site", "lex/site"]);
});

test("after a reload the failed edit is unknown and the committed drafts and receipts are all there", async () => {
  const { fake, records, status } = setup();
  await records.commit(command("kept"));
  fake.state.failure = "QuotaExceededError"; fake.state.failPutsInto = "receipts";
  const failed = { ...command("lost"), expectedRevision: 1 };
  await assert.rejects(records.commit(failed), code("aborted"));
  fake.state.failPutsInto = undefined;
  status.resume(); // A reload starts with no stop.
  const reloaded = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  assert.ok(await reloaded.receipt(workspace, "kept", "grant"));
  assert.equal(await reloaded.receipt(workspace, "lost", "grant"), undefined);
  assert.deepEqual([...fake.stores.get("drafts")!.keys()], [draftKey(scope, "kept.html")]);
  // It never applied, so its delivery now applies once.
  assert.equal((await reloaded.commit(failed)).duplicate, false);
});

test("disabled storage refuses agent edits and reports it without stopping the editor's other storage", async () => {
  const denied: Pick<IDBFactory, "open"> = { open() { throw new DOMException("Denied", "SecurityError"); } };
  const blocked = denied as IDBFactory;
  for (const [records, status] of [[unavailableAgentRecords(), agentStorageStatus(undefined)], [indexedDbAgentRecords(draftDatabaseName, blocked), agentStorageStatus(blocked)]] as const) {
    await assert.rejects(records.commit(command("refused")), code("unavailable"));
    assert.equal(status.problem?.reason, "unavailable");
    status.resume();
  }
});

test("the export holds each unsaved draft's text and the upload bytes this browser has, and names the missing ones", async () => {
  const bytes = memoryUploadBytes();
  const photo = new Uint8Array([1, 2, 3, 4]);
  await bytes.put(uploadKey(scope, "a".repeat(40)), new Blob([photo]));
  const drafts: SavedDraft[] = [
    { ...draft("index.html", "<h1>Unsaved</h1>"), baseSha: "b".repeat(40), original: "<h1>Old</h1>" },
    draft("new/page.html", "<p>New</p>"),
    { ...draft("old.html", "gone"), baseSha: "c".repeat(40), deleted: true },
    { ...draft("images/photo.png", ""), opaque: true, sourceSha: "a".repeat(40), upload: { size: 4, type: "image/png" } },
    { ...draft("images/lost.png", ""), opaque: true, sourceSha: "d".repeat(40), upload: { size: 9, type: "image/png" } },
    { ...draft("files/moved.pdf", ""), opaque: true, sourceSha: "e".repeat(40), movedFrom: "moved.pdf" },
  ];
  const result = await buildRecoveryExport({ repository: "lex/site", scope, drafts, bytes, now: new Date("2026-10-18T12:00:00Z") });
  assert.equal(result.name, "site-unsaved-changes.zip");
  const files = unzipStored(result.zip), text = (name: string) => new TextDecoder().decode(files[name]);
  assert.deepEqual(Object.keys(files).sort(), ["README.txt", "changes.json", "files/images/photo.png", "files/index.html", "files/new/page.html"]);
  assert.equal(text("files/index.html"), "<h1>Unsaved</h1>");
  assert.deepEqual([...files["files/images/photo.png"]], [...photo]);
  const listed = JSON.parse(text("changes.json")).changes as { path: string; status: string }[];
  assert.deepEqual(Object.fromEntries(listed.map((entry) => [entry.path, entry.status])), {
    "files/moved.pdf": "on-github", "images/lost.png": "missing", "images/photo.png": "included", "index.html": "included", "new/page.html": "included", "old.html": "deleted",
  });
  assert.match(text("README.txt"), /images\/lost\.png: this browser no longer has the uploaded file; upload it again/);
  assert.doesNotMatch(text("README.txt"), /photo\.png/, "an included file is not listed as left out");
  // Bytes unreadable altogether: every upload is missing, never claimed.
  const failing = { ...bytes, get: () => Promise.reject(new Error("blocked")) };
  const blind = await buildRecoveryExport({ repository: "lex/site", scope, drafts, bytes: failing });
  assert.equal(blind.entries.find((entry) => entry.path === "images/photo.png")?.status, "missing");
  // One upload's bytes fail while read: it is missing, and every other file is still in the export.
  const broken = { ...bytes, get: async (key: string) => key === uploadKey(scope, "a".repeat(40))
    ? Object.assign(new Blob([photo]), { arrayBuffer: () => Promise.reject(new DOMException("gone", "NotReadableError")) }) : bytes.get(key) };
  const partial = await buildRecoveryExport({ repository: "lex/site", scope, drafts: [...drafts, { ...draft("images/second.png", ""), opaque: true, sourceSha: "f".repeat(40), upload: { size: 1, type: "image/png" } }],
    bytes: { ...broken, get: async (key: string) => key === uploadKey(scope, "f".repeat(40)) ? new Blob([new Uint8Array([9])]) : broken.get(key) } });
  assert.deepEqual(Object.keys(unzipStored(partial.zip)).sort(), ["README.txt", "changes.json", "files/images/second.png", "files/index.html", "files/new/page.html"]);
  assert.equal(partial.entries.find((entry) => entry.path === "images/photo.png")?.status, "missing");
});

test("the budget constants are the accepted ones", () => {
  assert.equal(RECEIPT_RETENTION_MS, 24 * 60 * 60 * 1000);
  assert.equal(RECEIPT_LIMIT, 1000);
  assert.equal(RECEIPT_BUDGET_BYTES, 1024 * 1024);
});
