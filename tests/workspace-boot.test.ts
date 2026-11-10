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
import { ReadUnansweredError } from "../src/read-retry.ts";
import type { EarlyReads } from "../src/boot-reads.ts";

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

type Read = { path: string; params?: Record<string, string>; early?: Promise<Response>; answer: ReturnType<typeof deferred<unknown>> };

function fixture({ remember = true, early }: { remember?: boolean; early?: EarlyReads } = {}) {
  hash = "#repo=501&branch=main";
  globalThis.aseEarlyReads = early;
  const session = createWorkspaceSession();
  const local = store();
  if (remember) writeBootMemory(local, MEMORY);
  const reads: Read[] = [], seeded: string[] = [], cached = new Map<string, string>(), shown = { content: "", status: "", nodes: [] as unknown[] };
  let fileGeneration = 0, tag: string | null | undefined = "t1";
  const read = (path: string, params?: Record<string, string>, early?: Promise<Response>) => {
    const answer = deferred<unknown>();
    void answer.promise.catch(() => {});
    reads.push({ path, params, early, answer });
    return answer.promise;
  };
  const box = { replaceChildren: (...nodes: Pick<HTMLElement, "textContent">[]) => { shown.nodes = nodes; shown.content = nodes.map(node => node.textContent).join(""); } };
  const branchSelect = { disabled: false, value: "" }, refreshButton = { disabled: false };
  const ports = {
    appStore: createAppStore(createDraftStore()),
    savePublish: { trustedHead: () => undefined, seeHead: () => {}, resetDeleted: () => {}, checkDeleted: async () => {}, isDeleted: () => false },
    repositoryIndex: new RepositoryIndex(),
    cleanSources: {
      load: (_repo: string, revision: string, readText: () => Promise<string>) => {
        seeded.push(revision);
        const text = readText();
        text.then((value) => { cached.set(revision, value); }, () => {});
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
    apiResponse: <T>(path: string, params?: Record<string, string>, early?: Promise<Response>) => read(path, params, early) as Promise<ApiReceipt<T>>,
    readFile: async () => "",
    storage: () => local,
    element: () => ({ textContent: "", title: "" }),
    // A partial element: only the words are read back.
    // eslint-disable-next-line no-restricted-syntax -- a partial DOM fake
    node: (_tag, _className, text) => ({ textContent: text ?? "" }) as HTMLElement,
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
    boot, ports, reads, seeded, cached, shown, branchSelect,
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

test("a guess that won, abandoned by a new listing before its file batch lands: the batch is not cached, the file is read afresh", async () => {
  const f = fixture();
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  await choosing;
  assert.deepEqual(f.seeded, [sha(1)], "the loader is registered while the guess is live");
  f.newListing();
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await flush();
  assert.equal(f.cached.has(sha(1)), false);
  const fresh = f.pending("file");
  assert.deepEqual(fresh.map((read) => read.params?.sha), [sha(1)]);
  fresh[0].answer.resolve({ content: "<h1>Fresh</h1>" });
  await flush();
  assert.equal(f.cached.get(sha(1)), "<h1>Fresh</h1>");
});

test("sign-out (dropGuess) while a taken guess is held: it writes nothing when it lands", async () => {
  const f = fixture();
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.boot.dropGuess();
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await flush();
  assert.deepEqual(f.seeded, []);
  assert.equal(f.cached.size, 0);
  f.pending("branches")[0].answer.resolve(["main"]);
  await choosing;
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

test("another branch picked while a taken guess is held: the superseded load writes nothing; the guess still seeds its proven files (accepted: keyed by SHA)", async () => {
  const f = fixture();
  f.boot.startGuess();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("branches")[0].answer.resolve(["main", "dev"]);
  await flush();
  assert.equal(f.shown.content, "Opening your repository…");
  f.ports.appStore.branch.value = "dev";
  const switching = f.boot.loadSnapshot();
  const dev = f.pending("snapshot");
  assert.equal(dev.length, 2, "a fresh snapshot for the picked branch");
  assert.equal(dev[1].params?.branch, "dev");
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await choosing;
  await flush();
  // The guess is not abandoned by a branch change (TD 06 limit 2 covers a cleared selection only).
  assert.deepEqual(f.seeded, [sha(1)]);
  assert.equal(f.ports.appStore.snapshot.value, undefined, "the superseded load does not install the guess");
  const devSnapshot = { ...SNAPSHOT, branch: "dev" };
  dev[1].answer.resolve(devSnapshot);
  await switching;
  assert.equal(f.ports.appStore.snapshot.value, devSnapshot);
  assert.equal(f.ports.appStore.branch.value, "dev");
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
  assert.equal(f.shown.content, "Branches could not be loaded.");
  assert.equal(f.branchSelect.value, "");
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await flush();
  assert.deepEqual(f.seeded, []);
  assert.equal(f.ports.appStore.snapshot.value, undefined);
});

// Try again (ticket 26): each open hands its own retry to errorMessage with its errors.
function retries(f: ReturnType<typeof fixture>) {
  const offered: (() => void)[] = [];
  f.ports.errorMessage = (error: unknown, retry?: () => void) => {
    f.shown.status = `error: ${error instanceof Error ? error.message : error}`;
    if (retry) offered.push(retry);
  };
  return offered;
}
const silent = () => new ReadUnansweredError(new Error("held"));
function failedSnapshotLoad(f: ReturnType<typeof fixture>) {
  f.ports.appStore.reset(REPO);
  f.ports.appStore.branch.value = "main";
  const loading = f.boot.loadSnapshot();
  f.pending("snapshot")[0].answer.reject(silent());
  return loading;
}

test("the failed panel handed to errorMessage is the one drawn in the content area", async () => {
  const f = fixture();
  const panels: (HTMLElement | undefined)[] = [];
  f.ports.errorMessage = (_error: unknown, _retry?: () => void, panel?: HTMLElement) => { panels.push(panel); };
  await failedSnapshotLoad(f);
  assert.equal(f.shown.content, "Your repository could not be opened.");
  assert.equal(panels.length, 1);
  assert.equal(panels[0], f.shown.nodes[0], "the node handed to the content area is the one that carries Try again");
});

test("Try again repeats the failed open with fresh reads: a snapshot load, a repository choice", async () => {
  const f = fixture(), offered = retries(f);
  await failedSnapshotLoad(f);
  assert.equal(offered.length, 1);
  assert.equal(f.shown.content, "Your repository could not be opened.");
  offered[0]();
  assert.equal(f.pending("snapshot").length, 2, "a fresh snapshot read");
  f.pending("snapshot")[1].answer.resolve(SNAPSHOT);
  await flush();
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);

  const g = fixture(), offeredChoice = retries(g);
  const choosing = g.boot.chooseRepository({ repoId: 501, branch: "main" });
  g.pending("branches")[0].answer.reject(silent());
  await choosing;
  assert.equal(g.shown.content, "Branches could not be loaded.");
  assert.equal(offeredChoice.length, 1);
  offeredChoice[0]();
  assert.equal(g.pending("branches").length, 2, "the branch list is read again");
});

test("a superseded Try again reads nothing: another load started since its open failed", async () => {
  const f = fixture(), offered = retries(f);
  await failedSnapshotLoad(f);
  // Refresh (or another branch) starts the next load.
  const refreshing = f.boot.loadSnapshot();
  assert.equal(f.pending("snapshot").length, 2);
  offered[0]();
  assert.equal(f.pending("snapshot").length, 2, "no snapshot read for the old open");
  f.pending("snapshot")[1].answer.resolve(SNAPSHOT);
  await refreshing;

  const g = fixture(), offeredChoice = retries(g);
  const choosing = g.boot.chooseRepository({ repoId: 501, branch: "main" });
  g.pending("branches")[0].answer.reject(silent());
  await choosing;
  g.newListing();
  offeredChoice[0]();
  assert.equal(g.pending("branches").length, 1, "no branch read for the old choice");
  assert.equal(g.pending("snapshot").length, 1);
});

// The page's early snapshot (src/boot-early.ts): asked with the session, before the editor's script loaded.
const earlySnapshot = (fullName: string | undefined, repoId = 501, branch = "main"): EarlyReads => {
  const response = Promise.resolve(new Response("{}"));
  return { snapshot: { repoId, branch, read: Promise.resolve(fullName ? { fullName, response } : undefined) } };
};

test("nothing remembered: the page's early snapshot opens the linked repository once the session's tag proves it, with no second read", async () => {
  const early = earlySnapshot("lex/site"), read = early.snapshot!.read;
  const f = fixture({ remember: false, early });
  f.boot.startGuess();
  await flush();
  assert.deepEqual(f.paths(), ["snapshot"], "no remembered files to ask for");
  assert.equal(f.pending("snapshot")[0].early, (await read)!.response, "the early answer stands for the first try");
  assert.deepEqual(f.pending("snapshot")[0].params, { repo: "lex/site", branch: "main" });
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  await choosing;
  assert.equal(f.pending("snapshot").length, 1, "no second snapshot");
  assert.deepEqual(f.seeded, []);
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
  assert.match(f.shown.status, /^Up to date with main/);
});

test("the early snapshot is taken once: a second boot guess asks for itself", async () => {
  const f = fixture({ remember: false, early: earlySnapshot("lex/site") });
  f.boot.startGuess();
  f.boot.dropGuess();
  f.boot.startGuess();
  await flush();
  assert.equal(f.pending("snapshot").length, 1, "nothing remembered and the early read gone: no guess");
  assert.equal(globalThis.aseEarlyReads?.snapshot, undefined);
});

for (const [name, setup] of [
  ["a signed-out session (no tag) throws the early snapshot away", (f: ReturnType<typeof fixture>) => f.setTag(undefined)],
  ["another account's session (another tag) throws the early snapshot away", () => {}],
] as const) {
  test(name, async () => {
    const f = fixture({ remember: false, early: earlySnapshot("lex/site") });
    setup(f);
    f.boot.startGuess();
    await flush();
    const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
    f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT, "other"));
    await flush();
    assert.equal(f.pending("snapshot").length, 2, "the snapshot is read afresh");
    assert.equal(f.pending("snapshot")[1].early, undefined);
    f.pending("branches")[0].answer.resolve(["main"]);
    f.pending("snapshot")[1].answer.resolve(SNAPSHOT);
    await choosing;
    assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
    assert.match(f.shown.status, /^Up to date with main/);
  });
}

test("an early snapshot of another name (the repository renamed) or none (not listed) is not used: the choice reads afresh", async () => {
  for (const name of ["lex/old-name", undefined]) {
    const f = fixture({ remember: false, early: earlySnapshot(name) });
    f.boot.startGuess();
    await flush();
    const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
    if (name) f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
    await flush();
    const fresh = f.pending("snapshot").at(-1)!;
    assert.deepEqual(fresh.params, { repo: "lex/site", branch: "main" }, String(name));
    assert.equal(fresh.early, undefined);
    f.pending("branches")[0].answer.resolve(["main"]);
    fresh.answer.resolve(SNAPSHOT);
    await choosing;
    assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
  }
});

test("an early snapshot of another repository or branch than the address names is never taken", async () => {
  const f = fixture({ remember: false, early: earlySnapshot("lex/site", 501, "draft") });
  f.boot.startGuess();
  await flush();
  assert.deepEqual(f.paths(), []);
  assert.equal(globalThis.aseEarlyReads?.snapshot, undefined, "thrown away");
});

test("remembered: the early snapshot stands for the guess's own first try; the remembered files are asked as before", async () => {
  const early = earlySnapshot("lex/site"), read = early.snapshot!.read;
  const f = fixture({ early });
  f.boot.startGuess();
  await flush();
  assert.deepEqual(f.paths(), ["files", "snapshot"]);
  assert.equal(f.pending("snapshot")[0].early, (await read)!.response);
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("files")[0].answer.resolve(receipt<FilesResult>({ files: { [sha(1)]: "<h1>Guess</h1>" } }));
  await choosing;
  assert.equal(f.pending("snapshot").length, 1);
  assert.deepEqual(f.seeded, [sha(1)]);
});

test("no address: no guess", () => {
  const f = fixture({ early: earlySnapshot("lex/site") });
  hash = "";
  f.boot.startGuess();
  assert.deepEqual(f.paths(), []);
});

test("a record the early script named but the boot rejects (a bad commit): the guess runs on the early snapshot alone, taken only with the same name and tag, and seeds nothing", async () => {
  for (const tag of ["t1", "other"]) {
    const early = earlySnapshot("lex/site");
    const f = fixture({ remember: false, early });
    // rememberedName (src/boot-memory.ts) accepts this record; readBootMemory removes it.
    f.ports.storage().setItem("ase:boot-memory:v1:501", JSON.stringify({ ...MEMORY, commit: "not a sha!".repeat(10) }));
    f.boot.startGuess();
    await flush();
    assert.equal(f.ports.storage().getItem("ase:boot-memory:v1:501"), null, "the boot drops the bad record");
    assert.deepEqual(f.paths(), ["snapshot"], "no remembered files asked");
    const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
    f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT, tag));
    await flush();
    if (tag === "other") {
      assert.equal(f.pending("snapshot").length, 2, "another session's answer: read afresh");
      f.pending("branches")[0].answer.resolve(["main"]);
      f.pending("snapshot")[1].answer.resolve(SNAPSHOT);
    }
    await choosing;
    if (tag === "t1") assert.equal(f.pending("snapshot").length, 1, "taken: no second read");
    assert.deepEqual(f.seeded, []);
    assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT);
  }
});

test("a guess opens on the linked branch with the selector disabled until the branch list answers; a list that fails says so once the site is open, and Try again fills it", async () => {
  const f = fixture({ remember: false, early: earlySnapshot("lex/site") });
  let retry: (() => void) | undefined;
  const said: string[] = [];
  f.ports.errorMessage = (error, again) => { said.push(error instanceof Error ? error.message : String(error)); retry = again; };
  f.boot.startGuess();
  await flush();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  await choosing;
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT, "the site is open");
  assert.equal(f.branchSelect.value, "main");
  assert.equal(f.branchSelect.disabled, true, "no other branch to offer yet");
  f.pending("branches")[0].answer.reject(new Error("down"));
  await flush();
  assert.deepEqual(said, ["down"], "the plain path's message");
  assert.equal(f.branchSelect.disabled, true);
  retry!();
  assert.equal(f.pending("branches").length, 2, "Try again reads the list again");
  f.pending("branches")[1].answer.resolve(["main", "draft"]);
  await flush();
  assert.equal(f.branchSelect.disabled, false);
  assert.equal(f.branchSelect.value, "main");
  assert.equal(f.ports.appStore.snapshot.value, SNAPSHOT, "still the same open site");
});

test("a branch list that answers enables the selector on the linked branch, with no message", async () => {
  const f = fixture({ remember: false, early: earlySnapshot("lex/site") });
  const said: unknown[] = [];
  f.ports.errorMessage = (error) => { said.push(error); };
  f.boot.startGuess();
  await flush();
  const choosing = f.boot.chooseRepository({ repoId: 501, branch: "main" });
  f.pending("snapshot")[0].answer.resolve(receipt(SNAPSHOT));
  f.pending("branches")[0].answer.resolve(["main", "draft"]);
  await choosing;
  await flush();
  assert.equal(f.branchSelect.disabled, false);
  assert.equal(f.branchSelect.value, "main");
  assert.deepEqual(said, []);
});
