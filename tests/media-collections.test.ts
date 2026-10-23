import test from "node:test";
import assert from "node:assert/strict";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords } from "../shared/media-records";
import { createMediaCollection, addToMediaCollection, takeOutOfMediaCollection, renameMediaCollection, deleteMediaCollection, mediaCollectionNameProblem, startingMediaCollections, readSiteMediaRecords, type MediaCollectionChange } from "../src/page-builder/media-collections";
import { applyMediaWorkspaceBatch, createMediaWorkspace, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { mediaDraftTransaction, type MediaDraftHost } from "../src/page-builder/media-draft-transaction";
import { createMediaHistoryHome } from "../src/page-builder/media-history-home";
import { memoryUploadBytes } from "../src/uploads";
import type { SavedDraft, DraftScope } from "../src/drafts";

const source = JSON.stringify({ version: 2, collections: ["Logos", "Brand", "Empty"], files: {
  "images/logos/a.png": { collections: ["Brand", "Logos"], description: { text: "Mark", byAgent: true }, alwaysKeep: true, credit: "Artist" },
  "images/b.png": {},
}, removed: [{ path: "old.png", sha: "old-sha", date: "2026-10-14", record: { collections: ["Brand", "Logos"], credit: "Old artist" } }], future: { keep: true } });
const a = "images/logos/a.png", b = "images/b.png";

test("new and add trim names, reject empty/taken names, keep sorted membership and immutable input", () => {
  const records = parseMediaRecords(source), before = serializeMediaRecords(records);
  assert.equal(mediaCollectionNameProblem(records, "  "), "empty");
  assert.equal(mediaCollectionNameProblem(records, " logos "), "taken");
  assert.equal(mediaCollectionNameProblem(records, " logos ", "Logos"), undefined);
  assert.throws(() => createMediaCollection(records, " logos "), /already exists/);
  assert.throws(() => createMediaCollection(records, " "), /Enter a collection name/);
  assert.throws(() => addToMediaCollection(records, "logos", [a]), /no collection/);
  const created = createMediaCollection(records, " Art ", [a, b, b]);
  assert.deepEqual(created.collections, ["Logos", "Brand", "Empty", "Art"]);
  assert.deepEqual(created.files[a].collections, ["Art", "Brand", "Logos"]);
  assert.deepEqual(created.files[b].collections, ["Art"]);
  assert.equal(addToMediaCollection(created, "Art", [a, b]), created);
  assert.deepEqual(created.removed, records.removed);
  assert.equal(serializeMediaRecords(records), before);
});

test("take out keeps record fields and empty collection; missing membership is a no-op", () => {
  const records = parseMediaRecords(source);
  const next = takeOutOfMediaCollection(records, "Logos", [a, b, "missing"]);
  assert.deepEqual(next.files[a], { ...records.files[a], collections: ["Brand"] });
  assert.deepEqual(next.collections, records.collections);
  const empty = takeOutOfMediaCollection(next, "Brand", [a]);
  const { collections: _collections, ...fields } = records.files[a];
  assert.deepEqual(empty.files[a], fields);
  assert.equal(takeOutOfMediaCollection(empty, "Logos", [a]), empty);
  assert.deepEqual(empty.removed, records.removed);
});

test("rename refuses merging, allows case-only rename, preserves position and removed records", () => {
  const records = parseMediaRecords(source);
  assert.throws(() => renameMediaCollection(records, "Logos", " brand "), /already exists/);
  assert.throws(() => renameMediaCollection(records, "Logos", " "), /Enter a collection name/);
  assert.equal(renameMediaCollection(records, "Logos", " Logos "), records);
  const next = renameMediaCollection(records, "Logos", " logos ");
  assert.deepEqual(next.collections, ["logos", "Brand", "Empty"]);
  assert.deepEqual(next.files[a].collections, ["Brand", "logos"]);
  assert.deepEqual(next.removed?.[0].record?.collections, ["Brand", "logos"]);
  assert.equal(next.removed?.length, records.removed?.length);
  assert.equal(records.files[a].collections?.includes("Logos"), true);
});

test("delete keeps files, fields and other collections, with no resurrection after parse", () => {
  const records = parseMediaRecords(source), next = deleteMediaCollection(records, "Logos");
  assert.deepEqual(Object.keys(next.files), Object.keys(records.files));
  assert.deepEqual(next.files[a], { ...records.files[a], collections: ["Brand"] });
  assert.deepEqual(next.removed, [{ ...records.removed![0], record: { ...records.removed![0].record, collections: ["Brand"] } }]);
  assert.deepEqual(parseMediaRecords(serializeMediaRecords(next)), next);
  assert.deepEqual(next.collections, ["Brand", "Empty"]);
  assert.throws(() => deleteMediaCollection(next, "Logos"), /no collection called "Logos"/);
  assert.throws(() => renameMediaCollection(next, "missing", "Other"), /no collection called "missing"/);
  const all = deleteMediaCollection(next, "Brand");
  assert.equal(all.files[a].collections, undefined);
  assert.equal(all.removed?.[0].record?.collections, undefined);
  assert.deepEqual(parseMediaRecords(serializeMediaRecords(all)), all);
});

const tree = ["images/logos/a.png", "images/logos/b.png", "images/logos/a-480w.png", "images/logos/a-960.png", "media/originals/a.png", "images/brand/mark.svg", "images/uploads/2023/09/photo.jpg", "images/uploads/2023/09/photo-480w.jpg", "images/hero.jpg", "media/images/a.webp", "images/logos/2021/old.png", "assets/brand-assets/2023-09/9/banner.jpg", "public/brand_assets/clip.mp4", "root.png", "STATIC/IMAGES/plain.png", ".github/screenshot.png"];
test("starting collections use nearest real folder, readable names, and family main files only", () => {
  const records = startingMediaCollections(tree);
  assert.deepEqual(records.collections, ["Logos", "Brand", "Brand assets"]);
  assert.deepEqual(Object.keys(records.files), ["images/logos/a.png", "images/logos/b.png", "images/brand/mark.svg", "images/logos/2021/old.png", "assets/brand-assets/2023-09/9/banner.jpg", "public/brand_assets/clip.mp4"]);
  assert.equal(records.removed, undefined);
  const old = readSiteMediaRecords(JSON.stringify({ "root.png": { tags: ["logos"], alt: "Old" } }), tree);
  assert.deepEqual(old.collections, ["logos", "Brand", "Brand assets"]);
  assert.deepEqual(old.files[a].collections, ["logos"]);
  assert.equal(old.files["root.png"].description?.text, "Old");
  assert.deepEqual(readSiteMediaRecords('{"version":2,"collections":[],"files":{}}', tree).collections, []);
});

/** Real draft transactions with no mounted page, using the site's detached Undo home. */
function workspace(initial: string | undefined, paths = [a, b]) {
  const scope: DraftScope = { account: "a", repoId: 1, repo: "a/r", branch: "main" };
  const drafts = new Map<string, SavedDraft>(), home = createMediaHistoryHome();
  const store = { get: (_: DraftScope, path: string) => drafts.get(path), list: () => [...drafts.values()], error: "store failure",
    save: (record: SavedDraft) => { drafts.set(record.path, record); return true; },
    remove: (_: DraftScope, path: string) => { drafts.delete(path); return true; } };
  const read = (path: string) => drafts.get(path)?.content ?? (path === MEDIA_RECORDS_PATH ? initial : undefined);
  const host: MediaDraftHost = { scope, store, bytes: memoryUploadBytes(), stamp: { holds: () => true, changed: () => undefined },
    paths: () => [...paths, ...(initial !== undefined || drafts.has(MEDIA_RECORDS_PATH) ? [MEDIA_RECORDS_PATH] : [])],
    source: read, assetVersion: () => "v1", entry: async () => undefined, mounted: () => false,
    prepareSources: edits => { assert.equal(edits.length, 0); return { apply: () => true, undo: () => true, redo: () => true, isCurrent: () => true }; },
    modelState: () => ({ isCurrent: () => true }), evictModel: (_path, proof) => proof,
    historyCurrent: () => true, history: (undo, redo) => home.hold({ holds: () => true }, undo, redo), refresh: () => {}, announce: () => {},
  };
  const reads: string[] = [], batches: string[] = [];
  // SVG is text the usage scan reads (slice 46), so the fake gives it content.
  const ctx: MediaWorkspaceContext = { key: "site", scope, drafts: store, get paths() { return host.paths(); }, items: paths.map(path => ({ path })), pages: [], components: {},
    assertLive() {}, read: async path => { reads.push(path); return /\.svg$/i.test(path) ? "<svg/>" : read(path); }, blob: async () => new Blob(), assetVersion: path => host.assetVersion(path),
    applyBatch: async batch => { assert.deepEqual([...batch.edits.keys()], [MEDIA_RECORDS_PATH]); batches.push(batch.label); await applyMediaWorkspaceBatch(batch, mediaDraftTransaction(host)); }, openPage: async () => {},
  };
  return { picker: createMediaWorkspace(async () => ctx), drafts, read: () => read(MEDIA_RECORDS_PATH), reads, batches,
    async undo() { let action: () => boolean | Promise<boolean> = () => false, steps = 0; home.adopt(undo => { action = undo; steps++; return true; }); assert.equal(steps, 1); assert.equal(await action(), true); },
  };
}

for (const [change, label] of [
  [{ kind: "new", name: "New", paths: [a] }, "New collection"],
  [{ kind: "add", name: "Empty", paths: [b] }, "Add to collection"],
  [{ kind: "take-out", name: "Logos", paths: [a] }, "Take out of collection"],
  [{ kind: "rename", from: "Logos", to: "Marks" }, "Rename collection"],
  [{ kind: "delete", name: "Logos" }, "Delete collection"],
] satisfies [MediaCollectionChange, string][]) test(`${label} is one Undo step with no page open`, async () => {
  const f = workspace(source); await f.picker.load();
  await f.picker.collections(change);
  assert.deepEqual(f.batches, [label]);
  assert.notEqual(f.read(), source);
  assert.deepEqual(parseMediaRecords(f.read()).removed?.map(item => item.path), ["old.png"]);
  await f.undo(); assert.equal(f.read(), source);
  assert.ok(f.reads.every(path => path === MEDIA_RECORDS_PATH));
});

test("workspace load derives without writing; first description saves starting collections; Undo restores absence", async () => {
  const f = workspace(undefined, tree), library = await f.picker.load();
  assert.deepEqual(library.collections, ["Logos", "Brand", "Brand assets"]);
  assert.equal(f.drafts.size, 0);
  await f.picker.metadata({ [a]: { alt: "Description" } });
  assert.deepEqual(parseMediaRecords(f.read()).collections, library.collections);
  await f.undo(); assert.equal(f.read(), undefined);
});

test("empty saved collections are exposed; invalid library paths and taken names write nothing", async () => {
  const f = workspace(source), library = await f.picker.load();
  assert.deepEqual(library.collections, ["Logos", "Brand", "Empty"]);
  for (const kind of ["new", "add", "take-out"] as const) await assert.rejects(f.picker.collections({ kind, name: "Empty", paths: ["index.html"] }), /no longer in the media library/);
  await assert.rejects(f.picker.collections({ kind: "new", name: "logos" }), /already exists/);
  await assert.rejects(f.picker.collections({ kind: "rename", from: "Logos", to: "brand" }), /already exists/);
  await f.picker.collections({ kind: "add", name: "Logos", paths: [a] });
  assert.equal(f.batches.length, 0); assert.equal(f.drafts.size, 0);
});
