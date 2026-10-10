import { test } from "node:test";
import assert from "node:assert/strict";
import { createFileOperationsController, type FileOperationsPorts } from "../src/controllers/file-operations-controller";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import { DraftStore } from "../src/drafts";
import { resolveNativeProject, nativePageMovedUrl, nativeSiteSettings, NATIVE_CONFIG_PATH } from "../shared/native-project";
import type { TreeEntry } from "../shared/types";

function fixture(native = false, extra: Record<string, string> = {}) {
  const branch: Record<string, string> = native ? { "index.html": '<a href="/about/">About</a>', "about/index.html": '<h1>About</h1>', "style.css": "" } : { "open.txt": "open", "a.txt": "source" };
  Object.assign(branch, extra);
  const parsed = resolveNativeProject(Object.keys(branch));
  const memory = createMemoryWorkspace({ branch, open: native ? "index.html" : "open.txt", site: native && parsed.ok ? parsed.site : undefined });
  const edits = createGuardedEdits(memory.workspace), errors: string[] = [], refused: string[] = [], restored: string[][] = [], focused: string[] = [];
  const store = new DraftStore({ getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 });
  const entries: TreeEntry[] = Object.keys(branch).map((path, n) => ({ path, type: "blob", sha: `sha-${n}`, mode: "100644" }));
  let copied = 0;
  const ports: FileOperationsPorts = {
    edits, parentOf: (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
    draftScope: () => memory.scope, engaged: () => native, repository: () => ({ full_name: "lex/site" }),
    treeState: () => ({ changes: new Map(), deleted: new Map(memory.files().flatMap(path => { const draft = memory.draft(path); return draft?.deleted ? [[path, draft] as const] : []; })), drafted: memory.files().filter(path => !Object.hasOwn(branch, path)) }),
    pathNow: (path: string) => memory.files().includes(path) ? "file" : memory.workspace.exists(path) ? "folder" : undefined,
    branchFilesUnder: async (folder: string) => entries.filter(entry => entry.path.startsWith(`${folder}/`)),
    findEntry: async (path: string) => entries.find(entry => entry.path === path),
    // The memory workspace's drafts, as the host's draft store lists them.
    draftStore: () => Object.assign(store, { list: () => [...new Set([...Object.keys(branch), ...memory.files()])].flatMap(path => { const draft = memory.draft(path); return draft ? [draft] : []; }) }), baseSource: (path: string) => edits.peek.source(path), readFiles: async () => ({}), readFile: async () => "",
    nativeFiles: () => memory.files(), ensureNativeTextIndex: async () => undefined, branchPathProblem: async () => undefined,
    onBranchHere: (path: string) => Object.hasOwn(branch, path),
    withMovedPageUrls: (writes, pages, r) => {
      const url = nativeSiteSettings(r.source(NATIVE_CONFIG_PATH)).url;
      for (const page of pages) {
        const source = r.source(page.file), path = page.moved ?? page.file;
        if (source !== undefined) writes.set(path, nativePageMovedUrl(writes.get(path) ?? source, page.from, page.to, url));
      }
    }, readNativeRedirects: async () => undefined,
    confirmDialog: () => ({ ask: async () => true, choose: async () => ({ value: "go", option: false }) }),
    undoFileChanges: ({ restore }: { restore?: string[] }) => { restored.push(restore ?? []); }, duplicateFile: () => { copied++; return true; },
    afterFileChanges: () => {}, announce: (message: string) => memory.announced.push(message), refuse: (message: string) => refused.push(message), errorMessage: (error: unknown) => errors.push((error as Error).message),
    requestAnimationFrame: (callback: () => void) => callback(), openFolder: () => {}, fileRow: (path: string) => ({ focus: () => focused.push(path) }), renderFileTree: () => {}, filesTabOpen: () => true,
  } satisfies FileOperationsPorts;
  return { ports, memory, errors, refused, restored, focused, copied: () => copied, controller: createFileOperationsController(ports) };
}
const target = { path: "a.txt", name: "a.txt", folder: false };
const page = { path: "about/index.html", name: "index.html", folder: false };

for (const stage of ["branchPathProblem", "findEntry"] as const) {
  test(`rename refuses a branch switch during ${stage}`, async () => {
    const h = fixture(), held = deferred(), reached = deferred();
    const original = h.ports.findEntry.bind(h.ports);
    if (stage === "branchPathProblem") h.ports.branchPathProblem = async () => { reached.resolve(); await held.promise; return undefined; };
    else h.ports.findEntry = async path => { reached.resolve(); await held.promise; return original(path); };
    const action = h.controller.moveFileTarget(target, "b.txt", "rename");
    await reached.promise; h.memory.setScope("lex/site@other"); held.resolve();
    assert.equal(await action, "The repository changed meanwhile. Try again.");
    assert.deepEqual(h.memory.steps(), []); assert.equal(h.memory.draft("b.txt"), undefined);
  });
}

test("plain rename records one receipt; undo refuses an edit to the moved file", async () => {
  const h = fixture();
  assert.equal(await h.controller.moveFileTarget(target, "b.txt", "rename"), undefined);
  assert.deepEqual(h.memory.steps(), ["operation"]);
  h.memory.writeDraft("b.txt", "edited after rename");
  const draft = h.memory.draft("b.txt");
  assert.equal(h.memory.undo(), false); assert.ok(h.memory.refusals.length); assert.deepEqual(h.memory.draft("b.txt"), draft);
});

test("plain delete goes through the module and undoes as one step", async () => {
  const h = fixture();
  assert.equal(await h.controller.deleteFileTarget(target), undefined);
  assert.deepEqual(h.memory.steps(), ["operation"]); assert.equal(h.memory.draft("a.txt")?.deleted, true);
  assert.equal(h.memory.undo(), true); assert.equal(h.memory.workspace.source("a.txt"), "source");
});

for (const url of [false, true]) {
  test(`${url ? "URL choose" : "link-note ask"} move refuses a changed source while answering`, async () => {
    const h = fixture(true);
    let asked = 0;
    h.ports.confirmDialog = () => ({
      ask: async () => { asked++; h.memory.writeDraft(page.path, "changed"); return true; },
      choose: async () => { asked++; h.memory.writeDraft(page.path, "changed"); return { value: "go", option: false }; },
    });
    const error = await h.controller.moveFileTarget(page, url ? "renamed/index.html" : "about/page.txt", "rename");
    assert.equal(asked, 1); assert.match(error!, url ? /site changed while the Rename dialog was open/ : /repository changed meanwhile/);
    assert.deepEqual(h.memory.steps(), []);
  });
}

for (const change of ["edit", "branch"] as const) {
  test(`delete refuses a target ${change} while the index loads, before its dialog opens`, async () => {
    const h = fixture();
    let asked = 0;
    h.ports.ensureNativeTextIndex = async () => { if (change === "edit") h.memory.writeDraft(target.path, "newer"); else h.memory.setScope("lex/site@feature"); return undefined; };
    h.ports.confirmDialog = () => ({ ask: async () => { asked++; return true; }, choose: async () => ({ value: "go", option: false }) });
    assert.equal(await h.controller.deleteFileTarget(target), "The repository or source changed meanwhile. Try again.");
    assert.equal(asked, 0); assert.deepEqual(h.memory.steps(), []);
  });
}

test("delete refuses a dialog-time source edit with its existing message", async () => {
  const h = fixture();
  h.ports.confirmDialog = () => ({ ask: async () => { h.memory.writeDraft(target.path, "changed"); return true; }, choose: async () => ({ value: "go", option: false }) });
  assert.equal(await h.controller.deleteFileTarget(target), "The repository or source changed meanwhile. Try again.");
  assert.deepEqual(h.memory.steps(), []); assert.equal(h.memory.workspace.source(target.path), "changed");
});

for (const action of ["delete", "move", "url"] as const) {
  test(`cancelled ${action} announces cancellation even with a stale workspace`, async () => {
    const h = fixture(action === "url");
    h.ports.confirmDialog = () => ({ ask: async () => { h.memory.bumpGeneration(); return false; }, choose: async () => { h.memory.bumpGeneration(); return { value: undefined, option: false }; } });
    if (action === "delete") assert.equal(await h.controller.deleteFileTarget(target), "Cancelled.");
    else if (action === "url") assert.equal(await h.controller.moveFileTarget(page, "renamed/index.html", "rename"), undefined);
    else {
      // No link note in a plain repository: supply a native page losing its URL.
      const native = fixture(true);
      native.ports.confirmDialog = () => ({ ask: async () => { native.memory.bumpGeneration(); return false; }, choose: async () => ({ value: undefined, option: false }) });
      assert.equal(await native.controller.moveFileTarget(page, "page.txt", "move"), undefined);
      assert.match(native.memory.announced.at(-1)!, /Cancelled moving/); assert.deepEqual(native.memory.steps(), []);
      return;
    }
    assert.match(h.memory.announced.at(-1)!, /Cancelled/); assert.deepEqual(h.memory.steps(), []); assert.deepEqual(h.errors, []);
  });
}

test("duplicate refuses a repository switch before making its draft copy", async () => {
  const h = fixture(), original = h.ports.findEntry.bind(h.ports);
  h.ports.findEntry = async path => { h.memory.bumpGeneration(); return original(path); };
  await h.controller.duplicateFileTarget(target);
  assert.equal(h.copied(), 0); assert.match(h.refused[0], /repository changed meanwhile/);
});

test("duplicate stays a draft copy outside operation history", async () => {
  const h = fixture(); await h.controller.duplicateFileTarget(target);
  assert.equal(h.copied(), 1); assert.deepEqual(h.memory.steps(), []);
});

test("a changed file list refuses a URL move", async () => {
  const h = fixture(true);
  h.ports.confirmDialog = () => ({ ask: async () => true, choose: async () => { h.memory.writeDraft("new.txt", "new"); return { value: "go", option: false }; } });
  assert.match((await h.controller.moveFileTarget(page, "new/index.html", "rename"))!, /site changed/);
  assert.deepEqual(h.memory.steps(), []);
});

test("asset in use refuses deletion", async () => {
  const h = fixture(true); h.memory.typeInto("index.html", '<link rel="stylesheet" href="/style.css">');
  assert.ok(await h.controller.deleteFileTarget({ path: "style.css", name: "style.css", folder: false }));
  assert.ok(h.refused.length); assert.deepEqual(h.memory.steps(), []);
});

test("without a mounted open file plain file operations refuse", async () => {
  const h = fixture(); h.memory.close();
  assert.equal(await h.controller.moveFileTarget(target, "b.txt", "rename"), "Open a page before changing these files.");
  assert.equal(await h.controller.deleteFileTarget(target), "Open a page before changing these files.");
  assert.deepEqual(h.memory.steps(), []);
});

test("restore expands current folder deletions and focuses the row", () => {
  const h = fixture();
  const draft = { ...h.memory.scope, version: 1 as const, path: "pages/a.html", baseSha: "sha", original: "", content: "", updatedAt: 1, deleted: true as const };
  h.ports.treeState = () => ({ changes: new Map(), deleted: new Map([[draft.path, draft], ["pages/b.html", { ...draft, path: "pages/b.html" }], ["other.html", { ...draft, path: "other.html" }]]), drafted: [] });
  h.controller.restoreFileTarget({ path: "pages", name: "pages", folder: true, gone: true });
  assert.deepEqual(h.restored, [["pages/a.html", "pages/b.html"]]); assert.deepEqual(h.focused, ["pages"]);
  h.controller.restoreFileTarget({ path: "other.html", name: "other.html", folder: false, gone: true });
  assert.deepEqual(h.restored[1], ["other.html"]);
});


test("native rename updates links and existing redirects as one step", async () => {
  const h = fixture(true, { "_redirects": "/old/ /about/ 301\n" });
  h.ports.confirmDialog = () => ({ ask: async () => true, choose: async () => ({ value: "go", option: true }) });
  assert.equal(await h.controller.moveFileTarget(page, "renamed/index.html", "rename"), undefined);
  assert.deepEqual(h.memory.steps(), ["operation"]);
  assert.match(h.memory.workspace.source("index.html")!, /href="\/renamed\/"/);
  assert.match(h.memory.workspace.source("_redirects")!, /\/old\/\s+\/renamed\//);
  assert.equal(h.memory.undo(), true); assert.equal(h.memory.workspace.source("_redirects"), "/old/ /about/ 301\n");
});

test("native rename creates absent redirects in its same step", async () => {
  const h = fixture(true);
  h.ports.confirmDialog = () => ({ ask: async () => true, choose: async () => ({ value: "go", option: true }) });
  assert.equal(await h.controller.moveFileTarget(page, "renamed/index.html", "rename"), undefined);
  assert.match(h.memory.workspace.source("_redirects")!, /\/about\/\s+\/renamed\//);
  assert.equal(h.memory.undo(), true); assert.equal(h.memory.workspace.source("_redirects"), undefined);
});

test("rename refuses source drift during redirects loading", async () => {
  const h = fixture(true);
  h.ports.readNativeRedirects = async () => { h.memory.writeDraft(page.path, "edited during redirects read"); return undefined; };
  assert.match((await h.controller.moveFileTarget(page, "renamed/index.html", "rename"))!, /site changed/);
  assert.deepEqual(h.memory.steps(), []);
});

test("asset rename rewrites stylesheet references in the same receipt", async () => {
  const h = fixture(true);
  h.memory.typeInto("index.html", '<link rel="stylesheet" href="/style.css">');
  assert.equal(await h.controller.moveFileTarget({ path: "style.css", name: "style.css", folder: false }, "new.css", "rename"), undefined);
  assert.match(h.memory.workspace.source("index.html")!, /href="\/new.css"/);
  assert.deepEqual(h.memory.steps(), ["operation"]); assert.equal(h.memory.undo(), true);
  assert.match(h.memory.workspace.source("index.html")!, /href="\/style.css"/);
});

test("restore uses the current deletions and defers focus to the next frame", () => {
  const h = fixture(), frames: (() => void)[] = [];
  const draft = { ...h.memory.scope, version: 1 as const, path: "pages/new.html", baseSha: "sha", original: "", content: "", updatedAt: 1, deleted: true as const };
  h.ports.requestAnimationFrame = callback => { frames.push(callback); };
  h.ports.treeState = () => ({ changes: new Map(), deleted: new Map([[draft.path, draft]]), drafted: [] });
  h.controller.restoreFileTarget({ path: "pages", name: "pages", folder: true, gone: true });
  assert.deepEqual(h.restored, [["pages/new.html"]]); assert.deepEqual(h.focused, []);
  frames[0](); assert.deepEqual(h.focused, ["pages"]);
});
