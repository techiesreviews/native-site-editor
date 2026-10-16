import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { improveHeavy, type ImproveRequest, type ImprovePorts } from "../src/page-builder/improve-heavy";
import { applyMediaWorkspaceBatch, createMediaWorkspace, type MediaWorkspaceContext, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { parseMediaRecords, serializeMediaRecords, MEDIA_RECORDS_PATH } from "../shared/media-records";
import { mediaCleanUpSuggestions } from "../src/page-builder/media-clean-up";
import { mediaUsageRecords } from "../src/page-builder/media-usage";
import { SOCIAL_IMAGE_NOTE } from "../src/page-builder/social-image";
import { memoryUploadBytes } from "../src/uploads";
import { readSource } from "../src/page-builder/source-tree";

function imageBlob(size = 1000, width = 1200, height = 800) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(16, width); view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}
function fixture(html = '<img src="/images/heavy.jpg" alt="Keep &amp; this" class="photo">') {
  const text = new Map<string, string>([["index.html", html]]);
  const facts: ImproveRequest["files"] = { "images/heavy.jpg": { size: 300000, width: 3000, height: 2000 } };
  const bytes = new Map<string, Blob>([["images/heavy.jpg", imageBlob(300000, 3000, 2000)]]);
  const versions = new Map<string, string>([["images/heavy.jpg", "old"]]);
  const history: (() => void)[] = [], batches: MediaWorkspaceBatch[] = [];
  let hook: (() => void) | undefined;
  const ctx: MediaWorkspaceContext = {
    removedCopies: memoryUploadBytes(), key: "test", scope: { account: "test", repoId: 1, repo: "test/test", branch: "main" }, history: false,
    drafts: { get: () => undefined, save: () => { throw new Error("Direct write"); }, remove: () => { throw new Error("Direct write"); } },
    get paths() { return [...new Set([...text.keys(), ...bytes.keys()])]; },
    get items() { return [...bytes.keys()].map(path => ({ path })); }, pages: ["index.html"], components: {}, origins: ["https://own.example"],
    assertLive() {}, async read(path) { return text.get(path) ?? (path.endsWith(".svg") ? bytes.get(path)?.text() : undefined); }, async blob(path) { return bytes.get(path)!; },
    assetVersion: path => versions.get(path), async openPage() {},
    async applyBatch(batch) {
      await applyMediaWorkspaceBatch(batch, {
        assertLive: () => ctx.assertLive(), paths: () => ctx.paths, source: path => text.get(path), assetVersion: path => versions.get(path),
        async snapshot() { return { text: new Map(text), bytes: new Map(bytes), versions: new Map(versions) }; },
        async stage() { hook?.(); },
        commit(batch, state) {
          batches.push(batch);
          for (const path of batch.deletes) { bytes.delete(path); versions.delete(path); }
          for (const [path, source] of batch.edits) text.set(path, source);
          for (const upload of batch.uploads) { bytes.set(upload.path, upload.blob); versions.set(upload.path, "new:" + upload.path); }
          history.push(() => { text.clear(); bytes.clear(); versions.clear(); state.text.forEach((v, k) => text.set(k, v)); state.bytes.forEach((v, k) => bytes.set(k, v)); state.versions.forEach((v, k) => versions.set(k, v)); });
        }, async rollback() {},
      });
    },
  };
  let encodes = 0;
  const ports: ImprovePorts = { tree: source => readSource(source, { page: true }), async encode(_file, options) {
    encodes++;
    const extension = options.format === "jpeg" ? "jpg" : options.format === "avif" ? "avif" : "webp";
    const outputs = [{ blob: extension === "jpg" ? new Blob([imageBlob()], { type: "image/jpeg" }) : imageBlob(), width: 1200, height: 800, extension },
      ...options.responsive ? [480, 960].map(width => ({ blob: imageBlob(100, width, Math.round(width * 2 / 3)), width, height: Math.round(width * 2 / 3), extension, variantWidth: width })) : []];
    return { outputs, before: 300000, after: 1200 };
  } };
  return { ctx, text, bytes, versions, facts, ports, history, batches, get encodes() { return encodes; }, hook(work: () => void) { hook = work; },
    improve: (request: Partial<ImproveRequest> = {}) => improveHeavy(ctx, { row: "index.html", files: facts, ...request }, ports) };
}

test("heavy family rewritten across text kinds; later row reuses one file and one Undo per row", async () => {
  const f = fixture('<img src="/images/heavy.jpg" srcset="/images/heavy-480.jpg 480w, /images/heavy.jpg 3000w" alt="Keep &amp; this" class="photo">');
  f.bytes.set("images/heavy-480.jpg", imageBlob(2000, 480, 320)); f.versions.set("images/heavy-480.jpg", "copy"); f.facts["images/heavy-480.jpg"] = { size: 2000, width: 480, height: 320 };
  f.text.set("other.html", '<img src="/images/heavy.jpg">'); f.ctx.pages.push("other.html");
  f.text.set("share.html", '<meta property="og:image" content="https://own.example/images/heavy.jpg"><meta name="twitter:image" content="/images/heavy.jpg">');
  f.text.set("site.css", 'a{background:url(/images/heavy.jpg)}');
  f.text.set("site.js", 'const picture="\\/images\\/heavy.jpg"');
  f.text.set("data.json", '{"picture":"/images/heavy.jpg"}');
  f.text.set("sitemap.xml", '<image:loc>https://own.example/images/heavy.jpg</image:loc>');
  f.text.set("readme.md", '![photo](/images/heavy.jpg)');
  f.text.set("_redirects", '/old /images/heavy.jpg 301');
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ version: 2, collections: ["Photos"], files: { "images/heavy.jpg": { description: { text: "Default" }, collections: ["Photos"], places: { "index.html": { decorative: true }, "other.html": { agentText: "own" } } } } }));
  const original = f.bytes.get("images/heavy.jpg");
  assert.equal((await f.improve()).changed, true);
  assert.equal(f.encodes, 2); assert.equal(f.history.length, 1);
  assert.deepEqual([...f.bytes.keys()].filter(path => path.endsWith("webp")), ["images/heavy.webp", "images/heavy-480.webp", "images/heavy-960.webp"]);
  for (const file of ["site.css", "site.js", "data.json", "sitemap.xml", "readme.md", "_redirects"]) assert.ok(f.text.get(file)!.includes("heavy.webp"), file);
  const html = f.text.get("index.html")!;
  assert.match(html, /heavy-480.webp 480w/); assert.match(html, /heavy.webp 1200w/);
  for (const value of ['width="1200"', 'height="800"', 'sizes="auto, 100vw"', 'loading="lazy"', 'decoding="async"', 'alt="Keep &amp; this"', 'class="photo"']) assert.ok(html.includes(value), value);
  assert.equal(f.bytes.get("images/heavy.jpg"), original);
  assert.match(f.text.get("other.html")!, /heavy.jpg/);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/heavy.webp"].lighterFrom, "images/heavy.jpg");
  await f.improve({ row: "other.html" });
  assert.equal(f.encodes, 2); assert.equal(f.batches[1].uploads.length, 0);
  assert.deepEqual([...f.batches[1].edits.keys()].sort(), [MEDIA_RECORDS_PATH, "other.html"].sort());
  f.history.pop()!(); assert.match(f.text.get("other.html")!, /heavy.jpg/); assert.ok(f.bytes.has("images/heavy.webp"));
  f.history.pop()!(); assert.equal(f.bytes.has("images/heavy.webp"), false); assert.match(f.text.get("index.html")!, /heavy.jpg/);
});

test("unticked, script, samples, JSON-LD and component fallbacks survive outside rewrites", async () => {
  const samples = ["pre", "code", "samp", "kbd", "xmp", "textarea", "template", "noscript"].map(tag => `<${tag}><img src="/images/heavy.jpg"></${tag}>`).join("");
  const f = fixture(`<img src="/images/heavy.jpg">${samples}<img id="swap" src="/images/heavy.jpg"><script>document.getElementById('swap').src = next;</script><script type="application/ld+json">{"image":"/images/heavy.jpg"}</script>`);
  f.text.set("unticked.html", '<picture><source srcset="/images/heavy.jpg 3000w"><img src="/images/heavy.jpg"></picture>'); f.ctx.pages.push("unticked.html");
  f.text.set("components/card.html", '<slot><img src="/images/heavy.jpg"></slot>'); f.ctx.components["test-card"] = "components/card.html";
  f.text.set(MEDIA_RECORDS_PATH, '{"version":2,"collections":[],"files":{},"leftAsIs":[{"picture":"images/heavy.jpg","row":"unticked.html"}]}');
  await f.improve();
  assert.ok(f.text.get("index.html")!.includes(samples)); assert.ok(f.text.get("index.html")!.includes('<img id="swap" src="/images/heavy.jpg">'));
  assert.match(f.text.get("index.html")!, /"image":"\/images\/heavy.jpg"/);
  assert.match(f.text.get("unticked.html")!, /heavy.jpg 3000w/); assert.match(f.text.get("components/card.html")!, /heavy.jpg/);
});

test("hand-made srcset and picture sources adopted, only main descriptor changes", async () => {
  const f = fixture('<picture><source srcset="/images/panel-400.webp 400w, /images/heavy.jpg 3000w"><img src="/images/heavy.jpg" srcset="/images/panel-400.webp 400w, /images/heavy.jpg 3000w" alt="unchanged"></picture>');
  f.bytes.set("images/panel-400.webp", imageBlob(100, 400, 267)); f.facts["images/panel-400.webp"] = { size: 100, width: 400, height: 267 };
  await f.improve(); assert.equal(f.batches[0].uploads.length, 1);
  const html = f.text.get("index.html")!;
  assert.match(html, /<source srcset="\/images\/panel-400.webp 400w, \/images\/heavy.webp 1200w">/);
  assert.match(html, /srcset="\/images\/panel-400.webp 400w, \/images\/heavy.webp 1200w"/);
});

for (const preset of ["balanced", "smallest"] as const) test(`${preset}: sharing JPEG uses full address, same dimensions, one batch and Undo`, async () => {
  const meta = '<meta property="og:image" content="https://own.example/site/images/heavy.jpg"><meta name="og:image:type" content="image/png"><meta property="og:image:width" content="3000"><meta property="og:image:height" content="2000"><meta name="og:image:url" content="/images/heavy.jpg"><meta property="og:image:secure_url" content="/images/heavy.jpg"><meta name="twitter:image" content="/images/heavy.jpg">';
  const f = fixture('<img src="/images/heavy.jpg">' + meta);
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ version: 2, collections: [], files: {}, adding: { image: preset, keepOriginal: true } }));
  const encode = f.ports.encode!;
  f.ports.encode = async (file, options, ...rest) => {
    if (options.format === "jpeg") {
      assert.equal(file.size, 300000);
      assert.deepEqual(options, { maxWidth: 2400, quality: 82, format: "jpeg", plainJpeg: true, responsive: false, keepOriginal: false });
    }
    return encode(file, options, ...rest);
  };
  const progress: string[] = [];
  f.text.set(".editor/config.json", JSON.stringify({ site: { url: "https://own.example/site/" } }));
  const result = await f.improve({ siteUrl: "https://own.example/site/", progress: state => progress.push(state) });
  const main = `images/heavy.${preset === "smallest" ? "avif" : "webp"}`;
  assert.ok(f.bytes.has(main)); assert.equal(result.notes.length, 0);
  if (preset === "smallest") assert.ok(progress.includes("Preparing (slower)…"));
  const html = f.text.get("index.html")!;
  assert.equal((html.match(/content="https:\/\/own.example\/site\/images\/heavy-sharing.jpg"/g) ?? []).length, 4);
  for (const content of ["image/jpeg", "1200", "800"]) assert.ok(html.includes(`content="${content}"`));
  assert.equal(f.bytes.get("images/heavy-sharing.jpg")!.type, "image/jpeg");
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/heavy-sharing.jpg"].sharing, true);
  assert.equal(f.batches.length, 1); assert.equal(f.history.length, 1);
  assert.ok(f.batches[0].uploads.some(upload => upload.path === "images/heavy-sharing.jpg"));
  const usage = mediaUsageRecords({ media: [...f.bytes.keys()], sources: Object.fromEntries(f.text), pages: f.ctx.pages, site: { origins: ["https://own.example"] } });
  assert.ok(mediaCleanUpSuggestions({ usage, records: parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)) }).groups.some(group => group.items.some(item => item.main === "images/heavy.jpg")));
  f.history.pop()!(); assert.equal(f.bytes.has(main), false); assert.equal(f.bytes.has("images/heavy-sharing.jpg"), false);
  assert.equal(f.text.get("index.html"), '<img src="/images/heavy.jpg">' + meta);
});

test("no site address gives sharing root link and note; existing social and outside links survive", async () => {
  const f = fixture('<img src="/images/heavy.jpg"><meta property="og:image" content="/images/heavy.jpg"><meta name="twitter:image" content="https://outside.example/images/heavy.jpg"><meta property="og:image" content="/images/heavy-social.jpg"><pre><meta property="og:image" content="/images/heavy.jpg"></pre>');
  const result = await f.improve();
  assert.ok(result.notes.includes(SOCIAL_IMAGE_NOTE));
  assert.match(f.text.get("index.html")!, /content="\/images\/heavy-sharing.jpg"/);
  assert.ok(f.text.get("index.html")!.includes('content="https://outside.example/images/heavy.jpg"'));
  assert.ok(f.text.get("index.html")!.includes('content="/images/heavy-social.jpg"'));
  assert.ok(f.text.get("index.html")!.includes('<pre><meta property="og:image" content="/images/heavy.jpg"></pre>'));
});

test("JPEG main needs no sharing copy; encoder fallback note survives", async () => {
  const f = fixture('<img src="/images/heavy.jpg"><meta property="og:image" content="/images/heavy.jpg">');
  f.ports.encode = async () => ({ outputs: [{ blob: imageBlob(), width: 1200, height: 800, extension: "jpg" }], before: 300000, after: 1000, note: "JPEG fallback used." });
  const result = await f.improve();
  assert.ok(result.notes.includes("JPEG fallback used."));
  assert.equal(f.batches[0].uploads.length, 1); assert.match(f.text.get("index.html")!, /content="\/images\/heavy-2.jpg"/);
});

test("later row reuses sharing JPEG or creates it only when first needed", async () => {
  for (const firstShares of [false, true]) {
    const f = fixture('<img src="/images/heavy.jpg">' + (firstShares ? '<meta property="og:image" content="/images/heavy.jpg">' : ""));
    f.text.set("other.html", '<img src="/images/heavy.jpg"><meta property="og:image" content="/images/heavy.jpg">'); f.ctx.pages.push("other.html");
    await f.improve(); assert.equal(f.encodes, firstShares ? 2 : 1);
    await f.improve({ row: "other.html" });
    assert.equal(f.encodes, 2); assert.equal(f.batches[1].uploads.length, firstShares ? 0 : 1);
    assert.match(f.text.get("other.html")!, /content="\/images\/heavy-sharing.jpg"/);
  }
});

test("JPEG that is not lighter keeps old sharing picture and metadata with a note", async () => {
  const meta = '<meta property="og:image" content="/images/heavy.jpg"><meta property="og:image:type" content="image/png">';
  const f = fixture('<img src="/images/heavy.jpg">' + meta), encode = f.ports.encode!;
  f.ports.encode = async (file, options, ...rest) => options.format === "jpeg" ? { outputs: [{ blob: new Blob([new Uint8Array(300000)], { type: "image/jpeg" }), extension: "jpg", width: 1200, height: 800 }], before: 300000, after: 300000 } : encode(file, options, ...rest);
  const result = await f.improve();
  assert.ok(result.notes.some(note => note.includes("Sharing pictures keep") && note.includes("not lighter")));
  assert.ok(f.text.get("index.html")!.includes(meta)); assert.equal(f.bytes.has("images/heavy-sharing.jpg"), false);
});

test("not lighter keeps main but writes other details; family collision gets numbered name", async () => {
  const f = fixture(); f.ports.encode = async () => ({ outputs: [{ blob: imageBlob(300000), width: 1200, height: 800, extension: "webp" }], before: 300000, after: 300000 });
  f.ports.copies = async () => ({ uploads: [{ path: "images/heavy-480.webp", blob: imageBlob(100, 480, 320) }], variants: [{ path: "images/heavy-480.webp", width: 480 }], version: "old" });
  const result = await f.improve(); assert.ok(result.notes.some(note => note.includes("not lighter")));
  // The old main stays, but the copies a heavy picture lacks are still made and listed.
  assert.deepEqual(f.batches[0].uploads.map(upload => upload.path), ["images/heavy-480.webp"]);
  assert.match(f.text.get("index.html")!, /src="\/images\/heavy.jpg"/); assert.match(f.text.get("index.html")!, /width="3000"/);
  assert.match(f.text.get("index.html")!, /srcset="\/images\/heavy-480.webp 480w, \/images\/heavy.jpg 3000w"/);
  const collision = fixture(); collision.bytes.set("images/heavy-480.webp", imageBlob());
  await collision.improve(); assert.ok(collision.bytes.has("images/heavy-2.webp"));
});

test("measured order chooses one priority; fallback stays lazy; SVG gets dimensions only", async () => {
  const f = fixture('<img src="/images/heavy.jpg" alt="hero"><img src="/images/small.jpg"><img src="/images/icon.svg" class="logo">');
  f.bytes.set("images/small.jpg", imageBlob(100000)); f.facts["images/small.jpg"] = { size: 100000, width: 1200, height: 800 };
  f.bytes.set("images/icon.svg", new Blob(['<svg/>'])); f.facts["images/icon.svg"] = { width: 30, height: 20 };
  f.ports.copies = async () => ({ uploads: [{ path: "images/small-480.webp", blob: imageBlob(100) }], variants: [{ path: "images/small-480.webp", width: 480 }], version: undefined });
  await f.improve({ async measure(_file, node) { return { sizes: "50vw", firstScreen: node[0] === 0, large: node[0] === 0, images: [{ node: [0], firstScreen: true, large: true }, { node: [1], firstScreen: false, large: false }] }; } });
  const html = f.text.get("index.html")!; assert.equal((html.match(/fetchpriority="high"/g) ?? []).length, 1);
  assert.match(html, /sizes="50vw"/); assert.match(html, /sizes="auto, 50vw"/); assert.match(html, /<img width="30" height="20" src="\/images\/icon.svg" class="logo">/);
  assert.equal(await f.bytes.get("images/small.jpg")!.arrayBuffer().then(b => b.byteLength), 100000);
});

test("revision, source drift, unreadable file and cancellation refuse entire row", async () => {
  for (const change of ["revision", "source", "cancel", "unreadable"] as const) {
    const f = fixture(), signal = new AbortController();
    const encode = f.ports.encode!;
    f.ports.encode = async (...args) => { const result = await encode(...args); if (change === "revision") f.versions.set("images/heavy.jpg", "changed"); if (change === "source") f.text.set("index.html", "changed"); if (change === "cancel") signal.abort(); return result; };
    if (change === "unreadable") { f.text.set("unreadable.js", "x"); const originalRead = f.ctx.read.bind(f.ctx); f.ctx.read = async path => path === "unreadable.js" ? undefined : originalRead(path); }
    await assert.rejects(f.improve({ signal: signal.signal })); assert.equal(f.batches.length, 0); assert.equal(f.bytes.has("images/heavy.webp"), false);
  }
  const f = fixture(), signal = new AbortController(); f.hook(() => signal.abort());
  await assert.rejects(f.improve({ signal: signal.signal })); assert.equal(f.batches.length, 0);
});

test("component fixes only template markup; fixture own pictures share existing adding recipe", async () => {
  const f = fixture('<test-card></test-card>'); f.text.set("components/card.html", '<img src="/images/heavy.jpg"><slot><img src="/images/heavy.jpg"></slot>'); f.ctx.components["test-card"] = "components/card.html";
  await f.improve({ row: "components/card.html", async measure() { throw new Error("not shown"); } });
  assert.equal(f.text.get("index.html"), '<test-card></test-card>'); assert.match(f.text.get("components/card.html")!, /loading="lazy"/); assert.match(f.text.get("components/card.html")!, /<slot><img src="\/images\/heavy.jpg"><\/slot>/);
  const root = join(import.meta.dirname, "fixtures/improve-images");
  const read = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const file = join(dir, entry.name); if (entry.isDirectory()) read(file); else f.text.set(relative(root, file), readFileSync(file, "utf8")); } }; read(root);
  const facts: ImproveRequest["files"] = JSON.parse(f.text.get("facts.json")!);
  for (const [path, fact] of Object.entries(facts)) { f.bytes.set(path, imageBlob(fact.size ?? 100, fact.width ?? 1, fact.height ?? 1)); }
  f.ctx.pages = ["index.html", "articles/notch-menu/index.html"];
  f.ports.copies = async () => undefined;
  await f.improve({ row: "articles/notch-menu/index.html", files: facts }); assert.match(f.text.get("articles/notch-menu/index.html")!, /images\/wide.webp/);
});

test("workspace exposes lazy improve and cleanup offers old family unless Always keep", async () => {
  const f = fixture('<img src="/images/heavy.jpg" width="3000" height="2000" loading="lazy">');
  // An existing lighter file lets the real workspace entry run without a browser encoder.
  f.bytes.set("images/heavy.webp", imageBlob()); f.versions.set("images/heavy.webp", "new");
  f.text.set(MEDIA_RECORDS_PATH, '{"version":2,"collections":[],"files":{"images/heavy.webp":{"lighterFrom":"images/heavy.jpg"}}}');
  const workspace = createMediaWorkspace(async () => f.ctx); await workspace.load();
  assert.equal((await workspace.improve({ row: "index.html", files: f.facts }, { tree: f.ports.tree })).changed, true);
  const sources = Object.fromEntries([...f.text].filter(([path]) => path !== MEDIA_RECORDS_PATH));
  const snapshot = mediaUsageRecords({ media: [...f.bytes.keys()], sources, pages: f.ctx.pages, components: {} });
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  assert.ok(mediaCleanUpSuggestions({ usage: snapshot, records }).groups.some(group => group.items.some(item => item.main === "images/heavy.jpg")));
  records.files["images/heavy.jpg"] = { alwaysKeep: true };
  assert.ok(!mediaCleanUpSuggestions({ usage: snapshot, records }).groups.some(group => group.items.some(item => item.main === "images/heavy.jpg")));
});

test("adopted WordPress and bare-number families get one main and keep their copies", async () => {
  for (const copies of [["images/heavy-400x267.jpg", "images/heavy-800x533.jpg"], ["images/heavy-400.webp", "images/heavy-800.webp"]]) {
    const f = fixture();
    for (let index = 0; index < copies.length; index++) { const path = copies[index], width = index ? 800 : 400; f.bytes.set(path, imageBlob(100, width, 267)); f.facts[path] = { size: 100, width, height: 267 }; }
    await f.improve(); assert.equal(f.batches[0].uploads.length, 1);
    for (const path of copies) assert.ok(f.text.get("index.html")!.includes(path));
  }
});

test("an omitted old editor width cannot attach to the new family; missing widths map to main", async () => {
  const f = fixture('<img src="/images/heavy.jpg" srcset="/images/heavy-1600.webp 1600w, /images/heavy.jpg 3000w">');
  f.bytes.set("images/heavy-1600.webp", imageBlob(100, 1600, 1067)); f.versions.set("images/heavy-1600.webp", "oldcopy"); f.facts["images/heavy-1600.webp"] = { size: 100, width: 1600, height: 1067 };
  await f.improve(); assert.ok(f.bytes.has("images/heavy-2.webp")); assert.match(f.text.get("index.html")!, /heavy-2.webp 1200w/);
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  const usage = mediaUsageRecords({ media: [...f.bytes.keys()], sources: { "index.html": f.text.get("index.html") }, pages: f.ctx.pages });
  const suggestions = mediaCleanUpSuggestions({ usage, records });
  assert.ok(suggestions.groups.some(group => group.items.some(item => item.main === "images/heavy.jpg" && item.members.includes("images/heavy-1600.webp"))));
  records.files["images/heavy.jpg"] = { alwaysKeep: true }; assert.equal(mediaCleanUpSuggestions({ usage, records }).count, 0);
});

test("a measured page leaves complete SVGs and animated pictures untouched", async () => {
  const f = fixture('<img src="/images/heavy.jpg"><img src="/icon.svg" width="20" height="20"><img src="/loop.gif">');
  f.bytes.set("icon.svg", new Blob(["<svg/>"])); f.facts["icon.svg"] = { width: 20, height: 20 };
  f.bytes.set("loop.gif", imageBlob(100)); f.facts["loop.gif"] = { animated: true, size: 100, width: 800, height: 600 };
  await f.improve({ async measure() { return { sizes: "100vw", firstScreen: true, large: true, images: [0, 1, 2].map(index => ({ node: [index], firstScreen: true, large: true })) }; } });
  assert.ok(f.text.get("index.html")!.includes('<img src="/icon.svg" width="20" height="20"><img src="/loop.gif">'));
});

test("relative component pictures are resolved through their showing page", async () => {
  const f = fixture('<test-card></test-card>');
  f.text.set("components/card.html", '<img src="images/heavy.jpg">'); f.ctx.components["test-card"] = "components/card.html";
  let measuredFile = "";
  await f.improve({ row: "components/card.html", async measure(file) { measuredFile = file; return undefined; } });
  assert.equal(measuredFile, "components/card.html"); assert.match(f.text.get("components/card.html")!, /src="\/images\/heavy.webp"/);
});

test("a hand-made set written on one page serves the same picture's plain places", async () => {
  const f = fixture('<img src="/images/heavy.jpg">');
  f.text.set("other.html", '<img src="/images/heavy.jpg" srcset="/images/odd-small.webp 400w, /images/heavy.jpg 3000w">'); f.ctx.pages.push("other.html");
  f.bytes.set("images/odd-small.webp", imageBlob(100, 400, 267)); f.versions.set("images/odd-small.webp", "odd"); f.facts["images/odd-small.webp"] = { size: 100, width: 400, height: 267 };
  await f.improve();
  assert.deepEqual(f.batches[0].uploads.map(upload => upload.path), ["images/heavy.webp"]);
  assert.match(f.text.get("index.html")!, /srcset="\/images\/odd-small.webp 400w, \/images\/heavy.webp 1200w"/);
  await f.improve({ row: "other.html" });
  assert.match(f.text.get("other.html")!, /srcset="\/images\/odd-small.webp 400w, \/images\/heavy.webp 1200w"/);
});

test("lighter family sharing JPEG removes and restores together", async () => {
  const f = fixture('<img src="/images/heavy.jpg"><meta property="og:image" content="/images/heavy.jpg">');
  await f.improve();
  const workspace = createMediaWorkspace(async () => f.ctx); await workspace.load();
  const members = ["images/heavy.webp", "images/heavy-480.webp", "images/heavy-960.webp", "images/heavy-sharing.jpg"];
  const originals = members.map(path => f.bytes.get(path));
  await workspace.remove(["images/heavy.webp"]);
  assert.deepEqual(f.batches[1].deletes.sort(), [...members].sort());
  for (const path of members) assert.equal(f.bytes.has(path), false);
  const removed = (await workspace.load()).removed!.find(item => item.path === "images/heavy.webp")!;
  assert.ok(removed.family!.some(member => member.path === "images/heavy-sharing.jpg"));
  await workspace.restore([{ path: removed.path, id: removed.browserKey! }]);
  for (const [index, path] of members.entries()) assert.deepEqual(await f.bytes.get(path)!.arrayBuffer(), await originals[index]!.arrayBuffer());
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/heavy-sharing.jpg"].sharing, true);
});

test("sharing name collision numbers the main so JPEG remains in its family", async () => {
  const f = fixture('<img src="/images/heavy.jpg"><meta property="og:image" content="/images/heavy.jpg">');
  const occupied = imageBlob(); f.bytes.set("images/heavy-sharing.jpg", occupied);
  await f.improve();
  assert.ok(f.bytes.has("images/heavy-2.webp")); assert.ok(f.bytes.has("images/heavy-2-sharing.jpg"));
  assert.equal(f.bytes.get("images/heavy-sharing.jpg"), occupied);
});

test("sharing tags on old responsive addresses use the main's one JPEG", async () => {
  const f = fixture('<img src="/images/heavy.jpg"><meta property="og:image" content="/images/heavy-480.jpg"><meta name="twitter:image" content="/images/heavy.jpg">');
  f.bytes.set("images/heavy-480.jpg", imageBlob(10000, 480, 320));
  f.versions.set("images/heavy-480.jpg", "old-copy"); f.facts["images/heavy-480.jpg"] = { size: 10000, width: 480, height: 320 };
  await f.improve(); assert.equal(f.encodes, 2);
  assert.equal((f.text.get("index.html")!.match(/content="\/images\/heavy-sharing.jpg"/g) ?? []).length, 2);
});

test("a sharing-only mention keeps the lighter family used and Always keep protects its old family", async () => {
  const f = fixture('<img src="/images/heavy.jpg"><meta property="og:image" content="/images/heavy.jpg">');
  await f.improve();
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  const usage = mediaUsageRecords({ media: [...f.bytes.keys()], sources: { "index.html": '<meta property="og:image" content="/images/heavy-sharing.jpg">' }, pages: f.ctx.pages });
  const offered = () => mediaCleanUpSuggestions({ usage, records }).groups.flatMap(group => group.items.map(item => item.main));
  assert.ok(offered().includes("images/heavy.jpg")); assert.ok(!offered().includes("images/heavy.webp"));
  records.files["images/heavy.jpg"] = { alwaysKeep: true }; assert.ok(!offered().includes("images/heavy.jpg"));
});

test("Improve images writes the requested prefix into the main and responsive copies", async () => {
  const f = fixture();
  f.text.set(".editor/config.json", JSON.stringify({ site: { url: "https://user.github.io/my-site/" } }));
  await f.improve({ siteUrl: "https://user.github.io/my-site/" });
  const html = f.text.get("index.html")!;
  assert.ok(html.includes('src="/my-site/images/heavy.webp"'));
  assert.ok(html.includes('srcset="/my-site/images/heavy-480.webp 480w, /my-site/images/heavy-960.webp 960w, /my-site/images/heavy.webp 1200w"'));
});

test("improve-heavy refuses a stale request prefix captured before config reads", async () => {
  const f = fixture();
  f.text.set(".editor/config.json", JSON.stringify({ site: { url: "https://own.example/old/" } }));
  const read = f.ctx.read.bind(f.ctx);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let reached!: () => void;
  const reading = new Promise<void>(resolve => { reached = resolve; });
  f.ctx.read = async path => { if (path === ".editor/config.json") { reached(); await held; } return read(path); };
  const pending = f.improve({ siteUrl: "https://own.example/old/" });
  await reading;
  f.text.set(".editor/config.json", JSON.stringify({ site: { url: "https://own.example/new/" } }));
  release();
  await assert.rejects(pending, /The site address changed. Try again./);
  assert.equal(f.batches.length, 0);
});
