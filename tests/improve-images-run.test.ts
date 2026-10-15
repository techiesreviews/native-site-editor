import { test } from "node:test";
import assert from "node:assert/strict";
import { improveImagesSession, improveRow, revertJson, runMaps, stagingContext, undoRows, type ImproveRowPorts, type KnownSizes } from "../src/page-builder/improve-images-run";
import { applyMediaWorkspaceBatch, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords } from "../shared/media-records";
import { readSource } from "../src/page-builder/source-tree";
import type { prepareMediaFile } from "../src/page-builder/media-prepare";

function imageBlob(size = 1000, width = 1200, height = 800) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(16, width); view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}
const outside = "https://mobbin.com/og-image.png";
const prepare: typeof prepareMediaFile = async (file, _key, folder) => ({
  request: { file, folder: folder!, result: { outputs: [
    { blob: imageBlob(), extension: "webp", width: 1200, height: 600 },
    { blob: imageBlob(100, 480, 240), extension: "webp", width: 480, height: 240, variantWidth: 480 },
  ], before: file.size, after: 1000 } },
});

function site(pages: Record<string, string>) {
  const text = new Map<string, string>(Object.entries(pages));
  const bytes = new Map<string, Blob>([["images/heavy.jpg", imageBlob(300000, 3000, 2000)]]);
  const versions = new Map<string, string>([["images/heavy.jpg", "old"]]);
  const batches: MediaWorkspaceBatch[] = [];
  let encodes = 0, hook: (() => void) | undefined;
  const ctx: MediaWorkspaceContext = {
    key: "test", scope: { account: "test", repoId: 1, repo: "test/test", branch: "main" }, history: false,
    drafts: { get: () => undefined, save: () => { throw new Error("Direct write"); }, remove: () => { throw new Error("Direct write"); } },
    get paths() { return [...new Set([...text.keys(), ...bytes.keys()])]; },
    get items() { return [...bytes].map(([path, blob]) => ({ path, size: blob.size })); },
    pages: Object.keys(pages), components: {}, origins: ["https://own.example"],
    assertLive() {}, async read(path) { return text.get(path) ?? (path.endsWith(".svg") ? bytes.get(path)?.text() : undefined); }, async blob(path) { return bytes.get(path)!; },
    assetVersion: path => versions.get(path), async openPage() {},
    async applyBatch(batch) {
      await applyMediaWorkspaceBatch(batch, {
        assertLive() {}, paths: () => ctx.paths, source: path => text.get(path), assetVersion: path => versions.get(path),
        async snapshot() { return {}; }, async stage() {},
        commit(batch) {
          batches.push(batch);
          for (const path of batch.deletes) { bytes.delete(path); text.delete(path); versions.delete(path); }
          for (const [path, source] of batch.edits) text.set(path, source);
          for (const upload of batch.uploads) { bytes.set(upload.path, upload.blob); versions.set(upload.path, "new:" + upload.path); }
        }, async rollback() {},
      });
    },
  };
  const ports: ImproveRowPorts = { prepare, probe: async () => true,
    heavy: { tree: source => readSource(source, { page: true }), async encode(_file, options) {
      encodes++; hook?.();
      const outputs = [{ blob: imageBlob(), width: 1200, height: 800, extension: "webp" },
        ...options.responsive ? [480, 960].map(width => ({ blob: imageBlob(100, width, Math.round(width * 2 / 3)), width, height: Math.round(width * 2 / 3), extension: "webp", variantWidth: width })) : []];
      return { outputs, before: 300000, after: 1000 };
    } } };
  const known: KnownSizes = { "images/heavy.jpg": { width: 3000, height: 2000 } };
  const maps = runMaps();
  const picture = async () => new Response(await imageBlob().arrayBuffer(), { headers: { "content-type": "image/png" } });
  const row = (file: string, signal = new AbortController().signal) => improveRow(ctx, { row: file, known, maps, signal, fetch: picture, siteUrl: "https://own.example/" }, ports);
  return { ctx, text, bytes, batches, row, get encodes() { return encodes; }, onEncode(work: () => void) { hook = work; } };
}

test("a row fixed by several engines is saved once: one Undo step for the page", async () => {
  const s = site({ "index.html": `<title>Home</title><img src="${outside}" alt="Logo"><img src="/images/heavy.jpg" alt="Desk">` });
  const outcome = await s.row("index.html");
  assert.equal(s.batches.length, 1);
  const batch = s.batches[0];
  assert.equal(batch.label, "Improve images: Home");
  const html = s.text.get("index.html")!;
  assert.match(html, /src="\/media\/images\/mobbin-og-image\.webp"/);
  assert.match(html, /src="\/images\/heavy\.webp"/);
  assert.ok(!html.includes(outside));
  assert.deepEqual(batch.uploads.map(upload => upload.path).sort(), ["images/heavy-480.webp", "images/heavy-960.webp", "images/heavy.webp", "media/images/mobbin-og-image-480.webp", "media/images/mobbin-og-image.webp"]);
  // The merged save proves the real site as it was, not what an earlier engine staged.
  assert.equal(batch.expectedSources.get("index.html"), `<title>Home</title><img src="${outside}" alt="Logo"><img src="/images/heavy.jpg" alt="Desk">`);
  assert.ok(!batch.expectedAssets.has("media/images/mobbin-og-image.webp"));
  assert.equal(outcome.changed, true); assert.equal(outcome.label, "Home");
  assert.deepEqual(outcome.added.sort(), batch.uploads.map(upload => upload.path).sort());
  assert.deepEqual(outcome.texts.map(([path]) => path).sort(), [MEDIA_RECORDS_PATH, "index.html"].sort());
});

test("Undo per row works in any order; Undo all removes what nothing uses any more", async () => {
  const s = site({ "index.html": '<img src="/images/heavy.jpg">', "other.html": '<img src="/images/heavy.jpg">' });
  const first = await s.row("index.html"), second = await s.row("other.html");
  assert.equal(s.encodes, 1, "the later row reuses the lighter file");
  assert.match(s.text.get("other.html")!, /heavy\.webp/);
  // The earlier row first: its page goes back; the lighter file stays, the other page still shows it.
  const kept = await undoRows(s.ctx, [first]);
  assert.deepEqual(kept.sort(), ["images/heavy-480.webp", "images/heavy-960.webp", "images/heavy.webp"]);
  assert.equal(s.text.get("index.html"), '<img src="/images/heavy.jpg">');
  assert.ok(s.bytes.has("images/heavy.webp"));
  assert.ok(parseMediaRecords(s.text.get(MEDIA_RECORDS_PATH)).files["images/heavy.webp"], "a file still used keeps its record");
  assert.deepEqual(await undoRows(s.ctx, [second], kept), []);
  assert.equal(s.text.get("other.html"), '<img src="/images/heavy.jpg">');
  assert.deepEqual([...s.bytes.keys()], ["images/heavy.jpg"]);
  assert.equal(parseMediaRecords(s.text.get(MEDIA_RECORDS_PATH)).files["images/heavy.webp"], undefined);

  const again = site({ "index.html": '<img src="/images/heavy.jpg">', "other.html": '<img src="/images/heavy.jpg">' });
  const rows = [await again.row("index.html"), await again.row("other.html")];
  const saves = again.batches.length;
  await undoRows(again.ctx, rows);
  assert.equal(again.batches.length, saves + 1, "Undo all is one change");
  assert.equal(again.batches.at(-1)!.label, "Undo Improve images");
  assert.deepEqual([...again.bytes.keys()], ["images/heavy.jpg"]);
  assert.equal(again.text.get("index.html"), '<img src="/images/heavy.jpg">');
});

test("a row that adds the site's player saves its files as text, and its Undo removes them (slice 101)", async () => {
  const embed = '<iframe src="https://www.youtube.com/embed/abcdefghijk" title="Tour"></iframe>';
  const s = site({ "index.html": `<html><head><title>Home</title></head><body>${embed}</body></html>` });
  // As the starter's player: its files name each other, and its script loads the online player on demand.
  const player = { "styles/media-player.css": "/* The player's look (scripts/media-player.js builds the players). */",
    "scripts/media-player.js": '// Styled by styles/media-player.css.\nimport("./media-online.js");', "scripts/media-online.js": "// Loaded by scripts/media-player.js." };
  const outcome = await improveRow(s.ctx, { row: "index.html", known: {}, maps: runMaps(), signal: new AbortController().signal, fetch: async () => new Response(null, { status: 404 }), siteUrl: "https://own.example/" },
    { gifs: { read: async () => ({ title: "Tour" }), playerFiles: async () => player } });
  assert.equal(s.batches.length, 1);
  const batch = s.batches[0];
  // Never uploads: the preview's stylesheet reader takes a stylesheet only as text.
  assert.deepEqual(batch.uploads.map(upload => upload.path), []);
  for (const [path, text] of Object.entries(player)) { assert.equal(batch.edits.get(path), text); assert.equal(batch.expectedSources.get(path), undefined); assert.ok(batch.expectedSources.has(path)); }
  assert.match(s.text.get("index.html")!, /href="\/styles\/media-player\.css"/);
  assert.deepEqual(outcome.added.sort(), Object.keys(player).sort());
  assert.ok(!outcome.added.includes(MEDIA_RECORDS_PATH), "the records file is never an added file");
  assert.deepEqual(await undoRows(s.ctx, [outcome]), []);
  assert.match(s.text.get("index.html")!, /youtube\.com\/embed/);
  for (const path of Object.keys(player)) assert.ok(!s.text.has(path), `${path} goes with the Undo`);
});

test("undoing one of two rows that share the player keeps every player file the other still loads; undoing both removes them", async () => {
  const embed = '<iframe src="https://www.youtube.com/embed/abcdefghijk" title="Tour"></iframe>';
  const html = (title: string) => `<html><head><title>${title}</title></head><body>${embed}</body></html>`;
  const s = site({ "index.html": html("Home"), "tour.html": html("Tour") });
  // As the starter's player: its files name each other, and its script loads the online player on demand.
  const player = { "styles/media-player.css": "/* The player's look (scripts/media-player.js builds the players). */",
    "scripts/media-player.js": '// Styled by styles/media-player.css.\nimport("./media-online.js");', "scripts/media-online.js": "// Loaded by scripts/media-player.js." };
  const row = (file: string) => improveRow(s.ctx, { row: file, known: {}, maps: runMaps(), signal: new AbortController().signal, fetch: async () => new Response(null, { status: 404 }), siteUrl: "https://own.example/" },
    { gifs: { read: async () => ({ title: "Tour" }), playerFiles: async () => player } });
  const first = await row("index.html"), second = await row("tour.html");
  assert.deepEqual(first.added.sort(), Object.keys(player).sort());
  assert.deepEqual(second.added, [], "the second row finds the player in place");
  const kept = await undoRows(s.ctx, [first]);
  assert.match(s.text.get("index.html")!, /youtube\.com\/embed/);
  for (const path of Object.keys(player)) assert.ok(s.text.has(path), `${path} stays for Tour`);
  assert.deepEqual(kept.sort(), Object.keys(player).sort());
  assert.deepEqual(await undoRows(s.ctx, [second], kept), []);
  for (const path of Object.keys(player)) assert.ok(!s.text.has(path), `${path} goes once nothing uses the player`);
});

test("Undo refuses a page edited since and changes nothing", async () => {
  const s = site({ "index.html": '<img src="/images/heavy.jpg">' });
  const outcome = await s.row("index.html");
  s.text.set("index.html", s.text.get("index.html") + "<p>Lex typed</p>");
  const saves = s.batches.length;
  await assert.rejects(undoRows(s.ctx, [outcome]), /index\.html was edited after Improve images/);
  assert.equal(s.batches.length, saves);
});

test("Cancel saves nothing of the row; nothing to do saves nothing", async () => {
  const s = site({ "index.html": `<img src="${outside}"><img src="/images/heavy.jpg">` });
  // Stopped while the heavy file is made, after the outside picture was prepared: nothing is saved.
  const stop = new AbortController();
  s.onEncode(() => stop.abort());
  await assert.rejects(s.row("index.html", stop.signal), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(s.batches.length, 0);
  assert.deepEqual([...s.bytes.keys()], ["images/heavy.jpg"]);
  const done = site({ "index.html": '<img src="/media/x.svg" width="10" height="10">' });
  const outcome = await done.row("index.html");
  assert.equal(outcome.changed, false); assert.equal(done.batches.length, 0);
});

test("the staging workspace reads what earlier engines prepared and proves only first sightings", async () => {
  const s = site({ "index.html": "<p>old</p>" });
  const stage = stagingContext(s.ctx);
  const base = { label: "", expectedPaths: s.ctx.paths, expectedAssets: new Map(), moves: [], deletes: [], restores: [] };
  await stage.ctx.applyBatch({ ...base, expectedSources: new Map([["index.html", "<p>old</p>"]]), edits: new Map([["index.html", "<p>one</p>"]]), uploads: [{ path: "media/a.webp", blob: imageBlob() }] });
  assert.equal(await stage.ctx.read("index.html"), "<p>one</p>");
  assert.ok(stage.ctx.paths.includes("media/a.webp")); assert.ok(stage.ctx.items.some(item => item.path === "media/a.webp"));
  await stage.ctx.applyBatch({ ...base, expectedSources: new Map([["index.html", "<p>one</p>"]]), expectedAssets: new Map([["media/a.webp", "staged:0"]]), edits: new Map([["index.html", "<p>two</p>"]]), uploads: [] });
  const batch = stage.batch("Improve images: Home");
  assert.equal(batch.expectedSources.get("index.html"), "<p>old</p>");
  assert.ok(!batch.expectedAssets.has("media/a.webp"));
  assert.equal(batch.edits.get("index.html"), "<p>two</p>");
  assert.deepEqual(batch.expectedPaths, s.ctx.paths);
  await assert.rejects(stage.ctx.applyBatch({ ...base, expectedSources: new Map(), edits: new Map(), uploads: [], deletes: ["index.html"] }), /only adds files/);
});

test("records go back field by field; a field changed since keeps its newer value", () => {
  const before = { files: { "a.jpg": { description: { text: "A" }, places: { "index.html": { decorative: true } } } } };
  const after = { files: { "a.jpg": { description: { text: "A" }, places: {} }, "a.webp": { lighterFrom: "a.jpg", places: { "index.html": { decorative: true } } } } };
  const now = { files: { "a.jpg": { description: { text: "Edited" }, places: {} }, "a.webp": { lighterFrom: "a.jpg", places: { "index.html": { decorative: true } } }, "b.jpg": {} } };
  assert.deepEqual(revertJson(before, after, now), { files: { "a.jpg": { description: { text: "Edited" }, places: { "index.html": { decorative: true } } }, "b.jpg": {} } });
  assert.deepEqual(revertJson(before, after, after), before);
  assert.deepEqual(revertJson([1], [2], [3]), [3]);
  const records = serializeMediaRecords({ version: 2, collections: [], files: {} });
  assert.ok(records.includes('"files"'));
});

test("two rows sharing an outside picture bring it in once and both keep its size and copies; Fix after Undo brings it in again", async () => {
  const tag = `<img src="${outside}" alt="Logo">`;
  const s = site({ "index.html": tag, "about/index.html": tag });
  const first = await s.row("index.html"), second = await s.row("about/index.html");
  assert.equal(second.added.length, 0, "the second row reuses the brought-in file");
  for (const page of ["index.html", "about/index.html"]) {
    const html = s.text.get(page)!;
    assert.match(html, /src="\/media\/images\/mobbin-og-image\.webp"/, page);
    assert.match(html, /width="1200" height="600"/, page);
    assert.match(html, /mobbin-og-image-480\.webp 480w/, page);
  }
  // Undo both: the brought-in files go; fixing again brings the picture in again instead of pointing at nothing.
  await undoRows(s.ctx, [first, second]);
  assert.equal(s.bytes.has("media/images/mobbin-og-image.webp"), false);
  const again = await s.row("index.html");
  assert.ok(again.added.includes("media/images/mobbin-og-image.webp"));
  assert.ok(s.bytes.has("media/images/mobbin-og-image.webp"));
  assert.match(s.text.get("index.html")!, /width="1200" height="600"/);
});

test("Undo proves every page it read for other uses", async () => {
  const s = site({ "index.html": '<img src="/images/heavy.jpg">', "other.html": "<p>No pictures</p>" });
  const outcome = await s.row("index.html");
  const saves = s.batches.length;
  await undoRows(s.ctx, [outcome]);
  const undo = s.batches[saves];
  assert.equal(undo.expectedSources.get("other.html"), "<p>No pictures</p>");
  assert.ok(undo.deletes.includes("images/heavy.webp"));
  assert.equal(undo.expectedSources.has("images/heavy.jpg"), false, "media files are proved by their versions");

  // An SVG read for other uses is proved by its version, so one changed meanwhile refuses the Undo.
  const svg = site({ "index.html": '<img src="/images/heavy.jpg">' });
  svg.bytes.set("images/logo.svg", new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/svg+xml" }));
  const fixed = await svg.row("index.html");
  const count = svg.batches.length;
  await undoRows(svg.ctx, [fixed]);
  assert.ok(svg.batches[count].expectedAssets.has("images/logo.svg"));
});

test("leave alone everywhere is one Undo step on the records; the screen's rows then skip it and ticking it again lifts it (slice 118)", async () => {
  const s = site({ "one/index.html": `<title>One</title><img src="/images/heavy.jpg">`, "two/index.html": `<title>Two</title><img src="/images/heavy.jpg">` });
  const session = improveImagesSession(async () => s.ctx);
  await session.leftAsIs({ picture: "images/heavy.jpg", row: "one/index.html" }, true);
  await session.leftAsIs({ picture: "images/heavy.jpg" }, true);
  assert.deepEqual(s.batches.map(batch => [batch.label, [...batch.edits.keys()], batch.uploads.length, batch.deletes.length]),
    [["Leave a picture as it is", [MEDIA_RECORDS_PATH], 0, 0], ["Leave a picture alone everywhere", [MEDIA_RECORDS_PATH], 0, 0]]);
  assert.deepEqual(parseMediaRecords(s.text.get(MEDIA_RECORDS_PATH)).leftAsIs, [{ picture: "images/heavy.jpg" }]);
  const plan = await session.plan({ "images/heavy.jpg": { width: 3000, height: 2000 } });
  assert.deepEqual(plan.rows.map(row => [row.file, row.count, row.pictures[0].leftAsIs]), [["one/index.html", 0, "everywhere"], ["two/index.html", 0, "everywhere"]]);
  // Fixing a row writes nothing and lists the picture as left alone.
  const outcome = await s.row("two/index.html");
  assert.equal(outcome.changed, false); assert.equal(s.batches.length, 2);
  assert.deepEqual(outcome.left.map(left => left.reason), ["left-alone"]);
  // Ticking it again on one page undoes it everywhere, as one more step.
  await session.leftAsIs({ picture: "images/heavy.jpg", row: "two/index.html" }, false);
  assert.equal(s.batches.at(-1)!.label, "Improve a picture again");
  assert.equal(parseMediaRecords(s.text.get(MEDIA_RECORDS_PATH)).leftAsIs, undefined);
  assert.equal((await session.plan({ "images/heavy.jpg": { width: 3000, height: 2000 } })).count, 2);
});
