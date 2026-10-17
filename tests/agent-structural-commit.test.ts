import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { textHash, type AgentCommand } from "../shared/agent.ts";
import { prepareAgentText, agentStructuralActions, applySiteCommand, type AgentSiteActions } from "../src/agent-site.ts";
import { indexedDbAgentRecords } from "../src/agent-records.ts";
import { DraftStore, draftDatabaseName, indexedDbDrafts, type DraftScope } from "../src/drafts.ts";
import { createGuardedEdits, type EditorWorkspace, type Outcome, type PlanResult } from "../src/guarded-edit.ts";
import type { AgentTextCommit } from "../src/editor-workspace.ts";
import { resolveNativeProject } from "../shared/native-project.ts";
import { createPagesController, type PagesPorts } from "../src/controllers/pages-controller.ts";
import { createLazyFileOperationsController } from "../src/controllers/file-operation-checks.ts";
import { createBlockMoves } from "../src/page-builder/block-move.ts";
import { withPageField } from "../src/page-builder/site-head.ts";
import type { FileOperationsPorts } from "../src/controllers/file-operations-controller.ts";
import { createMemoryWorkspace } from "./fakes/memory-workspace.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";

let sequence = 0;
const branch = { "index.html": "home", "old.txt": "old", "style.css": "old css" };
type Kind = "create" | "move" | "delete" | "component" | "text";
async function fixture(t: TestContext, race?: AwaitRace, initialHome = "home") {
  const fake = fakeIndexedDB();
  for (const [name, value] of Object.entries({ indexedDB: fake.factory, IDBKeyRange: { bound: (lower: string, upper: string) => ({ lower, upper }) } })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  const scope: DraftScope = { account: `structural-${++sequence}`, repoId: 1, repo: "lex/site", branch: "main" };
  const database = indexedDbDrafts(draftDatabaseName, fake.factory);
  let manualWrites = 0, publication = 0, historyAvailable = true, refresh: "ok" | "throw" | "stale" = "ok";
  const store = new DraftStore({ getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 },
    { ...database, write: changes => { manualWrites++; return database.write(changes); } });
  await store.load(scope.account);
  const records = indexedDbAgentRecords(draftDatabaseName, fake.factory);
  const memory = createMemoryWorkspace({ branch: { ...branch, "index.html": initialHome }, open: "index.html" });
  const files = () => [...new Set([...Object.keys(branch), ...store.list(scope).map(draft => draft.path)])].filter(path => !store.get(scope, path)?.deleted);
  const source = (path: string) => {
    if (memory.workspace.mounted(path)) return memory.workspace.mountedSource(path);
    const draft = store.get(scope, path);
    return draft ? draft.deleted || draft.opaque ? undefined : draft.content : memory.workspace.base(path);
  };
  const workspace: EditorWorkspace = { ...memory.workspace, store, draftScope: () => scope, source, files,
    exists: path => files().some(file => file === path || file.startsWith(`${path}/`)),
    branchText: async path => { const text = memory.workspace.base(path); return text === undefined ? undefined : { text, sha: "a".repeat(40) }; },
    entry: async path => { const text = memory.workspace.base(path); return text === undefined ? undefined : { path, text, sha: "a".repeat(40) }; },
    recordHistory: (...args) => historyAvailable && memory.workspace.recordHistory(...args),
    afterFileChanges: () => { publication++; if (refresh === "throw") throw new Error("Preview unavailable"); },
    openAfter: async () => { if (refresh === "stale") memory.bumpGeneration(); if (refresh === "throw") throw new Error("Opening failed"); },
  };
  if (race) {
    workspace.createProblem = race.port("createProblem", workspace.createProblem.bind(workspace));
    workspace.entry = race.port("entry", workspace.entry.bind(workspace));
    workspace.branchText = race.port("branchText", workspace.branchText.bind(workspace));
  }
  const manual = createGuardedEdits(workspace);
  const command = (kind: Kind): AgentCommand => ({ id: "operation", grantId: "grant", operation: kind === "create" || kind === "text" ? "write_file" : kind === "move" ? "move_file" : kind === "delete" ? "delete_file" : "make_component",
    path: kind === "create" ? "new.txt" : kind === "component" || kind === "text" ? "index.html" : "old.txt", branch: "main", commit: "commit", content: kind === "create" ? "new file" : kind === "text" ? "agent text" : "",
    args: kind === "move" ? { to: "new.txt" } : kind === "component" ? { element: "0", tag: "site-part" } : undefined,
    state: "pending", createdAt: Date.now(), expectedHash: kind === "create" ? null : undefined });
  let context: AgentTextCommit | undefined, lastOutcome: Outcome | undefined;
  const agentWorkspace = { ...workspace, agentText: () => context, agentActing: () => true };
  const edits = createGuardedEdits(agentWorkspace);
  const run = async (kind: Kind, input = command(kind), afterCommit?: () => void) => {
    const epoch = workspace.generation();
    const current = () => epoch === workspace.generation();
    const prepared = await prepareAgentText(input, scope, store, current, () => {}, () => { workspace.afterFileChanges(); });
    if (prepared.duplicate) return prepared.duplicate;
    context = prepared.context;
    if (race) context = { ...context!, fence: race.port("fence", (...args) => prepared.context!.fence(...args)),
      commit: async (...args) => { await race.port("beforeCommit", async () => {})(); return prepared.context!.commit(...args); } };
    if (afterCommit) {
      const original = context!;
      context = { ...original, commit: async (...args) => { const result = await original.commit(...args); afterCommit(); return result; } };
    }
    try {
      const outcome = lastOutcome = await edits.run(async r => {
        r.source(input.path);
        if (race) await race.port("plan", async () => {})();
        const plan = { done: "Changed files", undone: "Undid files", select: { historyOnly: true } };
        if (kind === "create") return { ...plan, creates: [{ path: input.path, content: input.content }] };
        if (kind === "move") return { ...plan, moves: [{ from: "old.txt", to: "new.txt" }] };
        if (kind === "delete") return { ...plan, deletes: ["old.txt"] };
        if (kind === "text") return { ...plan, edits: new Map([[input.path, input.content]]) };
        r.source("style.css");
        return { ...plan, edits: new Map([["index.html", "<site-part></site-part>"], ["style.css", "new css"]]),
          creates: [{ path: "components/site-part.html", content: "<slot></slot>" }, { path: "loader.js", content: "load()" }] } satisfies PlanResult;
      });
      if (!outcome.ok || outcome.message) throw new Error(outcome.message);
      await prepared.finish!(() => current());
      return prepared.outcome;
    } catch (error) {
      if (!prepared.applied) throw error;
      await prepared.recover!();
      return prepared.outcome;
    } finally { context = undefined; }
  };
  t.after(() => store.flush());
  const unchanged = async () => {
    assert.equal(fake.stores.get("drafts")!.size, 0);
    assert.equal(fake.stores.get("receipts")!.size, 0);
    assert.deepEqual(memory.steps(), []);
    assert.equal(source("index.html"), "home");
    assert.equal(publication, 0);
  };
  return { fake, records, store, memory, workspace, scope, command, run, manual, unchanged, lastOutcome: () => lastOutcome, manualWrites: () => manualWrites,
    failRefresh: (mode: typeof refresh) => { refresh = mode; }, denyHistory: () => { historyAvailable = false; } };
}

for (const kind of ["create", "move", "delete", "component"] as const) {
  test(`${kind}: all drafts and receipt commit together; one Undo and Redo restore all files`, async t => {
    const f = await fixture(t);
    const outcome = await f.run(kind);
    assert.equal(f.fake.stores.get("receipts")!.size, 1);
    const durable = (await f.records.snapshot(f.scope)).drafts;
    assert.equal(durable.filter(([, record]) => record.path !== "index.html" || kind === "component").length, kind === "component" ? 4 : kind === "move" ? 2 : 1);
    assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
    for (const [, record] of durable) assert.deepEqual(f.store.get(f.scope, record.path), record);
    assert.equal(f.manualWrites(), 0, "no second persistence transaction during publication");
    assert.deepEqual(f.memory.steps(), ["operation"]);
    assert.equal(f.memory.undo(), true);
    assert.equal(f.store.list(f.scope).length, 0);
    assert.equal(f.workspace.source("index.html"), "home");
    assert.equal(f.memory.undo(), false, "exactly one step");
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.memory.redo(), true);
    assert.deepEqual(f.store.list(f.scope).sort((a, b) => a.path.localeCompare(b.path)), durable.map(([, record]) => record).sort((a, b) => a.path.localeCompare(b.path)));
  });
  for (const error of ["AbortError", "QuotaExceededError"]) test(`${kind}: ${error} at the receipt rolls every file back`, async t => {
    const f = await fixture(t);
    f.fake.state.failure = error;
    f.fake.state.failPutAt = kind === "component" ? 5 : kind === "move" ? 3 : 2;
    await assert.rejects(f.run(kind), /Nothing was changed; your drafts are as they were/);
    await f.unchanged();
  });
  for (const disturbance of ["revocation", "cancellation", "takeover", "stale", "abort", "quota"] as const) test(`${kind}: ${disturbance} at every preparation await applies nothing`, async t => {
    const count = await forEachAwait(race => {
      const state: { f?: Awaited<ReturnType<typeof fixture>> } = {};
      const done = (async () => {
        const f = state.f = await fixture(t, race);
        await f.run(kind).catch((error: unknown) => { assert.match(String(error), /changed|cancelled|revoked|ownership|save/i); });
      })();
      return { state, done };
    }, async ({ state }) => {
      const f = state.f!;
      if (disturbance === "revocation") await f.records.revoke(f.scope, "grant");
      else if (disturbance === "cancellation") await f.records.cancel(f.scope, "operation", "grant");
      else if (disturbance === "takeover") await f.records.setGeneration(f.scope, 0, 1);
      else if (disturbance === "stale") f.memory.bumpGeneration();
      else { f.fake.state.failure = disturbance === "abort" ? "AbortError" : "QuotaExceededError"; f.fake.state.failPutAt = 1; }
    }, async ({ state }) => state.f!.unchanged());
    assert.ok(count >= 4);
  });
}

for (const mode of ["throw", "stale", "history", "editor"] as const) test(`structural postcommit ${mode} failure still reports the recorded applied outcome`, async t => {
  const f = await fixture(t);
  if (mode === "history") f.denyHistory();
  else if (mode !== "editor") f.failRefresh(mode);
  const outcome = await f.run("component", undefined, mode === "editor" ? () => f.memory.bumpGeneration() : undefined);
  assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, outcome);
  assert.equal(f.lastOutcome()?.ok, true);
  assert.equal(f.lastOutcome()?.message, undefined, "guarded commit itself must not relabel a refresh failure as an error");
  const loaded = new DraftStore({ getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, indexedDbDrafts(draftDatabaseName, f.fake.factory));
  await loaded.load(f.scope.account);
  assert.deepEqual(f.store.list(f.scope), loaded.list(f.scope));
  assert.equal(f.store.list(f.scope).length, 4);
});

test("structural duplicate returns its recorded outcome; all identity fields reject id reuse without reapplying", async t => {
  const f = await fixture(t), command = f.command("move");
  const outcome = await f.run("move", command), state = await f.records.snapshot(f.scope);
  assert.deepEqual(await f.run("move", command), outcome);
  for (const difference of [{ operation: "delete_file" as const }, { path: "style.css" }, { branch: "other" }, { commit: "other" }, { expectedHash: "other" }, { args: { to: "elsewhere.txt" } }, { content: "private file bytes" }])
    await assert.rejects(f.run("move", { ...command, ...difference }), /different|differs/);
  assert.deepEqual(await f.records.snapshot(f.scope), state);
  assert.deepEqual(f.memory.steps(), ["operation"]);
  const identity = JSON.parse((await f.records.receipt(f.scope, command.id, "grant"))!.payloadIdentity);
  assert.equal(identity.contentHash, await textHash(command.content));
  assert.equal("content" in identity, false);
});

test("manual editing during structural preparation never gets the agent receipt", async t => {
  await forEachAwait(race => {
    const state: { f?: Awaited<ReturnType<typeof fixture>> } = {};
    const done = (async () => { const f = state.f = await fixture(t, race); await f.run("component").catch(() => {}); })();
    return { state, done };
  }, async ({ state }) => {
    const f = state.f!;
    const result = await f.manual.run(r => { r.source("index.html"); return { edits: new Map([["index.html", "manual"]]), done: "Manual", undone: "Undo manual", select: { historyOnly: true } }; });
    assert.equal(result.ok, true);
    await f.store.flush();
  }, async ({ state }) => {
    const f = state.f!;
    assert.equal(f.workspace.source("index.html"), "manual");
    assert.equal(f.store.list(f.scope).length, 1);
    assert.equal(f.store.get(f.scope, "index.html")?.content, "manual");
    assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
    assert.deepEqual(f.memory.steps(), ["operation"]);
  });
});

/** Live ports into the same fixture, using the real Pages and Files controllers. */
function controllerPorts(f: Awaited<ReturnType<typeof fixture>>, race?: AwaitRace) {
  const edits = f.manual, { workspace, scope, store } = f;
  const parsed = resolveNativeProject(Object.keys(branch));
  assert.ok(parsed.ok);
  f.memory.setSite(parsed.site);
  const wait = race ? race.port("controller preparation", async () => undefined) : async () => undefined;
  const pages: PagesPorts = {
    edits, site: () => workspace.site(), routeForPath: () => "/", source: path => workspace.source(path), files: () => workspace.files(),
    baseFiles: () => Object.keys(branch), drafts: () => store.list(scope), hasDraftScope: () => true,
    routeInfo: () => ({}), titles: () => ({}), siteUrl: () => undefined, writeMeta: async () => undefined,
    ensureIndex: wait, readRedirects: wait, withMovedPageUrls: () => {}, pageLinks: () => undefined,
    cardsLinkingTo: () => undefined, confirmation: () => undefined, picker: () => undefined,
    refreshMeta: () => {}, refreshLabel: () => {}, tree: () => undefined, pagesHidden: () => false,
    openFile: () => workspace.openFile(), clearPendingTitles: () => {}, tabsMounted: () => false, paintTabs: () => {},
    resetExplorer: () => {}, showMedia: () => {}, siteReadForCreate: wait, createWithCard: () => undefined,
    navigationTarget: () => undefined, restoreDeleted: () => {}, announce: () => {}, refuse: () => {}, error: () => {},
  };
  const entries = Object.keys(branch).map(path => ({ path, type: "blob" as const, sha: "a".repeat(40), mode: "100644" }));
  const files: FileOperationsPorts = {
    edits, parentOf: path => path.slice(0, Math.max(0, path.lastIndexOf("/"))), draftScope: () => scope,
    engaged: () => true, repository: () => ({ full_name: scope.repo }),
    treeState: () => ({ changes: new Map(), deleted: new Map(store.list(scope).filter(draft => draft.deleted).map(draft => [draft.path, draft])), drafted: store.list(scope).filter(draft => !draft.deleted).map(draft => draft.path) }),
    pathNow: path => workspace.files().includes(path) ? "file" : workspace.exists(path) ? "folder" : undefined,
    branchFilesUnder: async folder => { await wait(); return entries.filter(entry => entry.path.startsWith(`${folder}/`)); },
    findEntry: async path => { await wait(); return entries.find(entry => entry.path === path); },
    draftStore: () => store, baseSource: path => workspace.base(path), readFiles: async () => ({}), readFile: async () => "old",
    nativeFiles: () => workspace.files(), ensureNativeTextIndex: wait, branchPathProblem: wait,
    onBranchHere: path => Object.hasOwn(branch, path), withMovedPageUrls: () => {}, readNativeRedirects: wait,
    confirmDialog: () => undefined, undoFileChanges: () => {}, duplicateFile: () => false,
    afterFileChanges: () => workspace.afterFileChanges(), announce: () => {}, refuse: () => {}, errorMessage: () => {},
    requestAnimationFrame: task => task(), openFolder: () => {}, fileRow: () => undefined, renderFileTree: () => {}, filesTabOpen: () => false,
  };
  return { pages, files, components: () => { throw new Error("This unit fixture does not mount component UI."); },
    factories: { createGuardedEdits, createPagesController, createLazyFileOperationsController, createBlockMoves, withPageField },
    actions(edits: typeof f.manual): AgentSiteActions {
      // These scenarios exercise only the structural ports supplied by agentStructuralActions.
      return { edits, text: async path => workspace.source(path), isMounted: path => workspace.mounted(path) } as AgentSiteActions;
    },
  };
}

for (const operation of ["create_page", "set_page_details", "move_file", "delete_file"] as const) test(`real ${operation} controller carries one scoped receipt and one history action`, async t => {
  const f = await fixture(t, undefined, "<html><head><title>Home</title></head><body>home</body></html>");
  const command: AgentCommand = { ...f.command("component"), operation, path: operation === "move_file" || operation === "delete_file" ? "old.txt" : "index.html",
    args: operation === "set_page_details" ? { title: "New title", description: "New description" } : operation === "move_file" ? { to: "new.txt" } : { title: "New page", slug: "new-page" } };
  const prepared = await prepareAgentText(command, f.scope, f.store, () => true, () => {});
  assert.ok(prepared.context);
  const ports = controllerPorts(f), callbacks: (() => void)[] = [];
  ports.files.requestAnimationFrame = task => { callbacks.push(task); };
  const scoped = agentStructuralActions(f.workspace, prepared.context, () => true, ports);
  try {
    await applySiteCommand(scoped.actions, command);
    await prepared.finish!(() => true);
    assert.equal(prepared.applied, true);
    assert.equal(f.fake.stores.get("receipts")!.size, 1);
    assert.deepEqual(f.memory.steps(), ["operation"]);
    if (operation === "set_page_details") {
      assert.match(f.workspace.source("index.html")!, /New title/);
      assert.match(f.workspace.source("index.html")!, /New description/);
    }
    scoped.dispose();
    for (const callback of callbacks) assert.doesNotThrow(callback, "a delayed focus callback must be harmless after command disposal");
    assert.equal(f.memory.undo(), true);
    assert.equal(f.store.list(f.scope).length, 0);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.memory.redo(), true);
  } finally { scoped.dispose(); }
});

for (const disturbance of ["takeover", "revocation", "cancel", "manual"] as const) test(`real page controller: ${disturbance} at every awaited port cannot commit late`, async t => {
  await forEachAwait(race => {
    const state: { f?: Awaited<ReturnType<typeof fixture>> } = {};
    const done = (async () => {
      const f = state.f = await fixture(t, race);
      const command = { ...f.command("component"), operation: "create_page" as const, args: { title: "Page", slug: "page" } };
      const prepared = await prepareAgentText(command, f.scope, f.store, () => true, () => {});
      assert.ok(prepared.context);
      const scoped = agentStructuralActions(f.workspace, prepared.context, () => true, controllerPorts(f, race));
      try { await applySiteCommand(scoped.actions, command); } catch { /* Disturbance may win before or at the commit fence. */ }
      finally { scoped.dispose(); }
    })();
    return { state, done };
  }, async ({ state }) => {
    const f = state.f!;
    if (disturbance === "takeover") await f.records.setGeneration(f.scope, 0, 1);
    else if (disturbance === "revocation") await f.records.revoke(f.scope, "grant");
    else if (disturbance === "cancel") await f.records.cancel(f.scope, "operation", "grant");
    else {
      f.store.save({ ...f.scope, version: 1, path: "index.html", baseSha: "a".repeat(40), original: "home", content: "manual", updatedAt: 1 });
      await f.store.flush();
    }
  }, async ({ state }) => {
    const f = state.f!;
    assert.equal(f.fake.stores.get("receipts")!.size, 0);
    assert.deepEqual(f.memory.steps(), []);
    assert.equal(f.store.list(f.scope).length, disturbance === "manual" ? 1 : 0);
  });
});

for (const manual of [false, true]) test(`unchanged structural plan keeps its original proof through the receipt fence (manual=${manual})`, async t => {
  const home = '<html><head><title>Home</title><meta property="og:title" content="Home"></head><body>home</body></html>';
  const f = await fixture(t, undefined, home);
  const command: AgentCommand = { ...f.command("component"), operation: "set_page_details", args: { title: "Home" } };
  const prepared = await prepareAgentText(command, f.scope, f.store, () => true, () => {});
  assert.ok(prepared.context);
  const scoped = agentStructuralActions(f.workspace, prepared.context, () => true, controllerPorts(f));
  try {
    await applySiteCommand(scoped.actions, command);
    assert.equal(prepared.applied, false, "an unchanged plan still needs a durable receipt");
    if (manual) {
      const fence = prepared.context.fence.bind(prepared.context);
      prepared.context.fence = async (...args) => {
        const release = await fence(...args);
        f.store.save({ ...f.scope, version: 1, path: "index.html", baseSha: "a".repeat(40), original: home, content: "newer manual", updatedAt: 1 });
        await f.store.flush();
        return release;
      };
      await assert.rejects(prepared.finish!(() => scoped.current(), scoped.readDrafts), /changed/);
      assert.equal(f.fake.stores.get("receipts")!.size, 0);
      assert.equal(f.store.get(f.scope, "index.html")?.content, "newer manual");
    } else {
      await prepared.finish!(() => scoped.current(), scoped.readDrafts);
      assert.equal(f.fake.stores.get("receipts")!.size, 1);
      assert.equal(f.store.list(f.scope).length, 0);
    }
    assert.deepEqual(f.memory.steps(), []);
  } finally { scoped.dispose(); }
});

test("a newer opaque draft beneath a mounted text model cannot be overwritten through the shared commit path", async t => {
  const f = await fixture(t);
  const opaque = { ...f.scope, version: 1 as const, path: "index.html", baseSha: "a".repeat(40), original: "home", content: "", opaque: true as const, updatedAt: 1 };
  f.store.save(opaque);
  await f.store.flush();
  await assert.rejects(f.run("text"), /source changed/);
  assert.deepEqual(f.store.get(f.scope, "index.html"), opaque);
  assert.deepEqual((await f.records.snapshot(f.scope)).drafts.map(([, record]) => record), [opaque]);
  assert.equal(f.fake.stores.get("receipts")!.size, 0);
  assert.equal(f.workspace.source("index.html"), "home");
  assert.deepEqual(f.memory.steps(), []);
});
