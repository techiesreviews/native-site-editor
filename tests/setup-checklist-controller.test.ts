import { test } from "node:test";
import assert from "node:assert/strict";
import { createSetupChecklistController } from "../src/controllers/setup-checklist-controller.ts";
import { readSetupMemory, writeSetupMemory } from "../src/setup-checklist.ts";
import { forEachAwait } from "./support/await-race.ts";

// Connect an agent looks for the project menu's entry to light; there is none here.
(globalThis as { document?: unknown }).document ??= { querySelector: () => null, getElementById: () => null };

function fixture(init: { account?: string; siteName?: string } = {}) {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
  let account: string | undefined = init.account ?? "lex", repo = { id: 1 }, scope = "lex/1/main", connected = false;
  let site = { siteName: init.siteName ?? "My site", defaultName: "My site" };
  let saveName = async (): Promise<string | undefined> => undefined;
  let agentReady = async () => {};
  let opens = 0;
  const menu = { trigger: {} as HTMLElement, open: () => { opens++; } };
  const controller = createSetupChecklistController({
    account: () => account, repository: () => repo, scope: () => scope, site: () => site,
    menu: () => menu, connected: () => connected, ensureAgent: () => agentReady(), storage,
    saveName: () => saveName(), onError: error => { throw error; },
  });
  return {
    controller, storage, opens: () => opens,
    delayName: () => { let done!: () => void; saveName = () => new Promise(resolve => { done = () => resolve(undefined); }); return () => done(); },
    delayAgent: () => { let done!: () => void; agentReady = () => new Promise(resolve => { done = resolve; }); return () => done(); },
    refuseName: (problem: string) => { saveName = async () => problem; },
    rename: (siteName: string) => { site = { ...site, siteName }; },
    connect: () => { connected = true; },
    switchScope: () => { repo = { id: 2 }; scope = "lex/2/main"; },
    logout: () => { account = undefined; },
  };
}

test("a site the editor made lists Name your site and Connect an agent, and each goes once done", async () => {
  const f = fixture();
  f.controller.refresh();
  assert.deepEqual(f.controller.items.value, [], "a repository opened as it was lists no setup rows");
  f.controller.start(1);
  f.controller.refresh();
  assert.deepEqual(f.controller.items.value, ["name", "agent"]);
  assert.equal(await f.controller.saveName("My site"), undefined);
  assert.equal(readSetupMemory(f.storage, "lex", 1).named, true, "the default name saved on purpose counts as named");
  assert.deepEqual(f.controller.items.value, ["agent"]);
  f.controller.noteAgent(true);
  assert.deepEqual(f.controller.items.value, []);
});

test("a site renamed elsewhere, or an agent connected elsewhere, takes its row away on the next refresh", () => {
  const f = fixture();
  f.controller.start(1);
  f.rename("Larkspur Studio");
  f.connect();
  f.controller.refresh();
  assert.deepEqual(f.controller.items.value, []);
  assert.equal(readSetupMemory(f.storage, "lex", 1).agent, true, "the connection is remembered for this repository");
});

test("a refused name keeps its row and says why", async () => {
  const f = fixture();
  f.controller.start(1);
  f.controller.refresh();
  f.refuseName(".editor/config.json is not valid JSON");
  assert.equal(await f.controller.saveName("Larkspur"), ".editor/config.json is not valid JSON");
  assert.equal(readSetupMemory(f.storage, "lex", 1).named, undefined);
  assert.deepEqual(f.controller.items.value, ["name", "agent"]);
});

test("a login differing only in capitals keeps its setup: Lex sees the name lex saved", () => {
  const f = fixture({ account: "Lex" });
  writeSetupMemory(f.storage, "lex", 1, { auto: true, named: true });
  f.controller.refresh();
  assert.deepEqual(f.controller.items.value, ["agent"]);
});

test("a name save completing after navigation cannot mark the new repository named", async () => {
  const f = fixture();
  f.controller.start(1); f.controller.start(2);
  const finish = f.delayName();
  const saving = f.controller.saveName("My site");
  f.switchScope(); finish(); await saving;
  assert.equal(readSetupMemory(f.storage, "lex", 1).named, undefined);
  assert.equal(readSetupMemory(f.storage, "lex", 2).named, undefined);
});

test("signing out or closing the site empties the rows", () => {
  const f = fixture();
  f.controller.start(1);
  f.controller.refresh();
  f.logout();
  f.controller.refresh();
  assert.deepEqual(f.controller.items.value, []);
  const g = fixture();
  g.controller.start(1);
  g.controller.refresh();
  g.controller.dispose();
  assert.deepEqual(g.controller.items.value, []);
});

test("Connect an agent opens the project menu once the agent tools are ready, unless the site closed meanwhile", async () => {
  const f = fixture();
  await f.controller.connectAgent();
  assert.equal(f.opens(), 1);
  const ready = f.delayAgent();
  const late = f.controller.connectAgent();
  f.controller.dispose(); ready(); await late;
  assert.equal(f.opens(), 1);
});

test("a switch to another site while Connect an agent or Save name waits opens no menu and marks no site named", async () => {
  const awaits = await forEachAwait(race => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
    const site = { repo: { id: 1 }, scope: "lex/1/main", menu: { trigger: {} as HTMLElement, open: () => { opened.push(site.scope); } } };
    const opened: string[] = [];
    const controller = createSetupChecklistController({
      account: () => "lex", repository: () => site.repo, scope: () => site.scope, site: () => ({ siteName: "My site", defaultName: "My site" }),
      menu: () => site.menu, connected: () => false, storage, onError: error => { throw error; },
      ensureAgent: race.port("ensureAgent", async () => {}),
      saveName: race.port("saveName", async (_name: string) => undefined),
    });
    controller.start(1); controller.start(2);
    const done = Promise.all([controller.connectAgent(), controller.saveName("My site")]);
    return { site, storage, opened, done };
  }, run => {
    run.site.repo = { id: 2 };
    run.site.scope = "lex/2/main";
    run.site.menu = { ...run.site.menu, open: () => { run.opened.push("lex/2/main"); } };
  }, run => {
    assert.deepEqual(run.opened, []);
    assert.equal(readSetupMemory(run.storage, "lex", 1).named, undefined);
    assert.equal(readSetupMemory(run.storage, "lex", 2).named, undefined);
  });
  assert.equal(awaits, 2);
});
