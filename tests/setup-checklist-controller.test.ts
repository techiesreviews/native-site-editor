import { test } from "node:test";
import assert from "node:assert/strict";
import { createSetupChecklistController, type SetupChecklistPorts } from "../src/controllers/setup-checklist-controller.ts";
import { readSetupMemory } from "../src/setup-checklist.ts";
import type { SetupActions, SetupView } from "../src/components/setup-checklist.ts";

function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
  let account: string | undefined = "lex", repo = { id: 1 }, scope = "lex/1/main";
  let state = { homePage: true, committed: true, homeUnsaved: false, siteName: "My site", defaultName: "Repository" };
  let saveName = async (): Promise<string | undefined> => undefined;
  let actions!: SetupActions, request!: () => void;
  let resolve!: (value: Awaited<ReturnType<SetupChecklistPorts["loadChecklist"]>>) => void;
  let loads = 0, mounts = 0, closes = 0, removes = 0, opens = 0;
  const views: SetupView[] = [];
  const host = { append: () => { mounts++; } } as unknown as HTMLElement;
  const checklist = { root: { remove: () => { removes++; } }, close: () => { closes++; }, open: () => { opens++; }, update: (view: SetupView) => views.push(view), onRequest: (callback: () => void) => { request = callback; } };
  const module = { createSetupChecklist: (options: SetupActions) => { actions = options; return checklist; } } as unknown as Awaited<ReturnType<SetupChecklistPorts["loadChecklist"]>>;
  const controller = createSetupChecklistController({
    account: () => account, repository: () => repo, scope: () => scope, state: () => state,
    host: () => host, menu: () => undefined, connected: () => false, ensureAgent: async () => {}, agentText: () => [], storage,
    start: () => {}, save: () => {}, saveName: () => saveName(),
    loadChecklist: () => { loads++; return new Promise(yes => { resolve = yes; }); },
    loadSpotlight: async () => { throw new Error("Unexpected spotlight load"); }, onError: error => { throw error; },
  });
  return { delayName: () => { let done!: () => void; saveName = () => new Promise(resolve => { done = () => resolve(undefined); }); return () => done(); }, controller, storage, views, module, resolve: () => resolve(module), actions: () => actions, request: () => request(), counters: () => ({ loads, mounts, closes, removes, opens }), switchScope: () => { repo = { id: 2 }; scope = "lex/2/main"; }, logout: () => { account = undefined; }, undo: () => { state = { ...state, homeUnsaved: true }; } };
}

test("lazy mount is shared and disposal refuses a late load, allowing a fresh mount", async () => {
  const f = fixture();
  const first = f.controller.mount();
  assert.equal(f.controller.mount(), first);
  f.controller.dispose();
  f.resolve();
  await first;
  assert.equal(f.counters().mounts, 0);
  const second = f.controller.mount();
  f.resolve();
  await second;
  assert.equal(f.counters().loads, 2);
  assert.equal(f.counters().mounts, 1);
  f.controller.dispose();
  assert.equal(f.counters().closes, 1);
  assert.equal(f.counters().removes, 1);
});

test("account changes refuse a pending mount", async () => {
  const f = fixture(), pending = f.controller.mount();
  f.logout(); f.resolve(); await pending;
  assert.equal(f.counters().mounts, 0);
});

test("completion timer cannot finish another branch or an undone first save", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.controller.start(1);
  const pending = f.controller.mount(); f.resolve(); await pending;
  assert.equal(f.views.at(-1)?.progress.complete, true);
  f.switchScope();
  t.mock.timers.tick(4000);
  assert.equal(readSetupMemory(f.storage, "lex", 1).finished, undefined);
  assert.equal(readSetupMemory(f.storage, "lex", 2).finished, undefined);
  f.controller.start(2); f.controller.refresh(); f.undo();
  t.mock.timers.tick(4000);
  assert.equal(readSetupMemory(f.storage, "lex", 2).finished, undefined);
  f.controller.dispose();
});

test("completion remembers its own repository, while disposal cancels deferred dialog opening", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); f.controller.start(1);
  const pending = f.controller.mount(); f.resolve(); await pending;
  t.mock.timers.tick(4000);
  assert.equal(readSetupMemory(f.storage, "lex", 1).finished, true);
  f.request(); f.controller.dispose();
  t.mock.timers.tick(0);
  assert.equal(f.counters().opens, 0);
  f.request(); t.mock.timers.tick(0);
  assert.equal(f.counters().opens, 0);
});


test("a name save completing after navigation cannot mark the new repository named", async () => {
  const f = fixture(), pending = f.controller.mount(); f.resolve(); await pending;
  const finish = f.delayName();
  const saving = f.actions().saveName("My site");
  f.switchScope(); finish(); await saving;
  assert.equal(readSetupMemory(f.storage, "lex", 1).named, undefined);
  assert.equal(readSetupMemory(f.storage, "lex", 2).named, undefined);
  f.controller.dispose();
});
