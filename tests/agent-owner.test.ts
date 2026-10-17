import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentOwner } from "../src/agent-owner.ts";
import { AgentRecordsError, indexedDbAgentRecords, type AgentCommit, type AgentRecords } from "../src/agent-records.ts";
import { draftDatabaseName, draftKey, indexedDbDrafts, type SavedDraft } from "../src/drafts.ts";
import { payloadIdentity, workspaceKey, type AgentReceipt } from "../shared/agent-command.ts";
import { forEachAwait } from "./support/await-race.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";

const draft: SavedDraft = { version: 1, account: "lex", repoId: 1, repo: "lex/site", branch: "main", path: "index.html", baseSha: null, original: "", content: "agent", updatedAt: 1 };
const key = draftKey(draft, draft.path);
const command = (): AgentCommit => ({
  workspace: { account: draft.account, repoId: draft.repoId, branch: draft.branch },
  generation: 0, expectedRevision: 0, expectedDrafts: [[key, null]], drafts: [[key, { ...draft }]],
  receipt: { operationId: "one", authorizationId: "grant", payloadIdentity: payloadIdentity({ content: "agent" }), outcome: { changed: 1 }, createdAt: 1 },
});
const code = (expected: AgentRecordsError["code"]) => (error: unknown) => error instanceof AgentRecordsError && error.code === expected;
function setup() {
  const fake = fakeIndexedDB();
  let time = 100;
  const records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => time);
  const owner = createAgentOwner({ workspace: draft, generation: 0, records, reload: async () => {} });
  return { fake, records, owner, clock: (next: number) => { time = next; } };
}

for (const mismatch of ["payload", "authorization", "generation", "account", "repository", "branch"]) test(`duplicate id refuses changed ${mismatch}`, async () => {
  const { fake, records } = setup(), input = command();
  await records.commit(input);
  if (mismatch === "payload") input.receipt.payloadIdentity = payloadIdentity({ content: "different" });
  if (mismatch === "authorization") input.receipt.authorizationId = "other";
  if (mismatch === "generation") input.generation++;
  if (mismatch === "account") input.workspace.account = "other";
  if (mismatch === "repository") input.workspace.repoId++;
  if (mismatch === "branch") input.workspace.branch = "other";
  await assert.rejects(records.commit(input), code("duplicate-id"));
  assert.deepEqual([...fake.stores.get("drafts")!.values()], [draft]);
  assert.equal(fake.stores.get("receipts")!.size, 1);
});

test("matching duplicate returns recorded outcome, even after takeover, without reapplying", async () => {
  const { records, owner, fake } = setup(), input = command();
  const first = await owner.commit(input);
  await owner.takeover();
  assert.deepEqual(await records.commit(input), { receipt: first.receipt, duplicate: true });
  assert.deepEqual(await records.workspace(draft), { revision: 1, generation: 1 });
  assert.equal(fake.stores.get("receipts")!.size, 1);
});

test("expired receipt is unknown; late delivery cannot become a fresh edit", async () => {
  const { records, owner, fake } = setup(), input = command();
  await owner.commit(input);
  assert.equal(await records.evictReceipts(draft, 100 + 24 * 60 * 60 * 1000), 1);
  assert.equal(await records.receipt(draft, "one", "grant"), undefined);
  const transfer = await owner.takeover([input]);
  assert.deepEqual(transfer.outcomes, [{ operationId: "one", status: "unknown" }]);
  await assert.rejects(records.commit(input), code("conflict"));
  assert.deepEqual([...fake.stores.get("drafts")!.values()], [draft]);
  assert.deepEqual(await records.workspace(draft), { revision: 1, generation: 1 });
  assert.equal(fake.stores.get("receipts")!.size, 0, "0 late commits");
});

test("eviction fences same-generation redelivery by its original expected revision", async () => {
  const { records } = setup(), input = command();
  await records.commit(input);
  await records.evictReceipts(draft, 100 + 24 * 60 * 60 * 1000);
  await assert.rejects(records.commit(input), code("conflict"));
  assert.deepEqual(await records.workspace(draft), { revision: 1, generation: 0 });
});

test("receipt caps evict oldest completed records per workspace, never drafts", async () => {
  const { fake, records } = setup();
  const receipt = (operationId: string, createdAt: number, workspace = workspaceKey(draft)): AgentReceipt => ({
    ...command().receipt, operationId, workspace, createdAt, generation: 0, revision: 1,
  });
  await records.commit(command());
  let rows = fake.stores.get("receipts")!;
  // Seed completed records directly to exercise both caps without 1000 unrelated transactions.
  rows.clear();
  const add = (value: AgentReceipt) => rows.set(JSON.stringify([value.workspace, value.operationId]), value);
  for (let i = 0; i < 1001; i++) add(receipt(`id-${i}`, i));
  add(receipt("foreign", 0, workspaceKey({ ...draft, branch: "other" })));
  assert.equal(await records.evictReceipts(draft, 2000), 1);
  assert.equal(await records.receipt(draft, "id-0", "grant"), undefined);
  assert.ok(await records.receipt(draft, "id-1", "grant"));
  assert.ok(await records.receipt({ ...draft, branch: "other" }, "foreign", "grant"));
  rows = fake.stores.get("receipts")!;
  rows.clear();
  add({ ...receipt("old", 1), outcome: "x".repeat(600_000) });
  add({ ...receipt("new", 2), outcome: "x".repeat(600_000) });
  assert.equal(await records.evictReceipts(draft, 3), 1);
  assert.equal(await records.receipt(draft, "old", "grant"), undefined);
  assert.ok(await records.receipt(draft, "new", "grant"));
  assert.deepEqual([...fake.stores.get("drafts")!.values()], [draft]);
});

test("commit makes room transactionally; an oversized required receipt refuses before mutation", async () => {
  const { records, fake, clock } = setup();
  await records.commit(command());
  clock(100 + 24 * 60 * 60 * 1000);
  const next = command(); next.receipt.operationId = "two"; next.expectedRevision = 1;
  next.expectedDrafts = [[key, draft]]; next.drafts[0][1]!.content = "next";
  await records.commit(next);
  assert.equal(await records.receipt(draft, "one", "grant"), undefined);
  const tooBig = command(); tooBig.receipt.operationId = "huge"; tooBig.expectedRevision = 2;
  tooBig.expectedDrafts = next.drafts; tooBig.receipt.outcome = "界".repeat(400_000);
  await assert.rejects(records.commit(tooBig), code("capacity"));
  assert.equal(fake.stores.get("receipts")!.size, 1);
  assert.equal((fake.stores.get("drafts")!.get(key) as SavedDraft).content, "next");
  assert.equal((await records.workspace(draft)).revision, 2);
});

test("completed revocation blocks new commits and duplicate disclosure; prior application is reported", async () => {
  const { records, fake } = setup(), input = command();
  const applied = await records.commit(input);
  assert.deepEqual(await records.revoke(draft, "grant"), [applied.receipt]);
  await assert.rejects(records.commit(input), code("revoked"));
  await assert.rejects(records.receipt(draft, "one", "grant"), code("revoked"));
  const late = command(); late.receipt.operationId = "late"; late.expectedRevision = 1; late.expectedDrafts = [[key, draft]];
  await assert.rejects(records.commit(late), code("revoked"));
  assert.equal(fake.stores.get("receipts")!.size, 1, "0 late commits");
  assert.deepEqual([...fake.stores.get("drafts")!.values()], [draft]);
  // Revocation survives another connection and stays scoped to this authorization/workspace.
  const reopened = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  await assert.rejects(reopened.commit(late), code("revoked"));
  late.receipt.authorizationId = "other";
  await reopened.commit(late);
  assert.deepEqual(await reopened.revoke({ ...draft, branch: "other" }, "grant"), []);
});

test("revocation abort rolls back the durable revocation record", async () => {
  const { fake, records } = setup();
  fake.state.failPutAt = 1;
  await assert.rejects(records.revoke(draft, "grant"), code("aborted"));
  await records.commit(command());
});

test("takeover pauses admission, reconciles, reloads and only then bumps generation", async () => {
  const { records, fake } = setup(), input = command(), events: string[] = [];
  const applied = await records.commit(input);
  const missing = command(); missing.receipt.operationId = "missing";
  const tracked: AgentRecords = {
    ...records,
    pause: async (...args) => { events.push("pause"); return records.pause(...args); },
    reconcile: async (...args) => { events.push("reconcile"); return records.reconcile(...args); },
    snapshot: async (...args) => { events.push("snapshot"); return records.snapshot(...args); },
    setGeneration: async (...args) => { events.push("bump"); return records.setGeneration(...args); },
  };
  const owner = createAgentOwner({ workspace: draft, generation: 0, records: tracked, reload: async (snapshot) => {
    events.push("reload");
    assert.equal(owner.paused, true);
    assert.equal((await records.workspace(draft)).generation, 0);
    assert.deepEqual(snapshot.drafts, [[key, draft]]);
    await assert.rejects(owner.commit(missing), code("conflict"));
    await assert.rejects(records.commit(missing), code("conflict"));
    snapshot.drafts[0][1].content = "port cannot change the CAS proof";
  } });
  const transfer = owner.takeover([input, missing]);
  assert.equal(owner.paused, true);
  const result = await transfer;
  assert.deepEqual(events, ["pause", "reconcile", "snapshot", "reload", "bump", "reconcile"]);
  assert.deepEqual(result.outcomes, [{ operationId: "one", status: "applied", receipt: applied.receipt }, { operationId: "missing", status: "unknown" }]);
  assert.equal(owner.generation, 1); assert.equal(owner.paused, false);
  await assert.rejects(records.commit(missing), code("conflict"));
  assert.equal(fake.stores.get("receipts")!.size, 1, "unknown was never replayed; 0 late commits");
});

test("reload failure leaves admission paused and generation unchanged", async () => {
  const { records } = setup();
  const owner = createAgentOwner({ workspace: draft, generation: 0, records, reload: async () => { throw new Error("reload failed"); } });
  await assert.rejects(owner.takeover(), /reload failed/);
  assert.equal(owner.paused, true);
  assert.deepEqual(await records.workspace(draft), { revision: 0, generation: 0, paused: true });
  await assert.rejects(records.commit(command()), code("conflict"));
});

test("manual writes disturb every commit await; stale plans never overwrite them", async () => {
  const count = await forEachAwait((race) => {
    let first = true;
    const fake = fakeIndexedDB(undefined, () => {
      if (!first) return Promise.resolve();
      first = false; return race.port("open", async () => {})();
    });
    const records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
    const tracked: AgentRecords = { ...records, commit: race.port("commit", (...args) => records.commit(...args)) };
    const owner = createAgentOwner({ workspace: draft, generation: 0, records: tracked, reload: async () => {} });
    return { fake, boundary: { receipts: 0 }, done: owner.commit(command()).catch((error: unknown) => { assert.ok(code("conflict")(error)); }), manual: indexedDbDrafts(draftDatabaseName, fake.factory) };
  }, async ({ manual, fake, boundary }) => {
    await manual.write([[key, { ...draft, content: "manual" }]]);
    boundary.receipts = fake.stores.get("receipts")!.size;
  }, ({ fake, boundary }) => {
    assert.equal((fake.stores.get("drafts")!.get(key) as SavedDraft).content, "manual");
    assert.equal(fake.stores.get("receipts")!.size - boundary.receipts, 0, "0 stale commits after manual write");
  });
  assert.equal(count, 2);
});

for (const disturbance of ["revocation", "takeover"]) test(`${disturbance} disturbs every commit await; frozen old owner has 0 late commits`, async () => {
  const count = await forEachAwait((race) => {
    let first = true;
    const fake = fakeIndexedDB(undefined, () => {
      if (!first) return Promise.resolve();
      first = false; return race.port("open", async () => {})();
    });
    const records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
    const tracked: AgentRecords = { ...records, commit: race.port("commit", (...args) => records.commit(...args)) };
    const owner = createAgentOwner({ workspace: draft, generation: 0, records: tracked, reload: async () => {} });
    return { fake, records, boundary: { receipts: 0 }, done: owner.commit(command()).catch((error: unknown) => {
      assert.ok(code(disturbance === "revocation" ? "revoked" : "conflict")(error));
    }) };
  }, async ({ fake, boundary }) => {
    const current = indexedDbAgentRecords(draftDatabaseName, fake.factory);
    if (disturbance === "revocation") {
      const applied = await current.revoke(draft, "grant");
      boundary.receipts = applied.length;
    } else {
      await createAgentOwner({ workspace: draft, generation: 0, records: current, reload: async () => {} }).takeover();
      boundary.receipts = fake.stores.get("receipts")!.size;
    }
  }, async ({ fake, records, boundary }) => {
    // A duplicate may report prior application; a fresh old-generation edit must refuse.
    const late = command(); late.receipt.operationId = "late";
    await assert.rejects(records.commit(late), code(disturbance === "revocation" ? "revoked" : "conflict"));
    assert.equal(fake.stores.get("receipts")!.size - boundary.receipts, 0, "0 late commits");
    assert.equal(fake.stores.get("drafts")!.size, boundary.receipts);
  });
  assert.equal(count, 2);
});

test("manual writes disturb every takeover await; reload/CAS preserve current drafts", async () => {
  const count = await forEachAwait((race) => {
    const { fake, records } = setup();
    const tracked: AgentRecords = {
      ...records,
      pause: race.port("pause", (...args) => records.pause(...args)),
      reconcile: race.port("reconcile", (...args) => records.reconcile(...args)),
      snapshot: race.port("snapshot", (...args) => records.snapshot(...args)),
      setGeneration: race.port("generation CAS", (...args) => records.setGeneration(...args)),
    };
    const owner = createAgentOwner({ workspace: draft, generation: 0, records: tracked, reload: race.port("reload", async () => {}) });
    return { fake, records, owner, manual: indexedDbDrafts(draftDatabaseName, fake.factory), done: owner.takeover([command()]).catch((error: unknown) => { assert.ok(code("conflict")(error)); }) };
  }, async ({ manual }) => {
    await manual.write([[key, { ...draft, content: "manual" }]]);
  }, async ({ fake, records }) => {
    assert.equal((fake.stores.get("drafts")!.get(key) as SavedDraft).content, "manual");
    await assert.rejects(records.commit(command()), code("conflict"));
    assert.equal(fake.stores.get("receipts")!.size, 0, "0 late commits");
  });
  assert.equal(count, 6);
});

test("manual workspace revision races disturb every commit await", async () => {
  const count = await forEachAwait((race) => {
    let first = true;
    const fake = fakeIndexedDB(undefined, () => {
      if (!first) return Promise.resolve();
      first = false; return race.port("open", async () => {})();
    });
    const records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
    const owner = createAgentOwner({ workspace: draft, generation: 0, records, reload: async () => {} });
    return { fake, done: owner.commit(command()).catch((error: unknown) => { assert.ok(code("conflict")(error)); }) };
  }, async ({ fake }) => {
    const current = indexedDbAgentRecords(draftDatabaseName, fake.factory);
    await current.workspace(draft);
    fake.stores.get("workspaces")!.set(workspaceKey(draft), { revision: 1, generation: 0 });
  }, ({ fake }) => {
    assert.equal(fake.stores.get("drafts")!.size, 0);
    assert.equal(fake.stores.get("receipts")!.size, 0, "0 stale commits");
  });
  assert.equal(count, 1);
});

test("eviction and draft mutation roll back together when receipt persistence fails", async () => {
  const { fake, records, clock } = setup();
  await records.commit(command());
  clock(100 + 24 * 60 * 60 * 1000);
  const next = command(); next.receipt.operationId = "two"; next.expectedRevision = 1;
  next.expectedDrafts = [[key, draft]]; next.drafts[0][1]!.content = "next";
  fake.state.failPutAt = 2; // Draft put succeeds, receipt put fails after eligible eviction.
  await assert.rejects(records.commit(next), code("aborted"));
  assert.ok(await records.receipt(draft, "one", "grant"));
  assert.equal(await records.receipt(draft, "two", "grant"), undefined);
  assert.deepEqual([...fake.stores.get("drafts")!.values()], [draft]);
  assert.deepEqual(await records.workspace(draft), { revision: 1, generation: 0 });
});

test("competing takeovers disturb every await; one generation CAS wins", async () => {
  const count = await forEachAwait((race) => {
    const { fake, records } = setup();
    const tracked: AgentRecords = {
      ...records,
      pause: race.port("pause", (...args) => records.pause(...args)),
      reconcile: race.port("reconcile", (...args) => records.reconcile(...args)),
      snapshot: race.port("snapshot", (...args) => records.snapshot(...args)),
      setGeneration: race.port("generation CAS", (...args) => records.setGeneration(...args)),
    };
    const owner = createAgentOwner({ workspace: draft, generation: 0, records: tracked, reload: race.port("reload", async () => {}) });
    const wins: number[] = [];
    return { fake, records, wins, done: owner.takeover([command()]).then(() => { wins.push(1); }).catch((error: unknown) => { assert.ok(code("conflict")(error)); }) };
  }, async ({ records, wins }) => {
    const contender = createAgentOwner({ workspace: draft, generation: 0, records, reload: async () => {} });
    try { await contender.takeover(); wins.push(2); }
    catch (error) { assert.ok(code("conflict")(error)); }
  }, async ({ fake, records, wins }) => {
    assert.equal(wins.length, 1);
    assert.deepEqual(await records.workspace(draft), { revision: 0, generation: 1 });
    await assert.rejects(records.commit(command()), code("conflict"));
    assert.equal(fake.stores.get("receipts")!.size, 0, "0 late commits");
  });
  assert.equal(count, 6);
});

test("takeover reconciles operations admitted before its durable pause", async () => {
  const { records, fake } = setup();
  const owner = createAgentOwner({ workspace: draft, generation: 0, records, reload: async () => {} });
  const committing = owner.commit(command());
  const transferring = owner.takeover();
  const [applied, transfer] = await Promise.all([committing, transferring]);
  assert.deepEqual(transfer.outcomes, [{ operationId: "one", status: "applied", receipt: applied.receipt }]);
  assert.equal(fake.stores.get("receipts")!.size, 1);
  await assert.rejects(records.commit({ ...command(), receipt: { ...command().receipt, operationId: "late" } }), code("conflict"));
  assert.equal(fake.stores.get("receipts")!.size, 1, "0 late commits");
});

test("takeover rechecks authorization after reload before revealing recorded outcomes", async () => {
  const { records } = setup(), input = command();
  const applied = await records.commit(input);
  const owner = createAgentOwner({ workspace: draft, generation: 0, records, reload: async () => {
    assert.deepEqual(await records.revoke(draft, "grant"), [applied.receipt]);
  } });
  const transfer = await owner.takeover([input]);
  assert.deepEqual(transfer.outcomes, [{ operationId: "one", status: "unknown" }]);
  assert.equal(transfer.generation, 1);
  await assert.rejects(records.commit(input), code("revoked"));
});

test("takeover does not expose a receipt evicted while reload was pending", async () => {
  const { records } = setup(), input = command();
  await records.commit(input);
  const owner = createAgentOwner({ workspace: draft, generation: 0, records, reload: async () => {
    await records.evictReceipts(draft, 100 + 24 * 60 * 60 * 1000);
  } });
  assert.deepEqual((await owner.takeover([input])).outcomes, [{ operationId: "one", status: "unknown" }]);
});
