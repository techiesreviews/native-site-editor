import { test } from "node:test";
import assert from "node:assert/strict";
import { addPreparedMedia, prepareMedia, prepareMediaFile, mediaNeedsPreparation, mediaPreparationFolder } from "../src/page-builder/media-prepare";
import { createMediaWorkspace, applyMediaWorkspaceBatch, type MediaWorkspaceContext, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { DEFAULT_MEDIA_OPTIMISE, type optimiseMedia } from "../src/page-builder/media-optimise";
import { MAX_UPLOAD_BYTES, uploadFileName } from "../src/uploads";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords } from "../shared/media-records";

const encode: typeof optimiseMedia = async (_file, settings) => {
  assert.deepEqual(settings, DEFAULT_MEDIA_OPTIMISE);
  return { before: 100, after: 5, outputs: [
    { blob: new Blob(["main"], { type: "image/webp" }), extension: "webp", width: 1200, height: 600 },
    { blob: new Blob(["copy"], { type: "image/webp" }), extension: "webp", variantWidth: 480 },
  ] };
};
function fixture(initial: Record<string, string> = { "index.html": '<img src="/images/old.png">' }) {
  let text = new Map(Object.entries(initial)), paths = new Set([...text.keys(), "images/old.png"]), bytes = new Map<string, Blob>();
  const history: { undo(): void; redo(): void }[] = [], batches: MediaWorkspaceBatch[] = [], reads: string[] = [];
  const snapshot = () => ({ text: new Map(text), paths: new Set(paths), bytes: new Map(bytes) });
  const restore = (state: ReturnType<typeof snapshot>) => { text = new Map(state.text); paths = new Set(state.paths); bytes = new Map(state.bytes); };
  const ctx: MediaWorkspaceContext = {
    key: "repo", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
    drafts: { get: () => undefined, save: () => false, remove: () => false },
    get paths() { return [...paths]; }, items: [{ path: "images/old.png" }], pages: ["index.html"], components: {},
    assertLive() {}, async read(path) { reads.push(path); return text.get(path); },
    async blob(path) { return bytes.get(path)!; }, assetVersion: () => "v1", async openPage() {},
    async applyBatch(batch) {
      await applyMediaWorkspaceBatch(batch, {
        assertLive() {}, paths: () => [...paths], source: path => text.get(path), assetVersion: () => "v1",
        async snapshot() { return snapshot(); }, async stage() {},
        commit(batch, before) {
          batches.push(batch);
          for (const { path, blob } of batch.uploads) { paths.add(path); bytes.set(path, blob); }
          for (const [path, source] of batch.edits) { paths.add(path); text.set(path, source); }
          const after = snapshot();
          history.push({ undo: () => restore(before), redo: () => restore(after) });
        }, async rollback(_batch, state) { restore(state); },
      });
    },
  };
  return { host: createMediaWorkspace(async () => ctx), batches, history, reads, text: () => text, paths: () => paths, bytes: () => bytes };
}

test("all entrances share requests, uploads and records in one addition", async () => {
  const files = [new File(["picture"], "Picture.PNG"), new File(["pdf bytes"], "Notes.PDF")];
  let expected: unknown;
  for (const entrance of ["Media", "picker", "Structure", "component", "address", "settings", "Files", "canvas"]) {
    const f = fixture();
    const { requests, errors } = await prepareMedia(files, "repo", undefined, undefined, encode);
    assert.deepEqual(errors, [], entrance);
    await f.host.import(requests);
    const batch = f.batches[0], summary = { uploads: await Promise.all(batch.uploads.map(async upload => [upload.path, await upload.blob.text()])), edits: [...batch.edits] };
    expected ??= summary; assert.deepEqual(summary, expected, entrance);
    assert.equal(f.history.length, 1, entrance);
    assert.deepEqual(f.reads, [MEDIA_RECORDS_PATH], "fresh import skips library and usage reads");
  }
});
test("Files folder wins, including root", async () => {
  assert.equal(mediaPreparationFolder(), "images");
  for (const folder of ["", "downloads"]) {
    const f = fixture(), prepared = await prepareMedia([new File(["bytes"], "CNAME")], "repo", folder, undefined, encode);
    assert.deepEqual(await f.host.import(prepared.requests), [folder ? `${folder}/cname` : "cname"]);
  }
});
test("as-is kinds retain their bytes and exact sanitised names, including no extension", async () => {
  for (const name of ["Logo.SVG", "animation.gif", "favicon.ico", "CNAME", "Guide.PDF", "film.mp4", "photo.heic"]) {
    assert.equal(mediaNeedsPreparation(name), false);
    const file = new File([new Uint8Array([0, 255, 128, 7])], name);
    const { request } = await prepareMediaFile(file, "repo", "", undefined, async () => { throw new Error("must not encode"); });
    const f = fixture(); await f.host.import([request]);
    assert.equal(f.batches[0].uploads[0].path, uploadFileName(name));
    assert.equal(f.batches[0].uploads[0].blob, file);
    assert.deepEqual([...new Uint8Array(await f.batches[0].uploads[0].blob.arrayBuffer())], [0, 255, 128, 7]);
  }
  for (const ext of ["jpg", "jpeg", "png", "webp", "avif", "bmp"]) assert.equal(mediaNeedsPreparation(`picture.${ext}`), true);
});
test("cap checks stored outputs, keeps other files, and warns for heavy as-is images", async () => {
  const huge = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.pdf");
  const prepared = await prepareMedia([huge, new File(["ok"], "small.txt")], "repo", "", undefined, encode);
  assert.equal(prepared.requests.length, 1); assert.match(prepared.errors[0], /uploads are limited to 20 MB per file/);
  const tooBig: typeof optimiseMedia = async () => ({ before: 1, after: huge.size, outputs: [{ blob: huge, extension: "webp" }] });
  await assert.rejects(prepareMediaFile(new File(["picture"], "large.png"), "repo", undefined, undefined, tooBig), /uploads are limited/);
  const heavy = await prepareMediaFile(new File([new Uint8Array(3 * 1024 * 1024)], "heavy.gif"), "repo");
  assert.match(heavy.warning!, /heavy for a web page/);
  const failed = await prepareMedia([new File(["broken"], "broken.png"), new File(["ok"], "ok.pdf")], "repo", undefined, undefined, async () => { throw new Error("Cannot decode"); });
  assert.deepEqual(failed.errors, ["Cannot decode"]); assert.equal(failed.requests.length, 1);
});
test("add and place registers one history action; Undo and Redo restore both", async () => {
  const f = fixture(), source = f.text().get("index.html")!;
  const { requests } = await prepareMedia([new File(["picture"], "photo.png")], "repo", undefined, undefined, encode);
  await f.host.import(requests, { path: "index.html", source, apply: paths => `<img src="/${paths[0]}">` });
  assert.equal(f.history.length, 1); assert.match(f.text().get("index.html")!, /photo.webp/);
  assert.equal(f.paths().has("images/photo-480w.webp"), true);
  f.history[0].undo(); assert.equal(f.text().get("index.html"), source); assert.equal(f.paths().has("images/photo.webp"), false);
  f.history[0].redo(); assert.match(f.text().get("index.html")!, /photo.webp/); assert.equal(f.bytes().size, 2);
});
test("stale placement refuses files and page together", async () => {
  const f = fixture(), { requests } = await prepareMedia([new File(["picture"], "photo.png")], "repo", undefined, undefined, encode);
  await assert.rejects(f.host.import(requests, { path: "index.html", source: "old", apply: () => "new" }), /index\.html changed while the file was being added/);
  await assert.rejects(f.host.import(requests, { path: "index.html", source: "old", stale: "The instance changed.", apply: () => "new" }), /^Error: The instance changed\.$/);
  assert.equal(f.history.length, 0); assert.equal(f.bytes().size, 0);
});
test("adding reads the files again after preparing; another repository refuses", async () => {
  const files = new Set(["index.html", "images/old.png"]);
  let contexts = 0, switchAt = Infinity;
  const context = async (): Promise<MediaWorkspaceContext> => {
    const paths = [...files];
    // A file appears after the first snapshot, as if added while preparing.
    if (++contexts === 1) files.add("notes.txt");
    return { key: contexts >= switchAt ? "other" : "repo", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
      drafts: { get: () => undefined, save: () => false, remove: () => false }, paths, items: [], pages: [], components: {},
      assertLive() {}, async read() { return undefined; }, async blob() { return new Blob(); }, assetVersion: () => undefined,
      async openPage() {}, async applyBatch(batch) { assert.deepEqual([...batch.expectedPaths].sort(), [...files].sort()); } };
  };
  const told: string[] = [];
  const report = { error: (error: unknown) => { throw error; }, announce: (message: string) => told.push(message) };
  assert.deepEqual(await addPreparedMedia(context, "images", [new File(["bytes"], "notes.pdf")], undefined, report), ["images/notes.pdf"]);
  assert.equal(contexts, 2); assert.deepEqual(told, ["Added images/notes.pdf."]);
  contexts = 0; switchAt = 2;
  await assert.rejects(addPreparedMedia(context, "images", [new File(["bytes"], "more.pdf")], undefined, report), /repository changed while adding/);
});
test("replacement carries every record field instead of its metadata view", async () => {
  const record = { alwaysKeep: true as const, collections: ["Studio"], description: { text: "Agent words", byAgent: true as const, unknown: 42 },
    decorative: true as const, places: { "index.html": { agentText: "Own words", unknown: true } }, still: "poster.webp", subtitles: "captions.vtt", custom: { nested: [1, 2] } };
  const f = fixture({ "index.html": '<img src="/images/old.png">', [MEDIA_RECORDS_PATH]: serializeMediaRecords({ version: 2, collections: ["Studio"], files: { "images/old.png": record } }) });
  const { requests } = await prepareMedia([new File(["picture"], "old.png")], "repo", undefined, undefined, encode);
  await f.host.import(requests.map(request => ({ ...request, replaceFrom: "images/old.png", expectedAssetVersion: "v1", metadata: { tags: ["Studio"], alt: "Agent words" } })));
  assert.deepEqual(JSON.parse(JSON.stringify(parseMediaRecords(f.text().get(MEDIA_RECORDS_PATH)).files["images/old.webp"])), record);
});
test("file segments are refused and folder paths are reserved with conflict numbering", async () => {
  const f = fixture({ "images/file": "bytes", "images/photo.webp/child.txt": "child" });
  await assert.rejects(f.host.import([{ file: new File(["bytes"], "a.txt"), folder: "images/file/deep" }]), /is a file/);
  const { requests } = await prepareMedia([new File(["picture"], "photo.png")], "repo", undefined, undefined, encode);
  assert.deepEqual(await f.host.import(requests), ["images/photo-2.webp"]);
});

test("preparation reads settings for the repository and honours cancellation", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const stored = { ...DEFAULT_MEDIA_OPTIMISE, maxWidth: 960, quality: 60, responsive: false };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key: string) { assert.equal(key, "native-site-editor:media-optimise:chosen-repo"); return JSON.stringify(stored); },
  } });
  try {
    await prepareMediaFile(new File(["picture"], "photo.png"), "chosen-repo", undefined, undefined, async (_file, settings) => {
      assert.deepEqual(settings, stored);
      return { before: 7, after: 4, outputs: [{ blob: new Blob(["main"]), extension: "webp" }] };
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(prepareMedia([new File(["bytes"], "photo.png")], "repo", undefined, controller.signal, encode), /abort/i);
});
