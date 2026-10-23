import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentSiteHost, type AgentSiteHostPorts } from "../src/agent-site-host";
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
