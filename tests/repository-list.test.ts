import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { rememberSignedIn, signedInBefore } from "../src/auto-signin.ts";
import { readBootMemory, writeBootMemory } from "../src/boot-memory.ts";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import type { RepositoryListPorts } from "../src/repository-list.ts";
import type { Repository } from "../shared/types.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";

// Just enough DOM for the welcome panel (node and button, src/ui/dom.ts).
class FakeElement {
  children: (FakeElement | string)[] = [];
  textContent = "";
  className = "";
  type = "";
  constructor(public localName: string) {}
  replaceChildren(...children: (FakeElement | string)[]) { this.children = children; }
  append(...children: (FakeElement | string)[]) { this.children.push(...children); }
  addEventListener() {}
}

// The page's location, history, localStorage, fetch and document, put back after the file.
const saved = ["location", "history", "localStorage", "fetch", "document"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const assigned: string[] = [], replaced: string[] = [];
let answer: () => Response = () => new Response(null, { status: 204 });
const fetched: string[] = [];
Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://editor.test", pathname: "/", hash: "", href: "https://editor.test/", assign: (url: string) => { assigned.push(url); } } });
Object.defineProperty(globalThis, "history", { configurable: true, value: { replaceState: (_state: unknown, _unused: string, url: string) => { replaced.push(url); } } });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store() });
Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string) => { fetched.push(url); return answer(); } });
Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (name: string) => new FakeElement(name) } });
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { createRepositoryList } = await import("../src/repository-list.ts");

function store() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}
const repo = (id: number): Repository => ({ id, name: `site-${id}`, full_name: `lex/site-${id}`, private: false, default_branch: "main", owner: { login: "lex", type: "User" } });
const A = repo(1), B = repo(2), C = repo(3);

function fixture(listed: Repository[] = [], fetchList: (refresh: boolean) => Promise<Repository[]> = async () => listed) {
  const session = createWorkspaceSession(), local = store();
  const shown = { content: [] as (FakeElement | string)[] }, calls = { loading: 0, ready: 0, listed: 0, fetchList: 0, cleared: 0 };
  const errors: unknown[] = [], announced: string[] = [];
  const box = { replaceChildren: (...nodes: (FakeElement | string)[]) => { shown.content = nodes; } };
  // The list code reads and writes only disabled and value: the fake stands in for the select.
  // eslint-disable-next-line no-restricted-syntax -- a partial DOM fake, see above
  const select = () => ({ disabled: false, value: "" }) as unknown as HTMLSelectElement;
  let repositories: Repository[] = [], fileGeneration = 0;
  const appStore = createAppStore(createDraftStore());
  const ports = {
    appStore, session, local,
    repositoryIndex: { clear: () => {} },
    mediaHistoryHome: { clear: () => {} },
    cleanSources: { clear: () => { calls.cleared++; } },
    workspaceBoot: { abandonGuess: () => {} },
    setup: { waitingForRepositories: true },
    setupEntry: { dismissed: () => true, open: async () => {}, active: () => false },
    setupController: { start: () => {} },
    boot: {
      loading: () => { calls.loading++; }, ready: () => { calls.ready++; }, failed: () => {}, listed: () => { calls.listed++; },
      fetchList: (refresh = false) => { calls.fetchList++; return fetchList(refresh); },
      refreshPending: () => false, takeRefresh: () => false, recover: async () => false,
    },
    user: { login: "lex" },
    get repositories() { return repositories; }, set repositories(value) { repositories = value; },
    get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
    content: box, files: box, refreshButton: { disabled: false },
    branchSelect: select(), repositorySelect: select(),
    repositoryMenu: undefined,
    siteActions: undefined,
    nextLoad: () => { session.next(undefined); return session.begin(); },
    chooseRepository: async () => {},
    storage: () => local,
    options: () => {},
    status: () => {},
    clearError: () => {},
    errorMessage: (error: unknown) => { errors.push(error); },
    announce: (text: string) => { announced.push(text); },
    setCurrentPage: () => {},
    openExplorer: () => {},
    removeFinishStarter: () => {},
    showGetStarted: async () => {},
    knownRepositories: () => undefined,
    rememberRepositories: () => {},
  } satisfies RepositoryListPorts & Record<string, unknown>;
  return { ports, list: createRepositoryList(ports), shown, calls, errors, announced };
}

test("sign-out of the last account forgets the signed-in mark and the boot memory", async () => {
  const { ports, list, calls } = fixture();
  rememberSignedIn(ports.local);
  writeBootMemory(ports.local, { login: "lex", repoId: 1, fullName: "lex/site-1", branch: "main", commit: "a".repeat(40), files: [] });
  answer = () => new Response(null, { status: 204 });
  assigned.length = 0;
  await list.disconnect();
  assert.equal(signedInBefore(ports.local), false);
  assert.equal(readBootMemory(ports.local, 1), undefined);
  assert.equal(calls.cleared, 1);
  assert.deepEqual(assigned, ["/"]);
});

test("sign-out with another account left forgets only the boot memory", async () => {
  const { ports, list } = fixture();
  rememberSignedIn(ports.local);
  writeBootMemory(ports.local, { login: "lex", repoId: 1, fullName: "lex/site-1", branch: "main", commit: "a".repeat(40), files: [] });
  answer = () => new Response(null, { status: 200 });
  assigned.length = 0;
  await list.disconnect();
  assert.equal(signedInBefore(ports.local), true);
  assert.equal(readBootMemory(ports.local, 1), undefined);
  assert.deepEqual(assigned, ["/"]);
});

test("a refused sign-out shows its error and stays on the page", async () => {
  const { list, errors } = fixture();
  answer = () => new Response(null, { status: 500 });
  assigned.length = 0;
  await list.disconnect();
  assert.equal((errors[0] as Error).message, "Could not disconnect. Try again.");
  assert.deepEqual(assigned, []);
});

test("a refreshed list that still holds the open repository announces the change and keeps it selected", async () => {
  const { ports, list, announced, calls } = fixture([], async () => [A, C]);
  ports.repositories = [A, B];
  ports.appStore.repository.value = A;
  await list.refreshRepositoryList();
  assert.deepEqual(announced, ["1 repository added, 1 removed."]);
  assert.equal(ports.repositorySelect.value, String(A.id));
  assert.deepEqual(ports.repositories, [A, C]);
  assert.equal(calls.loading, 0);
});

test("a refreshed list without the open repository lists the repositories again from it", async () => {
  const { ports, list, calls } = fixture([], async () => [C]);
  ports.repositories = [A, B];
  ports.appStore.repository.value = A;
  replaced.length = 0;
  await list.refreshRepositoryList();
  assert.deepEqual(replaced, ["/"]);
  assert.equal(calls.loading, 1);
  // The new list is the one loaded: no second read.
  assert.equal(calls.fetchList, 1);
  assert.deepEqual(ports.repositories, [C]);
});

test("a listing superseded by a later load writes nothing", async () => {
  const points = await forEachAwait(
    (race: AwaitRace) => {
      const run = fixture([], race.port("fetchList", async () => [A, B]));
      return { ...run, done: run.list.loadRepositories() };
    },
    (run) => { run.ports.nextLoad(); },
    (run) => {
      assert.deepEqual(run.ports.repositories, []);
      assert.equal(run.calls.ready, 0);
      assert.equal((run.shown.content[0] as FakeElement).textContent, "Finding your selected repositories…");
    },
  );
  assert.equal(points, 1);
});
