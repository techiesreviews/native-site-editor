import { test } from "node:test";
import assert from "node:assert/strict";
import { planMediaReplace, replacementImageSize } from "../src/page-builder/replace-everywhere";
import { createMediaWorkspace, applyMediaWorkspaceBatch, type MediaReplaceRequest, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { parseMediaRecords, MEDIA_RECORDS_PATH, type MediaRecords } from "../shared/media-records";
import { gitBlobSha, memoryUploadBytes } from "../src/uploads";

const path = "media/images/photo.jpg", copy = "media/images/photo-480.jpg", gone = "media/images/photo-960.jpg", original = "media/originals/photo.png";
const trim = "media/images/photo-crop.webp", trimCopy = "media/images/photo-crop-480.webp";
const paths = [path, copy, gone, original, trim, trimCopy];
const records: MediaRecords = { version: 2, collections: ["Travel"], files: {
  [path]: { collections: ["Travel"], description: { text: "Tram", byAgent: true }, decorative: true, alwaysKeep: true, places: { "index.html": { agentText: "Own words" } }, credit: "Artist" },
  [trim]: { trimmedFrom: { source: copy, trim: { x: 0, y: 0, width: .5, height: .5 } } },
} };
function result(extension = "jpg"): MediaReplaceRequest["result"] {
  return { before: 20, after: 10, outputs: [
    { blob: new Blob(["new main"]), extension, width: 800, height: 400 },
    { blob: new Blob(["new copy"]), extension, width: 480, height: 240, variantWidth: 480 },
  ] };
}
async function plan(sources: Record<string, string | undefined> = {}, extra: Partial<Parameters<typeof planMediaReplace>[0]> = {}) {
  const request = extra.request ?? { path, result: result() };
  const main = path.replace(/\.jpg$/, "." + request.result.outputs[0].extension);
  const versions = new Map(await Promise.all(request.result.outputs.map(async output => [output.variantWidth ? main.replace(/\.[^.]+$/, `-${output.variantWidth}.${output.extension}`) : main,
    (await gitBlobSha(new Uint8Array(await output.blob.arrayBuffer()))).slice(0, 8)] as const)));
  return planMediaReplace({ request, paths, sources, records, versions, site: { origins: ["https://site.test"] }, ...extra });
}
const mainHash = (async () => (await gitBlobSha(new TextEncoder().encode("new main"))).slice(0, 8))();
const copyHash = (async () => (await gitBlobSha(new TextEncoder().encode("new copy"))).slice(0, 8))();

test("same name and address, new family bytes, missing copies/original removed, records copied without mutation", async () => {
  const before = structuredClone(records);
  const p = await plan();
  assert.equal(p.main, path);
  assert.deepEqual(p.uploads.map(upload => upload.path), [path, copy]);
  assert.equal(await p.uploads[0].blob.text(), "new main");
  assert.deepEqual(p.deletes, [gone, original]);
  assert.ok(p.deletes.every(path => !p.uploads.some(upload => upload.path === path)));
  assert.deepEqual(p.records.files[path], records.files[path]);
  assert.deepEqual(records, before);
});

test("version marks cover every file kind, query/hash, entities, escaped JSON and own-domain sharing addresses", async () => {
  const h = await mainHash;
  const sources = {
    "index.html": `<img src="/${path}?v=old&w=1#hash" data-src="/${path}?w=1&amp;v=older#top"><link imagesrcset="/${copy} 480w"><meta property="og:image" content="http://www.site.test/${path}?w=1&amp;q=2#hi"><script type="application/ld+json">{"image":"/${path}"}</script><script>const x="/${path}";</script>`,
    "styles/site.css": `a{background:url(../${path}?w=1#hi)}`,
    "app.js": `const x="\\/media\\/images\\/photo.jpg?w=1&v=old#hi";`,
    "data.json": `{"image":"/${path}?v=old"}`,
    "sitemap.xml": `<loc>https://site.test/${path}?w=1&amp;q=2#top</loc>`,
    "feed.rss": `<image>/${path}</image>`,
    "feed.atom": `<image>/${path}</image>`,
    "icon.svg": `<image xlink:href="/${path}"/>`,
    "README.md": `[picture](${path}?w=1#hash)`,
    "_redirects": `/ancient /${path} 301\n`,
    "_headers": `/${path}\n  Cache-Control: max-age=10\n`,
  };
  const p = await plan(sources);
  for (const file of Object.keys(sources).filter(file => !file.startsWith("_"))) assert.ok(p.edits.get(file)?.includes(`v=${h}`) || file === "index.html", file);
  const html = p.edits.get("index.html")!;
  assert.ok(html.includes(`?v=${h}&w=1#hash`));
  assert.ok(html.includes(`?w=1&amp;v=${h}#top`));
  assert.ok(html.includes(`http://www.site.test/${path}?w=1&amp;q=2&amp;v=${h}#hi`));
  assert.ok(html.includes(`/${copy}?v=${await copyHash} 480w`));
  assert.equal(p.edits.get("app.js"), `const x="\\/media\\/images\\/photo.jpg?w=1&v=${h}#hi";`);
  assert.equal(p.edits.get("sitemap.xml"), `<loc>https://site.test/${path}?w=1&amp;q=2&amp;v=${h}#top</loc>`);
  // A redirect destination is a mention: it gets the mark; the source (a request path) stays.
  assert.equal(p.edits.get("_redirects"), `/ancient /${path}?v=${h} 301\n`);
  assert.equal(p.edits.has("_headers"), false);
});

test("same-format redirect destinations keep query and fragment and gain the mark; sources stay", async () => {
  const p = await plan({ "_redirects": `/legacy /${path}?size=1#top 301\n/${path} /elsewhere 302\n` });
  assert.equal(p.edits.get("_redirects"), `/legacy /${path}?size=1&v=${await mainHash}#top 301\n/${path} /elsewhere 302\n`);
});

test("each mention keeps encoding, slash entities and escapes; external URLs are untouched", async () => {
  const h = await mainHash;
  const p = await plan({ "index.html": `<img src="/media&#47;images&#47;photo.jpg"><img src="/media/images/%70hoto.jpg"><img src="https://other.test/${path}">`, "style.css": 'a{background:url(/media/images/\\70 hoto.jpg)}' });
  assert.equal(p.edits.get("index.html"), `<img src="/media&#47;images&#47;photo.jpg?v=${h}"><img src="/media/images/%70hoto.jpg?v=${h}"><img src="https://other.test/${path}">`);
  assert.equal(p.edits.get("style.css"), `a{background:url(/media/images/\\70 hoto.jpg?v=${h})}`);
});

test("responsive widths remade, absent width dropped only from srcset, main w descriptor follows dimensions", async () => {
  const p = await plan({ "index.html": `<img src="/${gone}" srcset="/${path} 1200w, /${copy} 480w, /${gone} 960w"><link imagesrcset="/${gone} 960w, /${path} 1200w"><img data-srcset="/${gone} 960w">`, "data.json": `"/${gone}"` });
  const h = await mainHash;
  assert.equal(p.edits.get("index.html"), `<img src="/${path}?v=${h}" srcset="/${path}?v=${h} 800w, /${copy}?v=${await copyHash} 480w"><link imagesrcset="/${path}?v=${h} 800w"><img data-srcset="/${path}?v=${h} 800w">`);
  assert.equal(p.edits.get("data.json"), `"/${path}?v=${h}"`);
  const newer = result(); newer.outputs.push({ blob: new Blob(["1600"]), extension: "jpg", variantWidth: 1600 });
  assert.ok((await plan({}, { request: { path, result: newer } })).uploads.some(upload => upload.path === "media/images/photo-1600.jpg"));
});

test("shapes and other declarations survive; focus re-centres; Original height follows new ratio", async () => {
  const source = `<img width='600' height='500' src="/${path}" style="color: red; aspect-ratio: 4 / 3; object-fit: contain; object-position: 20% 30%; --x: 1"><img src="/${path}" width="600" height="500" style="object-position: left top; color:blue"><img src="/${path}">`;
  const p = await plan({ "index.html": source });
  const html = p.edits.get("index.html")!;
  assert.ok(html.includes("width='600' height='500'"));
  assert.ok(html.includes('color: red; aspect-ratio: 4 / 3; object-fit: contain; object-position: 50% 50%; --x: 1'));
  assert.ok(html.includes('width="600" height="300" style="object-position: 50% 50%; color:blue"'));
});

test("trimmed places switch families and preserve shape using attributes or real dimensions", async () => {
  const p = await plan({ "index.html": `<img src="/${trim}" width="300" height="200" style="color:red"><img src="/${trimCopy}" style="aspect-ratio: 1 / 1; object-fit:contain; object-position: 10% 0"><img src="/${trim}">`, "style.css": `a{background:url(/${trim})}` }, { dimensions: new Map([[trim, { width: 500, height: 250 }]]) });
  const html = p.edits.get("index.html")!;
  assert.ok(html.includes('width="300" height="200" style="color:red; aspect-ratio: 300 / 200; object-fit: cover; object-position: 50% 50%;"'));
  assert.ok(html.includes('aspect-ratio: 1 / 1; object-fit:contain; object-position: 50% 50%'));
  assert.ok(html.includes('aspect-ratio: 500 / 250; object-fit: cover; object-position: 50% 50%;'));
  assert.ok(!html.includes("photo-crop"));
  assert.ok(p.edits.get("style.css")?.includes(`${path}?v=${await mainHash}`));
});

test("relative component images get shape and focus edits using their page context", async () => {
  const p = await plan({ "media/index.html": "<site-card></site-card>", "components/card.html": '<img src="images/photo.jpg" width="600" height="500" style="object-position:left">' }, { site: { origins: [], pages: ["media/index.html"], components: { "site-card": "components/card.html" } } });
  assert.equal(p.edits.get("components/card.html"), `<img src="/${path}?v=${await mainHash}" width="600" height="300" style="object-position:50% 50%">`);
});

test("type change keeps base, records and redirect destination spelling; forwarding follows Always keep or override", async () => {
  const sources = { "index.html": `<img src="/${path}">`, "_redirects": `/ancient https://site.test/media/images/%70hoto.jpg?w=1#top 301\n/${path} https://other.test/${path} 302\n`, "_headers": `/${path}\n  X: y\n` };
  const p = await plan(sources, { request: { path, result: result("webp") } });
  assert.equal(p.main, "media/images/photo.webp");
  assert.deepEqual(p.records.files[p.main], records.files[path]);
  assert.equal(p.records.files[trim].trimmedFrom?.source, "media/images/photo-480.webp");
  assert.ok(p.edits.get("_redirects")?.includes(`/ancient https://site.test/media/images/photo.webp?w=1&v=${await mainHash}#top 301`));
  for (const [old, target] of [[path, p.main], [copy, "media/images/photo-480.webp"], [gone, p.main]]) assert.ok(p.edits.get("_redirects")?.includes(`/${old} /${target} 301`));
  // New forwarding lines point at addresses no browser has cached: no mark.
  assert.ok(!p.edits.get("_redirects")?.split("\n").some(line => line.startsWith(`/${path} /`) && line.includes("v=")));
  assert.ok(!p.edits.get("_headers")?.includes("?v="));
  assert.equal((await plan({}, { request: { path, result: result("webp"), keepOldAddress: false } })).edits.has("_redirects"), false);
  const unkept = structuredClone(records); unkept.files[path].alwaysKeep = false;
  assert.equal((await plan({}, { records: unkept, request: { path, result: result("webp") } })).edits.has("_redirects"), false);
  assert.ok((await plan({}, { records: unkept, request: { path, result: result("webp"), keepOldAddress: true } })).edits.has("_redirects"));
});

test("taken new main or family member refuses without changing records", async () => {
  const before = structuredClone(records);
  for (const taken of ["media/images/photo.webp"])
    await assert.rejects(plan({}, { paths: [...paths, taken], request: { path, result: result("webp"), original: { blob: new Blob(["original"]), extension: "jpg" } } }), /is taken/);
  assert.deepEqual(records, before);
});

test("new kept original uses family base, previous original without counterpart is removed", async () => {
  const p = await plan({}, { request: { path, result: result(), original: { blob: new Blob(["original"]), extension: "jpg" } } });
  assert.equal(p.uploads.at(-1)?.path, "media/originals/photo.jpg");
  assert.ok(p.deletes.includes(original));
});

test("invalid inputs refuse plainly: non-main, SVG, trimmed, malformed preparation", async () => {
  for (const chosen of [copy, "document.pdf", "image.svg", trim]) await assert.rejects(plan({}, { request: { path: chosen, result: result() } }), /main picture|Trimmed copy/);
  const invalid = [result(), result(), result(), result(), result(), result()];
  invalid[0].outputs = [];
  invalid[1].outputs.push({ ...invalid[1].outputs[0] });
  invalid[2].outputs[1].extension = "png";
  invalid[3].outputs.push({ ...invalid[3].outputs[1] });
  invalid[4].outputs[1].variantWidth = 0;
  invalid[5].outputs[0].width = 0;
  for (const prepared of invalid) await assert.rejects(plan({}, { request: { path, result: prepared } }));
});

function png(width: number, height: number) {
  const bytes = new Uint8Array(24); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height); return bytes;
}
test("dimension reader handles PNG, GIF, JPEG, WebP variants and AVIF, rejects short/zero headers", () => {
  assert.deepEqual(replacementImageSize(png(300, 200)), { width: 300, height: 200 });
  const gif = new Uint8Array([71, 73, 70, 56, 57, 97, 44, 1, 200, 0]);
  assert.deepEqual(replacementImageSize(gif), { width: 300, height: 200 });
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 7, 8, 0, 200, 1, 44]);
  assert.deepEqual(replacementImageSize(jpeg), { width: 300, height: 200 });
  for (const kind of ["VP8X", "VP8 ", "VP8L"]) {
    const bytes = new Uint8Array(30), view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode("RIFF")); bytes.set(new TextEncoder().encode("WEBP"), 8); bytes.set(new TextEncoder().encode(kind), 12);
    if (kind === "VP8X") { bytes[24] = 43; bytes[25] = 1; bytes[27] = 199; }
    if (kind === "VP8 ") { bytes.set([157, 1, 42], 23); view.setUint16(26, 300, true); view.setUint16(28, 200, true); }
    if (kind === "VP8L") { bytes[20] = 47; view.setUint32(21, 299 | (199 << 14), true); }
    assert.deepEqual(replacementImageSize(bytes), { width: 300, height: 200 });
  }
  const avif = new Uint8Array(36), view = new DataView(avif.buffer);
  avif.set(new TextEncoder().encode("ftypavif"), 4); view.setUint32(16, 20); avif.set(new TextEncoder().encode("ispe"), 20); view.setUint32(28, 300); view.setUint32(32, 200);
  assert.deepEqual(replacementImageSize(avif), { width: 300, height: 200 });
  for (const bytes of [new Uint8Array(), png(0, 200), jpeg.slice(0, 10)]) assert.equal(replacementImageSize(bytes), undefined);
});

async function workspace(kept = false, stillUsed = false) {
  const files = new Set([...paths, "index.html", MEDIA_RECORDS_PATH, ...(stillUsed ? ["other/photo-crop.webp", "notes.txt"] : [])]);
  const data = structuredClone(records); data.files[trim].alwaysKeep = kept;
  const sources = new Map([[MEDIA_RECORDS_PATH, JSON.stringify(data)], ["index.html", `<img src="/${trim}" width="300" height="200">`]]);
  // Ambiguous bare references cannot be rewritten safely, so wide usage retains the trim.
  if (stillUsed) sources.set("notes.txt", "photo-crop.webp");
  const blobs = new Map(paths.map(file => [file, new Blob([file === trim ? png(500, 250) : new TextEncoder().encode("old " + file)])]));
  const batches: MediaWorkspaceBatch[] = [];
  const context: MediaWorkspaceContext = {
    key: "site", scope: { account: "a", repoId: 1, repo: "a/r", branch: "dev" }, paths: [...files], items: [...blobs.keys()].map(path => ({ path })), pages: ["index.html"], components: {},
    history: true, removedCopies: memoryUploadBytes(), now: () => Date.parse("2026-10-14"),
    drafts: { get: () => undefined, save: () => false, remove: () => false }, assertLive() {},
    read: async path => sources.get(path), blob: async path => blobs.get(path)!, assetVersion: path => files.has(path) ? "sha:" + path : undefined,
    openPage: async () => {}, applyBatch: async batch => {
      await applyMediaWorkspaceBatch(batch, { assertLive() {}, paths: () => [...files], source: path => sources.get(path), assetVersion: path => context.assetVersion(path),
        snapshot: async () => undefined, stage: async () => {}, rollback: async () => {}, commit: batch => { batches.push(batch); } });
    },
  };
  const host = createMediaWorkspace(async () => context); await host.load();
  await host.replace({ path, result: result("webp") });
  return { batch: batches[0], records: parseMediaRecords(batches[0].edits.get(MEDIA_RECORDS_PATH)) };
}
test("unused trimmed family goes to Recently removed with old family; main record survives removal", async () => {
  const p = await workspace();
  assert.ok(p.batch.deletes.includes(trim)); assert.ok(p.batch.deletes.includes(trimCopy));
  assert.deepEqual(p.records.removed?.map(entry => entry.path).sort(), [path, trim].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(p.records.files["media/images/photo.webp"])), records.files[path]);
  assert.equal(p.records.files[trim], undefined);
  assert.ok(p.batch.deletes.every(path => !p.batch.uploads.some(upload => upload.path === path)));
});
test("Always keep or still-mentioned trims retain records with source following type change", async () => {
  for (const [kept, used] of [[true, false], [false, true]]) {
    const p = await workspace(kept, used);
    assert.ok(!p.batch.deletes.includes(trim));
    assert.equal(p.records.files[trim].trimmedFrom?.source, "media/images/photo-480.webp");
  }
});

test("srcset pruning retains unrelated data URLs and candidates", async () => {
  const p = await plan({ "index.html": `<img srcset="data:image/png;base64,AAAA 1x, /${gone} 960w, /unrelated.png 2x, /${path} 1200w">` });
  assert.equal(p.edits.get("index.html"), `<img srcset="data:image/png;base64,AAAA 1x, /unrelated.png 2x, /${path}?v=${await mainHash} 800w">`);
});

test("declaration edits ignore quoted semicolons and comments, preserve priority, quote unquoted style", async () => {
  const p = await plan({ "index.html": `<img src="/${path}" style="--label: 'a;object-position: x'; /* aspect-ratio:1 */ object-position: left !important; color:red"><img src="/${path}" style=object-position:left>` });
  assert.ok(p.edits.get("index.html")?.includes("--label: 'a;object-position: x'; /* aspect-ratio:1 */ object-position: 50% 50% !important; color:red"));
  assert.ok(p.edits.get("index.html")?.includes('style="object-position:50% 50%"'));
});

test("bare assignments, empty query/version, hash-only and encoded query spelling get correct version marks", async () => {
  const h = await mainHash;
  const p = await plan({ "notes.txt": `image=/${path}?w=1&v=old#top /${path}?v=#top /${path}?#top /${path}#top`, "index.html": `<img src="/${path}?w=1&#38;v=old#top">` });
  assert.equal(p.edits.get("notes.txt"), `image=/${path}?w=1&v=${h}#top /${path}?v=${h}#top /${path}?v=${h}#top /${path}?v=${h}#top`);
  assert.ok(p.edits.get("index.html")?.includes(`?w=1&#38;v=${h}#top`));
});

test("unresolved unique encoded basename keeps its spelling at the same address", async () => {
  assert.equal((await plan({ "notes.md": "%70hoto.jpg" })).edits.get("notes.md"), `%70hoto.jpg?v=${await mainHash}`);
});

test("a folder occupying a new family address refuses before planning writes", async () => {
  await assert.rejects(plan({}, { paths: [...paths, "media/images/photo.webp/nested.txt"], request: { path, result: result("webp") } }), /is taken/);
});


test("same-format extension casing keeps the exact occupied address", async () => {
  const upper = "media/images/Photo.JPG", copy = "media/images/Photo-480.JPG";
  const p = planMediaReplace({ request: { path: upper, result: result() }, paths: [upper, copy], sources: { "index.html": `<img src="/${upper}">` },
    records: { version: 2, collections: [], files: {} }, versions: new Map([[upper, await mainHash], [copy, await copyHash]]) });
  assert.equal(p.main, upper); assert.deepEqual(p.uploads.map(upload => upload.path), [upper, copy]);
  assert.equal(p.edits.get("index.html"), `<img src="/${upper}?v=${await mainHash}">`);
  assert.equal(p.edits.has("_redirects"), false);
});

test("retained trim provenance keeps its responsive source unless that copy disappears", async () => {
  assert.equal((await plan()).records.files[trim].trimmedFrom?.source, copy);
  const noCopies = result(); noCopies.outputs = noCopies.outputs.slice(0, 1);
  assert.equal((await plan({}, { request: { path, result: noCopies } })).records.files[trim].trimmedFrom?.source, path);
});

test("a srcset whose only candidate's width disappears keeps the new main, so the place still shows a picture", async () => {
  const h = await mainHash;
  const p = await plan({ "index.html": `<img srcset="/${gone} 960w" alt="">` });
  assert.equal(p.edits.get("index.html"), `<img srcset="/${path}?v=${h} 800w" alt="">`);
});

test("a type change forwards every old address when only a responsive copy is Always keep", async () => {
  const copyKept = structuredClone(records); copyKept.files[path].alwaysKeep = false; copyKept.files[copy] = { alwaysKeep: true };
  const p = await plan({}, { records: copyKept, request: { path, result: result("webp") } });
  for (const [old, target] of [[path, p.main], [copy, "media/images/photo-480.webp"], [gone, p.main]]) assert.ok(p.edits.get("_redirects")?.includes(`/${old} /${target} 301`));
  assert.deepEqual(p.records.files["media/images/photo-480.webp"], { alwaysKeep: true });
  assert.equal(p.records.files[copy], undefined);
  assert.equal((await plan({}, { records: copyKept, request: { path, result: result("webp"), keepOldAddress: false } })).edits.has("_redirects"), false);
});

test("a responsive copy that stays at its address keeps its record", async () => {
  const copyKept = structuredClone(records); copyKept.files[copy] = { alwaysKeep: true, credit: "Copy" };
  const p = await plan({}, { records: copyKept });
  assert.deepEqual(p.records.files[copy], { alwaysKeep: true, credit: "Copy" });
});
