import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentCommands, createAgentSiteHost, type AgentCommandPorts, type AgentSiteHostPorts } from "../src/agent-site-host";
import { createAppStore } from "../src/app-store";
import { createDraftStore } from "../src/draft-store";
import type { AgentCommand } from "../shared/agent";
import type { Repository, SessionInfo, Snapshot } from "../shared/types";
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
function commandsFixture() {
  const appStore = createAppStore(createDraftStore());
  const host = { info: {} as SessionInfo, pageStructure: undefined as { refreshMeta(): void } | undefined,
    nativePreview: undefined as AgentCommandPorts["nativePreview"] };
  const calls: string[] = [];
  const unused = () => { throw new Error("not used here"); };
  const ports = {
    appStore, runtime: {} as never, workspaceSession: {} as never, guardedEdits: {} as never, editorWorkspace: {} as never, versions: {} as never,
    editorModule: { isMounted: () => false, getMountedSource: unused, dropDraft: unused, forgetDraftModel: unused, prepareHistorySources: unused,
      flushAgentTyping: unused, applyAgentDraft: async command => { calls.push(`draft ${command.path}`); } },
    finishedWork: {} as never, parkedSteps: {} as never, repositoryIndex: {} as never, mediaController: {} as never, mediaPorts: {} as never,
    blockMoves: {} as never, agentPresence: {} as never, pagesAndFiles: {} as never, api: unused,
    pagesController: { renderTree: () => { calls.push("tree"); } }, filesTreeController: { refresh: unused },
    get info() { return host.info; }, componentTools: undefined,
    get pageStructure() { return host.pageStructure; }, get nativePreview() { return host.nativePreview; },
    loadAgentSite: unused, loadPagesActions: unused, loadFileOps: unused, draftScope: () => undefined, shownScope: () => undefined,
    branchText: unused, pathNow: unused, treeState: unused, branchPathProblem: unused, afterFileChanges: unused, restoreFile: unused,
    openNewDraft: unused, nativeComponentLoaderPlan: unused, writeNativePageMeta: async () => undefined, nativeSectionChoices: () => [],
    pagePorts: unused, filePorts: unused, componentPorts: unused, refreshNativeRoutes: unused,
    updateCurrentPageLabel: () => { calls.push("label"); }, updateAgentContext: () => { calls.push("context"); },
  } satisfies AgentCommandPorts;
  return { commands: createAgentCommands(ports), appStore, host, calls };
}

const activeDraft = { id: "a1", operation: "update_active_draft", path: "index.html", branch: "main", commit: "c1", content: "<p>Hi</p>", state: "pending", createdAt: 0 } satisfies AgentCommand;

test("an agent's active-file draft is checked against the session and branch shown as it runs", async () => {
  const f = commandsFixture();
  await assert.rejects(f.commands.actions.legacy(activeDraft), { message: "The editor context changed." });
  f.host.info = { user: { login: "lex" } } as SessionInfo;
  f.appStore.repository.value = { id: 1, full_name: "lex/site" } as Repository;
  f.appStore.snapshot.value = { branch: "main", commit: "c1" } as Snapshot;
  await f.commands.actions.legacy(activeDraft);
  assert.deepEqual(f.calls, ["draft index.html"]);
  f.appStore.snapshot.value = { branch: "main", commit: "c2" } as Snapshot;
  await assert.rejects(f.commands.actions.legacy(activeDraft), { message: "The editor context changed." });
  assert.equal(f.commands.acting(), false);
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
