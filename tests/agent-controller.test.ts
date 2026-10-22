import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentController, type AgentMenuPort } from "../src/controllers/agent-controller.ts";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import type { createAgentMenu } from "../src/components/agent-menu.ts";
import type { AgentElement } from "../shared/agent.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
type Root = { remove(): void };
class Events extends EventTarget {
  listeners = new Set<EventListenerOrEventListenerObject>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.listeners.add(listener);
    super.addEventListener(type, listener);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.listeners.delete(listener);
    super.removeEventListener(type, listener);
  }
}
function fixture() {
  const appStore = createAppStore(createDraftStore());
  const windowEvents = new Events();
  const loads: ReturnType<typeof deferred<{ createAgentMenu: typeof createMenu }>>[] = [];
  const menuOptions: Parameters<typeof createAgentMenu>[0][] = [];
  const menus: (AgentMenuPort<Root> & { calls: string[] })[] = [];
  const attached: Root[] = [];
  const initialHost = { append: (root: Root) => { attached.push(root); } };
  const state = { account: "lex" as string | undefined, host: initialHost as typeof initialHost | undefined };
  const errors: unknown[] = [];
  function createMenu(options: Parameters<typeof createAgentMenu>[0]) {
    menuOptions.push(options);
    const calls: string[] = [];
    const menu = {
      calls,
      root: { remove() { calls.push("remove"); } },
      connected: () => true,
      changed() { calls.push("changed"); },
      consentGranted(approval: { at: number }) { calls.push(`consent:${approval.at}`); },
      destroy() { calls.push("destroy"); },
      async ask(text: string) { calls.push(`ask:${text}`); },
      async answer(id: string, text: string) { calls.push(`answer:${id}:${text}`); },
      async dismiss(id: string) { calls.push(`dismiss:${id}`); },
    };
    menus.push(menu);
    return menu;
  }
  const controller = createAgentController<Root>({
    account: () => state.account, host: () => state.host, appStore,
    createOptions: () => ({ context: async () => undefined, onCommand: async () => {} }),
    load() { const pending = deferred<{ createAgentMenu: typeof createMenu }>(); loads.push(pending); return pending.promise; },
    onError: error => { errors.push(error); },
    environment: { window: windowEvents },
  });
  const consent = (key = "native-site-editor:agent-connected", newValue = JSON.stringify({ at: 1700, repo: "lex/site", branch: "main", approval: "approval-1" })) =>
    windowEvents.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }));
  async function mount() { const pending = controller.ensure(); loads.at(-1)!.resolve({ createAgentMenu: createMenu }); await pending; }
  const cleanup = () => { controller.destroy(); appStore.dispose(); };
  /** The tab shows `fullName` on `branch`, as the approval names it. */
  function show(fullName = "lex/site", branch = "main") {
    appStore.repository.value = { id: 1, name: "site", full_name: fullName, default_branch: "main", private: false, owner: { login: "lex", type: "User" } };
    appStore.snapshot.value = { branch, commit: "head", entries: [] };
  }
  return { controller, appStore, state, loads, menus, menuOptions, attached, windowEvents, errors, consent, mount, createMenu, show, cleanup };
}

test("lazy mount deduplicates loads; destroyed or replaced hosts cannot mount their pending result", async () => {
  const f = fixture();
  const first = f.controller.ensure();
  assert.equal(f.controller.ensure(), first);
  f.state.host = { append: root => { f.attached.push(root); } };
  const second = f.controller.ensure();
  assert.equal(f.loads.length, 2);
  f.loads[0].resolve({ createAgentMenu: f.createMenu });
  await first;
  assert.equal(f.menus.length, 0);
  f.controller.destroy();
  f.loads[1].resolve({ createAgentMenu: f.createMenu });
  await second;
  assert.equal(f.menus.length, 0);
  f.controller.start();
  await f.mount();
  assert.equal(f.attached.length, 1);
  f.cleanup();
});

test("account changes reject a pending mount; failed lazy loads can be retried", async () => {
  const f = fixture();
  const first = f.controller.ensure();
  f.state.account = "other";
  f.loads[0].resolve({ createAgentMenu: f.createMenu });
  await first;
  assert.equal(f.menus.length, 0);
  const failed = f.controller.ensure();
  f.loads[1].reject(new Error("Chunk unavailable"));
  await assert.rejects(failed, /Chunk unavailable/);
  await f.mount();
  assert.equal(f.menus.length, 1);
  f.cleanup();
});

test("start only listens for consent: no hub probe, timer or mount until the user acts", async () => {
  const f = fixture();
  f.controller.start();
  f.controller.start();
  assert.equal(f.windowEvents.listeners.size, 1);
  f.windowEvents.dispatchEvent(new Event("focus"));
  f.consent("another-key");
  await settle();
  assert.equal(f.loads.length, 0);
  assert.equal(f.controller.connected(), false);
  // Mounting the menu (opening it) is still lazy and local; the menu itself starts no transport.
  await f.mount();
  assert.equal(f.menus.length, 1);
  f.controller.destroy();
  assert.equal(f.windowEvents.listeners.size, 0);
  f.consent();
  assert.equal(f.loads.length, 1); // Destroyed: a consent event no longer loads anything.
  f.cleanup();
});

test("consent lazy-loads once and notifies only the same account and host", async () => {
  const f = fixture();
  f.show();
  f.controller.start();
  f.consent();
  assert.equal(f.loads.length, 1);
  f.state.host = { append: root => { f.attached.push(root); } };
  f.loads[0].resolve({ createAgentMenu: f.createMenu });
  await settle();
  assert.equal(f.menus.length, 0);
  f.consent();
  f.loads[1].resolve({ createAgentMenu: f.createMenu });
  await settle();
  // The approval goes to the menu, which matches this tab's repository and branch.
  assert.deepEqual(f.menus[0].calls, ["consent:1700"]);
  f.consent();
  assert.deepEqual(f.menus[0].calls, ["consent:1700"]); // Mounted menu owns subsequent consent events.
  f.cleanup();
});

const about: AgentElement = { file: "index.html", id: "p", tag: "p", text: "Hello" };
test("Ask captures its original menu and refuses replacement instead of sending through the new menu", async () => {
  const f = fixture();
  await f.mount();
  const ask = f.controller.captureAsk()!;
  await ask.ask("first", about);
  f.controller.changed();
  await f.controller.answer("q", "yes");
  await f.controller.dismiss("q");
  f.controller.destroy();
  f.controller.start();
  await f.mount();
  await assert.rejects(ask.ask("stale", about), /agent connection changed/);
  await f.controller.ask("new", about);
  assert.deepEqual(f.menus[0].calls, ["ask:first", "changed", "answer:q:yes", "dismiss:q", "destroy", "remove"]);
  assert.deepEqual(f.menus[1].calls, ["ask:new"]);
  f.cleanup();
});

test("the mounted menu reads the current repository signals and refuses a replaced account", async () => {
  const f = fixture();
  await f.mount();
  const repository = f.menuOptions[0].repository;
  assert.equal(repository(), undefined);
  const appRepository = { id: 1, name: "site", full_name: "lex/site", default_branch: "main", private: false, owner: { login: "lex", type: "User" } };
  // Access the shared store supplied to the controller, not a second repository copy.
  f.appStore.repository.value = appRepository;
  f.appStore.snapshot.value = { branch: "main", commit: "head", entries: [] };
  assert.deepEqual(repository(), { id: 1, fullName: "lex/site", branch: "main" });
  f.appStore.reset({ ...appRepository, id: 2, full_name: "lex/second" });
  assert.equal(repository(), undefined);
  f.appStore.snapshot.value = { branch: "main", commit: "next", entries: [] };
  assert.deepEqual(repository(), { id: 2, fullName: "lex/second", branch: "main" });
  f.appStore.snapshot.value = { branch: "preview", commit: "next", entries: [] };
  assert.deepEqual(repository(), { id: 2, fullName: "lex/second", branch: "preview" });
  f.state.account = "other";
  assert.equal(repository(), undefined);
  f.cleanup();
});

test("old numeric and malformed announcements do not mount a menu", async () => {
  const f = fixture();
  f.controller.start();
  for (const value of ["1700", "not-json", "null"]) f.consent("native-site-editor:agent-connected", value);
  await settle();
  assert.equal(f.loads.length, 0);
  f.cleanup();
});

test("an approval for another repository or branch does not mount a menu", async () => {
  const f = fixture();
  f.controller.start();
  f.consent();
  f.show("lex/other", "main");
  f.consent();
  f.show("lex/site", "preview");
  f.consent();
  await settle();
  assert.equal(f.loads.length, 0);
  f.show();
  f.consent();
  assert.equal(f.loads.length, 1);
  f.cleanup();
});

test("a mounted menu hears both leaving a workspace and returning to the same workspace", async () => {
  const f = fixture(); f.show(); f.controller.start(); await f.mount();
  f.menus[0].calls.length = 0;
  f.appStore.repository.value = undefined;
  assert.equal(f.menus[0].calls.filter(call => call === "changed").length, 1);
  f.show();
  assert.equal(f.menus[0].calls.filter(call => call === "changed").length, 2);
  f.cleanup();
});

test("remote agents remembered on for the open site mount the menu at startup without reading history; another branch's do not", async () => {
  const appStore = createAppStore(createDraftStore());
  const remembered = new Set([JSON.stringify(["lex", 1, "main"])]);
  const histories: string[] = [];
  let loads = 0;
  const host = { append() {} };
  const controller = createAgentController<Root>({
    account: () => "Lex", host: () => host, appStore,
    createOptions: () => ({ context: async () => undefined, onCommand: async () => {} }),
    async load() {
      loads++;
      return { createAgentMenu: () => ({ root: { remove() {} }, connected: () => false, changed() {}, consentGranted() {}, destroy() {},
        async ask() {}, async answer() {}, async dismiss() {} }) };
    },
    onError: error => { throw error; },
    environment: { window: new EventTarget() },
    history: async workspace => { histories.push(workspace.branch); return false; },
    remembered: workspace => remembered.has(JSON.stringify([workspace.account.toLowerCase(), workspace.repoId, workspace.branch])),
  });
  controller.start();
  appStore.repository.value = { id: 1, name: "site", full_name: "lex/site", default_branch: "main", private: false, owner: { login: "lex", type: "User" } };
  appStore.snapshot.value = { branch: "feature", commit: "head", entries: [] };
  await settle();
  assert.deepEqual([loads, histories], [0, ["feature"]], "another branch of the site stays off");
  appStore.snapshot.value = { branch: "main", commit: "head", entries: [] };
  await settle(); await settle();
  assert.deepEqual([loads, histories], [1, ["feature"]], "the remembered site mounts the menu, which turns its agents back on");
  controller.destroy();
  appStore.dispose();
});
