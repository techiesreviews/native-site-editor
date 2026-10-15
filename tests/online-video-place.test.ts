import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMediaRecords, serializeMediaRecords, MEDIA_RECORDS_PATH } from "../shared/media-records";
import { mediaOnlineVideos, onlineAddressProblem, upsertOnlineVideo } from "../src/page-builder/online-video";
import { placeOnlineVideo } from "../src/page-builder/online-video-place";
import { filterOnlineVideos, onlineVideoName } from "../src/page-builder/media-library-filter";
import { createMediaWorkspace, type MediaWorkspaceContext, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { memoryUploadBytes } from "../src/uploads";
import type { prepareMediaFile } from "../src/page-builder/media-prepare";

const ID = "dQw4w9WgXcQ";
const PLAYER = ["styles/media-player.css", "scripts/media-player.js", "scripts/media-online.js"];
const PAGE = '<!doctype html>\n<html lang="en">\n<head><title>Home</title></head>\n<body>\n<main>\n  <section>\n    <p>Words</p>\n  </section>\n</main>\n</body>\n</html>';

test("the address field says why an address cannot be placed", () => {
  assert.match(onlineAddressProblem("  ")!, /Paste the address of a YouTube or Vimeo video/);
  assert.match(onlineAddressProblem("https://example.com/watch?v=abc")!, /Only YouTube and Vimeo/);
  assert.match(onlineAddressProblem("not an address at all")!, /Only YouTube and Vimeo/);
  assert.match(onlineAddressProblem("https://www.youtube.com/playlist?list=PL1")!, /not one video/);
  assert.match(onlineAddressProblem("https://vimeo.com/channels/staffpicks")!, /not one video/);
  assert.equal(onlineAddressProblem(`https://youtu.be/${ID}?t=30`), undefined);
  assert.equal(onlineAddressProblem("vimeo.com/123456"), undefined);
});

test("Media lists each recorded video with the HTML files that show it and a still only while it is in the site", () => {
  const records = upsertOnlineVideo(upsertOnlineVideo(parseMediaRecords(undefined), { service: "youtube", id: ID, title: "Film", still: "media/videos/film.webp", stillCopied: true }),
    { service: "vimeo", id: "42", hash: "abc", still: "media/videos/gone.webp", serviceBar: true });
  const link = `<a class="online-video" href="https://youtu.be/${ID}">Film</a>`;
  const videos = mediaOnlineVideos(records, { "b.html": link, "a.html": `${link}${link}`, "styles/site.css": link, "c.html": "<p></p>" }, ["media/videos/film.webp"]);
  assert.deepEqual(videos, [
    { key: `online:youtube:${ID}`, service: "youtube", id: ID, title: "Film", still: "media/videos/film.webp", uses: ["a.html", "b.html"] },
    { key: "online:vimeo:42", service: "vimeo", id: "42", hash: "abc", serviceBar: true, uses: [] },
  ]);
});

test("online videos show under All and Video, outside collections and narrowed pickers; search reads name and service", () => {
  const videos = [{ service: "vimeo", title: "Zebra talk" }, { service: "youtube", title: "Apple film" }, { service: "youtube" }] as const;
  const all = { query: "", collection: "", kind: "all" } as const;
  assert.deepEqual(filterOnlineVideos([...videos], all).map(onlineVideoName), ["Apple film", "YouTube video", "Zebra talk"]);
  assert.equal(filterOnlineVideos([...videos], { ...all, kind: "video" }).length, 3);
  for (const narrowed of [{ kind: "image" }, { kind: "audio" }, { collection: "Team" }, { accept: "image/*" }]) assert.deepEqual(filterOnlineVideos([...videos], { ...all, ...narrowed } as never), []);
  assert.deepEqual(filterOnlineVideos([...videos], { ...all, query: "vimeo" }).map(onlineVideoName), ["Zebra talk"]);
  assert.deepEqual(filterOnlineVideos([...videos], { ...all, query: "film" }).map(onlineVideoName), ["Apple film"]);
});

function fixture(extra: Record<string, string> = {}) {
  const text = new Map<string, string>([["index.html", PAGE], ...PLAYER.map(path => [path, "/* player */"] as [string, string]), ...Object.entries(extra)]);
  const bytes = new Map<string, Blob>(), versions = new Map<string, string>(), batches: MediaWorkspaceBatch[] = [];
  const ctx: MediaWorkspaceContext = {
    key: "repo:main", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
    history: true, removedCopies: memoryUploadBytes(), now: () => Date.parse("2026-10-15"),
    drafts: { get: () => undefined, save() { throw new Error("no direct write"); }, remove() { throw new Error("no direct write"); } },
    get paths() { return [...text.keys(), ...bytes.keys()]; }, get items() { return [...bytes.keys()].map(path => ({ path })); },
    pages: ["index.html"], components: {}, assertLive() {}, async read(path) { return text.get(path); },
    async blob(path) { return bytes.get(path)!; }, assetVersion(path) { return versions.get(path); }, async openPage() {},
    async applyBatch(batch) {
      if (batch.live && !batch.live()) throw new Error("not live");
      batches.push(batch);
      for (const [path, value] of batch.edits) text.set(path, value);
      for (const upload of batch.uploads) { bytes.set(upload.path, upload.blob); versions.set(upload.path, `sha:${upload.path}`); }
    },
  };
  const host = createMediaWorkspace(async () => ctx);
  const selected: unknown[] = [], said: string[] = [];
  // eslint-disable-next-line no-restricted-syntax -- placing uses only these ports; the rest are the editor's
  const ports = {
    stamp: () => ({ holds: () => true }), source: (path: string) => text.get(path), viewingVersion: () => false,
    openFile: () => "index.html", restoreFile: async () => undefined, announce: (words: string) => { said.push(words); },
    select: (path: string, node: number[]) => { selected.push({ path, node }); },
  } as unknown as Parameters<typeof placeOnlineVideo>[0];
  const place = (chosen: Parameters<typeof placeOnlineVideo>[3], service: Parameters<typeof placeOnlineVideo>[7], cancelled = () => false) => {
    const source = text.get("index.html")!;
    return placeOnlineVideo(ports, async () => ctx, { place: { path: "index.html", parent: [0, 0], index: 1 } }, chosen, host,
      { stamp: { holds: () => true } as never, epoch: 1, source }, cancelled, service);
  };
  return { ctx, text, batches, selected, said, place, records: () => parseMediaRecords(text.get(MEDIA_RECORDS_PATH)) };
}
const prepare: typeof prepareMediaFile = async (file, _key, folder) => ({ request: { file, folder: folder!, result: { before: file.size, after: 9,
  outputs: [{ blob: new Blob(["main"]), extension: "webp", width: 1280, height: 720 }, { blob: new Blob(["small"]), extension: "webp", variantWidth: 480 }] } } });
function service() {
  const calls: string[] = [];
  const answer: typeof globalThis.fetch = async url => {
    calls.push(String(url));
    return String(url).includes("oembed") ? Response.json({ title: "Never gonna" }) : new Response("picture", { headers: { "content-type": "image/jpeg" } });
  };
  return { calls, fetch: answer };
}

test("a pasted address is placed with its copied still, the player's head links and the record, as one step; placing it again calls no service", async () => {
  const f = fixture(), s = service();
  await f.place({ address: `https://youtu.be/${ID}?t=30` }, { fetch: s.fetch, prepare });
  assert.equal(f.batches.length, 1);
  assert.equal(f.batches[0].label, "YouTube video added");
  const page = f.text.get("index.html")!;
  assert.match(page, /<p>Words<\/p>\s*<a class="online-video" href="https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ&amp;t=30"><img src="\/media\/videos\/never-gonna.webp" alt="Never gonna" width="1280" height="720"><\/a>/);
  assert.ok(page.includes('<script type="module" src="/scripts/media-player.js"></script>'));
  assert.ok(page.includes('<link rel="stylesheet" href="/styles/media-player.css">'));
  assert.deepEqual(f.records().onlineVideos, [{ service: "youtube", id: ID, title: "Never gonna", still: "media/videos/never-gonna.webp", stillCopied: true }]);
  assert.deepEqual(f.selected, [{ path: "index.html", node: [0, 0, 1] }]);
  assert.deepEqual(f.said, ["YouTube video added."]);
  const calls = s.calls.length;
  // Chosen from Media: the record's still, no service call, no upload.
  await f.place({ service: "youtube", id: ID }, { fetch: s.fetch, prepare });
  assert.equal(s.calls.length, calls);
  assert.equal(f.batches.length, 2); assert.equal(f.batches[1].uploads.length, 0);
  assert.equal(f.text.get("index.html")!.match(/class="online-video"/g)?.length, 2);
  assert.match(f.text.get("index.html")!, /<a class="online-video" href="https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ"><img src="\/media\/videos\/never-gonna.webp" alt="Never gonna"><\/a>/);
});

test("a Vimeo video without a still is placed as its titled link with the service bar choice; the note asks for a picture", async () => {
  const records = serializeMediaRecords(upsertOnlineVideo(parseMediaRecords(undefined), { service: "vimeo", id: "42", title: "Talk", serviceBar: true }));
  const f = fixture({ [MEDIA_RECORDS_PATH]: records });
  const blocked: typeof fetch = async () => { throw new TypeError("blocked"); };
  await f.place({ address: "https://vimeo.com/42" }, { fetch: blocked, prepare });
  assert.match(f.text.get("index.html")!, /<a class="online-video" href="https:\/\/vimeo.com\/42" data-controls="service" aria-label="Talk">Talk<\/a>/);
  assert.match(f.said[0], /^Vimeo video added\. Vimeo did not share this video's picture, so add your own still picture\.$/);
});

test("nothing is written for an unknown video, a page changed meanwhile, or a picker closed meanwhile", async () => {
  const f = fixture(), s = service();
  await assert.rejects(f.place({ service: "youtube", id: ID }, { fetch: s.fetch, prepare }), /no longer in Media/);
  await assert.rejects(f.place({ address: "https://example.com/v" }, { fetch: s.fetch, prepare }), /YouTube or Vimeo/);
  const changing: typeof fetch = async url => { f.text.set("index.html", `${PAGE}\n`); return s.fetch(url); };
  await assert.rejects(f.place({ address: `https://youtu.be/${ID}` }, { fetch: changing, prepare }), /page changed/);
  f.text.set("index.html", PAGE);
  let closed = false;
  const closing: typeof fetch = async url => { closed = true; return s.fetch(url); };
  await assert.rejects(f.place({ address: `https://youtu.be/${ID}` }, { fetch: closing, prepare }, () => closed));
  assert.equal(f.batches.length, 0);
  assert.equal(f.text.get("index.html"), PAGE);
});

test("a placement's player files are saved as text, never as uploads, expected to be new", async () => {
  const f = fixture();
  for (const path of PLAYER) f.text.delete(path);
  const host = createMediaWorkspace(async () => f.ctx);
  await host.onlineVideo({ service: "youtube", id: ID }, { path: "index.html", source: PAGE, files: [{ path: "styles/media-player.css", content: ".online-video {}" }], apply: () => `${PAGE}\n` });
  const batch = f.batches.at(-1)!;
  assert.equal(batch.edits.get("styles/media-player.css"), ".online-video {}");
  assert.equal(batch.expectedSources.has("styles/media-player.css"), true);
  assert.equal(batch.expectedSources.get("styles/media-player.css"), undefined);
  assert.equal(batch.uploads.length, 0);
  const file = new File(["picture"], "film.jpg", { type: "image/jpeg" });
  await host.import([{ file, folder: "media" }], { path: "index.html", source: `${PAGE}\n`, files: [{ path: "scripts/media-player.js", content: "// player" }], apply: () => `${PAGE}\n\n` });
  const imported = f.batches.at(-1)!;
  assert.equal(imported.edits.get("scripts/media-player.js"), "// player");
  assert.deepEqual(imported.uploads.map(upload => upload.path), ["media/film.jpg"]);
});
