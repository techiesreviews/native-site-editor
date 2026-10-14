import { test } from "node:test";
import assert from "node:assert/strict";
import { createFileOperationsController, type FileOperationsPorts } from "../src/controllers/file-operations-controller";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import { DraftStore } from "../src/drafts";
import { resolveNativeProject, nativePageMovedUrl, nativeSiteSettings, NATIVE_CONFIG_PATH } from "../shared/native-project";
import type { TreeEntry } from "../shared/types";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../shared/media-records";
import { gitBlobSha, memoryUploadBytes, uploadKey } from "../src/uploads";

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

test("rename refuses a target edit while the index loads", async () => {
  const h = fixture();
  h.ports.ensureNativeTextIndex = async () => { h.memory.writeDraft(target.path, "newer"); return undefined; };
  assert.equal(await h.controller.moveFileTarget(target, "b.txt", "rename"), "The repository changed meanwhile. Try again.");
  assert.deepEqual(h.memory.steps(), []); assert.equal(h.memory.workspace.source(target.path), "newer");
});

test("folder rename refuses a file added to it while its files are listed", async () => {
  const h = fixture(false, { "folder/a.txt": "a" });
  const list = h.ports.branchFilesUnder.bind(h.ports);
  h.ports.branchFilesUnder = async folder => { h.memory.writeDraft("folder/new.txt", "new"); return list(folder); };
  assert.equal(await h.controller.moveFileTarget({ path: "folder", name: "folder", folder: true }, "renamed", "rename"), "The repository changed meanwhile. Try again.");
  assert.deepEqual(h.memory.steps(), []); assert.equal(h.memory.draft("renamed/a.txt"), undefined);
});

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

test("with no file open a plain rename opens the file where it went, whose Undo takes it back; a delete has no step", async () => {
  const h = fixture(); h.memory.close();
  assert.equal(await h.controller.moveFileTarget(target, "b.txt", "rename"), undefined);
  assert.deepEqual([h.memory.workspace.exists("a.txt"), h.memory.workspace.source("b.txt")], [false, "source"]);
  assert.equal(h.memory.openFile(), "b.txt");
  assert.deepEqual(h.memory.steps(), ["operation"]);
  assert.equal(h.memory.undo(), true, h.memory.refusals.join(" "));
  assert.deepEqual([h.memory.workspace.source("a.txt"), h.memory.workspace.exists("b.txt")], ["source", false]);
  assert.equal(h.memory.announced.at(-1), "Undid renaming a.txt to b.txt.");

  const plain = fixture(); plain.memory.close();
  assert.equal(await plain.controller.deleteFileTarget(target), undefined);
  assert.equal(plain.memory.workspace.exists("a.txt"), false);
  assert.deepEqual(plain.memory.steps(), []);
});

test("with no file open, a file opened while a plain rename reads the branch refuses it", async () => {
  const h = fixture(); h.memory.close();
  const hold = h.memory.holdBranchRead();
  const renaming = h.controller.moveFileTarget(target, "b.txt", "rename");
  await hold.reached;
  await h.memory.workspace.open("open.txt");
  hold.release();
  assert.equal(await renaming, "The repository changed meanwhile. Try again.");
  assert.deepEqual([h.memory.workspace.exists("a.txt"), h.memory.workspace.exists("b.txt"), h.memory.openFile()], [true, false, "open.txt"]);
  assert.deepEqual(h.memory.steps(), []);
});

test("with no file open, Undo of a plain rename refuses once the file changed", async () => {
  const h = fixture(); h.memory.close();
  await h.controller.moveFileTarget(target, "b.txt", "rename");
  h.memory.typeInto("b.txt", "edited");
  assert.equal(h.memory.undo(), false);
  assert.equal(h.memory.workspace.source("b.txt"), "edited");
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

const imageTarget = { path: "images/photo.webp", name: "photo.webp", folder: false };
const imageFamily = { "images/photo.webp": "main", "images/photo-480w.webp": "copy", "media/originals/photo.HEIC": "original" };

test("Files rename moves the family and rewrites srcset in one plan", async () => {
  const h = fixture(true, { ...imageFamily, "index.html": '<img src="/images/photo.webp" srcset="/images/photo-480w.webp 480w">' });
  assert.equal(await h.controller.moveFileTarget(imageTarget, "new/garden.webp", "rename"), undefined);
  for (const path of ["new/garden.webp", "new/garden-480w.webp", "media/originals/garden.HEIC"]) assert.ok(h.memory.workspace.exists(path));
  assert.match(h.memory.workspace.source("index.html")!, /garden-480w.webp 480w/);
  assert.deepEqual(h.memory.steps(), ["operation"]); assert.equal(h.memory.undo(), true);
  for (const path of Object.keys(imageFamily)) assert.ok(h.memory.workspace.exists(path));
});

test("Files delete removes the family in one plan and explains the members", async () => {
  const h = fixture(true, imageFamily); let notes: string[] = [];
  h.ports.confirmDialog = () => ({ ask: async question => { notes = question.notes ?? []; return true; }, choose: async () => ({ value: "go", option: false }) });
  assert.equal(await h.controller.deleteFileTarget(imageTarget), undefined);
  assert.match(notes.join(" "), /1 smaller copy and 1 kept original/);
  for (const path of Object.keys(imageFamily)) assert.equal(h.memory.workspace.exists(path), false);
  const entry = parseMediaRecords(h.memory.workspace.source(MEDIA_RECORDS_PATH)).removed![0];
  assert.equal(entry.path, imageTarget.path); assert.ok(entry.sha);
  assert.deepEqual(entry.family?.map(member => member.path), ["images/photo-480w.webp", "media/originals/photo.HEIC"]);
  assert.deepEqual(h.memory.steps(), ["operation"]); assert.equal(h.memory.undo(), true);
  assert.equal(h.memory.workspace.exists(MEDIA_RECORDS_PATH), false);
  for (const path of Object.keys(imageFamily)) assert.ok(h.memory.workspace.exists(path));
});

test("Files delete moves family records into Recently removed and Undo returns them", async () => {
  const records = { version: 2, collections: ["Work"], files: {
    [imageTarget.path]: { collections: ["Work"], alwaysKeep: true },
    "images/photo-480w.webp": { decorative: true },
  } };
  const h = fixture(true, { ...imageFamily, [MEDIA_RECORDS_PATH]: JSON.stringify(records) });
  assert.equal(await h.controller.deleteFileTarget(imageTarget), undefined);
  const after = parseMediaRecords(h.memory.workspace.source(MEDIA_RECORDS_PATH));
  assert.deepEqual(after.removed![0].record, records.files[imageTarget.path]);
  assert.deepEqual(after.removed![0].family![0].record, { decorative: true });
  assert.equal(Object.keys(after.files).length, 0); assert.deepEqual(h.memory.steps(), ["operation"]);
  assert.equal(h.memory.undo(), true); assert.deepEqual(JSON.parse(h.memory.workspace.source(MEDIA_RECORDS_PATH)!), records);
});

test("a family back through Files Restore keeps every member's records on the next Files delete", async () => {
  const records = { version: 2, collections: ["Work"], files: {
    [imageTarget.path]: { collections: ["Work"] }, "images/photo-480w.webp": { alwaysKeep: true }, "media/originals/photo.HEIC": { collections: ["Work"] },
  } };
  const h = fixture(true, { ...imageFamily, "images/other.webp": "other", [MEDIA_RECORDS_PATH]: JSON.stringify(records) });
  assert.equal(await h.controller.deleteFileTarget(imageTarget), undefined);
  // Files' Restore: the deletions go, the records draft stays.
  for (const [path, text] of Object.entries(imageFamily)) h.memory.writeDraft(path, text);
  assert.equal(await h.controller.deleteFileTarget({ path: "images/other.webp", name: "other.webp", folder: false }), undefined);
  const after = parseMediaRecords(h.memory.workspace.source(MEDIA_RECORDS_PATH));
  for (const [path, record] of Object.entries(records.files)) assert.deepEqual(after.files[path], record);
  assert.deepEqual(after.removed?.map(entry => entry.path), ["images/other.webp"]);
});

test("Files delete keeps browser copies of unsaved family members once Delete is confirmed", async () => {
  const h = fixture(true, imageFamily);
  const uploads = memoryUploadBytes(), removed = memoryUploadBytes();
  h.ports.removalStores = () => ({ uploads, removed });
  const drafts = h.ports.draftStore.bind(h.ports);
  h.ports.draftStore = () => Object.assign(drafts(), { get: (_: unknown, path: string) => h.memory.draft(path) });
  // An unsaved responsive copy held as text, and an unsaved upload whose bytes only this browser has.
  h.memory.writeDraft("images/photo-960w.webp", "unsaved copy");
  h.memory.writeDraft("images/photo-1600w.webp", "");
  Object.assign(h.memory.draft("images/photo-1600w.webp")!, { opaque: true, sourceSha: "upload-sha", upload: { size: 6, type: "image/webp" } });
  await uploads.put(uploadKey(h.memory.scope, "upload-sha"), new Blob(["upload"]));
  let asked = false;
  h.ports.confirmDialog = () => ({ ask: async () => { asked = true; assert.equal(removed.map.size, 0); return true; }, choose: async () => ({ value: "go", option: false }) });
  assert.equal(await h.controller.deleteFileTarget(imageTarget), undefined);
  assert.ok(asked);
  const entry = parseMediaRecords(h.memory.workspace.source(MEDIA_RECORDS_PATH)).removed![0];
  const member = (path: string) => entry.family!.find(item => item.path === path)!;
  assert.equal(member("images/photo-960w.webp").browserKey, `removed:${new Date().toISOString().slice(0, 10)}:${await gitBlobSha(new TextEncoder().encode("unsaved copy"))}`);
  assert.equal(await removed.map.get(member("images/photo-960w.webp").browserKey!)!.text(), "unsaved copy");
  assert.equal(await removed.map.get(member("images/photo-1600w.webp").browserKey!)!.text(), "upload");
  assert.ok(member("images/photo-480w.webp").sha);
});

test("Files delete cancelled keeps no browser copies", async () => {
  const h = fixture(true, imageFamily);
  const removed = memoryUploadBytes();
  h.ports.removalStores = () => ({ uploads: memoryUploadBytes(), removed });
  h.memory.writeDraft("images/photo-960w.webp", "unsaved copy");
  h.ports.confirmDialog = () => ({ ask: async () => false, choose: async () => ({ value: undefined, option: false }) });
  assert.equal(await h.controller.deleteFileTarget(imageTarget), "Cancelled.");
  assert.equal(removed.map.size, 0); assert.equal(h.memory.workspace.exists(MEDIA_RECORDS_PATH), false);
});

test("Files delete records a kept original of any format with its family", async () => {
  const h = fixture(true, { "images/photo.webp": "main", "media/originals/photo.tiff": "original" });
  assert.equal(await h.controller.deleteFileTarget(imageTarget), undefined);
  const entry = parseMediaRecords(h.memory.workspace.source(MEDIA_RECORDS_PATH)).removed![0];
  assert.equal(entry.path, imageTarget.path);
  assert.deepEqual(entry.family?.map(member => member.path), ["media/originals/photo.tiff"]);
  assert.ok(entry.family?.[0].sha);
});

test("Files media delete refuses malformed or unreadable records", async () => {
  for (const unreadable of [false, true]) {
    const h = fixture(true, { ...imageFamily, [MEDIA_RECORDS_PATH]: "malformed" });
    const source = h.memory.workspace.source.bind(h.memory.workspace);
    if (unreadable) h.memory.workspace.source = path => path === MEDIA_RECORDS_PATH ? undefined : source(path);
    assert.match(await h.controller.deleteFileTarget(imageTarget) ?? "", /media.json/);
    assert.deepEqual(h.memory.steps(), []); assert.ok(h.memory.workspace.exists(imageTarget.path));
  }
});

test("taken family destination refuses the whole Files rename", async () => {
  const h = fixture(true, { ...imageFamily, "images/garden-480w.webp": "taken" });
  assert.match((await h.controller.moveFileTarget(imageTarget, "images/garden.webp", "rename"))!, /is taken. Try images\/garden-2.webp/);
  assert.deepEqual(h.memory.steps(), []); assert.ok(h.memory.workspace.exists(imageTarget.path));
});

test("a used copy blocks Files family delete", async () => {
  const h = fixture(true, { ...imageFamily, "index.html": '<img src="/images/photo-480w.webp">' });
  assert.ok(await h.controller.deleteFileTarget(imageTarget));
  assert.deepEqual(h.memory.steps(), []);
});

test("moving a copy alone leaves its main and original", async () => {
  const h = fixture(true, imageFamily);
  assert.equal(await h.controller.moveFileTarget({ path: "images/photo-480w.webp", name: "photo-480w.webp", folder: false }, "images/copy.webp", "move"), undefined);
  assert.ok(h.memory.workspace.exists(imageTarget.path)); assert.ok(h.memory.workspace.exists("media/originals/photo.HEIC"));
});

test("Restore on a deleted main brings back its deleted family, not members renamed away", () => {
  const h = fixture(true);
  const draft = { ...h.memory.scope, version: 1 as const, path: "", baseSha: "sha", original: "", content: "", updatedAt: 1, deleted: true as const };
  const gone = (path: string, movedTo?: string) => [path, { ...draft, path, ...(movedTo ? { movedTo } : {}) }] as const;
  h.ports.treeState = () => ({ changes: new Map(), drafted: [], deleted: new Map([
    gone("images/photo.webp"), gone("images/photo-480w.webp"), gone("media/originals/photo.HEIC"),
    gone("images/photo-960w.webp", "images/kept-960w.webp"), gone("images/other-480w.webp"),
  ]) });
  h.controller.restoreFileTarget({ ...imageTarget, gone: true });
  assert.deepEqual(h.restored, [["images/photo.webp", "images/photo-480w.webp", "media/originals/photo.HEIC"]]);
});

for (const keep of [undefined, false, true]) test(`Files media rename rewrites all text, follows records, forwarding ${keep}, one Undo without a page`, async () => {
  const h = fixture(true, {
    "images/a.webp": "binary", "images/a-480.webp": "copy",
    "app.js": 'const image = "/images/a.webp";',
    ".editor/media.json": '{"version":2,"collections":["Travel"],"files":{"images/a.webp":{"alwaysKeep":true,"collections":["Travel"],"description":{"text":"Tram"}}}}',
  });
  h.memory.close();
  assert.equal(await h.controller.moveFileTarget({ path: "images/a.webp", name: "a.webp", folder: false }, "other/garden.webp", "move", { keepOldAddress: keep }), undefined);
  assert.equal(h.memory.workspace.source("app.js"), 'const image = "/other/garden.webp";');
  assert.equal(h.memory.workspace.source("_redirects"), keep === false ? undefined : '/images/a.webp /other/garden.webp 301\n/images/a-480.webp /other/garden-480.webp 301\n');
  const records = JSON.parse(h.memory.workspace.source(".editor/media.json")!);
  assert.equal(records.files["other/garden.webp"].alwaysKeep, true);
  assert.deepEqual(records.files["other/garden.webp"].collections, ["Travel"]);
  assert.equal(records.files["other/garden.webp"].description.text, "Tram");
  assert.deepEqual(h.memory.steps(), ["operation"]);
  assert.equal(h.memory.undo(), true);
  assert.equal(h.memory.workspace.source("app.js"), 'const image = "/images/a.webp";');
  assert.equal(h.memory.workspace.source("_redirects"), undefined);
  assert.equal(await h.memory.redo(), true);
  assert.equal(h.memory.workspace.source("app.js"), 'const image = "/other/garden.webp";');
});

test("a wider text read outside the preview baseline stays proved through structural Undo and Redo", async () => {
  const h = fixture(true, { "images/a.webp": "binary", "images/untouched.svg": '<svg/>', "notes.md": 'No image mentions.' });
  const base = h.memory.workspace.base.bind(h.memory.workspace);
  h.memory.workspace.base = path => ["images/untouched.svg", "notes.md"].includes(path) ? undefined : base(path);
  assert.equal(await h.controller.moveFileTarget({ path: "images/a.webp", name: "a.webp", folder: false }, "images/b.webp", "rename"), undefined);
  assert.equal(h.memory.undo(), true);
  assert.equal(h.memory.redo(), true);
  h.memory.writeDraft("notes.md", "Changed meanwhile");
  assert.equal(h.memory.undo(), false);
});

test("Files rename of a font is a plain file rename: no media tidying of its name", async () => {
  const h = fixture(true, { "fonts/Inter-Bold.woff2": "binary", "app.js": 'const font = "/fonts/Inter-Bold.woff2";' });
  assert.equal(await h.controller.moveFileTarget({ path: "fonts/Inter-Bold.woff2", name: "Inter-Bold.woff2", folder: false }, "fonts/Inter SemiBold.woff2", "rename"), undefined);
  assert.ok(h.memory.workspace.exists("fonts/Inter SemiBold.woff2"));
  assert.equal(h.memory.workspace.source("_redirects"), undefined);
});

test("Files rename of a media file tidies any language and suggests a free name for a taken one", async () => {
  const h = fixture(true, { ...imageFamily, "images/my-photo.webp": "taken" });
  assert.match(h.controller.fileMoveProblem(imageTarget, "images/my-photo.webp", "rename")!, /images\/my-photo.webp is taken. Try images\/my-photo-2.webp/);
  assert.equal(h.controller.fileMoveProblem(imageTarget, "images/京都.webp", "rename"), undefined);
  assert.equal(await h.controller.moveFileTarget(imageTarget, "images/Kyoto Night 京都!.webp", "rename"), undefined);
  assert.ok(h.memory.workspace.exists("images/kyoto-night-京都.webp"));
});
