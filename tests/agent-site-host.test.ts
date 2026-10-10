import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentSiteHost, type AgentSiteHostPorts } from "../src/agent-site-host";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import type { AgentSiteInput, SharedContext } from "../src/agent-site";

function fixture() {
  const workspace = createMemoryWorkspace();
  const edits = createGuardedEdits(workspace.workspace);
  const loading = deferred<Awaited<ReturnType<AgentSiteHostPorts["load"]>>>();
  const input: AgentSiteInput = { repository: { id: 1, fullName: "lex/site" }, branch: "main", commit: "head", file: null, drafts: [], mountedSource: () => undefined };
  const result: SharedContext = { context: { repository: input.repository, branch: input.branch, commit: input.commit, file: null, drafts: [] }, texts: new Map() };
  const real: NonNullable<ReturnType<AgentSiteHostPorts["dialog"]>> = {
    root: {} as HTMLDialogElement, ask: async () => false, choose: async () => ({ option: false }), close: () => {},
  };
  let dialog = real, built = 0, inputs = 0, answered = 0, swapped = 0, ran = 0;
  const ports = {
    stamp: () => edits.stamp("repository"), load: () => loading.promise,
    input: () => { inputs++; return input; }, dialog: () => dialog,
    setDialog: value => { swapped++; dialog = value!; },
  } satisfies AgentSiteHostPorts;
  const module: Awaited<ReturnType<AgentSiteHostPorts["load"]>> = {
    buildAgentContext: async value => { built++; assert.equal(value, input); return result; },
    agentAnswers: value => { answered++; return { ...value }; },
  };
  return { host: createAgentSiteHost(ports), workspace, real, result, input, module,
    load: () => loading.resolve(module), dialog: () => dialog,
    run: async () => { ran++; return "done"; }, counts: () => ({ built, inputs, answered, swapped, ran }),
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

for (const change of ["scope", "generation"] as const) test(`agent answers across a ${change} switch never run or swap the confirm dialog`, async () => {
  const f = fixture();
  const pending = f.host.withAnswers({ option: true }, f.run);
  if (change === "scope") f.workspace.setScope("lex/site@dev"); else f.workspace.bumpGeneration();
  f.load();
  await assert.rejects(pending, { message: "The editor changed branch or revision." });
  assert.deepEqual(f.counts(), { built: 0, inputs: 0, answered: 0, swapped: 0, ran: 0 });
  assert.equal(f.dialog(), f.real);
});

test("agent context and answers survive opening another page", async () => {
  const f = fixture();
  const context = f.host.context();
  const answers = f.host.withAnswers({}, f.run);
  f.workspace.setRoute("/about/");
  f.workspace.enterEditMode();
  f.load();
  assert.equal(await context, f.result);
  assert.equal(await answers, "done");
  assert.deepEqual(f.counts(), { built: 1, inputs: 1, answered: 1, swapped: 2, ran: 1 });
  assert.equal(f.dialog(), f.real);
});

test("agent answers restore the real dialog when the action fails", async () => {
  const f = fixture();
  const pending = f.host.withAnswers({}, async () => { assert.notEqual(f.dialog(), f.real); throw new Error("failed"); });
  f.load();
  await assert.rejects(pending, /failed/);
  assert.equal(f.dialog(), f.real);
  assert.equal(f.counts().swapped, 2);
});
