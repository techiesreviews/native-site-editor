import { test } from "node:test";
import assert from "node:assert/strict";
import { createSetupChecklistController, type SetupChecklistPorts } from "../src/controllers/setup-checklist-controller.ts";
import { readSetupMemory, writeSetupMemory } from "../src/setup-checklist.ts";
import { githubScope, setupKeyOf } from "../src/workspace-session.ts";
import type { SetupActions, SetupView } from "../src/components/setup-checklist.ts";

function fixture(init: { account?: string; scope?: string; siteName?: string } = {}) {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
  let account: string | undefined = init.account ?? "lex", repo = { id: 1 }, scope = init.scope ?? "lex/1/main";
  let state = { homePage: true, committed: true, homeUnsaved: false, siteName: init.siteName ?? "My site", defaultName: "Repository" };
  let saveName = async (): Promise<string | undefined> => undefined;
  let actions!: SetupActions, request!: () => void;
  let resolve!: (value: Awaited<ReturnType<SetupChecklistPorts["loadChecklist"]>>) => void;
  let loads = 0, mounts = 0, closes = 0, removes = 0, opens = 0;
  const views: SetupView[] = [];
  const host = ({ append: () => { mounts++; } } satisfies Pick<HTMLElement, "append">) as HTMLElement;
  const checklist = { root: { remove: () => { removes++; } } as HTMLDivElement, menuItem: {} as HTMLButtonElement, isOpen: () => opens > closes, close: () => { closes++; }, open: () => { opens++; }, update: (view: SetupView) => views.push(view), onRequest: (callback: () => void) => { request = callback; } };
  const module = { createSetupChecklist: (options: SetupActions) => { actions = options; return checklist; } } satisfies Awaited<ReturnType<SetupChecklistPorts["loadChecklist"]>>;
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

test("a login differing only in capitals keeps its setup checklist: Lex sees the name lex confirmed", async () => {
  const lexScope = { repoId: 1, branch: "main" }, scope = setupKeyOf(githubScope({ account: "Lex", ...lexScope }));
  // The default name counts as named only once confirmed, so the tick comes from the stored memory alone.
  const f = fixture({ account: "Lex", scope, siteName: "Repository" });
  writeSetupMemory(f.storage, "lex", 1, { named: true });
  const pending = f.controller.mount(); f.resolve(); await pending;
  assert.equal(f.views.at(-1)?.progress.done.name, true);
  assert.equal(f.views.at(-1)?.scope, setupKeyOf(githubScope({ account: "lex", ...lexScope })));
  const fresh = fixture({ account: "Lex", scope, siteName: "Repository" }), mounted = fresh.controller.mount(); fresh.resolve(); await mounted;
  assert.equal(fresh.views.at(-1)?.progress.done.name, false);
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
