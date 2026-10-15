import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMediaRecords, serializeMediaRecords, MEDIA_RECORDS_PATH, type MediaRecords } from "../shared/media-records";
import { parseOnlineVideoAddress, onlineVideoHref, onlineVideoMarkup, findOnlineVideo, upsertOnlineVideo, setOnlineVideoStill, removeOnlineVideo, onlineVideoStillPlan, onlineVideoUses, swapOnlineVideoStillInPage } from "../src/page-builder/online-video";
import { readOnlineVideo, addOnlineVideo } from "../src/page-builder/online-video-add";
import { createMediaWorkspace, type MediaWorkspaceContext, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { memoryUploadBytes } from "../src/uploads";
import { planRestore, pruneRemoved } from "../src/page-builder/recently-removed";
import type { prepareMediaFile } from "../src/page-builder/media-prepare";

const youtube = { service: "youtube", id: "dQw4w9WgXcQ" } as const;
const vimeo = { service: "vimeo", id: "123456", hash: "a1b2cf" } as const;
const empty = () => parseMediaRecords(undefined);
for (const address of ["www.youtube.com/watch?v=", "m.youtube.com/watch?v=", "youtube.com/watch?v=", "youtu.be/", "youtube.com/embed/", "youtube.com/shorts/", "youtube.com/live/", "youtube.com/v/", "youtube-nocookie.com/embed/"]) {
  test(`parse YouTube ${address}`, () => {
    assert.deepEqual(parseOnlineVideoAddress(`https://${address}${youtube.id}`), youtube);
    assert.deepEqual(parseOnlineVideoAddress(`${address}${youtube.id}`), youtube);
  });
}
for (const suffix of ["&t=90", "&t=1m30s", "&start=90", "#t=90s", "&t=0h1m30s"]) test(`start ${suffix}`, () => {
  assert.equal(parseOnlineVideoAddress(`https://youtube.com/watch?v=${youtube.id}${suffix}`)?.start, 90);
});
for (const path of ["123456", "channels/name/123456", "showcase/7/video/123456", "groups/name/videos/123456"]) test(`Vimeo ${path}`, () => {
  assert.deepEqual(parseOnlineVideoAddress(`vimeo.com/${path}`), { service: "vimeo", id: "123456" });
});
test("Vimeo unlisted forms and href round trip through both parsers", async () => {
  // The starter parser is DOM-free; import its exact source without executing its player setup.
  const starterSource = readFileSync(new URL("../fixtures/actual-starter/scripts/media-online.js", import.meta.url), "utf8");
  const starter = await import(`data:text/javascript;base64,${Buffer.from(starterSource).toString("base64")}`);
  for (const video of [youtube, vimeo]) for (const start of [undefined, 90]) {
    const address = onlineVideoHref(video, start);
    assert.deepEqual(parseOnlineVideoAddress(address), { ...video, ...start ? { start } : {} });
    const parsed = starter.onlineVideo(address);
    assert.equal(parsed.service, video.service); assert.equal(parsed.id, video.id);
    assert.equal(parsed.start, start ?? 0);
    assert.equal(parsed.hash, "hash" in video ? video.hash : "");
  }
  assert.deepEqual(parseOnlineVideoAddress("https://player.vimeo.com/video/123456?h=a1b2cf"), vimeo);
  assert.deepEqual(parseOnlineVideoAddress("vimeo.com/123456/a1b2cf"), vimeo);
});
for (const address of ["https://evil.com/123456", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "youtube.com/playlist?list=123", "youtube.com/watch?v=bad", "youtu.be/dQw4w9WgXc!", "vimeo.com/no-video", "vimeo.com/123/bad!", "music.youtube.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)"]) test(`reject ${address}`, () => assert.equal(parseOnlineVideoAddress(address), undefined));
test("records upsert, find, swap, remove keep unknown keys and copy only once", () => {
  let records: MediaRecords = { ...empty(), future: 7 };
  records = upsertOnlineVideo(records, { ...youtube, title: "Old", still: "media/videos/a.webp", extra: 42 });
  records = upsertOnlineVideo(records, { ...youtube, title: "New" });
  assert.equal(records.onlineVideos?.length, 1); assert.equal(findOnlineVideo(records, youtube)?.extra, 42);
  assert.equal(onlineVideoStillPlan(records, youtube, ["media/videos/a.webp"]).copy, false);
  assert.equal(onlineVideoStillPlan(records, youtube, []).copy, true);
  records = upsertOnlineVideo(records, { ...youtube, stillCopied: true });
  records = setOnlineVideoStill(records, youtube, "media/videos/b.webp");
  assert.equal(findOnlineVideo(records, youtube)?.still, "media/videos/b.webp");
  assert.equal(findOnlineVideo(records, youtube)?.stillCopied, undefined);
  records = setOnlineVideoStill(records, youtube, undefined);
  assert.equal(findOnlineVideo(records, youtube)?.still, undefined);
  records = removeOnlineVideo(records, youtube);
  assert.equal(findOnlineVideo(records, youtube), undefined); assert.equal(records.future, 7);
});
test("exact online video markup, escaping, service bar and no still", () => {
  assert.equal(onlineVideoMarkup({ video: youtube, still: { path: "media/videos/a.webp", width: 1280, height: 720 } }).markup, '<a class="online-video" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"><img src="/media/videos/a.webp" alt="YouTube video" width="1280" height="720"></a>');
  assert.equal(onlineVideoMarkup({ video: vimeo, start: 90, serviceBar: true, title: 'A & "B" <C>', still: { path: "media/videos/my still.webp" } }).markup, '<a class="online-video" href="https://vimeo.com/123456/a1b2cf#t=90s" data-controls="service"><img src="/media/videos/my%20still.webp" alt="A &amp; &quot;B&quot; &lt;C&gt;"></a>');
  assert.equal(onlineVideoMarkup({ video: youtube, start: 90 }).markup, '<a class="online-video" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=90" aria-label="YouTube video">YouTube video</a>');
  assert.deepEqual(onlineVideoMarkup({ video: vimeo }).notes, ["Add your own still picture…"]);
});
test("uses across pages ignore comments and plain links; still swap keeps attributes and alt", () => {
  const link = `<a class='wide online-video' href='https://youtu.be/${youtube.id}'><img class='still' src='/old.webp' alt='Keep &amp; this' width='10' height='20'></a>`;
  const source = `<p>Before</p>${link}${link}<!--${link}-->`;
  assert.deepEqual(onlineVideoUses({ "a.html": source, "b.html": link, "c.html": `<a href='https://youtu.be/${youtube.id}'>plain</a>` }), { [`youtube:${youtube.id}`]: ["a.html", "b.html"] });
  const changed = swapOnlineVideoStillInPage(source, youtube, { path: "media/videos/new.webp", width: 640 });
  assert.equal((changed.match(/src="\/media\/videos\/new.webp"/g) ?? []).length, 2);
  assert.ok(changed.includes("class='still'")); assert.ok(changed.includes("alt='Keep &amp; this'"));
  assert.ok(!changed.includes("height='20'></a><!--"));
  assert.equal(swapOnlineVideoStillInPage(source, vimeo, { path: "new.webp" }), source);
  // A link without a picture: the picture replaces its title text; the aria-label still names it.
  assert.equal(swapOnlineVideoStillInPage(onlineVideoMarkup({ video: youtube }).markup, youtube, { path: "new.webp" }),
    '<a class="online-video" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" aria-label="YouTube video"><img src="/new.webp" alt=""></a>');
});
function serviceFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, options) => {
    assert.equal(options?.credentials, "omit"); assert.equal(options?.referrerPolicy, "no-referrer");
    calls.push(String(input)); return handler(String(input));
  };
  return { fetch: (...args: Parameters<typeof fetch>) => fetch(...args), calls };
}
const json = (data: object) => Response.json(data);
const image = () => new Response("picture", { headers: { "content-type": "image/jpeg" } });
test("YouTube maxres 404 falls through to sddefault; every request omits credentials", async () => {
  const f = serviceFetch(url => url.includes("oembed") ? json({ title: "A film", width: 1280, height: 720 }) : url.includes("maxres") ? new Response(null, { status: 404 }) : image());
  const result = await readOnlineVideo(youtube, f.fetch);
  assert.equal(result.title, "A film"); assert.ok(result.still instanceof File);
  // YouTube's oEmbed size is its frame's, not the still's.
  assert.equal(result.width, undefined); assert.equal(f.calls.length, 3); assert.ok(f.calls[2].includes("sddefault"));
});
test("Vimeo includes unlisted hash and width, accepts only i.vimeocdn.com thumbnails", async () => {
  for (const host of ["i.vimeocdn.com", "evil.com", "i.vimeocdn.com.evil.com"]) {
    const f = serviceFetch(url => url.includes("oembed") ? json({ title: "Film", thumbnail_url: `https://${host}/picture.jpg`, thumbnail_width: 1280, thumbnail_height: 720 }) : image());
    const read = await readOnlineVideo(vimeo, f.fetch);
    assert.ok(f.calls[0].includes("width=1280")); assert.ok(decodeURIComponent(f.calls[0]).includes("123456/a1b2cf"));
    assert.equal(Boolean(read.still), host === "i.vimeocdn.com"); assert.equal(f.calls.length, host === "i.vimeocdn.com" ? 2 : 1);
    if (!read.still) assert.match(read.note!, /add your own still picture/);
  }
});
test("network/oEmbed failure gives fallback; missing YouTube refuses only with both missing proofs", async () => {
  const blocked = serviceFetch(() => { throw new TypeError("CORS"); });
  for (const video of [youtube, vimeo]) assert.match((await readOnlineVideo(video, blocked.fetch)).note!, /did not share this video's picture, so add your own still picture/);
  for (const status of [400, 404]) await assert.rejects(readOnlineVideo(youtube, serviceFetch(url => new Response(null, { status: url.includes("oembed") ? status : 404 })).fetch), /YouTube has no video at this address\./);
  const noTitle = await readOnlineVideo(youtube, serviceFetch(url => url.includes("oembed") ? new Response(null, { status: 500 }) : image()).fetch);
  assert.ok(noTitle.still); assert.equal(noTitle.title, undefined);
  assert.match((await readOnlineVideo(youtube, serviceFetch(() => new Response("html", { headers: { "content-type": "text/html" } })).fetch)).note!, /add your own/);
});

function fixture() {
  const text = new Map<string, string>([["index.html", onlineVideoMarkup({ video: youtube, still: { path: "media/videos/film.webp" } }).markup]]);
  const bytes = new Map<string, Blob>(); const versions = new Map<string, string>();
  const batches: MediaWorkspaceBatch[] = [];
  const ctx: MediaWorkspaceContext = {
    key: "repo:main", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
    history: true, removedCopies: memoryUploadBytes(), now: () => Date.parse("2026-10-15"),
    drafts: { get: () => undefined, save() { throw new Error("no direct write"); }, remove() { throw new Error("no direct write"); } },
    get paths() { return [...text.keys(), ...bytes.keys()]; }, get items() { return [...bytes.keys()].map(path => ({ path })); },
    pages: ["index.html"], components: {}, assertLive() {}, async read(path) { return text.get(path); },
    async blob(path) { return bytes.get(path)!; }, assetVersion(path) { return versions.get(path); }, async openPage() {},
    async applyBatch(batch) {
      batches.push(batch);
      for (const [path, value] of batch.edits) text.set(path, value);
      for (const upload of batch.uploads) { bytes.set(upload.path, upload.blob); versions.set(upload.path, `sha:${upload.path}`); }
      for (const path of batch.deletes) { bytes.delete(path); versions.delete(path); }
      for (const restore of batch.restores) { bytes.set(restore.path, new Blob(["restored"])); versions.set(restore.path, restore.sha); }
    },
  };
  const workspace = createMediaWorkspace(async () => ctx);
  return { workspace, ctx, bytes, text, batches, records: () => parseMediaRecords(text.get(MEDIA_RECORDS_PATH)) };
}
const prepare: typeof prepareMediaFile = async (file, _key, folder, _signal, _encode, _ask, _shows, quality) => {
  assert.equal(quality, "higher");
  return { request: { file, folder: folder!, result: { before: file.size, after: 9, outputs: [{ blob: new Blob(["main"]), extension: "webp" }, { blob: new Blob(["small"]), extension: "webp", variantWidth: 480 }] } } };
};
test("add still, copies, record and optional placement in one import batch; second add does not fetch", async () => {
  const f = fixture();
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ ...empty(), adding: { image: "higher" } }));
  const service = serviceFetch(url => url.includes("oembed") ? json({ title: "Film" }) : image());
  const first = await addOnlineVideo({ video: youtube, workspace: f.workspace, records: f.records(), paths: f.ctx.paths, fetch: service.fetch, prepare, assertLive() {}, place: { path: "index.html", source: f.text.get("index.html")!, apply(paths, _requests, records) {
    assert.equal(records.onlineVideos?.[0].still, paths[0]); return onlineVideoMarkup({ video: youtube, still: { path: paths[0] } }).markup;
  } } });
  assert.equal(f.batches.length, 1); assert.equal(f.batches[0].uploads.length, 2);
  assert.equal(first.record.still, "media/videos/film.webp"); assert.equal(f.records().onlineVideos?.[0].still, first.record.still);
  assert.equal(f.records().onlineVideos?.[0].stillCopied, true); assert.equal(first.record.stillCopied, true);
  const calls = service.calls.length;
  await addOnlineVideo({ address: onlineVideoHref(youtube), workspace: f.workspace, records: f.records(), paths: f.ctx.paths, fetch: service.fetch, prepare, assertLive() {} });
  assert.equal(service.calls.length, calls); assert.equal(f.batches.length, 1);
});
test("no still makes a records-only batch with service label; invalid input and stale scope refuse", async () => {
  const f = fixture(); const blocked = serviceFetch(() => { throw new TypeError("blocked"); });
  const result = await addOnlineVideo({ video: vimeo, workspace: f.workspace, records: empty(), paths: f.ctx.paths, fetch: blocked.fetch, assertLive() {} });
  assert.equal(f.batches.length, 1); assert.equal(f.batches[0].label, "Add Vimeo video"); assert.equal(f.batches[0].uploads.length, 0);
  assert.equal(f.records().onlineVideos?.[0].hash, vimeo.hash); assert.match(result.notes[0], /add your own/);
  await assert.rejects(addOnlineVideo({ address: "example.com", workspace: f.workspace, records: empty(), paths: [], fetch: blocked.fetch, assertLive() {} }), /Enter a YouTube or Vimeo/);
  await assert.rejects(addOnlineVideo({ video: youtube, workspace: f.workspace, records: empty(), paths: [], fetch: blocked.fetch, assertLive() { throw new Error("scope changed"); } }), /scope changed/);
});
test("workspace swaps picture, stores service bar, removes without service calls and restores record and family", async () => {
  const f = fixture();
  const copied = serializeMediaRecords(upsertOnlineVideo(empty(), { ...youtube, title: "Film", still: "media/videos/film.webp", stillCopied: true, future: 42 }));
  f.text.set(MEDIA_RECORDS_PATH, copied);
  for (const path of ["media/videos/film.webp", "media/videos/film-480.webp", "media/videos/own.webp"]) f.bytes.set(path, new Blob([path]));
  // Use branch identities for Recently removed, as the real workspace does.
  f.ctx.assetVersion = path => f.bytes.has(path) ? `sha:${path}` : undefined;
  await f.workspace.load();
  await f.workspace.onlineVideoServiceBar(youtube, true); assert.equal(findOnlineVideo(f.records(), youtube)?.serviceBar, true);
  assert.ok(f.text.get("index.html")?.includes('data-controls="service"'));
  await f.workspace.onlineVideoServiceBar(youtube, false);
  assert.ok(!f.text.get("index.html")?.includes("data-controls"));
  await f.workspace.onlineVideoServiceBar(youtube, true);
  await f.workspace.onlineVideoStill(youtube, { path: "media/videos/own.webp", width: 800, height: 600 });
  assert.ok(f.text.get("index.html")?.includes('/media/videos/own.webp')); assert.ok(f.bytes.has("media/videos/film.webp"));
  assert.equal(findOnlineVideo(f.records(), youtube)?.stillCopied, undefined);
  // Lex's own picture stays when the video leaves Media; only the record goes.
  await f.workspace.removeOnlineVideo(youtube);
  assert.equal(findOnlineVideo(f.records(), youtube), undefined); assert.ok(f.bytes.has("media/videos/own.webp"));
  assert.equal(f.records().removed, undefined);
  // The copied picture's family leaves with the video and comes back with it.
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ ...parseMediaRecords(copied), onlineVideos: [{ ...parseMediaRecords(copied).onlineVideos![0], serviceBar: true }] }));
  f.text.set("index.html", onlineVideoMarkup({ video: youtube, still: { path: "media/videos/film.webp" }, serviceBar: true }).markup);
  await f.workspace.load();
  const page = f.text.get("index.html"), before = f.batches.length;
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not contact service"); };
  try { await f.workspace.removeOnlineVideo(youtube); } finally { globalThis.fetch = originalFetch; }
  assert.equal(calls, 0); assert.equal(f.batches.length, before + 1); assert.equal(f.text.get("index.html"), page);
  assert.equal(findOnlineVideo(f.records(), youtube), undefined);
  const removed = f.records().removed![0]; assert.equal(removed.onlineVideo?.future, 42);
  assert.deepEqual(new Set([removed.path, ...removed.family!.map(member => member.path)]), new Set(["media/videos/film.webp", "media/videos/film-480.webp"]));
  await f.workspace.restore([{ path: removed.path, id: removed.sha! }]);
  assert.equal(findOnlineVideo(f.records(), youtube)?.title, "Film"); assert.equal(findOnlineVideo(f.records(), youtube)?.serviceBar, true);
  assert.ok(f.bytes.has("media/videos/film.webp")); assert.ok(f.bytes.has("media/videos/film-480.webp"));
});


test("restore never overwrites a re-added record; a file restored outside Media recovers its online video", () => {
  const removed = { path: "media/videos/film.webp", sha: "sha", date: "2026-10-15", onlineVideo: { ...youtube, title: "Removed", still: "media/videos/film.webp" } };
  const records: MediaRecords = { ...empty(), removed: [removed] };
  const returned = pruneRemoved(records, "2026-10-15", () => "sha");
  assert.equal(findOnlineVideo(returned, youtube)?.title, "Removed"); assert.equal(returned.removed?.length, 0);
  const added = upsertOnlineVideo(records, { ...youtube, title: "Added again" });
  const plan = planRestore(added, { path: removed.path, id: "sha" }, [], "2026-10-15");
  assert.equal(findOnlineVideo(plan.records, youtube)?.title, "Added again");
  assert.equal(findOnlineVideo(pruneRemoved(added, "2026-10-15", () => "sha"), youtube)?.title, "Added again");
});
test("browser-only removal and restore retain the whole online-video record", async () => {
  const f = fixture(); f.ctx.history = false;
  f.bytes.set("media/videos/film.webp", new Blob(["own picture"]));
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords(upsertOnlineVideo(empty(), { ...vimeo, title: "Local", still: "media/videos/film.webp", stillCopied: true, serviceBar: true })));
  await f.workspace.load(); await f.workspace.removeOnlineVideo(vimeo);
  const removed = f.records().removed![0]; assert.ok(removed.browserKey); assert.equal(removed.sha, undefined);
  await f.workspace.restore([{ path: removed.path, id: removed.browserKey! }]);
  assert.equal(await f.bytes.get(removed.path)!.text(), "own picture");
  assert.equal(findOnlineVideo(f.records(), vimeo)?.hash, vimeo.hash);
});
test("a scope invalidated during service reads cannot write to a newer workspace", async () => {
  const f = fixture(); let live = true;
  const service = serviceFetch(url => { live = false; return url.includes("oembed") ? json({ title: "Film" }) : image(); });
  await assert.rejects(addOnlineVideo({ video: youtube, workspace: f.workspace, records: empty(), paths: [], fetch: service.fetch, prepare, assertLive() { if (!live) throw new Error("scope changed"); } }), /scope changed/);
  assert.equal(f.batches.length, 0);
});
test("a title with slashes keeps every word in the still's name", async () => {
  const f = fixture();
  f.text.set(MEDIA_RECORDS_PATH, serializeMediaRecords({ ...empty(), adding: { image: "higher" } }));
  const service = serviceFetch(url => url.includes("oembed") ? json({ title: "AC/DC live" }) : image());
  let name = "";
  const named: typeof prepareMediaFile = async (file, ...rest) => { name = file.name; return prepare(file, ...rest); };
  const added = await addOnlineVideo({ video: youtube, workspace: f.workspace, records: f.records(), paths: f.ctx.paths, fetch: service.fetch, prepare: named, assertLive() {} });
  assert.equal(name, "ac-dc-live.jpg"); assert.equal(added.record.still, "media/videos/ac-dc-live.webp");
});
