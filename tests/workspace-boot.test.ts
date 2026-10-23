import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceBoot, GUESS_AFTER_FAILED_LIST_MS, type WorkspaceBootPorts } from "../src/workspace-boot.ts";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { writeBootMemory, type BootMemory } from "../src/boot-memory.ts";
import { RepositoryIndex } from "../src/repository-loading.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import type { ApiReceipt } from "../src/boot-api-response.ts";
import type { FilesResult, Repository, Snapshot } from "../shared/types.ts";

// readWorkspaceUrl and rememberWorkspace (src/workspace-state.ts) use the page's location, history and localStorage.
const saved = ["location", "history", "localStorage"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
let hash = "";
Object.defineProperty(globalThis, "location", { configurable: true, get: () => ({ origin: "https://editor.test", pathname: "/", hash, href: `https://editor.test/${hash}` }) });
Object.defineProperty(globalThis, "history", { configurable: true, value: { replaceState: (_state: unknown, _unused: string, url: string) => { hash = new URL(url, "https://editor.test/").hash; } } });
const pageStore = store();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: pageStore });
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

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
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };
const sha = (n: number) => n.toString(16).padStart(40, "0");
const REPO = { id: 501, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } } satisfies Repository;
const MEMORY: BootMemory = { login: "lex", repoId: 501, fullName: "lex/site", branch: "main", commit: sha(9), files: [{ path: "index.html", sha: sha(1) }] };
const SNAPSHOT: Snapshot = { commit: sha(9), branch: "main", entries: [{ path: "index.html", mode: "100644", type: "blob", sha: sha(1) }] };
const receipt = <T>(value: T, sessionTag: string | null = "t1"): ApiReceipt<T> => ({ value, sessionTag });

type Read = { path: string; params?: Record<string, string>; answer: ReturnType<typeof deferred<unknown>> };

function fixture() {
  hash = "#repo=501&branch=main";
  const session = createWorkspaceSession();
  const local = store();
  writeBootMemory(local, MEMORY);
  const reads: Read[] = [], seeded: string[] = [], shown = { content: "", status: "" };
  let fileGeneration = 0, tag: string | null | undefined = "t1";
  const read = (path: string, params?: Record<string, string>) => {
    const answer = deferred<unknown>();
    void answer.promise.catch(() => {});
    reads.push({ path, params, answer });
    return answer.promise;
  };
  const box = { replaceChildren: (...nodes: (Node | string)[]) => { shown.content = nodes.join(""); } };
  const branchSelect = { disabled: false, value: "" }, refreshButton = { disabled: false };
  const ports = {
    appStore: createAppStore(createDraftStore()),
    savePublish: { trustedHead: () => undefined, seeHead: () => {}, resetDeleted: () => {}, checkDeleted: async () => {}, isDeleted: () => false },
    repositoryIndex: new RepositoryIndex(),
    cleanSources: {
      load: (_repo: string, revision: string, readText: () => Promise<string>) => {
        seeded.push(revision);
        const text = readText();
        void text.catch(() => {});
        return text;
      },
    },
    filesTreeController: { reset: () => {}, render: () => {} },
    pagesController: { updateTabs: () => {} },
    previewSelection: { recordIntent: () => {} },
    mediaHistoryHome: { clear: () => {} },
    user: { login: "lex" },
    get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
    repositories: [REPO],
    content: box, files: { replaceChildren: () => {} }, refreshButton, branchSelect,
    repositorySelect: { value: "501" },
    repositoryMenu: undefined, explorerDropdown: undefined, siteActions: undefined, nativeSite: undefined,
    nativeSourcesRequest: 0, nativePaintedRequest: -1, nativePaintedPaths: [],
    source: () => "https://editor.test/",
    sessionTag: () => tag,
    draftsReady: async () => {},
    nextLoad: (scope) => { session.next(scope); return session.begin(); },
    api: <T>(path: string, params?: Record<string, string>) => read(path, params) as Promise<T>,
    apiResponse: <T>(path: string, params?: Record<string, string>) => read(path, params) as Promise<ApiReceipt<T>>,
    readFile: async () => "",
    storage: () => local,
    element: () => ({ textContent: "", title: "" }),
    node: (_tag, _className, text) => text ?? "",
    options: (select, values) => { select.value = values[0]?.value ?? ""; },
    status: (message) => { shown.status = message; },
    settleStatus: (message) => { shown.status = message; },
    clearError: () => {},
    errorMessage: (error) => { shown.status = `error: ${error instanceof Error ? error.message : error}`; },
    draftScope: () => undefined,
    entryAt: () => undefined,
    setCurrentPage: () => {},
    openNewDraft: async () => {},
    openEntry: async () => {},
    mountSource: async () => {},
    deactivateNative: () => {},
    activateNativeSite: async () => false,
    afterNativePaint: () => {},
    updateAgentContext: () => {},
    updatePreview: () => {},
    showDirectory: () => {},
    removeFinishStarter: () => {},
    takeStartingPoint: () => undefined,
    writeStartingPoint: async () => undefined,
    readPartialStart: () => undefined,
    offerFinishStarter: () => {},
  } satisfies WorkspaceBootPorts;
  const boot = createWorkspaceBoot(ports);
  const pending = (path: string) => reads.filter((entry) => entry.path === path);
  return {
    boot, ports, reads, seeded, shown, branchSelect,
    paths: () => reads.map((entry) => entry.path),
    pending,
    setTag: (value: string | null | undefined) => { tag = value; },
    /** The host's loadRepositories: a new listing starts the next load with no repository. */
    newListing: () => { boot.abandonGuess(); session.next(undefined); ports.appStore.reset(); },
  };
}

test("a proven guess opens on its own snapshot, without a fresh one, and seeds its proven files", async () => {
  const f = fixture();
  f.boot.startGuess();
  assert.deepEqual(f.paths(), ["snapshot", "files"]);
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  assert.deepEqual(f.paths(), ["snapshot", "files", "branches"]);
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await choosing;
  assert.deepEqual(f.seeded, [sha(1)]);
  assert.equal(f.pending("snapshot").length, 1, "no second snapshot");
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
  assert.equal(f.branchSelect.value, "main");
  assert.match(f.shown.status, /^Up to date with main/);
});

test("a taken guess whose repository selection a new listing clears writes nothing when it lands", async () => {
  const f = fixture();
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.newListing();
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  f.pending("branches")[0].answer.resolve(["main"]);
  await choosing;
  await flush();
  assert.deepEqual(f.seeded, [], "the clean-source cache is not seeded");
  assert.equal(f.ports.appStore.snapshot.value, undefined);
  assert.equal(f.ports.appStore.branch.value, undefined);
  assert.equal(f.shown.content, "Loading branches…", "the abandoned choice shows nothing after the listing");
});

test("a branch list first: the guess still feeds its own snapshot load and seeds when it lands", async () => {
  const f = fixture();
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("branches")[0].answer.resolve(["main", "dev"]);
  await flush();
  assert.equal(f.shown.content, "Opening your repository…");
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await choosing;
  assert.deepEqual(f.seeded, [sha(1)]);
  assert.equal(f.pending("snapshot").length, 1);
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
});

test("a dropped guess (navigation, sign-out) is not taken: the choice reads afresh", async () => {
  const f = fixture();
  f.boot.startGuess();
  f.boot.dropGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  assert.equal(f.pending("snapshot").length, 2, "a fresh snapshot read");
  f.pending("branches")[0].answer.resolve(["main"]);
  f.pending("snapshot")[1].answer.resolve(SNAPSHOT);
  await choosing;
  assert.deepEqual(f.seeded, []);
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
  assert.match(f.shown.status, /^Up to date with main/);
});

test("a guess answered under another session tag reads afresh and seeds nothing", async () => {
  const f = fixture();
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT, "other"));
  await flush();
  assert.equal(f.pending("snapshot").length, 2, "the fresh read");
  f.pending("snapshot")[1].answer.resolve(SNAPSHOT);
  f.pending("branches")[0].answer.resolve(["main"]);
  await choosing;
  assert.deepEqual(f.seeded, []);
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
  assert.match(f.shown.status, /^Up to date with main/);
});

test("no session tag: the guess is not taken", async () => {
  const f = fixture();
  f.setTag(undefined);
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  assert.equal(f.pending("snapshot").length, 2);
  f.pending("branches")[0].answer.resolve(["main"]);
  f.pending("snapshot")[1].answer.resolve(SNAPSHOT);
  await choosing;
  assert.deepEqual(f.seeded, []);
});

test("a failed branch list and a guess that never lands show the failure at the bound; the late guess writes nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("branches")[0].answer.reject(new Error("down"));
  await flush();
  assert.equal(f.shown.content, "Loading branches…");
  t.mock.timers.tick(GUESS_AFTER_FAILED_LIST_MS);
  await choosing;
  assert.equal(f.shown.content, "Branches could not be loaded. Reload repositories to retry.");
  assert.equal(f.branchSelect.value, "");
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await flush();
  assert.deepEqual(f.seeded, []);
  assert.equal(f.ports.appStore.snapshot.value, undefined);
});
