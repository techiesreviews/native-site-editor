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
import type { WorkspaceLocation } from "../src/workspace-state.ts";
import { readWizard, WIZARD_KEY } from "../src/setup-wizard.ts";
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
const page = { origin: "https://editor.test", pathname: "/", hash: "", href: "https://editor.test/", assign: (url: string) => { assigned.push(url); } };
Object.defineProperty(globalThis, "location", { configurable: true, value: page });
Object.defineProperty(globalThis, "history", { configurable: true, value: { replaceState: (_state: unknown, _unused: string, url: string) => { replaced.push(url); } } });
const pageStorage = store();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: pageStorage });
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

type Options = { user?: { login: string }; dismissed?: boolean; recover?: boolean };
function fixture(listed: Repository[] = [], fetchList: (refresh: boolean) => Promise<Repository[]> = async () => listed, options: Options = {}) {
  const session = createWorkspaceSession(), local = store();
  const shown = { content: [] as (FakeElement | string)[], files: [] as (FakeElement | string)[] };
  const calls = { loading: 0, ready: 0, failed: 0, listed: 0, fetchList: 0, cleared: 0, gotStarted: 0, opened: 0, remembered: 0 };
  const errors: unknown[] = [], announced: string[] = [], chosen: (WorkspaceLocation | undefined)[] = [], started: number[] = [];
  const content = { replaceChildren: (...nodes: (FakeElement | string)[]) => { shown.content = nodes; } };
  const files = { replaceChildren: (...nodes: (FakeElement | string)[]) => { shown.files = nodes; } };
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
    setupEntry: { dismissed: () => options.dismissed ?? true, open: async () => { calls.opened++; }, active: () => false },
    setupController: { start: (id: number) => { started.push(id); } },
    boot: {
      loading: () => { calls.loading++; }, ready: () => { calls.ready++; }, failed: () => { calls.failed++; }, listed: () => { calls.listed++; },
      fetchList: (refresh = false) => { calls.fetchList++; return fetchList(refresh); },
      refreshPending: () => false, takeRefresh: () => false, recover: async () => options.recover ?? false,
    },
    user: "user" in options ? options.user : { login: "lex" },
    get repositories() { return repositories; }, set repositories(value) { repositories = value; },
    get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
    content, files, refreshButton: { disabled: false },
    branchSelect: select(), repositorySelect: select(),
    repositoryMenu: undefined,
    siteActions: undefined,
    nextLoad: () => { session.next(undefined); return session.begin(); },
    chooseRepository: async (resume?: WorkspaceLocation) => { chosen.push(resume); },
    storage: () => local,
    options: () => {},
    status: () => {},
    clearError: () => {},
    errorMessage: (error: unknown) => { errors.push(error); },
    announce: (text: string) => { announced.push(text); },
    setCurrentPage: () => {},
    openExplorer: () => {},
    removeFinishStarter: () => {},
    showGetStarted: async () => { calls.gotStarted++; },
    knownRepositories: () => undefined,
    rememberRepositories: () => { calls.remembered++; },
  } satisfies RepositoryListPorts & Record<string, unknown>;
  return { ports, list: createRepositoryList(ports), shown, calls, errors, announced, chosen, started };
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

test("switching account goes to the editor's home", async () => {
  const { list, errors } = fixture();
  answer = () => new Response(null, { status: 200 });
  fetched.length = 0;
  assigned.length = 0;
  await list.switchAccount("other");
  assert.deepEqual(fetched, ["/api/accounts/switch"]);
  assert.deepEqual(assigned, ["/"]);
  assert.deepEqual(errors, []);
});

test("a refused account switch shows the server's reason and stays on the page", async () => {
  const { list, errors } = fixture();
  answer = () => new Response(JSON.stringify({ error: "nope" }), { status: 403 });
  assigned.length = 0;
  await list.switchAccount("other");
  assert.equal((errors[0] as Error).message, "nope");
  assert.deepEqual(assigned, []);
});

test("the listing opens the account's remembered repository where it was left", async () => {
  const resume = { repoId: B.id, branch: "dev", path: "about.html" };
  pageStorage.setItem("astro-site-editor:workspace:v1:lex", JSON.stringify(resume));
  try {
    const { ports, list, chosen, shown } = fixture([A, B]);
    await list.loadRepositories();
    assert.deepEqual(chosen, [resume]);
    assert.equal(ports.repositorySelect.value, String(B.id));
    // The file selection counter is the host's, written through its setter.
    assert.equal(ports.fileGeneration, 1);
    assert.deepEqual(shown.files, []);
  } finally {
    pageStorage.removeItem("astro-site-editor:workspace:v1:lex");
  }
});

test("a listing before the session has a user offers the choice of a project", async () => {
  pageStorage.setItem("astro-site-editor:workspace:v1:lex", JSON.stringify({ repoId: B.id, branch: "main" }));
  try {
    const { list, chosen, shown, errors } = fixture([A, B], undefined, { user: undefined });
    await list.loadRepositories();
    assert.deepEqual(chosen, []);
    assert.deepEqual(errors, []);
    const panel = shown.content[0] as FakeElement;
    assert.equal(panel.className, "welcome");
    assert.equal((panel.children[0] as FakeElement).textContent, "Open a project");
  } finally {
    pageStorage.removeItem("astro-site-editor:workspace:v1:lex");
  }
});

test("no repositories, with setup dismissed, shows Get started", async () => {
  const { list, calls } = fixture([], undefined, { dismissed: true });
  await list.loadRepositories();
  assert.equal(calls.gotStarted, 1);
  assert.equal(calls.opened, 0);
});

test("no repositories for a new user opens the Setup wizard", async () => {
  const { list, calls, shown } = fixture([], undefined, { dismissed: false });
  await list.loadRepositories();
  assert.equal(calls.opened, 1);
  assert.equal(calls.gotStarted, 0);
  assert.equal((shown.content[0] as FakeElement).textContent, "Create your first site to get started.");
});

test("a failed listing says so and offers Reload", async () => {
  const failure = new Error("GitHub is down");
  const { ports, list, calls, shown, errors } = fixture([], async () => { throw failure; });
  await list.loadRepositories();
  assert.equal(calls.failed, 1);
  assert.equal((shown.content[0] as FakeElement).textContent, "Repositories could not be loaded. Use Reload to try again.");
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(ports.repositories, []);
});

test("a listing that fails after a later load has begun writes nothing", async () => {
  const points = await forEachAwait(
    (race: AwaitRace) => {
      const run = fixture([], race.port("fetchList", async (): Promise<Repository[]> => { throw new Error("GitHub is down"); }));
      return { ...run, done: run.list.loadRepositories() };
    },
    (run) => { run.ports.nextLoad(); },
    (run) => {
      assert.equal(run.calls.failed, 0);
      assert.deepEqual(run.errors, []);
      assert.equal((run.shown.content[0] as FakeElement).textContent, "Finding your selected repositories…");
    },
  );
  assert.equal(points, 1);
});

for (const [name, hash, message] of [
  ["an invalid workspace link", "#repo=nope", "This workspace link is invalid. Choose a repository to continue."],
  ["a link to a repository this account cannot see", `#repo=${C.id}&branch=main`, "The linked repository is not available to this GitHub account. Check repository access or choose another project."],
] as const) {
  test(`${name} says so and leaves the choice open`, async () => {
    page.hash = hash;
    try {
      const { ports, list, chosen, errors } = fixture([A, B]);
      await list.loadRepositories();
      assert.equal((errors[0] as Error).message, message);
      assert.equal(ports.repositorySelect.disabled, false);
      assert.deepEqual(chosen, []);
    } finally {
      page.hash = "";
    }
  });
}

const wizardWith = (id: number) => JSON.stringify({ step: "open", at: Date.now(), repo: { id, name: `site-${id}`, fullName: `lex/site-${id}` } });

test("a wizard interrupted after making a listed site keeps its checklist", async () => {
  pageStorage.setItem(WIZARD_KEY, wizardWith(B.id));
  try {
    const { list, started } = fixture([A, B]);
    await list.loadRepositories();
    assert.deepEqual(started, [B.id]);
  } finally {
    pageStorage.removeItem(WIZARD_KEY);
  }
});

test("a wizard's site that is not listed is forgotten when the wizard is not open", async () => {
  pageStorage.setItem(WIZARD_KEY, wizardWith(C.id));
  const { list, started } = fixture([A, B]);
  await list.loadRepositories();
  assert.deepEqual(started, []);
  assert.equal(readWizard(pageStorage), undefined);
});

test("a refresh whose read fails shows the error and keeps the list", async () => {
  const failure = new Error("GitHub is down");
  const { ports, list, calls, errors } = fixture([], async () => { throw failure; });
  ports.repositories = [A, B];
  await list.refreshRepositoryList();
  assert.deepEqual(errors, [failure]);
  assert.equal(calls.loading, 0);
  assert.deepEqual(ports.repositories, [A, B]);
});

test("a refresh the boot recovers from goes no further", async () => {
  const { ports, list, calls, announced } = fixture([], async () => [A, C], { recover: true });
  ports.repositories = [A, B];
  await list.refreshRepositoryList();
  assert.equal(calls.listed, 0);
  assert.deepEqual(announced, []);
  assert.deepEqual(ports.repositories, [A, B]);
});

test("an unchanged refresh only marks the list as loaded", async () => {
  const { ports, list, calls, announced } = fixture([], async () => [A, B]);
  ports.repositories = [A, B];
  ports.appStore.repository.value = A;
  await list.refreshRepositoryList();
  assert.equal(calls.listed, 1);
  assert.deepEqual(announced, []);
  assert.equal(calls.remembered, 0);
  assert.equal(calls.loading, 0);
});

test("a refresh with no repository open lists again without touching the address", async () => {
  const { ports, list, calls } = fixture([], async () => [A, C]);
  ports.repositories = [A, B];
  replaced.length = 0;
  await list.refreshRepositoryList();
  assert.deepEqual(replaced, []);
  assert.equal(calls.loading, 1);
  assert.equal(calls.fetchList, 1);
  assert.deepEqual(ports.repositories, [A, C]);
});
