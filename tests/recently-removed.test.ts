import test from "node:test";
import assert from "node:assert/strict";
import { parseMediaRecords, serializeMediaRecords } from "../shared/media-records";
import { recordRemoval, planRestore, recentlyRemoved, pruneRemoved, removedToday, sweepRemovedCopies } from "../src/page-builder/recently-removed";
import { memoryUploadBytes, uploadKey, gitBlobSha } from "../src/uploads";
import { createMediaWorkspace, applyMediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { mediaDraftTransaction, type MediaDraftHost } from "../src/page-builder/media-draft-transaction";
import { listChanges, publishFiles } from "../src/file-changes";
import type { SavedDraft } from "../src/drafts";

const date = "2026-10-14";
function fixture() {
  const records = parseMediaRecords(undefined);
  records.files["media/a.webp"] = { collections: ["Work"], alwaysKeep: true, description: { text: "A", byAgent: true }, future: 1 };
  records.files["media/a-480.webp"] = { decorative: true, future: 2 };
  records.files["media/originals/a.heic"] = { future: 3 };
  records.files["media/a-crop.webp"] = { trimmedFrom: { source: "media/a.webp", trim: { x: 0, y: 0, width: 0.5, height: 1 } } };
  const family = [{ path: "media/a.webp", sha: "main" }, { path: "media/a-480.webp", sha: "copy" }, { path: "media/originals/a.heic", sha: "original" }];
  return { records, family, removed: recordRemoval(records, { main: family[0].path, family, date }) };
}

test("removal preserves each family record and identity; a trimmed copy stays separate", () => {
  const { records, removed, family } = fixture();
  assert.equal(removed.removed?.length, 1);
  const entry = removed.removed![0];
  assert.equal(entry.date, date); assert.equal(entry.sha, "main");
  for (const member of [entry, ...entry.family!]) {
    assert.equal(removed.files[member.path], undefined);
    assert.deepEqual(member.record, records.files[member.path]);
  }
  assert.deepEqual(removed.files["media/a-crop.webp"], records.files["media/a-crop.webp"]);
  const plan = planRestore(removed, { path: entry.path, id: "main" }, ["media/a-crop.webp"], date);
  assert.deepEqual(plan.members, family);
  assert.deepEqual(plan.records.files, records.files);
  assert.equal(plan.records.removed?.length, 0);
  assert.deepEqual(parseMediaRecords(serializeMediaRecords(removed)).removed![0].family![0].record, records.files[family[1].path]);
});

test("a taken member refuses the whole family; identity uses path and blob", () => {
  const { removed } = fixture();
  assert.throws(() => planRestore(removed, { path: "media/a.webp", id: "wrong" }, [], date), /no longer/);
  assert.throws(() => planRestore(removed, { path: "media/a.webp", id: "main" }, ["media/a-480.webp"], date), /media\/a-480.webp already exists/);
  assert.throws(() => planRestore(removed, { path: "media/a.webp", id: "main" }, ["media"], date), /media already exists/);
  assert.equal(removed.removed?.length, 1); assert.equal(removed.files["media/a.webp"], undefined);
});

test("30 days stay; 31 days expire from views, writes, restores and browser storage", async () => {
  const { removed } = fixture(), store = memoryUploadBytes();
  const key = `removed:${date}:hash`;
  await store.put(key, new Blob(["bytes"])); await store.put("other", new Blob(["keep"]));
  assert.equal(removedToday(Date.parse("2026-10-14T23:59:59Z")), date);
  assert.equal(pruneRemoved(removed, "2026-11-13").removed?.length, 1);
  assert.equal(pruneRemoved(removed, "2026-11-14").removed?.length, 0);
  assert.equal(recentlyRemoved(removed, "2026-11-14", () => undefined).length, 0);
  assert.throws(() => planRestore(removed, { path: "media/a.webp", id: "main" }, [], "2026-11-14"), /no longer/);
  await sweepRemovedCopies(store, "2026-11-13"); assert.ok(await store.get(key));
  await sweepRemovedCopies(store, "2026-11-14"); assert.equal(await store.get(key), undefined); assert.ok(await store.get("other"));
});

test("already-back entries hide only when the main has its recorded blob", () => {
  const { removed } = fixture();
  assert.equal(recentlyRemoved(removed, date, path => path === "media/a.webp" ? "main" : undefined).length, 0);
  assert.equal(recentlyRemoved(removed, date, () => "another").length, 1);
});

test("an entry back already returns its records to the files that are back", () => {
  const { records, removed } = fixture();
  const back = pruneRemoved(removed, date, path => ({ "media/a.webp": "main", "media/a-480.webp": "copy" } as Record<string, string>)[path]);
  assert.equal(back.removed?.length ?? 0, 0);
  assert.deepEqual(back.files["media/a.webp"], records.files["media/a.webp"]);
  assert.deepEqual(back.files["media/a-480.webp"], records.files["media/a-480.webp"]);
  // A member that did not come back gets no record; a newer record at an address is kept.
  assert.equal(back.files["media/originals/a.heic"], undefined);
  const newer = { ...removed, files: Object.assign(Object.create(null), removed.files, { "media/a.webp": { collections: ["New"] } }) };
  assert.deepEqual(pruneRemoved(newer, date, () => "main").files["media/a.webp"], { collections: ["New"] });
});

test("newest first includes removals on the same day; pruning keeps append order for future writes", () => {
  const { removed } = fixture();
  const next = recordRemoval(removed, { main: "newer.png", family: [{ path: "newer.png", sha: "newer" }], date });
  assert.deepEqual(recentlyRemoved(next, date, () => undefined).map(entry => entry.path), ["newer.png", "media/a.webp"]);
  assert.deepEqual(pruneRemoved(next, date).removed?.map(entry => entry.path), ["media/a.webp", "newer.png"]);
});

test("family records are validated and unknown keys survive", () => {
  const { removed } = fixture();
  const source = serializeMediaRecords(removed).replace('"decorative": true', '"alwaysKeep": "bad"');
  assert.throws(() => parseMediaRecords(source), /family\[0\].record.alwaysKeep/);
});

function engine(history = true) {
  const scope = { account: "a", repoId: 1, repo: "a/r", branch: "main" };
  const drafts = new Map<string, SavedDraft>(), branch = new Map([["a.png", "blob-main"], ["a-480.png", "blob-copy"], ["media/originals/a.heic", "blob-original"], ["a-crop.png", "blob-crop"]]);
  const bytes = memoryUploadBytes(), removedCopies = memoryUploadBytes();
  const store = { get: (_: typeof scope, path: string) => drafts.get(path), list: () => [...drafts.values()], error: null,
    save: (draft: SavedDraft) => { drafts.set(draft.path, draft); return true; }, remove: (_: typeof scope, path: string) => { drafts.delete(path); return true; } };
  const paths = () => [...new Set([...branch.keys(), ...drafts.keys()])].filter(path => !drafts.get(path)?.deleted);
  const source = (path: string) => drafts.get(path)?.deleted ? undefined : drafts.get(path)?.opaque ? undefined : drafts.get(path)?.content;
  const assetVersion = (path: string) => drafts.has(path) ? JSON.stringify(drafts.get(path)) : branch.get(path);
  const steps: { undo(): boolean; redo(): boolean | Promise<boolean> }[] = [];
  const host = { scope, store, bytes, stamp: { holds: () => true, changed: () => undefined }, paths, source, assetVersion,
    entry: async (path: string) => branch.has(path) ? { path, sha: branch.get(path)! } : undefined,
    mounted: () => false, prepareSources: () => ({ apply: () => true, undo: () => true, redo: () => true, isCurrent: () => true }),
    modelState: () => ({ isCurrent: () => true }), evictModel: () => ({ isCurrent: () => true }), historyCurrent: () => true,
    history: (undo, redo) => { steps.push({ undo, redo }); return true; }, refresh: () => {}, announce: () => {},
  } satisfies MediaDraftHost;
  const context = { key: "a/r", scope, drafts: store, history, removedCopies, now: () => Date.parse(date),
    get paths() { return paths(); }, get items() { return paths().filter(path => path !== ".editor/media.json").map(path => ({ path })); },
    pages: [], components: {}, assertLive: () => {}, read: async (path: string) => {
      const draft = drafts.get(path);
      return draft?.opaque ? draft.upload ? (await bytes.get(uploadKey(scope, draft.sourceSha!)))?.text() : "<svg></svg>" : source(path);
    },
    blob: async (path: string) => {
      const draft = drafts.get(path);
      return draft?.upload ? (await bytes.get(uploadKey(scope, draft.sourceSha!)))! : new Blob([path]);
    }, assetVersion, applyBatch: batch => applyMediaWorkspaceBatch(batch, mediaDraftTransaction(host)), openPage: async () => {},
  } satisfies MediaWorkspaceContext;
  return { workspace: createMediaWorkspace(async () => context), branch, drafts, bytes, removedCopies, context, steps, scope };
}

test("repository families restore before saving by dropping deletion drafts, with one Undo/Redo", async () => {
  const f = engine(); await f.workspace.load(); await f.workspace.remove(["a.png"]);
  const entry = (await f.workspace.load()).removed![0];
  assert.equal(entry.sha, "blob-main"); assert.equal(entry.family?.length, 2);
  assert.ok(f.branch.has("a-crop.png")); assert.equal(f.drafts.get("a-crop.png"), undefined);
  await f.workspace.restore([{ path: entry.path, id: entry.sha! }]);
  assert.equal(f.drafts.get("a.png"), undefined); assert.equal(f.drafts.get("a-480.png"), undefined);
  assert.equal(f.steps.length, 2); assert.equal((await f.workspace.load()).removed?.length, 0);
  assert.equal(f.steps[1].undo(), true); assert.equal((await f.workspace.load()).removed?.length, 1);
  assert.equal(await f.steps[1].redo(), true); assert.equal((await f.workspace.load()).removed?.length, 0);
});

test("a Restore outside Media (Files or Save) brings the records back with the files", async () => {
  const f = engine(); await f.workspace.load();
  await f.workspace.collections({ kind: "new", name: "Work", paths: ["a.png"] });
  await f.workspace.remove(["a.png"]);
  assert.deepEqual((await f.workspace.load()).metadata["a.png"], undefined);
  // The Files tab's Restore drops the deletion drafts and leaves the records draft as it is.
  for (const [path, draft] of f.drafts) if (draft.deleted) f.drafts.delete(path);
  const library = await f.workspace.load();
  assert.equal(library.removed?.length, 0); assert.deepEqual(library.metadata["a.png"]?.tags, ["Work"]);
  await f.workspace.metadata({ "a-480.png": { alt: "Small" } });
  const saved = parseMediaRecords(f.drafts.get(".editor/media.json")!.content);
  assert.deepEqual(saved.files["a.png"].collections, ["Work"]); assert.equal(saved.removed, undefined);
});

test("after saving a removal, restore publishes the old blob without uploading bytes", async () => {
  const f = engine(); await f.workspace.load(); await f.workspace.remove(["a.png"]);
  const entry = (await f.workspace.load()).removed![0];
  // Model Save's branch deletions; keep the records draft so the next action reads them.
  for (const [path, draft] of f.drafts) if (draft.deleted) { f.branch.delete(path); f.drafts.delete(path); }
  await f.workspace.restore([{ path: entry.path, id: entry.sha! }]);
  const restored = f.drafts.get("a.png")!;
  assert.equal(restored.sourceSha, "blob-main"); assert.equal(restored.opaque, true); assert.equal(restored.baseSha, null);
  assert.equal(restored.upload, undefined); assert.equal(f.bytes.map.size, 0);
  const published = publishFiles(listChanges([...f.drafts.values()]));
  assert.ok(published.some(file => file.path === "a.png" && file.sha === "blob-main"));
});

test("a context without history restores every member from browser bytes as uploads", async () => {
  const f = engine(false); await f.workspace.load(); await f.workspace.remove(["a.png"]);
  const entry = (await f.workspace.load()).removed![0];
  assert.ok(entry.browserKey); assert.equal(entry.sha, undefined); assert.equal(f.removedCopies.map.size, 3);
  for (const [path, draft] of f.drafts) if (draft.deleted) { f.branch.delete(path); f.drafts.delete(path); }
  await f.workspace.restore([{ path: entry.path, id: entry.browserKey! }]);
  for (const path of ["a.png", "a-480.png", "media/originals/a.heic"]) {
    const draft = f.drafts.get(path)!;
    assert.ok(draft.upload); assert.equal(await (await f.bytes.get(uploadKey(f.scope, draft.sourceSha!)))?.text(), path);
  }
  assert.equal(f.steps.length, 2);
});

test("local browser copies restore before saving by clearing the matching branch deletions", async () => {
  const f = engine(false);
  for (const path of f.branch.keys()) f.branch.set(path, await gitBlobSha(new TextEncoder().encode(path)));
  await f.workspace.load(); await f.workspace.remove(["a.png"]);
  const entry = (await f.workspace.load()).removed![0];
  await f.workspace.restore([{ path: entry.path, id: entry.browserKey! }]);
  for (const path of ["a.png", "a-480.png", "media/originals/a.heic"]) assert.equal(f.drafts.get(path), undefined);
  assert.equal((await f.workspace.load()).removed?.length, 0);
  assert.equal(f.steps[1].undo(), true); assert.equal((await f.workspace.load()).removed?.length, 1);
});

test("edited SVG and unsaved upload use browser copies; an opaque repository move uses its source blob", async () => {
  for (const kind of ["text", "upload", "move"] as const) {
    const f = engine(), path = kind + ".svg";
    const draft: SavedDraft = { ...f.scope, version: 1, path, baseSha: kind === "text" ? "branch-svg" : null,
      original: "old", content: "<svg>edited</svg>", updatedAt: 1,
      ...kind === "text" ? {} : { opaque: true, sourceSha: "source-blob", ...kind === "upload" ? { upload: { size: 5, type: "image/svg+xml" } } : {} },
    };
    if (kind === "text") f.branch.set(path, "branch-svg");
    if (kind === "upload") await f.bytes.put(uploadKey(f.scope, "source-blob"), new Blob(["upload"]));
    f.drafts.set(path, draft);
    await f.workspace.load(); await f.workspace.remove([path]);
    const entry = (await f.workspace.load()).removed![0];
    if (kind === "move") { assert.equal(entry.sha, "source-blob"); assert.equal(f.removedCopies.map.size, 0); }
    else assert.equal(await (await f.removedCopies.get(entry.browserKey!))?.text(), kind === "text" ? "<svg>edited</svg>" : "upload");
    await f.workspace.restore([{ path, id: (entry.sha ?? entry.browserKey)! }]);
    const restored = f.drafts.get(path)!;
    if (kind === "text") {
      assert.equal(restored.content, "<svg>edited</svg>"); assert.equal(restored.deleted, undefined);
      assert.ok(publishFiles(listChanges([...f.drafts.values()])).some(file => file.path === path && file.content === "<svg>edited</svg>"));
    } else if (kind === "upload") assert.ok(restored.upload);
    else assert.equal(restored.sourceSha, "source-blob");
  }
});
