import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createAgentCommands, createAgentSiteHost, type AgentCommandPorts, type AgentSiteHostPorts } from "../src/agent-site-host";
import { createAppStore } from "../src/app-store";
import { createDraftStore } from "../src/draft-store";
import type { AgentCommand } from "../shared/agent";
import type { Repository, SessionInfo, Snapshot } from "../shared/types";
import * as agentSite from "../src/agent-site";
import { draftKey, draftStore, type DraftScope, type SavedDraft } from "../src/drafts";
import { createWorkspaceSession, githubScope, type SessionStamp } from "../src/workspace-session";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import { forEachAwait } from "./support/await-race";
import type { AgentSiteInput, SharedContext } from "../src/agent-site";

function fixture() {
  const workspace = createMemoryWorkspace();
  const edits = createGuardedEdits(workspace.workspace);
  const loading = deferred<Awaited<ReturnType<AgentSiteHostPorts["load"]>>>();
  const input: AgentSiteInput = { repository: { id: 1, fullName: "lex/site" }, branch: "main", commit: "head", file: null, drafts: [], mountedSource: () => undefined };
  const result: SharedContext = { context: { repository: input.repository, branch: input.branch, commit: input.commit, file: null, drafts: [] }, texts: new Map() };
  let built = 0, inputs = 0;
  const ports = {
    stamp: () => edits.stamp("repository"), load: () => loading.promise,
    input: () => { inputs++; return input; },
  } satisfies AgentSiteHostPorts;
  const module: Awaited<ReturnType<AgentSiteHostPorts["load"]>> = {
    buildAgentContext: async value => { built++; assert.equal(value, input); return result; },
  };
  return { host: createAgentSiteHost(ports), workspace, result, input, module,
    load: () => loading.resolve(module), counts: () => ({ built, inputs }),
  };
}

test("an agent context built across a branch switch is dropped", async () => {
  const f = fixture();
  const pending = f.host.context();
  f.workspace.setScope("lex/site@dev");
  f.load();
  assert.equal(await pending, undefined);
  assert.equal(f.counts().built, 0);
  assert.equal(f.counts().inputs, 0);
});

test("an agent context whose build spans a branch switch is dropped", async () => {
  const f = fixture();
  const building = deferred<void>();
  f.module.buildAgentContext = async () => { await building.promise; return f.result; };
  const pending = f.host.context();
  f.load();
  await Promise.resolve(); await Promise.resolve();
  f.workspace.setScope("lex/site@dev");
  building.resolve();
  assert.equal(await pending, undefined);
  assert.equal(f.counts().inputs, 1, "the switch came while the context was being built");
});

test("an agent context survives opening another page", async () => {
  const f = fixture();
  const context = f.host.context();
  f.workspace.setRoute("/about/");
  f.workspace.enterEditMode();
  f.load();
  assert.equal(await context, f.result);
  assert.deepEqual(f.counts(), { built: 1, inputs: 1 });
});

// Ticket 23: an edit's pin, taken as it arrives. Switched to another branch at any wait of its context,
// it is the context of the workspace it arrived in (its drafts then, nothing mounted or on show),
// never the one shown meanwhile.
test("an edit's pinned context, switched at any wait, is the workspace it arrived in", async () => {
  const count = await forEachAwait(race => {
    const f = fixture(), seen: AgentSiteInput[] = [];
    f.module.buildAgentContext = race.port("build", async value => { seen.push(value); return f.result; });
    const edits = createGuardedEdits(f.workspace.workspace);
    const host = createAgentSiteHost({ stamp: () => edits.stamp("repository"), load: race.port("load", async () => f.module), input: () => f.input });
    const build = () => host.context();
    const pin = host.tools(build).pin()!;
    const run = { f, seen, context: undefined as SharedContext | undefined, done: Promise.resolve() };
    run.done = pin.context().then(value => { run.context = value; });
    return run;
  }, run => { run.f.workspace.setScope("lex/site@dev"); }, run => {
    assert.equal(run.context, run.f.result, "a context, not none");
    const last = run.seen.at(-1)!;
    assert.equal(last.branch, "main");
    assert.equal(last.native, undefined, "nothing on show is read once away");
  });
  assert.ok(count >= 2);
});

// The agent's commands (createAgentCommands) read the host's state as they run, not as the host was made.
/** A port these cases never reach, but for its `used` members: reading anything else throws, so a case that starts to use it fails naming it. */
function unusedPort<T extends object>(name: string, used: Partial<T> = {}): T {
  return new Proxy({} as T, { get: (_, key) => {
    if (Object.hasOwn(used, key)) return used[key as keyof T];
    throw new Error(`${name}.${String(key)} is not used here`);
  } });
}
const unused = (): never => { throw new Error("not used here"); };
const signedOut = { configured: true, user: null, installUrl: null } satisfies SessionInfo;
const signedIn = { ...signedOut, user: { login: "lex", avatar_url: "" } } satisfies SessionInfo;
const repository = { id: 1, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } } satisfies Repository;
const snapshotAt = (commit: string, branch = "main") => ({ branch, commit, entries: [] }) satisfies Snapshot;
// The browser's draft store (src/drafts.ts `draftStore`) listens on the page and keeps nothing in storage here.
const browser = globalThis as Record<string, unknown>;
const savedGlobals = ["window", "document", "localStorage", "BroadcastChannel"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const stored = new Map<string, string>();
browser.window = { addEventListener: () => {} };
browser.document = { addEventListener: () => {}, visibilityState: "visible" };
browser.localStorage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); }, key: (index: number) => [...stored.keys()][index] ?? null, get length() { return stored.size; } };
Reflect.deleteProperty(globalThis, "BroadcastChannel");
after(() => {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
const SCOPE = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" } satisfies DraftScope;

type PagesAndFilesPort = AgentCommandPorts["pagesAndFiles"];
/** Overrides laid on by descriptor, not spread or Object.assign: either would read a getter once, as a copy. */
const withPorts = <T extends object>(base: T, overrides: Partial<T>): T => Object.defineProperties(base, Object.getOwnPropertyDescriptors(overrides));

function commandsFixture(overrides: Partial<AgentCommandPorts> = {}, files: Partial<PagesAndFilesPort> = {}) {
  const appStore = createAppStore(createDraftStore());
  const host = { info: signedOut as SessionInfo, pageStructure: undefined as AgentCommandPorts["pageStructure"],
    nativePreview: undefined as AgentCommandPorts["nativePreview"] };
  const calls: string[] = [];
  const pagesAndFiles = {
    nativeResyncDone: undefined as PagesAndFilesPort["nativeResyncDone"], pageActions: undefined,
    pagesController: { renderTree: () => { calls.push("tree"); } }, filesTreeController: { refresh: () => { calls.push("files"); } },
    loadPagesActions: unused, loadFileOps: unused, pagePorts: unused, filePorts: unused, branchText: unused, pathNow: unused, treeState: unused,
    branchPathProblem: unused, afterFileChanges: () => { calls.push("after"); },
  } satisfies PagesAndFilesPort;
  const ports = {
    appStore, runtime: unusedPort("runtime"), workspaceSession: unusedPort("workspaceSession"), guardedEdits: unusedPort("guardedEdits"),
    editorWorkspace: unusedPort("editorWorkspace"), versions: unusedPort("versions"), finishedWork: unusedPort("finishedWork"),
    parkedSteps: unusedPort("parkedSteps"), repositoryIndex: unusedPort("repositoryIndex"), mediaController: unusedPort("mediaController"),
    mediaPorts: unusedPort("mediaPorts"), blockMoves: unusedPort("blockMoves"), agentPresence: unusedPort("agentPresence"),
    pagesAndFiles: withPorts(pagesAndFiles, files), api: unused,
    editorModule: { isMounted: () => false, getMountedSource: unused, dropDraft: unused, forgetDraftModel: unused, prepareHistorySources: unused,
      flushAgentTyping: unused, applyAgentDraft: async command => { calls.push(`draft ${command.path}`); } },
    get info() { return host.info; }, componentTools: undefined,
    get pageStructure() { return host.pageStructure; }, get nativePreview() { return host.nativePreview; },
    loadAgentSite: unused, draftScope: () => undefined, shownScope: () => undefined, restoreFile: unused,
    openNewDraft: async draft => { calls.push(`open ${draft.account} ${draft.path}`); }, nativeComponentLoaderPlan: unused,
    writeNativePageMeta: async () => undefined, nativeSectionChoices: () => [], componentPorts: unused,
    refreshNativeRoutes: () => { calls.push("routes"); }, updateCurrentPageLabel: () => { calls.push("label"); }, updateAgentContext: () => { calls.push("context"); },
  } satisfies AgentCommandPorts;
  return { commands: createAgentCommands(withPorts(ports, overrides)), appStore, host, calls };
}

const command = (fields: Pick<AgentCommand, "id" | "operation" | "path" | "content"> & Partial<AgentCommand>) =>
  ({ branch: "main", commit: "c1", state: "pending", createdAt: 0, ...fields }) satisfies AgentCommand;
const activeDraft = command({ id: "a1", operation: "update_active_draft", path: "index.html", content: "<p>Hi</p>" });

test("an agent's active-file draft is checked against the session and branch shown as it runs", async () => {
  const f = commandsFixture();
  await assert.rejects(f.commands.actions.legacy(activeDraft), { message: "The editor context changed." });
  f.host.info = signedIn;
  f.appStore.repository.value = repository;
  f.appStore.snapshot.value = snapshotAt("c1");
  await f.commands.actions.legacy(activeDraft);
  assert.deepEqual(f.calls, ["draft index.html"]);
  f.appStore.snapshot.value = snapshotAt("c2");
  await assert.rejects(f.commands.actions.legacy(activeDraft), { message: "The editor context changed." });
  f.appStore.snapshot.value = snapshotAt("c1", "dev");
  await assert.rejects(f.commands.actions.legacy(activeDraft), { message: "The editor context changed." });
});

test("an agent's new-file draft is saved for the account signed in and opened, once", async (t) => {
  t.after(() => draftStore().remove(SCOPE, "notes.txt"));
  const f = commandsFixture();
  f.host.info = signedIn;
  f.appStore.repository.value = repository;
  f.appStore.snapshot.value = snapshotAt("c1");
  const create = command({ id: "n1", operation: "create_file_draft", path: "notes.txt", content: "Hello" });
  await f.commands.actions.legacy(create);
  assert.deepEqual(f.calls, ["files", "open lex notes.txt"]);
  assert.equal(draftStore().get(SCOPE, "notes.txt")?.content, "Hello");
  await f.commands.actions.legacy(create);
  assert.deepEqual(f.calls, ["files", "open lex notes.txt"], "the same draft again changes nothing");
  await assert.rejects(f.commands.actions.legacy({ ...create, content: "Other" }), { message: /^This file already has a browser draft\./ });
});

test("an agent reads the preview and Page Structure made after its commands' host", async () => {
  const f = commandsFixture();
  assert.throws(() => f.commands.actions.inspect({ path: "index.html" }), { message: "The preview is not showing a page." });
  f.host.nativePreview = { isActive: () => true, inspect: async request => ({ inspected: request.path }) };
  assert.deepEqual(await f.commands.actions.inspect({ path: "index.html" }), { inspected: "index.html" });
  f.host.pageStructure = { refreshMeta: () => { f.calls.push("meta"); } };
  assert.equal(await f.commands.actions.setPageDetail("index.html", "title", "Home"), undefined);
  assert.deepEqual(f.calls, ["meta", "tree", "label", "context"]);
});

const loaded = { loadPagesActions: () => import("../src/controllers/pages-controller"), loadFileOps: () => import("../src/controllers/file-operation-checks") } satisfies Partial<PagesAndFilesPort>;

test("an agent's command is acting while it runs, and not once it resolves or rejects", async () => {
  const seen: boolean[] = [];
  let fail = false;
  const f = commandsFixture({
    loadAgentSite: async () => ({ ...agentSite, pinnedMedia: () => true, pinnedMediaActions: actions => actions, pinnedMediaAway: () => undefined,
      applySiteCommand: async () => { seen.push(f.commands.acting()); await Promise.resolve(); if (fail) throw new Error("refused"); return { message: "done" }; } }),
  }, loaded);
  const media = command({ id: "m1", operation: "list_media", path: "index.html", content: "" });
  assert.deepEqual(await f.commands.apply(media), { message: "done" });
  assert.equal(f.commands.acting(), false);
  fail = true;
  await assert.rejects(f.commands.apply(media), { message: "refused" });
  assert.equal(f.commands.acting(), false);
  assert.deepEqual(seen, [true, true]);
});

test("a reload after an agent's write reads the open page again on the stamp it began with, while that holds", async (t) => {
  t.after(() => draftStore().remove(SCOPE, "index.html"));
  const draft = { ...SCOPE, version: 1, path: "index.html", baseSha: "b1", original: "<p>Old</p>", content: "<p>New</p>", updatedAt: 0 } satisfies SavedDraft;
  draftStore().save(draft);
  let holds = true;
  const stamps: SessionStamp[] = [], restored: [string, SessionStamp][] = [];
  const f = commandsFixture({
    draftScope: () => SCOPE,
    workspaceSession: { begin: () => { const stamp = { load: 1, scope: githubScope(SCOPE), holds: () => holds, changed: () => undefined } satisfies SessionStamp; stamps.push(stamp); return stamp; },
      current: unused, visits: unused },
    editorModule: { isMounted: () => true, getMountedSource: () => "<p>Old</p>", dropDraft: unused, forgetDraftModel: unused,
      prepareHistorySources: unused, flushAgentTyping: unused, applyAgentDraft: unused },
    restoreFile: async (path, at) => { restored.push([path, at]); },
  });
  f.appStore.openFile.value = "index.html";
  const snapshot = { revision: 1, generation: 1, drafts: [[draftKey(SCOPE, "index.html"), draft]] } satisfies Parameters<typeof f.commands.reload>[0];
  await f.commands.reload(snapshot);
  assert.deepEqual(restored, [["index.html", stamps[0]]]);
  holds = false;
  await f.commands.reload(snapshot);
  assert.equal(restored.length, 1, "left meanwhile: nothing mounted is read, nothing restored");
});

// An agent's read waits for a home page's resync, refused once another site or branch was opened meanwhile.
const SWITCHED = "The editor tab switched to another site meanwhile. Call get_site and try again.";
function resyncFixture(resync: () => Promise<void>) {
  const session = createWorkspaceSession();
  session.next(githubScope(SCOPE));
  let pending: Promise<void> | undefined;
  const f = commandsFixture({
    workspaceSession: session, draftScope: () => SCOPE,
    runtime: unusedPort<AgentCommandPorts["runtime"]>("runtime", { source: () => "<p>Home</p>" }),
  }, { get nativeResyncDone() { return pending ??= resync(); } });
  return { ...f, switchBranch: () => session.next(githubScope({ ...SCOPE, branch: "dev" })) };
}

test("an agent's read across a home page's resync is refused once another branch was opened", async () => {
  const resync = deferred();
  const f = resyncFixture(() => resync.promise);
  const reading = f.commands.actions.text("index.html");
  f.switchBranch();
  resync.resolve();
  await assert.rejects(reading, { message: SWITCHED });
  const again = resyncFixture(async () => {});
  assert.equal(await again.commands.actions.text("index.html"), "<p>Home</p>", "nothing switched: the text as the editor has it");
});

test("an agent's read, switched to another branch at any wait of the resync, is refused", async () => {
  const count = await forEachAwait(race => {
    const f = resyncFixture(race.port("resync", async () => {}));
    const run = { f, outcome: undefined as string | undefined, done: Promise.resolve() };
    run.done = f.commands.actions.text("index.html").then(text => { run.outcome = text; }, (error: Error) => { run.outcome = error.message; });
    return run;
  }, run => { run.f.switchBranch(); }, run => {
    assert.equal(run.outcome, SWITCHED);
  });
  assert.ok(count >= 1);
});

// Ticket 23: an agent's command run on show is proved by the branch and the revision it was read on.
test("an agent's command on show is refused once its branch or revision moved, and runs acting otherwise", async () => {
  const seen: boolean[] = [];
  const session = createWorkspaceSession();
  session.next(githubScope(SCOPE));
  const f = commandsFixture({
    workspaceSession: session, draftScope: () => SCOPE, versions: { view: undefined },
    // Its finishing elsewhere runs as it is: read on no other branch (no read files), it finishes nowhere else.
    finishedWork: { add: unused, agent: (_scope, _command, _draft, run) => run },
    loadAgentSite: async () => ({ ...agentSite, applySiteCommand: async () => { seen.push(f.commands.acting()); return { message: "done" }; } }),
  }, { ...loaded, pagePorts: () => unusedPort("pagePorts"), filePorts: () => unusedPort("filePorts") });
  const read = command({ id: "s1", operation: "list_media", path: "index.html", content: "" });
  f.appStore.snapshot.value = snapshotAt("c2");
  await assert.rejects(f.commands.apply(read), { message: "This branch is at another revision now than when the change was read. Read the site again." });
  await assert.rejects(f.commands.apply({ ...read, branch: "dev" }), { message: "The editor changed repository or branch." });
  f.appStore.snapshot.value = snapshotAt("c1");
  assert.deepEqual(await f.commands.apply(read), { message: "done" });
  assert.deepEqual(seen, [true]);
});

// An agent's first file in a repository that is not a native site yet: a new draft, all or nothing (src/new-drafts.ts).
function preNativeFixture(checkPath: (path: string) => Promise<string | undefined>) {
  draftStore().remove(SCOPE, "notes.txt");
  const session = createWorkspaceSession();
  session.next(githubScope(SCOPE));
  const f = commandsFixture({
    workspaceSession: session, draftScope: () => SCOPE, versions: { view: undefined },
    runtime: unusedPort<AgentCommandPorts["runtime"]>("runtime", { site: undefined, engaged: false }),
  }, { pathNow: () => undefined, treeState: () => unusedPort("treeState"), branchPathProblem: checkPath });
  f.appStore.repository.value = repository;
  f.appStore.snapshot.value = snapshotAt("c1");
  return { ...f, switchBranch: () => session.next(githubScope({ ...SCOPE, branch: "dev" })) };
}

test("an agent's new file before the site is native is saved as a draft, refused once the branch switched while it loaded", async (t) => {
  t.after(() => draftStore().remove(SCOPE, "notes.txt"));
  const f = preNativeFixture(async () => undefined);
  assert.equal(await f.commands.actions.writeDraft("notes.txt", "Hi", true), undefined);
  assert.equal(draftStore().get(SCOPE, "notes.txt")?.content, "Hi");
  assert.deepEqual(f.calls, ["after"]);
  const g = preNativeFixture(async () => undefined);
  const writing = g.commands.actions.writeDraft("notes.txt", "Hi", true);
  g.switchBranch();
  assert.equal(await writing, "The repository changed meanwhile. Try again.");
  assert.equal(draftStore().get(SCOPE, "notes.txt"), undefined);
  assert.deepEqual(g.calls, []);
});

test("an agent's new file before the site is native, switched to another branch at any wait, saves nothing", async (t) => {
  t.after(() => draftStore().remove(SCOPE, "notes.txt"));
  const count = await forEachAwait(race => {
    const f = preNativeFixture(race.port("checkPath", async () => undefined));
    const run = { f, outcome: undefined as string | undefined, done: Promise.resolve() };
    run.done = f.commands.actions.writeDraft("notes.txt", "Hi", true).then(outcome => { run.outcome = outcome; });
    return run;
  }, run => { run.f.switchBranch(); }, run => {
    assert.match(run.outcome ?? "", /^The repository (or branch )?changed( meanwhile)?\. Try again\.$/);
    assert.equal(draftStore().get(SCOPE, "notes.txt"), undefined);
    assert.deepEqual(run.f.calls, []);
  });
  assert.ok(count >= 1);
});
