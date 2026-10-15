import { test } from "node:test";
import assert from "node:assert/strict";
import { elementEnd, startTags, type ElementRange } from "../shared/html-source";
import { onlinePlayerAddress, onlineVideo } from "../src/page-builder/online-video";
import { createMediaPlay, playable, type MediaPlayHost } from "../src/page-builder/media-play";

const range = (source: string, name: string): ElementRange => {
  const tags = startTags(source), index = tags.findIndex(tag => tag.name === name);
  const found = elementEnd(source, tags, index, source.length);
  assert.ok(found); return found;
};
const what = (source: string, name: string, file = "index.html", origins: string[] = []) => playable(source, range(source, name), file, { origins });

test("YouTube and Vimeo addresses are read as the starter reads them", () => {
  const id = "aqz-KE-bpKQ";
  for (const address of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/embed/${id}`, `https://youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`, `https://www.youtube-nocookie.com/embed/${id}`])
    assert.deepEqual(onlineVideo(address), { service: "youtube", id, hash: "", start: 0 }, address);
  assert.equal(onlineVideo(`https://youtu.be/${id}?t=1m30s`)?.start, 90);
  assert.equal(onlineVideo(`https://www.youtube.com/watch?v=${id}&start=45`)?.start, 45);
  assert.equal(onlineVideo(`https://www.youtube.com/watch?v=${id}#t=1h2m3s`)?.start, 3723);
  assert.equal(onlineVideo("https://www.youtube.com/watch?v=short"), undefined);
  assert.equal(onlineVideo("https://www.youtube.com/channel/abc"), undefined);
  assert.deepEqual(onlineVideo("https://vimeo.com/76979871"), { service: "vimeo", id: "76979871", hash: "", start: 0 });
  assert.deepEqual(onlineVideo("https://vimeo.com/76979871/a1b2c3"), { service: "vimeo", id: "76979871", hash: "a1b2c3", start: 0 });
  assert.equal(onlineVideo("https://player.vimeo.com/video/76979871?h=ff00")?.hash, "ff00");
  assert.equal(onlineVideo("https://vimeo.com/channels/staffpicks/76979871")?.id, "76979871");
  assert.equal(onlineVideo("https://vimeo.com/showcase/123/video/76979871")?.id, "76979871");
  assert.equal(onlineVideo("https://vimeo.com/76979871/not-a-hash")?.hash, "");
  for (const address of ["javascript:alert(1)", "ftp://youtu.be/aqz-KE-bpKQ", "not a url", "https://example.com/watch?v=aqz-KE-bpKQ"])
    assert.equal(onlineVideo(address), undefined, address);
});

test("the service's own player starts as it loads, keeping the start and Vimeo's key", () => {
  assert.equal(onlinePlayerAddress({ service: "youtube", id: "aqz-KE-bpKQ", hash: "", start: 90 }),
    "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&playsinline=1&rel=0&iv_load_policy=3&start=90");
  assert.equal(onlinePlayerAddress({ service: "vimeo", id: "76979871", hash: "ab12", start: 5 }),
    "https://player.vimeo.com/video/76979871?autoplay=1&playsinline=1&dnt=1&title=0&byline=0&portrait=0&h=ab12#t=5s");
});

test("a video or audio plays its own site file: its address, else its first source with one", () => {
  assert.deepEqual(what('<video src="/media/clip.mp4" poster="/media/clip.webp"></video>', "video"), { kind: "file", path: "media/clip.mp4", type: "video/mp4" });
  assert.deepEqual(what('<video src="clip%20one.webm"></video>', "video", "blog/index.html"), { kind: "file", path: "blog/clip one.webm", type: "video/webm" });
  assert.deepEqual(what('<video poster="x.webp"><source type="video/webm"><source src="../media/a.mov" type="video/quicktime"></video>', "video", "blog/post.html"),
    { kind: "file", path: "media/a.mov", type: "video/quicktime" });
  assert.deepEqual(what('<audio src="/media/talk.mp3" controls></audio>', "audio"), { kind: "file", path: "media/talk.mp3", type: "audio/mpeg" });
  assert.deepEqual(what('<audio src="/media/talk.m4a"></audio>', "audio"), { kind: "file", path: "media/talk.m4a", type: "audio/mp4" });
  assert.deepEqual(what('<video src="/media/a&amp;b.mp4"></video>', "video"), { kind: "file", path: "media/a&b.mp4", type: "video/mp4" });
  // The site's own full address counts as its file.
  assert.deepEqual(what('<video src="https://example.com/media/clip.mp4"></video>', "video", "index.html", ["https://example.com"]),
    { kind: "file", path: "media/clip.mp4", type: "video/mp4" });
});

test("nothing plays without a site file or a YouTube or Vimeo address, with the reason", () => {
  assert.deepEqual(what("<video></video>", "video"), { kind: "none", reason: "This video has no file to play." });
  assert.deepEqual(what('<video src="https://cdn.example.net/clip.mp4"></video>', "video"), { kind: "none", reason: "This video is not one of the site's files, so it cannot play here." });
  assert.deepEqual(what('<a class="online-video" href="https://example.com/">x</a>', "a"), { kind: "none", reason: "This link is not a YouTube or Vimeo video." });
  assert.deepEqual(what("<p>x</p>", "p"), { kind: "none", reason: "Choose a video or audio." });
  assert.deepEqual(what('<a class="online-video" href="https://vimeo.com/76979871">x</a>', "a"),
    { kind: "online", address: "https://player.vimeo.com/video/76979871?autoplay=1&playsinline=1&dnt=1&title=0&byline=0&portrait=0" });
});

function harness(bytes: Blob | Error = new Blob(["clip"], { type: "application/octet-stream" })) {
  const sent: { id: number; request: { path: string; node: number[] } | null; blob?: Blob }[] = [];
  const listeners = new Set<(at: { path?: string; node?: number[] } | undefined) => void>();
  let selected: { path?: string; node?: number[] } | undefined = { path: "index.html", node: [0] };
  let refreshed = 0, release: () => void = () => {};
  const host: MediaPlayHost = {
    send: (id, request, blob) => { sent.push({ id, request, blob }); },
    box: () => undefined, frame: () => undefined,
    watch: listener => { listeners.add(listener); listener(selected); return () => { listeners.delete(listener); }; },
  };
  const gate = new Promise<void>(resolve => { release = resolve; });
  const play = createMediaPlay({
    host, locate: text => range(text, /<audio/.test(text) ? "audio" : "video"), refresh: () => { refreshed++; },
    blob: async () => { await gate; if (bytes instanceof Error) throw bytes; return bytes; },
  });
  return { play, sent, release, refreshed: () => refreshed, listeners,
    select(at: typeof selected) { selected = at; for (const listener of [...listeners]) listener(at); } };
}

test("Play posts the file's bytes, typed, to the canvas; a second press stops and writes nothing else", async () => {
  const h = harness();
  const pending = h.play.toggle("index.html", [0], '<video src="/media/clip.webm"></video>');
  // The bar reads Stop at once, while the bytes load.
  assert.equal(h.play.playing("index.html", [0]), true);
  assert.equal(h.refreshed(), 1);
  h.release(); await pending;
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0].request, { path: "index.html", node: [0] });
  assert.equal(h.sent[0].blob?.type, "video/webm");
  await h.play.toggle("index.html", [0], '<video src="/media/clip.webm"></video>');
  assert.equal(h.play.playing("index.html", [0]), false);
  assert.deepEqual(h.sent[1], { id: h.sent[0].id, request: null, blob: undefined });
  assert.equal(h.listeners.size, 0);
});

test("choosing something else, the canvas's end or a press while loading stops it", async () => {
  const source = '<audio src="/media/talk.mp3"></audio>';
  const a = harness();
  a.release();
  await a.play.toggle("index.html", [0], source);
  a.select({ path: "index.html", node: [1] });
  assert.equal(a.play.playing("index.html", [0]), false);
  assert.equal(a.sent.at(-1)?.request, null);
  // Same element chosen again (a redraw of the selection) keeps playing.
  const b = harness(); b.release();
  await b.play.toggle("index.html", [0], source);
  b.select({ path: "index.html", node: [0] });
  assert.equal(b.play.playing("index.html", [0]), true);
  b.play.ended(b.sent[0].id + 1);
  assert.equal(b.play.playing("index.html", [0]), true, "another play's end changes nothing");
  b.play.ended(b.sent[0].id);
  assert.equal(b.play.playing("index.html", [0]), false);
  // Stopped before the bytes arrived: nothing is posted to play.
  const c = harness();
  const pending = c.play.toggle("index.html", [0], source);
  await c.play.toggle("index.html", [0], source);
  c.release(); await pending;
  assert.deepEqual(c.sent.map(message => message.request), [null]);
});

test("a file that cannot be read stops and reports; a video without a file refuses with the reason", async () => {
  const h = harness(new Error("media/gone.mp4 is unavailable."));
  h.release();
  await assert.rejects(h.play.toggle("index.html", [0], '<video src="/media/gone.mp4"></video>'), /unavailable/);
  assert.equal(h.play.playing("index.html", [0]), false);
  await assert.rejects(h.play.toggle("index.html", [0], "<video></video>"), /no file to play/);
  assert.equal(h.play.playing("index.html", [0]), false);
});
