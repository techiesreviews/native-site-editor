import { test } from "node:test";
import assert from "node:assert/strict";
import { improveGifsAndPlayers, onlinePlayersAllowed, type ImproveGifsPlayersRequest, type ImproveGifsPlayersPorts } from "../src/page-builder/improve-gifs-players";
import { applyMediaWorkspaceBatch, createMediaWorkspace, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords } from "../shared/media-records";
import { prepareSocialCopy } from "../src/page-builder/social-copy-prepare";

const page = (body: string) => `<html><head><title>Test</title></head><body>${body}</body></html>`;
const iframe = '<iframe id="movie" slot="film" class="wide" style="aspect-ratio:16/9" title="Author title" src="https://youtube.com/embed/aqz-KE-bpKQ?start=42"></iframe>';
const blob = (type: string) => new Blob(["test bytes"], { type });
function fixture(body = '<img src="/images/a.gif">') {
  const text = new Map([["index.html", page(body)]]), assets = new Map([["images/a.gif", blob("image/gif")]]);
  const versions = new Map([["images/a.gif", "original"]]), batches: MediaWorkspaceBatch[] = [];
  let prepareCalls = 0, reads = 0, playerCalls = 0;
  let hook: (() => void) | undefined;
  const ctx: MediaWorkspaceContext = {
    key: "test", scope: { account: "test", repoId: 1, repo: "test/test", branch: "main" }, history: false,
    drafts: { get: () => undefined, save: () => { throw new Error("Direct write"); }, remove: () => { throw new Error("Direct write"); } },
    get paths() { return [...text.keys(), ...assets.keys()]; }, get items() { return [...assets.keys()].map(path => ({ path })); },
    pages: ["index.html"], components: {}, origins: ["https://own.example"],
    assertLive() {}, read: async path => text.get(path) ?? (assets.has(path) && /\.(?:js|css)$/.test(path) ? await assets.get(path)!.text() : undefined), blob: async path => assets.get(path)!, assetVersion: path => versions.get(path), async openPage() {},
    async applyBatch(batch) {
      await applyMediaWorkspaceBatch(batch, {
        assertLive() {}, paths: () => ctx.paths, source: path => text.get(path) ?? (assets.has(path) && /\.(?:js|css)$/.test(path) ? (path.endsWith(".css") ? "/* player */" : path.endsWith("media-online.js") ? "// online" : "// player") : undefined), assetVersion: path => versions.get(path),
        async snapshot() {}, async stage() { hook?.(); }, async rollback() {},
        commit(batch) {
          batches.push(batch);
          for (const [path, source] of batch.edits) text.set(path, source);
          for (const upload of batch.uploads) { assets.set(upload.path, upload.blob); versions.set(upload.path, "new"); }
        },
      });
    },
  };
  const ports: ImproveGifsPlayersPorts = {
    async prepare(file, _key, folder, _signal, _encode, _ask, _shows, _quality, _keep, videoQuality) {
      prepareCalls++;
      const gif = file.type === "image/gif";
      if (gif) assert.equal(videoQuality, "balanced");
      return { request: { file, folder: folder!, result: { outputs: [{ blob: blob(gif ? "video/mp4" : "image/webp"), extension: gif ? "mp4" : "webp", width: 800, height: 450 }],
        ...gif ? { still: { blob: blob("image/webp"), extension: "webp" }, fromGif: true, duration: 2.345 } : {}, before: 100, after: 10 } } };
    },
    async read() { reads++; return { title: "Service title", still: new File([blob("image/jpeg")], "still.jpg", { type: "image/jpeg" }) }; },
    async playerFiles() { playerCalls++; return { "styles/media-player.css": "/* player */", "scripts/media-player.js": "// player", "scripts/media-online.js": "// online" }; },
  };
  const facts = { "images/a.gif": { size: 100, width: 800, height: 450, animated: true } };
  return { ctx, text, assets, versions, batches, ports, facts, get prepares() { return prepareCalls; }, get reads() { return reads; }, get playerCalls() { return playerCalls; },
    hook(work: () => void) { hook = work; },
    run: (request: Partial<ImproveGifsPlayersRequest> = {}) => improveGifsAndPlayers(ctx, { row: "index.html", files: facts, by: "lex", ...request }, ports) };
}

test("one row commits GIF, still, records, page and player together; old GIF stays", async () => {
  const f = fixture('<img src="/images/a.gif" alt="A &amp; B" class="shape" style="object-position:30% 70%" slot="hero" width="320" height="180">');
  await f.run();
  assert.equal(f.batches.length, 1); assert.equal(f.playerCalls, 1);
  const batch = f.batches[0], html = f.text.get("index.html")!;
  assert.deepEqual(batch.uploads.map(u => u.path), ["media/videos/a.mp4", "media/videos/a.webp"]);
  // The player goes in as new text files, never uploads: an uploaded stylesheet froze the editor (slice 101).
  for (const [path, text] of [["styles/media-player.css", "/* player */"], ["scripts/media-player.js", "// player"], ["scripts/media-online.js", "// online"]]) {
    assert.equal(batch.edits.get(path), text); assert.ok(batch.expectedSources.has(path)); assert.equal(batch.expectedSources.get(path), undefined);
  }
  assert.deepEqual(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["media/videos/a.mp4"], { still: "media/videos/a.webp", fromGif: true, duration: 2.35 });
  assert.match(html, /controls muted loop playsinline/); assert.doesNotMatch(html, /autoplay/);
  for (const attribute of ['class="shape"', 'style="object-position:30% 70%"', 'slot="hero"', 'width="320"', 'height="180"', 'aria-label="A &amp; B"']) assert.ok(html.includes(attribute));
  assert.match(html, /href="\/styles\/media-player.css"/); assert.match(html, /src="\/scripts\/media-player.js"/);
  assert.equal(batch.expectedAssets.get("images/a.gif"), "original"); assert.ok(batch.expectedSources.has(MEDIA_RECORDS_PATH));
  assert.ok(f.assets.has("images/a.gif"));
});

test("picture inside a link is replaced whole; link bytes stay and controls are omitted", async () => {
  const open = "<a  href='/buy?x=1&amp;y=2' data-track='same'>";
  const f = fixture(`${open}<picture slot="hero"><source srcset="/images/a.gif"><img src="/images/a.gif" alt="" loading="lazy" decoding="async"></picture></a>`);
  await f.run(); const html = f.text.get("index.html")!;
  assert.ok(html.includes(open + '<video'));
  assert.match(html, /slot="hero"[^>]*><\/video><\/a>/); assert.doesNotMatch(html, /<picture|<source| controls|aria-label|loading|decoding/);
});

test("same GIF twice and across rows uses one conversion; cache keeps output dimensions", async () => {
  const f = fixture('<img src="/images/a.gif" width="20" height="10"><img src="/images/a.gif">');
  f.text.set("other.html", page('<img src="/images/a.gif">')); f.ctx.pages.push("other.html");
  const converted: NonNullable<ImproveGifsPlayersRequest["converted"]> = new Map();
  await f.run({ converted }); await f.run({ row: "other.html", converted });
  assert.equal(f.prepares, 1); assert.equal(f.batches.length, 2); assert.equal(f.playerCalls, 1);
  assert.match(f.text.get("other.html")!, /width="800" height="450"/);
});

test("component rewrite adds player to every reaching page in one batch", async () => {
  const f = fixture('<hero-card></hero-card>'); f.text.set("other.html", page('<hero-card></hero-card>'));
  f.text.set("components/hero.html", '<img src="/images/a.gif">'); f.ctx.pages.push("other.html"); f.ctx.components["hero-card"] = "components/hero.html";
  await f.run({ row: "components/hero.html" }); assert.equal(f.batches.length, 1);
  assert.match(f.text.get("components/hero.html")!, /<video/);
  for (const path of f.ctx.pages) assert.match(f.text.get(path)!, /media-player.js/);
});

test("sharing copy encodes GIF bytes to one JPEG and preserves other meta bytes; later rows reuse it", async () => {
  const meta = "<meta data-x='same' property='og:image'  content = '/images/a.gif' >";
  const f = fixture(meta); f.text.set("other.html", page(meta)); f.ctx.pages.push("other.html");
  let calls = 0;
  f.ports.social = (source, name, trim, signal) => prepareSocialCopy(source, name, trim, signal, async (file, options) => {
    calls++; assert.equal(file.name, "a.gif"); assert.equal(file.type, "image/gif"); assert.equal(await file.text(), await f.assets.get("images/a.gif")!.text());
    assert.equal(options.sharing, true); assert.equal(options.format, "jpeg"); assert.equal(options.responsive, false);
    return { outputs: [{ blob: blob("image/jpeg"), extension: "jpg", width: 1200, height: 630 }], trim: { x: 0, y: 0, width: 1, height: 1 }, before: 100, after: 10 };
  });
  await f.run({ siteUrl: "https://own.example" }); await f.run({ row: "other.html", siteUrl: "https://own.example" });
  const frameless = fixture(meta); frameless.ports.social = async () => ({ outputs: [{ blob: blob("image/jpeg"), extension: "jpg" }], before: 1, after: 1 });
  assert.deepEqual((await frameless.run()).left.map(x => x.note), ["The sharing image has no frame."]); assert.equal(frameless.batches.length, 0);
  assert.equal(calls, 1); const record = Object.entries(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files).find(([, r]) => r.sharing)!;
  assert.equal(record[1].trimmedFrom?.source, "images/a.gif");
  assert.ok(f.text.get("index.html")!.includes(meta.replace("/images/a.gif", "https://own.example/" + record[0])));
  assert.equal(f.batches[0].uploads.length, 1); assert.equal(f.playerCalls, 0);
});

test("online still copied once per row and run, then recorded still avoids every service read", async () => {
  const f = fixture(iframe + iframe); f.text.set("other.html", page(iframe)); f.ctx.pages.push("other.html");
  const videos: NonNullable<ImproveGifsPlayersRequest["videos"]> = new Map();
  await f.run({ videos }); await f.run({ row: "other.html", videos });
  assert.equal(f.reads, 1); assert.equal(f.prepares, 1);
  f.text.set("index.html", page(iframe)); await f.run(); assert.equal(f.reads, 1);
  const html = f.text.get("index.html")!;
  assert.match(html, /class="online-video wide"/); assert.match(html, /id="movie"/); assert.match(html, /slot="film"/); assert.match(html, /style="aspect-ratio:16\/9"/);
  assert.match(html, /watch\?v=aqz-KE-bpKQ&amp;t=42/); assert.match(html, /alt="Service title"/); assert.doesNotMatch(html, /iframe/);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).onlineVideos?.[0].stillCopied, true);
});

test("blocked still writes a titled link and note; absent YouTube video stays written", async () => {
  const f = fixture(iframe + iframe); let calls = 0;
  f.ports.read = async () => { calls++; return { note: "Private video" }; };
  const result = await f.run(); assert.equal(calls, 1); assert.equal(f.prepares, 0);
  assert.match(f.text.get("index.html")!, />Author title<\/a>/); assert.ok(result.notes.includes("Add your own still picture…")); assert.ok(result.notes.includes("Private video"));
  const missing = fixture(iframe); missing.ports.read = async () => { throw new Error("YouTube has no video at this address."); };
  assert.equal((await missing.run()).left[0].reason, "no-video"); assert.equal(missing.batches.length, 0); assert.equal(missing.text.get("index.html"), page(iframe));
});

test("remembered recipes prepare GIF video and online still family with copies and kept original", async () => {
  const f = fixture('<img src="/images/a.gif">' + iframe);
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ ...parseMediaRecords(undefined), adding: { video: "smaller", image: "higher", keepOriginal: true } }));
  f.assets.set("media/videos/service-title.webp", blob("image/webp"));
  const prepare = f.ports.prepare!;
  f.ports.prepare = async (...args) => {
    assert.equal(args[7], "higher");
    const gif = args[0].type === "image/gif";
    if (gif) { assert.equal(args[9], "smaller"); assert.equal(args[8], false); }
    else assert.equal(args[8], true);
    const prepared = await prepare(...args.slice(0, 9), "balanced");
    if (!gif) {
      prepared.request.result!.outputs.push({ blob: blob("image/webp"), extension: "webp", variantWidth: 480, width: 480, height: 270 });
      prepared.request.original = { blob: blob("image/jpeg"), extension: "jpg" };
    }
    return prepared;
  };
  await f.run();
  const uploaded = f.batches[0].uploads.map(u => u.path);
  const record = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).onlineVideos![0];
  assert.notEqual(record.still, "media/videos/service-title.webp");
  assert.ok(uploaded.includes(record.still!));
  assert.ok(uploaded.includes(record.still!.replace(/\.webp$/, "-480.webp")));
  assert.ok(uploaded.some(path => path.startsWith("media/originals/") && path.endsWith(".jpg")));
});

test("browser cannot convert: no imports or edits; repeated failure is prepared once", async () => {
  const f = fixture('<img src="/images/a.gif"><img src="/images/a.gif">'); let calls = 0;
  const note = "This browser cannot turn animated GIFs into videos, so a.gif was added as it is.";
  f.ports.prepare = async file => { calls++; return { request: { file, folder: "media/videos", result: { outputs: [{ blob: file, extension: "gif" }], before: 1, after: 1, note } }, warning: note }; };
  const result = await f.run(); assert.equal(result.changed, false); assert.equal(calls, 1); assert.equal(f.batches.length, 0);
  const stays = "This browser cannot turn animated GIFs into videos, so this GIF stays as it is.";
  assert.deepEqual(result.left.map(x => [x.reason, x.note]), [["cannot-convert", stays], ["cannot-convert", stays]]);
  const still = fixture(); still.ports.prepare = async file => ({ request: { file, folder: "media/images", result: { outputs: [{ blob: file, extension: "webp" }], before: 1, after: 1 } } });
  assert.deepEqual((await still.run()).left.map(x => x.note), ["This GIF has no animation, so it stays a picture."]); assert.equal(still.batches.length, 0);
});

test("unticked pictures stay; agent converts own GIF but never reads or prepares online stills", async () => {
  assert.equal(onlinePlayersAllowed("lex"), true); assert.equal(onlinePlayersAllowed("agent"), false);
  const f = fixture('<img src="/images/a.gif">' + iframe);
  const result = await f.run({ by: "agent" }); assert.equal(f.reads, 0); assert.equal(f.prepares, 1);
  assert.equal(result.left[0].reason, "for-lex"); assert.ok(f.text.get("index.html")!.includes(iframe));
  const left = fixture(); left.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ ...parseMediaRecords(undefined), leftAsIs: [{ picture: "images/a.gif" }] }));
  assert.equal((await left.run()).changed, false); assert.equal(left.prepares, 0); assert.equal(left.batches.length, 0);
});

test("changed text, records, asset or cancellation refuses entire batch and leaves run cache empty", async () => {
  for (const change of ["text", "records", "asset", "cancel"]) {
    const f = fixture(); const before = [...f.assets.keys()]; let live = true;
    const converted: NonNullable<ImproveGifsPlayersRequest["converted"]> = new Map();
    f.hook(() => {
      if (change === "text") f.text.set("index.html", page("Changed"));
      if (change === "records") f.text.set(MEDIA_RECORDS_PATH, "{}");
      if (change === "asset") f.versions.set("images/a.gif", "changed");
      if (change === "cancel") live = false;
    });
    await assert.rejects(f.run({ converted, live: () => live }), /changed|Cancelled/);
    assert.equal(f.batches.length, 0); assert.deepEqual([...f.assets.keys()], before); assert.equal(converted.size, 0);
  }
});

test("cancellation during preparation never calls applyBatch; dynamic workspace entry works", async () => {
  const f = fixture(); let live = true; const prepare = f.ports.prepare!;
  f.ports.prepare = async (...args) => { const result = await prepare(...args); live = false; return result; };
  await assert.rejects(f.run({ live: () => live }), /cancelled/); assert.equal(f.batches.length, 0);
  const g = fixture(); const workspace = createMediaWorkspace(async () => g.ctx);
  assert.equal((await workspace.improveGifsAndPlayers({ row: "index.html", files: g.facts, by: "lex" }, g.ports)).changed, true);
});

test("a recorded video's saved service bar choice is kept on the switched player", async () => {
  const vimeo = '<iframe src="https://player.vimeo.com/video/123456?h=a1b2c3d4e5"></iframe>';
  const f = fixture(vimeo); f.assets.set("media/videos/talk.webp", blob("image/webp"));
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ ...parseMediaRecords(undefined), onlineVideos: [{ service: "vimeo", id: "123456", hash: "a1b2c3d4e5", title: "Talk", still: "media/videos/talk.webp", stillCopied: true, serviceBar: true }] }));
  await f.run(); assert.equal(f.reads, 0);
  assert.match(f.text.get("index.html")!, /<a class="online-video" href="https:\/\/vimeo.com\/123456\/a1b2c3d4e5" data-controls="service"><img src="\/media\/videos\/talk.webp" alt="Talk"/);
});

test("Improve GIF and online writers receive the project prefix including player links", async () => {
  const f = fixture();
  await f.run({ siteUrl: "https://user.github.io/my-site/" });
  assert.equal(f.text.get("index.html"), '<html><head><title>Test</title>\n<link rel="stylesheet" href="/my-site/styles/media-player.css">\n<script type="module" src="/my-site/scripts/media-player.js"></script>\n</head><body><video src="/my-site/media/videos/a.mp4" poster="/my-site/media/videos/a.webp" controls muted loop playsinline width="800" height="450"></video></body></html>');
});
