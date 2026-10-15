import { test } from "node:test";
import assert from "node:assert/strict";
import { elementEnd, startTags, type ElementRange } from "../shared/html-source";
import { onlinePlayerAddress } from "../src/page-builder/online-video";
import { createMediaPlay, playable, type MediaPlayHost } from "../src/page-builder/media-play";

const range = (source: string, name: string): ElementRange => {
  const tags = startTags(source), index = tags.findIndex(tag => tag.name === name);
  const found = elementEnd(source, tags, index, source.length);
  assert.ok(found); return found;
};
const what = (source: string, name: string, file = "index.html", origins: string[] = []) => playable(source, range(source, name), file, { origins });

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

function harness(bytes: Blob | Error = new Blob(["clip"], { type: "application/octet-stream" }), page?: string) {
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
    host, locate: text => range(text, /<audio/.test(text) ? "audio" : "video"), refresh: () => { refreshed++; }, source: () => page,
    blob: async () => { await gate; if (bytes instanceof Error) throw bytes; return bytes; },
  });
  return { play, sent, release, refreshed: () => refreshed, listeners, edit(next: string) { page = next; },
    select(at: typeof selected) { selected = at; for (const listener of [...listeners]) listener(at); } };
}

test("Play posts the file's bytes, typed, to the canvas; a second press stops and writes nothing else", async () => {
  const h = harness(undefined, '<video src="/media/clip.webm"></video>');
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
  const a = harness(undefined, source);
  a.release();
  await a.play.toggle("index.html", [0], source);
  a.select({ path: "index.html", node: [1] });
  assert.equal(a.play.playing("index.html", [0]), false);
  assert.equal(a.sent.at(-1)?.request, null);
  // Same element chosen again (a redraw of the selection) keeps playing.
  const b = harness(undefined, source); b.release();
  await b.play.toggle("index.html", [0], source);
  b.select({ path: "index.html", node: [0] });
  assert.equal(b.play.playing("index.html", [0]), true);
  b.play.ended(b.sent[0].id + 1);
  assert.equal(b.play.playing("index.html", [0]), true, "another play's end changes nothing");
  b.play.ended(b.sent[0].id);
  assert.equal(b.play.playing("index.html", [0]), false);
  // Stopped before the bytes arrived: nothing is posted to play.
  const c = harness(undefined, source);
  const pending = c.play.toggle("index.html", [0], source);
  await c.play.toggle("index.html", [0], source);
  c.release(); await pending;
  assert.deepEqual(c.sent.map(message => message.request), [null]);
});

test("a file that cannot be read stops and reports; a video without a file refuses with the reason", async () => {
  const h = harness(new Error("media/gone.mp4 is unavailable."), '<video src="/media/gone.mp4"></video>');
  h.release();
  await assert.rejects(h.play.toggle("index.html", [0], '<video src="/media/gone.mp4"></video>'), /unavailable/);
  assert.equal(h.play.playing("index.html", [0]), false);
  h.edit("<video></video>");
  await assert.rejects(h.play.toggle("index.html", [0], "<video></video>"), /no file to play/);
  assert.equal(h.play.playing("index.html", [0]), false);
});

test("a video changed while its bytes load never plays the old bytes; another element in its place stops it", async () => {
  const before = '<video src="/media/clip.mp4"></video>';
  const a = harness(undefined, before);
  const pending = a.play.toggle("index.html", [0], before);
  a.edit('<video src="/media/other.mp4"></video>');
  a.release(); await pending;
  assert.equal(a.sent.some(message => message.blob), false);
  assert.equal(a.play.playing("index.html", [0]), false);
  // Playing, then the element at its place is another (the first removed, a sibling moved up): it stops.
  const b = harness(undefined, before); b.release();
  await b.play.toggle("index.html", [0], before);
  b.edit('<video src="/media/sibling.mp4"></video>');
  b.select({ path: "index.html", node: [0] });
  assert.equal(b.play.playing("index.html", [0]), false);
  assert.equal(b.sent.at(-1)?.request, null);
  // The bar's source already stale when pressed: nothing plays.
  const c = harness(undefined, '<video src="/media/newer.mp4"></video>'); c.release();
  await c.play.toggle("index.html", [0], before);
  assert.equal(c.play.playing("index.html", [0]), false);
  assert.equal(c.sent.length, 0);
});
