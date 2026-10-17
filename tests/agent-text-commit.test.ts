import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { textHash, type AgentCommand } from "../shared/agent.ts";
import { applySiteCommand, prepareAgentText, type AgentSiteActions } from "../src/agent-site.ts";
import { indexedDbAgentRecords } from "../src/agent-records.ts";
import { DraftStore, draftDatabaseName, draftKey, indexedDbDrafts, type DraftScope } from "../src/drafts.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { createGuardedEdits, type EditorWorkspace } from "../src/guarded-edit.ts";
import type { AgentTextCommit } from "../src/editor-workspace.ts";
import { createMemoryWorkspace } from "./fakes/memory-workspace.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";

let sequence = 0;
const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }, key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; } };
};
async function setup(t: TestContext, race?: AwaitRace) {
  const fake = fakeIndexedDB();
  for (const [name, value] of Object.entries({ indexedDB: fake.factory, IDBKeyRange: { bound: (lower: string, upper: string) => ({ lower, upper }) } })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  const scope: DraftScope = { account: `lex-${++sequence}`, repoId: 1, repo: "lex/site", branch: "main" };
  let manualWrites = 0;
  const disk = storage(), database = indexedDbDrafts(draftDatabaseName, fake.factory);
  const store = new DraftStore(disk, { ...database, write: changes => { manualWrites++; return database.write(changes); } });
  await store.load(scope.account);
  const records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  const models = createDraftStore({ persistence: store });
  const base = new Map([["index.html", "before"], ["other.css", "old css"]]);
  for (const [path, text] of base) {
    models.open(scope, path, { text, baseSha: "a".repeat(40) });
    const release = models.retain(scope, path);
    t.after(release);
  }
  let context: AgentTextCommit | undefined, published = 0, historyAvailable = true, previewAvailable = true;
  const history: { undo(): boolean; redo(): boolean }[] = [];
  const proof = (path: string) => {
    const revision = models.get(scope, path)?.revision;
    return { isCurrent: () => models.get(scope, path)?.revision === revision };
  };
  const memory = createMemoryWorkspace({ branch: Object.fromEntries(base), open: "index.html" });
  const workspace: EditorWorkspace = {
    ...memory.workspace, agentActing: () => false, draftScope: () => scope, store,
    source: path => path === "index.html" ? models.text(scope, path) : store.get(scope, path)?.content ?? base.get(path), mountedSource: path => models.text(scope, path),
    model: proof, mounted: path => path === "index.html", retainModel: path => models.retain(scope, path),
    evictModel: (path, captured) => {
      if (!captured.isCurrent()) return undefined;
      models.forget(scope, path, true);
      return proof(path);
    },
    branchText: async path => base.has(path) ? { text: base.get(path)!, sha: "a".repeat(40) } : undefined,
    prepareSources(changes) {
      const before = changes.map(change => ({ ...change, revision: models.get(scope, change.path)!.revision }));
      let applied = false;
      return {
        isCurrent: () => before.every(change => models.text(scope, change.path) === (applied ? change.text : change.expectedSource)),
        apply() { for (const change of before) models.write(scope, change.path, change.text); applied = true; return true; },
        undo() { for (const change of before) models.write(scope, change.path, change.expectedSource, change.revision); applied = false; return true; },
        redo() { for (const change of before) models.write(scope, change.path, change.text); applied = true; return true; },
      };
    },
    recordHistory: (_path, undo, redo) => { if (!historyAvailable) return false; history.push({ undo, redo }); return true; },
    afterFileChanges: () => { if (!previewAvailable) throw new Error("Preview unavailable"); published++; },
  };
  if (race) workspace.branchText = race.port("branchText", path => workspace.base(path) === undefined ? Promise.resolve(undefined)
    : Promise.resolve({ text: workspace.base(path)!, sha: "a".repeat(40) }));
  const agentWorkspace = { ...workspace, agentText: () => context, agentActing: () => true };
  const edits = createGuardedEdits(agentWorkspace), manual = createGuardedEdits(workspace);
  const command: AgentCommand = { id: "operation", grantId: "grant", operation: "write_file", path: "index.html", branch: "main", commit: "commit",
    content: "agent", state: "pending", createdAt: Date.now(), expectedHash: await textHash("before") };
  const prepare = (input = command) => prepareAgentText(input, scope, store, () => true, (scope, paths) => models.flushTyping(scope, paths));
  const run = async (input = command, changes = new Map([["index.html", input.content]]), open?: string, afterCommit?: () => void) => {
    const prepared = await prepare(input);
    if (prepared.duplicate) return prepared.duplicate;
    context = prepared.context;
    if (afterCommit) context = { ...context!, commit: async (...args) => {
      const result = await prepared.context!.commit(...args);
      afterCommit();
      return result;
    } };
    if (race) context = { ...context!, fence: race.port("flush", (...args) => prepared.context!.fence(...args)),
      commit: async (...args) => {
        await race.port("staged", async () => {})();
        return prepared.context!.commit(...args);
      } };
    try {
      const result = await edits.run(r => {
        for (const path of changes.keys()) r.source(path);
        return { edits: changes, done: "Changed text.", undone: "Undid text.", select: { historyOnly: true }, ...open === undefined ? {} : { open } };
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      await prepared.finish!(() => workspace.source(input.path) === input.content);
      return prepared.outcome;
    } catch (error) {
      if (!prepared.applied) throw error;
      return prepared.outcome;
    } finally { context = undefined; }
  };
  t.after(async () => { await store.flush(); });
  return { fake, scope, store, records, models, memory, command, run, prepare, history, disk, published: () => published, manualWrites: () => manualWrites, edits, manual, denyHistory: () => { historyAvailable = false; }, denyPreview: () => { previewAvailable = false; } };
}

test("text drafts and receipt commit together before model, history and preview publication; reload agrees", async t => {
  const f = await setup(t);
  let announced = 0;
  f.store.announce = () => { announced++; assert.equal(f.fake.stores.get("receipts")!.size, 1); };
  const outcome = await f.run();
  assert.equal(f.models.text(f.scope, "index.html"), "agent");
  assert.equal(f.history.length, 1);
  assert.equal(f.published(), 1);
  assert.equal(announced, 1);
  await f.store.flush();
  assert.equal(f.manualWrites(), 0, "publication must never queue a second draft transaction");
  assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
  assert.equal(outcome?.result?.hash, await textHash("agent"));
  const loaded = new DraftStore(storage(), indexedDbDrafts(draftDatabaseName, f.fake.factory));
  await loaded.load(f.scope.account);
  assert.equal(loaded.get(f.scope, "index.html")?.content, "agent");
  const reloadedRecords = indexedDbAgentRecords(draftDatabaseName, f.fake.factory);
  assert.deepEqual((await reloadedRecords.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
  assert.equal(f.history[0].undo(), true);
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  assert.equal(f.history[0].redo(), true);
});

for (const failure of ["AbortError", "QuotaExceededError"]) test(`${failure} refuses multi-file edit without drafts, history or model changes`, async t => {
  const f = await setup(t);
  f.store.save({ ...f.scope, version: 1, path: "other.css", baseSha: "a".repeat(40), original: "old css", content: "manual css", updatedAt: 1 });
  f.models.reload(f.scope, "other.css");
  await f.store.flush();
  const before = structuredClone([...f.fake.stores.get("drafts")!]);
  f.fake.state.failure = failure;
  f.fake.state.failPutAt = 3; // Both draft puts succeeded; receipt failure still rolls everything back.
  await assert.rejects(f.run(f.command, new Map([["index.html", "agent"], ["other.css", "agent css"]])), /Agent edits are paused.*could not save.*aborted/i);
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  assert.equal(f.models.text(f.scope, "other.css"), "manual css");
  assert.equal(f.history.length, 0);
  assert.equal(f.published(), 0);
  assert.deepEqual([...f.fake.stores.get("drafts")!], before);
  assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
});

test("missing IndexedDB and failed open refuse without fallback", async t => {
  const f = await setup(t);
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
  await assert.rejects(f.prepare(), /Agent edits are paused.*could not save/i);
  assert.equal(f.history.length, 0);
  assert.equal(f.disk.length, 0);
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: f.fake.factory });
  f.fake.state.openError = true;
  await assert.rejects(f.prepare(), /Agent edits are paused.*could not save/i);
});

test("cancellation before commit applies nothing; after commit reports already applied without undo", async t => {
  const f = await setup(t);
  await f.records.cancel(f.scope, "operation", "grant");
  await assert.rejects(f.run(), /cancelled/);
  assert.equal(f.history.length, 0);
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  const applied = { ...f.command, id: "applied" };
  await f.run(applied);
  assert.equal((await f.records.cancel(f.scope, applied.id, "grant")).status, "applied");
  assert.equal(f.models.text(f.scope, "index.html"), "agent");
});

test("matching duplicate returns recorded outcome without another write or history; identity reuse refuses", async t => {
  const f = await setup(t);
  const outcome = await f.run();
  const revision = await f.records.workspace(f.scope);
  f.fake.state.failPutAt = 1;
  assert.deepEqual(await f.run(), outcome);
  assert.equal(f.fake.state.failPutAt, 1);
  assert.deepEqual(await f.records.workspace(f.scope), revision);
  assert.equal(f.history.length, 1);
  for (const change of [{ content: "different" }, { grantId: "other" }, { args: { title: "other" } }])
    await assert.rejects(f.run({ ...f.command, ...change }), /different|differs/);
  await assert.rejects(f.run({ ...f.command, grantId: undefined }), /authorization id/);
});

test("pending manual typing is durably flushed before the agent's expected records are captured", async t => {
  const f = await setup(t);
  const typing = f.models.beginTyping(f.scope, "index.html");
  typing.input("manual");
  assert.equal(f.fake.stores.get("drafts")!.size, 0);
  await f.run();
  assert.equal(f.store.get(f.scope, "index.html")?.content, "agent");
  assert.equal(f.history[0].undo(), true);
  assert.equal(f.models.text(f.scope, "index.html"), "manual");
  typing.dispose();
});

test("manual write between capture and commit refuses the agent with zero overwrites", async t => {
  const f = await setup(t);
  const prepared = await f.prepare();
  assert.ok(prepared.context);
  const release = await prepared.context.fence(f.scope, ["index.html"]);
  const before = new Map([["index.html", f.store.get(f.scope, "index.html")]]);
  f.models.edit({ scope: f.scope, path: "index.html", text: "newer manual", label: "Manual" });
  await f.store.flush();
  const desired = { ...f.scope, version: 1 as const, path: "index.html", baseSha: "a".repeat(40), original: "before", content: "agent", updatedAt: 2 };
  try { await assert.rejects(prepared.context.commit(before, new Map([["index.html", desired]]), () => true), /changed/); }
  finally { release(); }
  assert.equal(f.models.text(f.scope, "index.html"), "newer manual");
  assert.equal(f.store.get(f.scope, "index.html")?.content, "newer manual");
  assert.equal(f.history.length, 0);
  assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
  assert.equal((await f.records.snapshot(f.scope)).drafts.find(([key]) => key === draftKey(f.scope, "index.html"))?.[1].content, "newer manual");
});

test("completed revocation before commit refuses without publishing", async t => {
  const f = await setup(t);
  await f.records.revoke(f.scope, "grant");
  await assert.rejects(f.run(), /revoked/);
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  assert.equal(f.history.length, 0);
  assert.equal(f.fake.stores.get("drafts")!.size, 0);
});


test("multi-file success publishes one history step and reverting to the baseline deletes the draft atomically", async t => {
  const f = await setup(t);
  await f.run(f.command, new Map([["index.html", "agent"], ["other.css", "agent css"]]));
  assert.equal(f.store.get(f.scope, "other.css")?.content, "agent css");
  assert.equal(f.history.length, 1);
  assert.equal(f.manualWrites(), 0);
  await f.run({ ...f.command, id: "revert", content: "before" });
  assert.equal(f.store.get(f.scope, "index.html"), undefined);
  assert.equal((await f.records.snapshot(f.scope)).drafts.some(([key]) => key === draftKey(f.scope, "index.html")), false);
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  assert.equal(f.history.length, 2);
});

test("unchanged text still records a fenced receipt without publishing a history step", async t => {
  const f = await setup(t);
  const outcome = await f.run({ ...f.command, content: "before" });
  assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
  assert.equal(f.history.length, 0);
  assert.equal(f.manualWrites(), 0);
});

test("mounted write_file carries the checked source into the atomic path; stale text refuses", async t => {
  const f = await setup(t);
  let checked: string | undefined;
  // Only write_file's ports are present; another operation fails if invoked.
  const actions = {
    text: async () => f.models.text(f.scope, "index.html"), atomicText: () => true,
    writeDraft: async (_path: string, _content: string, _create: boolean, expected?: string) => {
      checked = expected;
      return "index.html changed in the editor since it was read. Read it again.";
    },
  } as AgentSiteActions;
  await assert.rejects(applySiteCommand(actions, f.command), /changed in the editor/);
  assert.equal(checked, "before");
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  assert.equal(f.history.length, 0);
});


test("manual guarded edits stay outside agent admission at every staging await", async t => {
  const count = await forEachAwait(race => {
    const state: { fixture?: Awaited<ReturnType<typeof setup>> } = {};
    const done = (async () => {
      const f = state.fixture = await setup(t, race);
      await f.run().catch((error: unknown) => { assert.match(String(error), /changed|stale/i); });
    })();
    return { state, done };
  }, async ({ state }) => {
    const f = state.fixture!;
    const changed = await f.manual.run(r => {
      r.source("index.html");
      return { edits: new Map([["index.html", "newer manual"]]), done: "Manual", undone: "Undo manual", select: { historyOnly: true } };
    });
    assert.equal(changed.ok, true);
    await f.store.flush();
  }, async ({ state }) => {
    const f = state.fixture!;
    assert.equal(f.models.text(f.scope, "index.html"), "newer manual");
    assert.equal(f.store.get(f.scope, "index.html")?.content, "newer manual");
    assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
    assert.equal(f.history.length, 1, "only the manual step belongs to history");
  });
  assert.equal(count, 3);
});


test("a lost history host after durable commit cannot undo the saved agent change", async t => {
  const f = await setup(t);
  f.denyHistory();
  const outcome = await f.run();
  assert.equal(f.models.text(f.scope, "index.html"), "agent");
  assert.equal(f.store.get(f.scope, "index.html")?.content, "agent");
  assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
  assert.equal(f.history.length, 0);
  assert.equal(f.manualWrites(), 0);
});


for (const abort of [false, true]) test(`text page opening keeps the durable boundary (abort=${abort})`, async t => {
  const f = await setup(t);
  if (abort) {
    f.fake.state.failPutAt = 2;
    await assert.rejects(f.run(f.command, new Map([["index.html", "agent"]]), "index.html"), /could not save/);
    assert.equal(f.models.text(f.scope, "index.html"), "before");
    assert.equal(f.history.length, 0);
    assert.equal(f.fake.stores.get("drafts")!.size, 0);
  } else {
    const outcome = await f.run(f.command, new Map([["index.html", "agent"]]), "index.html");
    assert.equal(f.models.text(f.scope, "index.html"), "agent");
    assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
    assert.equal(f.history.length, 1);
    assert.equal(f.manualWrites(), 0);
  }
});


test("a preview failure after commit still reports the exact durable outcome", async t => {
  const f = await setup(t);
  f.denyPreview();
  const outcome = await f.run();
  assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
  assert.equal(f.store.get(f.scope, "index.html")?.content, "agent");
  assert.equal(f.models.text(f.scope, "index.html"), "agent");
  assert.equal(f.manualWrites(), 0);
});


test("hashed command identity omits file contents and refuses mismatching delivered text", async t => {
  const f = await setup(t);
  const command = { ...f.command, contentHash: await textHash(f.command.content) };
  await f.run(command);
  const receipt = await f.records.receipt(f.scope, command.id, command.grantId!);
  assert.deepEqual(JSON.parse(receipt!.payloadIdentity), { operation: command.operation, path: command.path, branch: command.branch,
    commit: command.commit, expectedHash: command.expectedHash, contentHash: command.contentHash });
  await assert.rejects(f.run({ ...command, id: "mismatch", content: "other text" }), /does not match its content hash/);
  assert.equal(f.history.length, 1);
});


test("a command without contentHash stores the computed hash, never the file text, in its identity", async t => {
  const f = await setup(t);
  await f.run();
  const receipt = await f.records.receipt(f.scope, f.command.id, f.command.grantId!);
  const identity = JSON.parse(receipt!.payloadIdentity);
  assert.equal(identity.contentHash, await textHash(f.command.content));
  assert.equal("content" in identity, false);
  assert.equal(receipt!.payloadIdentity.includes(JSON.stringify(f.command.content)), false);
});

test("redelivery after the receipt is evicted and Undo restored the text stays unknown and applies nothing", async t => {
  const f = await setup(t);
  await f.run();
  assert.equal(await f.records.evictReceipts(f.scope, Date.now() + 25 * 60 * 60 * 1000), 1);
  assert.equal(f.history.at(-1)!.undo(), true);
  await f.store.flush();
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  const drafts = (await f.records.snapshot(f.scope)).drafts, revision = await f.records.workspace(f.scope);
  await assert.rejects(f.run(), /meanwhile/);
  assert.equal(f.history.length, 1);
  assert.equal(f.models.text(f.scope, "index.html"), "before");
  assert.deepEqual((await f.records.snapshot(f.scope)).drafts, drafts);
  assert.deepEqual(await f.records.workspace(f.scope), revision);
});

test("an editor change while the transaction commits still leaves this tab's drafts matching the durable records", async t => {
  const f = await setup(t);
  const outcome = await f.run(undefined, undefined, undefined, () => f.memory.bumpGeneration());
  assert.equal(outcome.result?.hash, await textHash("agent"));
  assert.equal(f.history.length, 0);
  // Not published to the stale editor, but draft memory (Save, file lists) reads the committed draft back.
  assert.equal(f.store.get(f.scope, "index.html")?.content, "agent");
  assert.ok(await f.records.receipt(f.scope, f.command.id, f.command.grantId!));
  const loaded = new DraftStore(storage(), indexedDbDrafts(draftDatabaseName, f.fake.factory));
  await loaded.load(f.scope.account);
  assert.equal(loaded.get(f.scope, "index.html")?.content, "agent");
});

test("a durable manual draft newer than the mounted source is never overwritten", async t => {
  const f = await setup(t);
  f.store.save({ ...f.scope, version: 1, path: "index.html", baseSha: "a".repeat(40), original: "before", content: "newer manual", updatedAt: 2 });
  assert.equal(f.models.text(f.scope, "index.html"), "before", "the pane has not adopted the outside write yet");
  await assert.rejects(f.run(), /source changed/);
  assert.equal(f.store.get(f.scope, "index.html")?.content, "newer manual");
  assert.equal((await f.records.snapshot(f.scope)).drafts[0][1].content, "newer manual");
  assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
  assert.equal(f.history.length, 0);
});
