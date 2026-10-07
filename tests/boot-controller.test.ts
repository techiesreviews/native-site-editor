import { test } from "node:test";
import assert from "node:assert/strict";
import { createBootController, planRepositoryOpen, type BootMenu, type BootPorts } from "../src/controllers/boot-controller.ts";
import type { ApiReceipt } from "../src/boot-api-response.ts";
import type { Repository, SessionInfo } from "../shared/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const repo = (id: number) => ({ id, name: `r${id}`, full_name: `lex/r${id}` }) as Repository;
const signedIn = (repositories?: Repository[]): SessionInfo => ({ configured: true, user: { login: "lex", avatar_url: "" }, installUrl: null, repositories });
const signedOut: SessionInfo = { configured: true, user: null, installUrl: null };
function store() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

function fixture(href = "https://editor.test/") {
  let generation = 0, info: SessionInfo | undefined, url = new URL(href), menu: BootMenu | undefined = { setRepositories: () => {} };
  const log: string[] = [];
  const sessions: ReturnType<typeof deferred<ApiReceipt<SessionInfo>>>[] = [];
  const lists: { refresh: boolean; read: ReturnType<typeof deferred<ApiReceipt<Repository[]>>> }[] = [];
  const loads: { prefetched?: Repository[]; started?: number }[] = [];
  const errors: unknown[] = [];
  const drafts = deferred<void>();
  let loadImpl: (prefetched?: Repository[], hooks?: { onStarted(epoch: number): void }) => Promise<void> = async (prefetched, hooks) => {
    const epoch = ++generation;
    hooks?.onStarted(epoch);
    loads.push({ prefetched, started: epoch });
  };
  const local = store(), session = store();
  const ports: BootPorts = {
    generation: () => generation,
    source: () => `${url.origin}${url.pathname}`,
    url: () => url.href,
    replaceUrl: next => { url = new URL(next); log.push(`replace ${next.href}`); },
    redirect: target => { log.push(`redirect ${target}`); },
    assign: target => { log.push(`assign ${target}`); },
    readSession: () => { const read = deferred<ApiReceipt<SessionInfo>>(); sessions.push(read); log.push("read session"); return read.promise; },
    readRepositories: refresh => { const read = deferred<ApiReceipt<Repository[]>>(); lists.push({ refresh, read }); log.push(`read repositories${refresh ? " refresh" : ""}`); return read.promise; },
    loadDrafts: () => { log.push("drafts"); return drafts.promise; },
    onDraftError: () => { log.push("draft onError"); },
    session: () => info,
    adoptSession: value => { info = value; },
    enterWorkspace: () => { log.push("enter"); },
    loadRepositories: (prefetched, hooks) => { log.push("load"); return loadImpl(prefetched, hooks); },
    renderLogin: mode => { generation++; log.push(`login ${mode ?? "ready"}`); controller.reset(); },
    retainLink: () => { log.push("retain"); },
    showError: error => { errors.push(error); },
    storage: kind => kind === "local" ? local : session,
    setTimer: () => 1,
    clearTimer: () => {},
    menu: () => menu,
    applyList: list => { log.push(`apply ${list.map(item => item.id)}`); },
  };
  const controller = createBootController(ports);
  return {
    controller, log, sessions, lists, loads, errors, drafts,
    bump: () => { generation++; },
    setInfo: (value: SessionInfo) => { info = value; },
    setMenu: (value: BootMenu | undefined) => { menu = value; },
    setLoad: (impl: typeof loadImpl) => { loadImpl = impl; },
    url: () => url.href,
  };
}
const receipt = <T>(value: T, sessionTag: string | null = "t1", onboarding?: "install" | "create"): ApiReceipt<T> => ({ value, sessionTag, onboarding });

test("both reads start before the session resolves and a matching tag is adopted with its onboarding", async () => {
  const f = fixture(), started = f.controller.start();
  assert.deepEqual(f.log, ["read session", "read repositories"]);
  f.lists[0].read.resolve(receipt([repo(1)], "t1", "create"));
  f.sessions[0].resolve(receipt(signedIn()));
  await started;
  assert.deepEqual(f.loads.map(load => load.prefetched?.map(item => item.id)), [[1]]);
  assert.equal(f.controller.onboarding(), "create");
  assert.deepEqual(f.log.slice(2, 5), ["drafts", "enter", "load"]);
});

test("a mismatched tag falls back to the session's listing and ignores speculative onboarding", async () => {
  const f = fixture(), started = f.controller.start();
  f.lists[0].read.resolve(receipt([repo(1)], "other", "install"));
  f.sessions[0].resolve(receipt(signedIn([repo(2)])));
  await started;
  assert.deepEqual(f.loads[0].prefetched?.map(item => item.id), [2]);
  assert.equal(f.controller.onboarding(), undefined);
});

test("signed-out install return replaces the location with sign-in", async () => {
  const f = fixture("https://editor.test/?installation_id=5"), started = f.controller.start();
  f.lists[0].read.resolve(receipt([], null));
  f.sessions[0].resolve(receipt(signedOut));
  await started;
  assert.ok(f.log.includes("redirect /auth/login"));
  assert.equal(f.loads.length, 0);
});

test("signed-in install return cleans the URL, ignores the prefetch and lists afresh once", async () => {
  const f = fixture("https://editor.test/?installation_id=5&setup_action=install#repo=1");
  f.setLoad(async () => { f.log.push(`fetch ${f.controller.refreshPending()}`); await f.controller.fetchList(f.controller.refreshPending()); f.log.push(`take ${f.controller.takeRefresh()} ${f.controller.takeRefresh()}`); });
  const started = f.controller.start();
  f.lists[0].read.resolve(receipt([repo(1)], "t1", "create"));
  f.sessions[0].resolve(receipt(signedIn()));
  await flush();
  assert.equal(f.url(), "https://editor.test/#repo=1");
  assert.equal(f.lists.length, 2); assert.equal(f.lists[1].refresh, true);
  f.lists[1].read.resolve(receipt([repo(1), repo(2)], "t1", "install"));
  await started;
  assert.ok(f.log.includes("fetch true")); assert.ok(f.log.includes("take true false"));
  assert.equal(f.controller.onboarding(), "install");
});

test("a generation bump while waiting for repositories stops the boot without onboarding", async () => {
  const f = fixture(), started = f.controller.start();
  f.sessions[0].resolve(receipt(signedIn()));
  await flush();
  f.bump();
  f.lists[0].read.resolve(receipt([repo(1)], "t1", "install"));
  await started;
  assert.equal(f.loads.length, 0); assert.equal(f.controller.onboarding(), undefined);
});

test("a generation bump before the session resolves adopts nothing", async () => {
  const f = fixture(), started = f.controller.start();
  f.bump();
  f.sessions[0].resolve(receipt(signedIn()));
  await started;
  assert.ok(!f.log.includes("enter")); assert.ok(!f.log.includes("drafts"));
});

test("a late boot error cannot replace a newer workspace; an owned one shows the login", async () => {
  const late = fixture();
  late.setLoad(async (_prefetched, hooks) => { late.bump(); hooks?.onStarted(1); late.bump(); throw new Error("late"); });
  const first = late.controller.start();
  late.sessions[0].resolve(receipt(signedIn())); late.lists[0].read.resolve(receipt([], "x"));
  await first;
  assert.equal(late.errors.length, 0); assert.ok(!late.log.includes("login error"));

  const owned = fixture();
  owned.setLoad(async (_prefetched, hooks) => { hooks?.onStarted(0); throw new Error("owned"); });
  const second = owned.controller.start();
  owned.sessions[0].resolve(receipt(signedIn())); owned.lists[0].read.resolve(receipt([], "x"));
  await second;
  assert.equal((owned.errors[0] as Error).message, "owned"); assert.ok(owned.log.includes("login error"));

  const replaced = fixture();
  replaced.setLoad(async (_prefetched, hooks) => { hooks?.onStarted(0); replaced.setInfo(signedIn()); throw new Error("other session"); });
  const third = replaced.controller.start();
  replaced.sessions[0].resolve(receipt(signedIn())); replaced.lists[0].read.resolve(receipt([], "x"));
  await third;
  assert.equal(replaced.errors.length, 0);
});

test("session errors before any handoff show the error login", async () => {
  const f = fixture(), started = f.controller.start();
  f.sessions[0].reject(new Error("down"));
  await started;
  assert.ok(f.log.includes("login error")); assert.equal((f.errors[0] as Error).message, "down");
});

test("drafts start before the workspace and their error hook installs only after loading", async () => {
  const f = fixture(), started = f.controller.start();
  f.sessions[0].resolve(receipt(signedIn())); f.lists[0].read.resolve(receipt([], null));
  await started;
  assert.ok(f.log.indexOf("drafts") < f.log.indexOf("enter"));
  let ready = false; void f.controller.draftsReady().then(() => { ready = true; });
  await flush(); assert.equal(ready, false); assert.ok(!f.log.includes("draft onError"));
  f.drafts.resolve(); await flush();
  assert.equal(ready, true); assert.ok(f.log.includes("draft onError"));
});

test("hash changes are ignored until a signed-in session exists", async () => {
  const f = fixture();
  f.controller.onHashChange(); assert.equal(f.loads.length, 0);
  f.setInfo(signedOut); f.controller.onHashChange(); assert.equal(f.loads.length, 0);
  f.setInfo(signedIn()); f.controller.onHashChange(); assert.equal(f.loads.length, 1);
});

test("ensureList deduplicates, recovers an uninitialized workspace and refuses a stale menu", async () => {
  const f = fixture(); f.setInfo(signedIn());
  const first = f.controller.ensureList();
  const again = f.controller.ensureList(); assert.equal(f.lists.length, 1);
  f.lists[0].read.resolve(receipt([repo(1)], null)); await first; await again;
  assert.equal(f.loads.length, 1, "uninitialized workspace recovers through loadRepositories");

  f.controller.ready();
  const shown: number[][] = []; f.setMenu({ setRepositories: list => { shown.push(list.map(item => item.id)); } });
  assert.equal(await f.controller.ensureList(), undefined); assert.equal(f.lists.length, 1, "loaded list is reused");

  f.controller.reset(); f.controller.ready();
  f.controller.reset();
  const stale = f.controller.ensureList();
  f.setMenu({ setRepositories: () => { shown.push([-1]); } });
  f.lists[1].read.resolve(receipt([repo(3)], null)); await stale;
  assert.deepEqual(shown, []); assert.ok(!f.log.some(line => line.startsWith("apply")));

  const g = fixture(); g.setInfo(signedIn()); g.controller.ready();
  g.controller.failed();
  const recovering = g.controller.ensureList(); g.lists[0].read.resolve(receipt([repo(4)], null)); await recovering;
  assert.equal(g.loads.length, 1);
  g.controller.loading(); g.controller.ready();
  const shownG: number[][] = []; g.setMenu({ setRepositories: list => { shownG.push(list.map(item => item.id)); } });
  g.controller.reset(); g.controller.loading(); // listed=false, state loading: no recovery
  const applied = g.controller.ensureList(); g.lists[1].read.resolve(receipt([repo(5)], null)); await applied;
  assert.deepEqual(shownG, [[5]]); assert.ok(g.log.includes("apply 5"));
});

test("reset clears listing state and onboarding", async () => {
  const f = fixture(); f.setInfo(signedIn());
  const read = f.controller.fetchList(); f.lists[0].read.resolve(receipt([], null, "install")); await read;
  f.controller.ready();
  assert.equal(f.controller.onboarding(), "install"); assert.equal(f.controller.needsRecovery(), false);
  f.controller.reset();
  assert.equal(f.controller.onboarding(), undefined); assert.equal(f.controller.needsRecovery(), true);
});

test("planRepositoryOpen decides the repository to open", () => {
  const list = [repo(1), repo(2)];
  const cases: [string, Parameters<typeof planRepositoryOpen>[0], ReturnType<typeof planRepositoryOpen>][] = [
    ["empty", { list: [], hashPresent: true }, { kind: "empty" }],
    ["invalid link", { list, hashPresent: true }, { kind: "invalid-link" }],
    ["unavailable link", { list, hashPresent: true, linked: { repoId: 9, branch: "main" } }, { kind: "unavailable-link" }],
    ["linked", { list, hashPresent: true, linked: { repoId: 2, branch: "dev" } }, { kind: "open", id: 2, resume: { repoId: 2, branch: "dev" } }],
    ["one added after install", { list, hashPresent: false, knownBefore: [1] }, { kind: "open", id: 2 }],
    ["added ignored with link", { list, hashPresent: true, knownBefore: [1], linked: { repoId: 1, branch: "main" } }, { kind: "open", id: 1, resume: { repoId: 1, branch: "main" } }],
    ["two added", { list, hashPresent: false, knownBefore: [] }, { kind: "choose" }],
    ["remembered", { list, hashPresent: false, remembered: { repoId: 1, branch: "main", path: "a.html" } }, { kind: "open", id: 1, resume: { repoId: 1, branch: "main", path: "a.html" } }],
    ["remembered gone", { list, hashPresent: false, remembered: { repoId: 7, branch: "main" } }, { kind: "choose" }],
    ["only one", { list: [repo(3)], hashPresent: false }, { kind: "open", id: 3 }],
    ["choose", { list, hashPresent: false }, { kind: "choose" }],
  ];
  for (const [name, input, expected] of cases) assert.deepEqual(planRepositoryOpen(input), expected, name);
});
