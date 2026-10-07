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
  const windowEvents = new Events(), documentEvents = new Events();
  const timers = new Map<object, { callback(): void; delay: number; recurring: boolean }>();
  const timer = (callback: () => void, delay: number, recurring: boolean) => {
    const key = {};
    timers.set(key, { callback, delay, recurring });
    return () => { timers.delete(key); };
  };
  const hubs: ReturnType<typeof deferred<{ grants?: unknown[]; requests?: unknown[] }>>[] = [];
  const loads: ReturnType<typeof deferred<{ createAgentMenu: typeof createMenu }>>[] = [];
  const menuOptions: Parameters<typeof createAgentMenu>[0][] = [];
  const menus: (AgentMenuPort<Root> & { calls: string[] })[] = [];
  const attached: Root[] = [];
  const initialHost = { append: (root: Root) => { attached.push(root); } };
  const state = { account: "lex" as string | undefined, host: initialHost as typeof initialHost | undefined, visible: true };
  const errors: unknown[] = [];
  function createMenu(options: Parameters<typeof createAgentMenu>[0]) {
    menuOptions.push(options);
    const calls: string[] = [];
    const menu = {
      calls,
      root: { remove() { calls.push("remove"); } },
      connected: () => true,
      changed() { calls.push("changed"); },
      consentGranted() { calls.push("consent"); },
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
    environment: {
      window: windowEvents, document: documentEvents,
      visible: () => state.visible,
      hub() { const pending = deferred<{ grants?: unknown[]; requests?: unknown[] }>(); hubs.push(pending); return pending.promise; },
      interval: (callback, delay) => timer(callback, delay, true),
      timeout: (callback, delay) => timer(callback, delay, false),
    },
  });
  const fire = (delay: number) => {
    for (const [key, task] of [...timers]) if (task.delay === delay) {
      if (!task.recurring) timers.delete(key);
      task.callback();
    }
  };
  const consent = () => windowEvents.dispatchEvent(Object.assign(new Event("storage"), { key: "native-site-editor:agent-connected" }));
  async function mount() { const pending = controller.ensure(); loads.at(-1)!.resolve({ createAgentMenu: createMenu }); await pending; }
  const cleanup = () => { controller.destroy(); appStore.dispose(); };
  return { controller, appStore, state, hubs, loads, menus, menuOptions, attached, timers, windowEvents, documentEvents, errors, fire, consent, mount, createMenu, cleanup };
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

test("discovery polls at 30 seconds, skips hidden wakes, and retries a boot failure only once", async () => {
  const f = fixture();
  f.state.visible = false;
  f.controller.start();
  assert.equal(f.hubs.length, 1); // Boot probes even when hidden.
  f.hubs[0].reject(new Error("Offline"));
  await settle();
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay).sort((a, b) => a - b), [3000, 30_000]);
  f.fire(3000);
  assert.equal(f.hubs.length, 1);
  f.fire(30_000);
  f.windowEvents.dispatchEvent(new Event("focus"));
  assert.equal(f.hubs.length, 1);
  f.state.visible = true;
  f.documentEvents.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.hubs.length, 2);
  f.fire(30_000);
  assert.equal(f.hubs.length, 2); // A pending probe is not duplicated.
  f.hubs[1].reject(new Error("Still offline"));
  await settle();
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [30_000]);
  f.cleanup();
});

test("destroy cancels timers/listeners and invalidates probes; restart ignores an old probe's completion", async () => {
  const f = fixture();
  f.controller.start();
  f.controller.destroy();
  assert.equal(f.timers.size, 0);
  assert.equal(f.windowEvents.listeners.size, 0);
  assert.equal(f.documentEvents.listeners.size, 0);
  f.controller.start();
  assert.equal(f.hubs.length, 2);
  f.hubs[0].resolve({ grants: [{}] });
  await settle();
  assert.equal(f.loads.length, 0);
  f.windowEvents.dispatchEvent(new Event("focus"));
  assert.equal(f.hubs.length, 2); // The old finally must not clear the new probe.
  f.hubs[1].resolve({ requests: [{}] });
  await settle();
  assert.equal(f.loads.length, 1);
  f.loads[0].resolve({ createAgentMenu: f.createMenu });
  await settle();
  assert.equal(f.controller.connected(), true);
  assert.equal(f.timers.size, 0);
  f.cleanup();
  assert.deepEqual(f.menus[0].calls, ["destroy", "remove"]);
});

test("consent lazy-loads once and notifies only the same account and host", async () => {
  const f = fixture();
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
  assert.deepEqual(f.menus[0].calls, ["consent"]);
  f.consent();
  assert.deepEqual(f.menus[0].calls, ["consent"]); // Mounted menu owns subsequent consent events.
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

test("a hub response for a changed account cannot trigger mounting; stop prevents a pending failure retry", async () => {
  const f = fixture();
  f.controller.start();
  f.state.account = "other";
  f.hubs[0].resolve({ grants: [{}] });
  await settle();
  assert.equal(f.loads.length, 0);
  f.controller.start();
  assert.equal(f.hubs.length, 2);
  f.controller.stop();
  f.hubs[1].reject(new Error("Offline"));
  await settle();
  assert.equal(f.timers.size, 0);
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
  assert.deepEqual(repository(), { id: 1, fullName: "lex/site" });
  f.appStore.reset({ ...appRepository, id: 2, full_name: "lex/second" });
  assert.equal(repository(), undefined);
  f.appStore.snapshot.value = { branch: "main", commit: "next", entries: [] };
  assert.deepEqual(repository(), { id: 2, fullName: "lex/second" });
  f.state.account = "other";
  assert.equal(repository(), undefined);
  f.cleanup();
});
