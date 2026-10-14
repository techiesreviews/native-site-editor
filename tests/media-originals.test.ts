import { mediaFamilyRows } from "../src/page-builder/media-file-details";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanedMediaOriginal, mediaOriginalCapQuestion, mediaOriginalIsDuplicate, mediaOriginalPath, mediaOriginalProblem } from "../src/page-builder/media-originals";
import { prepareMedia, prepareMediaFile } from "../src/page-builder/media-prepare";
import { createMediaWorkspace, applyMediaWorkspaceBatch, type MediaWorkspaceContext, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { mediaImageRecipe, type optimiseMedia, type MediaOptimiseResult, type MediaOptimiseOptions } from "../src/page-builder/media-optimise";
import { MEDIA_FILE_CAP_BYTES, mayHoldHiddenDetails } from "../src/page-builder/media-limits";
import { mediaLibraryTiles } from "../src/page-builder/media-library-filter";
import { mediaFamilies } from "../src/page-builder/media-families";
import { MEDIA_RECORDS_PATH } from "../shared/media-records";
import { readMediaAddingSettings } from "../src/page-builder/media-settings";
import { createFilesAdding } from "../src/page-builder/media-files-adding-runs";

const cleanJpeg = (size = 12) => {
  const bytes = new Uint8Array(size); bytes.set([255, 216, 255, 218, 0, 2]); bytes.set([255, 217], size - 2); return bytes;
};
function photo(orientation = 1, unknown = false) {
  const exif = Buffer.alloc(32); exif.write("Exif\0\0"); exif.write("II", 6); exif.writeUInt16LE(42, 8); exif.writeUInt32LE(8, 10);
  exif.writeUInt16LE(1, 14); exif.writeUInt16LE(0x112, 16); exif.writeUInt16LE(3, 18); exif.writeUInt32LE(1, 20); exif.writeUInt16LE(orientation, 24);
  const payload = Buffer.concat([exif, Buffer.from("GPS camera location")]);
  const header = Buffer.from([255, 225, 0, payload.length + 2]);
  return Buffer.concat([Buffer.from([255, 216]), header, payload, ...unknown ? [Buffer.from([255, 227, 0, 5, 71, 80, 83])] : [], Buffer.from([255, 218, 0, 2, 1, 2, 255, 217])]);
}
const original = { blob: new Blob([cleanJpeg()], { type: "image/jpeg" }), extension: "jpg" };
const encoder: typeof optimiseMedia = async () => ({ before: 100, after: 4, original,
  outputs: [{ blob: new Blob(["main"]), extension: "webp" }, { blob: new Blob(["copy"]), extension: "webp", variantWidth: 480 }] });
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
  return { ctx, host: createMediaWorkspace(async () => ctx), batches, history, reads, text: () => text, paths: () => paths, bytes: () => bytes };
}

test("retained source strips Exif/GPS losslessly; rotated and unknown blocks re-encode at quality 92", async () => {
  for (const [orientation, unknown] of [[1, false], [6, false], [1, true]] as const) {
    let encodes = 0;
    const source = photo(orientation, unknown);
    const retained = await cleanedMediaOriginal(source, "image/jpeg", false, async (type, quality) => {
      encodes++; assert.equal(type, "image/jpeg"); assert.equal(quality, 92); return original.blob;
    });
    assert.equal(encodes, orientation === 1 && !unknown ? 0 : 1);
    const bytes = new Uint8Array(await retained.blob.arrayBuffer());
    assert.equal(mayHoldHiddenDetails(bytes, "original.jpg"), false);
    assert.equal(Buffer.from(bytes).includes(Buffer.from("GPS")), false);
    assert.equal(retained.extension, "jpg");
  }
  const png = await cleanedMediaOriginal(new Uint8Array([1]), "image/bmp", true, async (type, quality) => {
    assert.equal(type, "image/png"); assert.equal(quality, 92); return new Blob(["encoded"], { type });
  });
  assert.equal(png.extension, "png");
});
test("only true opts in, defaults and unreadable settings stay off", async () => {
  const read = (text?: string) => readMediaAddingSettings(async () => text);
  for (const value of [undefined, "broken", "{}", '{"adding":{"keepOriginal":true}}', '{"version":2,"collections":[],"files":{},"adding":{"keepOriginal":"true"}}'])
    assert.equal((await read(value)).keepOriginal, false);
  assert.equal((await read('{"version":2,"collections":[],"files":{},"adding":{"keepOriginal":true}}')).keepOriginal, true);
  const f = fixture({ [MEDIA_RECORDS_PATH]: '{"version":2,"collections":[],"files":{},"adding":{"keepOriginal":true}}' });
  assert.equal((await f.host.load()).adding?.keepOriginal, true);
  const check: typeof optimiseMedia = async (file, options, signal, trim, retained) => { assert.equal(trim, undefined); assert.equal(retained, false); assert.equal(options.keepOriginal, false); return encoder(file, options, signal); };
  assert.equal((await prepareMediaFile(new File(["source"], "photo.jpg"), "repo", undefined, undefined, check)).request.original, undefined);
});
test("family paths share the chosen main base, including Files destinations and conflicts; one batch and Undo", async () => {
  for (const folder of ["media/images", "chosen/folder", ""]) {
    const f = fixture({ "media/originals/holiday.jpg": "existing" });
    const prepared = await prepareMediaFile(new File([photo()], "Holiday.JPG"), "repo", folder, undefined, encoder, undefined, undefined, "balanced", true);
    const main = `${folder ? folder + "/" : ""}holiday-2.webp`;
    assert.deepEqual(await f.host.import([prepared.request]), [main]);
    assert.equal(mediaOriginalPath(main, "jpg"), "media/originals/holiday-2.jpg");
    assert.deepEqual(f.batches[0].uploads.map(upload => upload.path), [main, main.replace(".webp", "-480.webp"), "media/originals/holiday-2.jpg"]);
    assert.equal(f.history.length, 1);
    const items = f.batches[0].uploads.map(({ path }) => ({ path }));
    assert.deepEqual(mediaLibraryTiles(items), [{ path: main }]);
    assert.deepEqual(mediaFamilies(items.map(item => item.path))[0].originals, ["media/originals/holiday-2.jpg"]);
    f.history[0].undo(); assert.equal(f.paths().has(main), false); assert.equal(f.paths().has("media/originals/holiday-2.jpg"), false);
    assert.equal(f.paths().has("media/originals/holiday.jpg"), true);
  }
});
test("a same-named main in another folder numbers the new family, so its original stays in it", async () => {
  const f = fixture({ "images/holiday.webp": "existing" });
  const prepared = await prepareMediaFile(new File([photo()], "Holiday.JPG"), "repo", "chosen", undefined, encoder, undefined, undefined, "balanced", true);
  assert.deepEqual(await f.host.import([prepared.request]), ["chosen/holiday-2.webp"]);
  assert.equal(f.batches[0].uploads.at(-1)!.path, "media/originals/holiday-2.jpg");
  const items = ["images/holiday.webp", ...f.batches[0].uploads.map(upload => upload.path)].map(path => ({ path }));
  assert.deepEqual(mediaLibraryTiles(items).map(item => item.path).sort(), ["chosen/holiday-2.webp", "images/holiday.webp"]);
  assert.deepEqual(mediaFamilyRows("chosen/holiday-2.webp", items)?.filter(row => row.original).map(row => row.path), ["media/originals/holiday-2.jpg"]);
  assert.deepEqual(mediaFamilyRows("images/holiday.webp", items), []);
});
test("unchanged files, accepted Add unchanged, and identical cleaned mains have no duplicate", async () => {
  for (const name of ["logo.svg", "guide.pdf", "movie.mp4", "song.mp3"]) {
    const prepared = await prepareMediaFile(new File(["source"], name), "repo", undefined, undefined, encoder, undefined, undefined, "balanced", true);
    assert.equal(prepared.request.original, undefined);
  }
  const fail: typeof optimiseMedia = async () => { throw new Error("encoding failed"); };
  const unchanged = await prepareMediaFile(new File([cleanJpeg()], "photo.jpg"), "repo", undefined, undefined, fail, async () => true, async () => true, "balanced", true);
  assert.equal(unchanged.request.original, undefined);
  const same: typeof optimiseMedia = async () => ({ before: 20, after: original.blob.size, original, outputs: [original] });
  assert.equal((await prepareMediaFile(new File([photo()], "photo.jpg"), "repo", undefined, undefined, same, undefined, undefined, "balanced", true)).request.original, undefined);
  assert.equal(await mediaOriginalIsDuplicate(new Blob(["abc"]), new Blob(["abd"])), false);
});
test("dirty originals fail this file, never silently omit or store them", async () => {
  const dirty: typeof optimiseMedia = async (file, options) => ({ ...await encoder(file, options), original: { blob: new Blob([photo()]), extension: "jpg" } });
  const prepared = await prepareMedia([new File([photo()], "photo.jpg"), new File(["pdf"], "guide.pdf")], "repo", undefined, undefined, dirty, undefined, undefined, "balanced", true);
  assert.equal(prepared.requests.length, 1); assert.match(prepared.errors[0], /original.*hidden personal details/);
  const f = fixture();
  await assert.rejects(f.host.import([{ file: new File(["main"], "photo.webp"), folder: "media/images", original: { blob: new Blob([photo()]), extension: "jpg" } }]), /hidden personal details/);
  assert.equal(f.batches.length, 0);
  assert.ok(mediaOriginalProblem(new TextEncoder().encode('<svg onload="evil()"/>'), "svg"));
});
test("over-cap asks only when website files fit: yes omits original; no/missing skips file; other files continue", async () => {
  const large = { blob: new Blob([cleanJpeg(MEDIA_FILE_CAP_BYTES + 1)]), extension: "jpg" };
  const encode: typeof optimiseMedia = async (file, options) => ({ ...await encoder(file, options), original: large });
  assert.equal(mediaOriginalCapQuestion("photo.jpg", MEDIA_FILE_CAP_BYTES), undefined);
  for (const answer of [true, false, undefined]) {
    let asked = 0;
    const prepared = await prepareMedia([new File([photo()], "photo.jpg"), new File(["pdf"], "guide.pdf")], "repo", undefined, undefined, encode,
      answer === undefined ? undefined : async (question, kind) => { asked++; assert.equal(kind, "original"); assert.match(question, /photo.jpg.*20 MB.*website version fits/); return answer; }, undefined, "balanced", true);
    assert.equal(asked, answer === undefined ? 0 : 1);
    assert.equal(prepared.requests.length, answer ? 2 : 1);
    assert.ok(prepared.requests.every(request => !request.original));
    assert.deepEqual(prepared.errors, answer ? [] : ["photo.jpg was not added."]);
    assert.deepEqual(prepared.warnings, []);
  }
  const f = fixture();
  await assert.rejects(f.host.import([{ file: new File(["main"], "photo.webp"), folder: "media/images", original: large }]), /20 MB/);
  assert.equal(f.batches.length, 0);
  const controller = new AbortController();
  await assert.rejects(prepareMediaFile(new File([photo()], "photo.jpg"), "repo", undefined, controller.signal, encode, async () => { controller.abort(); return true; }, undefined, "balanced", true), /abort/i);
});
test("Files reads the site setting once per addition, passing it to each preparation", async () => {
  const f = fixture({ [MEDIA_RECORDS_PATH]: '{"version":2,"collections":[],"files":{},"adding":{"keepOriginal":true}}' });
  let reads = 0, prepares = 0;
  const runs = createFilesAdding({
    settings: async ctx => { reads++; return readMediaAddingSettings(path => ctx.read(path)); },
    prepare: async (file, key, folder, signal, quality, keep) => { prepares++; assert.equal(keep, true); return prepareMediaFile(file, key, folder, signal, encoder, undefined, undefined, quality, keep); },
    save: async (_ctx, _context, requests) => f.host.import(requests), paint() {},
  });
  await runs.start("chosen", [new File([photo()], "one.jpg"), new File([photo()], "two.jpg")], {
    context: async () => f.ctx, live: () => true, announce() {}, error(error) { throw error; },
  });
  assert.equal(reads, 1); assert.equal(prepares, 2); assert.equal(f.batches.length, 1);
});

test("worker retains decoded full source size and orientation; opaque JPEG 92 or transparent lossless PNG", async () => {
  const names = ["self", "OffscreenCanvas", "createImageBitmap"];
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let result: MediaOptimiseResult | undefined, transparent = false, closed = 0;
  const calls: { width: number; height: number; type: string; quality?: number }[] = [];
  const scope = {
    onmessage: undefined as undefined | ((event: { data: { file: File; options: MediaOptimiseOptions; original: boolean } }) => Promise<void>),
    postMessage(value: { result?: MediaOptimiseResult; error?: string }) { assert.equal(value.error, undefined); result = value.result; },
  };
  class Canvas {
    constructor(readonly width: number, readonly height: number) {}
    getContext() { return { drawImage() {}, getImageData() { return { data: new Uint8Array([1, 2, 3, transparent ? 0 : 255]) }; } }; }
    async convertToBlob(options: { type: string; quality?: number }) {
      calls.push({ width: this.width, height: this.height, ...options });
      return new Blob([options.type === "image/jpeg" ? cleanJpeg() : new Uint8Array(8)], { type: options.type });
    }
  }
  Object.defineProperty(globalThis, "self", { configurable: true, value: scope });
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: Canvas });
  // createImageBitmap supplies already-oriented dimensions, as the real browser does.
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({ width: 3000, height: 6000, close() { closed++; } }) });
  try {
    await import("../src/page-builder/image-optimise.worker");
    for (const alpha of [false, true]) {
      transparent = alpha; calls.length = 0; result = undefined;
      await scope.onmessage!({ data: { file: new File([photo(6)], "rotated.jpg", { type: "image/jpeg" }), options: mediaImageRecipe(), original: true } });
      assert.ok(result?.original);
      assert.equal(result.outputs[0].width, 2400); assert.equal(result.outputs[0].height, 4800);
      assert.equal(result.original.extension, alpha ? "png" : "jpg");
      assert.deepEqual(calls.at(-1), { width: 3000, height: 6000, type: alpha ? "image/png" : "image/jpeg", quality: 0.92 });
    }
    assert.equal(closed, 2);
  } finally {
    names.forEach((name, index) => { const descriptor = descriptors[index]; if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
});

test("an original cannot overwrite its main in an explicit originals destination", async () => {
  const file = new File([photo()], "photo.jpg");
  for (const folder of ["media/originals", "media/originals/nested"]) {
    await assert.rejects(prepareMediaFile(file, "repo", folder, undefined, encoder, undefined, undefined, "balanced", true), /Choose a website folder/);
    const f = fixture();
    await assert.rejects(f.host.import([{ file, folder, original }]), /Choose a website folder/);
    assert.equal(f.batches.length, 0);
  }
});
