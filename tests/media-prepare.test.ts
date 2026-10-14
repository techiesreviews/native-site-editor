import { test } from "node:test";
import assert from "node:assert/strict";
import { addPreparedMedia, prepareMedia, prepareMediaFile, mediaNeedsPreparation, mediaPreparationFolder } from "../src/page-builder/media-prepare";
import { createMediaWorkspace, applyMediaWorkspaceBatch, type MediaWorkspaceContext, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { DEFAULT_MEDIA_OPTIMISE, type optimiseMedia } from "../src/page-builder/media-optimise";
import { MAX_UPLOAD_BYTES } from "../src/uploads";
import { mediaStorageName } from "../src/page-builder/media-storage";
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
  assert.equal(mediaPreparationFolder(), "media/images");
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
    assert.equal(f.batches[0].uploads[0].path, mediaStorageName(name));
    assert.equal(f.batches[0].uploads[0].blob, file);
    assert.deepEqual([...new Uint8Array(await f.batches[0].uploads[0].blob.arrayBuffer())], [0, 255, 128, 7]);
  }
  for (const ext of ["jpg", "jpeg", "png", "webp", "avif", "bmp"]) assert.equal(mediaNeedsPreparation(`picture.${ext}`), true);
});
test("cap checks stored outputs, keeps other files, and notes large downloads", async () => {
  const huge = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.pdf");
  const prepared = await prepareMedia([huge, new File(["ok"], "small.txt")], "repo", "", undefined, encode);
  assert.equal(prepared.requests.length, 1); assert.match(prepared.errors[0], /uploads are limited to 20 MB per file/);
  const tooBig: typeof optimiseMedia = async () => ({ before: 1, after: huge.size, outputs: [{ blob: huge, extension: "webp" }] });
  await assert.rejects(prepareMediaFile(new File(["picture"], "large.png"), "repo", undefined, undefined, tooBig), /uploads are limited/);
  const heavy = await prepareMediaFile(new File([new Uint8Array(3 * 1024 * 1024)], "heavy.gif"), "repo");
  assert.match(heavy.warning!, /Large download: heavy.gif is 3.1 MB/);
  const failed = await prepareMedia([new File(["broken"], "broken.png"), new File(["ok"], "ok.pdf")], "repo", undefined, undefined, async () => { throw new Error("Cannot decode"); });
  assert.match(failed.errors[0], /Hidden personal details/); assert.equal(failed.requests.length, 1);
});
test("add and place registers one history action; Undo and Redo restore both", async () => {
  const f = fixture(), source = f.text().get("index.html")!;
  const { requests } = await prepareMedia([new File(["picture"], "photo.png")], "repo", undefined, undefined, encode);
  await f.host.import(requests, { path: "index.html", source, apply: paths => `<img src="/${paths[0]}">` });
  assert.equal(f.history.length, 1); assert.match(f.text().get("index.html")!, /photo.webp/);
  assert.equal(f.paths().has("media/images/photo-480.webp"), true);
  f.history[0].undo(); assert.equal(f.text().get("index.html"), source); assert.equal(f.paths().has("media/images/photo.webp"), false);
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
  assert.deepEqual(JSON.parse(JSON.stringify(parseMediaRecords(f.text().get(MEDIA_RECORDS_PATH)).files["media/images/old.webp"])), record);
});
test("file segments are refused and folder paths are reserved with conflict numbering", async () => {
  const f = fixture({ "images/file": "bytes", "media/images/photo.webp/child.txt": "child" });
  await assert.rejects(f.host.import([{ file: new File(["bytes"], "a.txt"), folder: "images/file/deep" }]), /is a file/);
  const { requests } = await prepareMedia([new File(["picture"], "photo.png")], "repo", undefined, undefined, encode);
  assert.deepEqual(await f.host.import(requests), ["media/images/photo-2.webp"]);
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

test("a placement cancelled before commit saves nothing; the files can then be saved alone", async () => {
  const f = fixture(), source = f.text().get("index.html")!;
  const { requests } = await prepareMedia([new File(["picture"], "photo.png")], "repo", undefined, undefined, encode);
  let wanted = true;
  // Cancel lands while the batch is prepared: after apply, before the final guard.
  await assert.rejects(f.host.import(requests, { path: "index.html", source, live: () => wanted, apply: paths => { wanted = false; return `<img src="/${paths[0]}">`; } }), /Cancelled before the change was saved/);
  assert.equal(f.history.length, 0); assert.equal(f.text().get("index.html"), source); assert.equal(f.bytes().size, 0);
  await f.host.import(requests);
  assert.equal(f.history.length, 1); assert.equal(f.text().get("index.html"), source); assert.equal(f.paths().has("media/images/photo.webp"), true);
});

test("a placement decided on older records refuses newer ones", async () => {
  const records = serializeMediaRecords({ version: 2, collections: [], files: {} });
  const f = fixture({ "index.html": '<img src="/images/old.png">', [MEDIA_RECORDS_PATH]: records }), source = f.text().get("index.html")!;
  const { requests } = await prepareMedia([new File(["picture"], "photo.png")], "repo", undefined, undefined, encode);
  await assert.rejects(f.host.import(requests, { path: "index.html", source, records: { text: undefined }, apply: () => "new" }), /media\.json changed/);
  assert.equal(f.history.length, 0);
  await f.host.import(requests, { path: "index.html", source, records: { text: records }, apply: () => "new" });
  assert.equal(f.history.length, 1); assert.equal(f.text().get("index.html"), "new");
});


test("failed preparation asks before adding unchanged bytes; refusal and missing consent add nothing", async () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "photo.jpg");
  const fail: typeof optimiseMedia = async () => { throw new Error("Cannot decode"); };
  const questions: string[] = [];
  const shown = async () => true;
  const yes = await prepareMedia([file], "repo", undefined, undefined, fail, async question => { questions.push(question); return true; }, shown);
  assert.equal(questions.length, 1); assert.match(questions[0], /unchanged/);
  assert.equal(yes.requests[0].file, file); assert.equal(yes.requests[0].result, undefined);
  const f = fixture(); await f.host.import(yes.requests);
  assert.equal(f.batches[0].uploads[0].blob, file);
  const no = await prepareMedia([file], "repo", undefined, undefined, fail, async () => false, shown);
  assert.deepEqual(no.requests, []); assert.deepEqual(no.errors, ["photo.jpg was not added."]);
  const missing = await prepareMedia([file], "repo", undefined, undefined, fail, undefined, shown);
  assert.deepEqual(missing.requests, []); assert.match(missing.errors[0], /Try saving it as a new file/);
});
test("a failed picture the browser cannot show, or with a comment block, gets advice and no question", async () => {
  const fail: typeof optimiseMedia = async () => { throw new Error("Cannot decode"); };
  let asked = 0;
  const ask = async () => { asked++; return true; };
  const broken = await prepareMedia([new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "photo.jpg")], "repo", undefined, undefined, fail, ask, async () => false);
  assert.deepEqual(broken.requests, []); assert.match(broken.errors[0], /cannot show it as a picture/);
  for (const marker of [0xfe, 0xe0, 0xee]) {
    // A comment, or a JFIF/Adobe block carrying text instead of its standard header.
    const block = new Uint8Array([0xff, 0xd8, 0xff, marker, 0, 6, 0x48, 0x6f, 0x6d, 0x65, 0xff, 0xd9]);
    const noted = await prepareMedia([new File([block], "photo.jpg")], "repo", undefined, undefined, fail, ask, async () => true);
    assert.deepEqual(noted.requests, []); assert.match(noted.errors[0], /Hidden personal details/);
  }
  assert.equal(asked, 0);
});
test("prepared files note only their largest output; large sources can prepare below the cap", async () => {
  const source = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "photo.png");
  const large: typeof optimiseMedia = async () => ({ before: source.size, after: 1_400_000, outputs: [
    { blob: new Blob([new Uint8Array(1_400_000)]), extension: "webp" },
    { blob: new Blob([new Uint8Array(1_000_001)]), extension: "webp", variantWidth: 480 },
  ] });
  const prepared = await prepareMedia([source], "repo", undefined, undefined, large);
  assert.equal(prepared.requests.length, 1); assert.deepEqual(prepared.errors, []);
  assert.deepEqual(prepared.warnings, ["Large download: photo.webp is 1.4 MB, which can be slow to load on phones."]);
  const pdf = await prepareMediaFile(new File([new Uint8Array(10_000_001)], "guide.pdf"), "repo");
  assert.match(pdf.warning!, /guide.pdf is 10.0 MB/);
});
test("cancellation during failure consent never adds the unchanged file", async () => {
  const controller = new AbortController();
  await assert.rejects(prepareMedia([new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "photo.jpg")], "repo", undefined,
    controller.signal, async () => { throw new Error("Cannot decode"); }, async () => { controller.abort(); return true; }, async () => true), /abort/i);
});

test("failure cannot bypass personal-detail removal, and accepted unchanged files still get notes", async () => {
  const fail: typeof optimiseMedia = async () => { throw new Error("Cannot decode"); };
  let asked = false;
  const unsafe = await prepareMedia([new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 2, 0xff, 0xd9])], "photo.jpg")],
    "repo", undefined, undefined, fail, async () => { asked = true; return true; });
  assert.equal(asked, false); assert.deepEqual(unsafe.requests, []); assert.match(unsafe.errors[0], /Hidden personal details/);
  const bytes = new Uint8Array(1_000_001);
  bytes.set([0xff, 0xd8, 0xff, 0xda, 0, 2]); bytes.set([0xff, 0xd9], bytes.length - 2);
  const clean = await prepareMedia([new File([bytes], "photo.jpg")], "repo", undefined, undefined, fail, async () => true, async () => true);
  assert.equal(clean.requests.length, 1); assert.equal(clean.warnings.length, 1); assert.match(clean.warnings[0], /photo.jpg is 1.0 MB/);
});

test("automatic folders follow each output kind; explicit Files folders win", async () => {
  for (const [name, folder] of [["picture.jpg", "media/images"], ["logo.svg", "media/images"], ["movie.mp4", "media/videos"],
    ["song.m4a", "media/audio"], ["guide.pdf", "media/downloads"], ["archive.zip", "media/downloads"]]) {
    const file = new File(["bytes"], name);
    assert.equal((await prepareMediaFile(file, "repo", undefined, undefined, encode)).request.folder, folder);
    for (const explicit of ["", "chosen/folder"]) assert.equal((await prepareMediaFile(file, "repo", explicit, undefined, encode)).request.folder, explicit);
  }
});

test("duplicate incoming photos reserve numbered families in one batch", async () => {
  const f = fixture();
  const encodeFamily: typeof optimiseMedia = async () => ({ before: 10, after: 4,
    outputs: [{ blob: new Blob(["main"]), extension: "webp" },
      ...[480, 960, 1600].map(variantWidth => ({ blob: new Blob(["copy"]), extension: "webp", variantWidth }))] });
  const { requests } = await prepareMedia([new File(["one"], "Holiday Photo.JPG"), new File(["two"], "Holiday Photo.JPG")], "repo", undefined, undefined, encodeFamily);
  assert.deepEqual(await f.host.import(requests), ["media/images/holiday-photo.webp", "media/images/holiday-photo-2.webp"]);
  assert.deepEqual(f.batches[0].uploads.map(upload => upload.path),
    ["holiday-photo", "holiday-photo-2"].flatMap(base => ["", "-480", "-960", "-1600"].map(suffix => `media/images/${base}${suffix}.webp`)));
});
