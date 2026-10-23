import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createAppStore } from "../src/app-store";
import { createDraftStore } from "../src/draft-store";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { createWorkspaceSession } from "../src/workspace-session";
import type { createSetupActions } from "../src/setup-actions";

// Replace only the modal UI; run the real starting-point action and file generation.
const bundled = build({ entryPoints: ["src/setup-actions.ts"], bundle: true, write: false, format: "esm", platform: "node", loader: { ".css": "empty" },
  plugins: [{ name: "starting-choice", setup(plugin) {
    plugin.onResolve({ filter: /^\.\/components\/confirm-dialog$/ }, () => ({ path: "choice", namespace: "test" }));
    plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: 'export const createConfirmDialog = () => ({ root: {}, choose: async () => ({ value: globalThis.startingChoice }) });' }));
  } }],
}).then(result => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));

for (const choice of ["replace", "keep"]) test(`Blank ${choice} generates links from the final configuration`, async () => {
  const config = JSON.stringify({ site: { url: "https://user.github.io/my-site/" } });
  const workspace = createMemoryWorkspace({ branch: { ".editor/config.json": config } });
  const appStore = createAppStore(createDraftStore());
  appStore.repository.value = { id: 1, name: "my-site", full_name: "user/my-site", private: false, default_branch: "main", owner: { login: "user", type: "User" } };
  appStore.snapshot.value = { branch: "main", commit: "commit", entries: [] };
  const drafts = new Map<string, string>(), session = createWorkspaceSession();
  // Only these live ports are used by writeStartingPoint; the other setup actions are not invoked.
  const ports = {
    begin: () => session.begin(), appStore, draftScope: () => ({ account: "user", repoId: 1, repo: "user/my-site", branch: "main" }),
    guardedEdits: createGuardedEdits(workspace.workspace),
    pathNow: (path: string) => path === ".editor/config.json" ? "file" as const : undefined,
    repositoryIndex: { find: async (_api: unknown, _repo: unknown, _snap: unknown, path: string) => path === ".editor/config.json" ? { sha: "config" } : undefined },
    api: async () => { throw new Error("Unused"); }, readFile: async () => config,
    draftStore: () => ({ get: () => undefined, save: (draft: { path: string; content: string }) => { drafts.set(draft.path, draft.content); }, error: null }),
    setupController: { start() {} }, loadSnapshot: async () => {}, announce() {}, errorMessage(error: unknown) { throw error; },
  } satisfies Pick<Parameters<typeof createSetupActions>[0], "begin" | "appStore" | "draftScope" | "guardedEdits" | "pathNow" | "api" | "readFile" | "loadSnapshot" | "announce" | "errorMessage"> & {
    repositoryIndex: { find: (...args: unknown[]) => Promise<{ sha: string } | undefined> };
    draftStore: () => { get(): undefined; save(draft: { path: string; content: string }): void; error: null };
    setupController: { start(): void };
  };
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.assign(globalThis, { startingChoice: choice, document: { body: { append() {} } } });
  try {
    const module = await bundled;
    assert.equal(await module.createSetupActions(ports).writeStartingPoint("blank"), undefined);
    const prefix = choice === "keep" ? "/my-site" : "";
    assert.ok(drafts.get("index.html")?.includes(`href="${prefix}/styles/site.css"`));
    assert.ok(drafts.get("index.html")?.includes(`href="${prefix}/"`));
    assert.equal(drafts.has(".editor/config.json"), choice === "replace");
    if (choice === "replace") assert.equal(JSON.parse(drafts.get(".editor/config.json")!).site.url, undefined);
  } finally {
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "startingChoice");
    appStore.dispose();
  }
});

test("a new load while the Starter site is fetched writes nothing and says the repository changed", async () => {
  const appStore = createAppStore(createDraftStore()), session = createWorkspaceSession(), drafts = new Map<string, string>();
  appStore.repository.value = { id: 1, name: "my-site", full_name: "user/my-site", private: false, default_branch: "main", owner: { login: "user", type: "User" } };
  appStore.snapshot.value = { branch: "main", commit: "commit", entries: [] };
  let fetched!: (value: unknown) => void, asked!: () => void;
  const starting = new Promise<void>(resolve => { asked = resolve; });
  const ports = {
    begin: () => session.begin(), appStore, draftScope: () => ({ account: "user", repoId: 1, repo: "user/my-site", branch: "main" }),
    guardedEdits: createGuardedEdits(createMemoryWorkspace({ branch: {} }).workspace),
    pathNow: () => undefined, repositoryIndex: { find: async () => undefined },
    api: <T>() => { asked(); return new Promise<T>(resolve => { fetched = resolve as (value: unknown) => void; }); }, readFile: async () => "",
    draftStore: () => ({ get: () => undefined, save: (draft: { path: string; content: string }) => { drafts.set(draft.path, draft.content); }, error: null }),
    setupController: { start() {} }, loadSnapshot: async () => {}, announce() {}, errorMessage(error: unknown) { throw error; },
  } satisfies Pick<Parameters<typeof createSetupActions>[0], "begin" | "appStore" | "draftScope" | "guardedEdits" | "pathNow" | "api" | "readFile" | "loadSnapshot" | "announce" | "errorMessage"> & {
    repositoryIndex: { find: (...args: unknown[]) => Promise<{ sha: string } | undefined> };
    draftStore: () => { get(): undefined; save(draft: { path: string; content: string }): void; error: null };
    setupController: { start(): void };
  };
  try {
    const module = await bundled;
    const written = module.createSetupActions(ports).writeStartingPoint("starter");
    await starting;
    session.next({ kind: "github", account: "user", repoId: 2, repo: "user/other", branch: "main" });
    fetched({ files: [{ path: "index.html", content: "<h1>Hi</h1>" }] });
    assert.equal(await written, "The repository changed meanwhile. Try again.");
    assert.equal(drafts.size, 0);
  } finally { appStore.dispose(); }
});
