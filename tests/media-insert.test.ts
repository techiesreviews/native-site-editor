import { test } from "node:test";
import assert from "node:assert/strict";
import { insertAtPlace, insertedImagePage, insertedNode, locatePageElement, playerMediaMarkup, spotVideoPage } from "../src/page-builder/media-insert";
import { parseMediaRecords } from "../shared/media-records";
import { pickerFileWord, pickerNoun, chosenNoun } from "../src/page-builder/media-library-filter";
import type { MediaWorkspaceBatch, MediaWorkspaceContext } from "../src/page-builder/media-workspace";

const page = (body: string) => `<!doctype html>\n<html lang="en">\n<head><title>T</title></head>\n<body>\n<main>\n<section class="flow"><h1>Hi</h1></section>\n</main>${body}\n</body>\n</html>`;
const place = { path: "index.html", parent: [0, 0], index: 1 };
const records = (files: Record<string, object> = {}) => parseMediaRecords(JSON.stringify({ version: 2, collections: [], files }));

test("a video takes slice 62's markup with its still's size, subtitles, page language and description", () => {
  const out = playerMediaMarkup("media/clip.mp4", { record: { description: { text: "Clip" } }, still: { path: "media/clip.webp", width: 1280, height: 720 }, subtitles: "media/clip.vtt" }, page(""));
  assert.equal(out?.kind, "video");
  assert.equal(out?.markup, '<video src="/media/clip.mp4" poster="/media/clip.webp" controls preload="none" playsinline width="1280" height="720" aria-label="Clip"><track kind="subtitles" src="/media/clip.vtt" srclang="en" label="English"></video>');
  // The video's own size wins over its still's; a video made from a GIF loops from the start.
  const gif = playerMediaMarkup("media/cat.mp4", { record: { fromGif: true }, width: 320, height: 240, still: { path: "media/cat.webp", width: 10, height: 10 } }, page(""));
  assert.equal(gif?.kind, "looping-video");
  assert.equal(gif?.markup, '<video src="/media/cat.mp4" poster="/media/cat.webp" controls muted loop playsinline width="320" height="240"></video>');
});

test("audio carries its whole-second length; PDFs open as cards, other downloads download", () => {
  assert.deepEqual(playerMediaMarkup("media/song.mp3", { record: { duration: 75.4 } }, page("")), { markup: '<audio src="/media/song.mp3" controls preload="none" data-duration="75"></audio>', notes: [], kind: "audio" });
  const pdf = playerMediaMarkup("media/price-list.pdf", { size: 2048, still: { path: "media/price-list.webp", width: 600, height: 800 } }, page(""));
  assert.equal(pdf?.kind, "download");
  assert.equal(pdf?.markup, '<a class="download-card" href="/media/price-list.pdf"><img src="/media/price-list.webp" alt="" width="600" height="800" loading="lazy" decoding="async"><span class="download-card-name">price-list</span><span class="download-card-meta">PDF · 2 KB</span><span class="download-card-action">Open</span></a>');
  assert.match(playerMediaMarkup("files/menu.zip", {}, page(""))!.markup, /^<a class="download-card" href="\/files\/menu.zip" download>.*Download<\/span><\/a>$/);
  // An SRT file writes no track and says why.
  assert.deepEqual(playerMediaMarkup("media/talk.m4a", { subtitles: "media/talk.srt" }, page(""))?.notes, ["Subtitles need a WebVTT (.vtt) file; this subtitles file was left out."]);
  assert.equal(playerMediaMarkup("media/photo.webp", {}, page("")), undefined);
});

test("markup goes into the gap, or a new Section; HTML that refuses it gives nothing", () => {
  const source = page("");
  const into = insertAtPlace(source, place, "<audio></audio>")!;
  assert.match(into, /<section class="flow"><h1>Hi<\/h1>\s*<audio><\/audio><\/section>/);
  assert.equal(locatePageElement(into, insertedNode(place))?.tag.name, "audio");
  const wrapped = insertAtPlace(source, { path: "index.html", parent: [0], index: 1, wrap: true }, "<audio></audio>")!;
  assert.match(wrapped, /<\/section>\s*<section class="flow">\n\s*<audio><\/audio>\n\s*<\/section>/);
  assert.equal(locatePageElement(wrapped, insertedNode({ parent: [0], index: 1, wrap: true }))?.tag.name, "audio");
  assert.equal(insertAtPlace(source, { path: "index.html", parent: [0, 0], index: 5 }, "<audio></audio>"), undefined, "no such gap");
});

test("a picture takes the placed-image markup unmeasured, and its words follow the file", () => {
  const image = { path: "media/photo.webp", width: 1600, height: 900, alt: "Photo", variants: [{ path: "media/photo-480.webp", width: 480 }] };
  const placed = insertedImagePage(page(""), place, image, records())!;
  const tag = /<img[^>]*>/.exec(placed.page)![0];
  assert.match(tag, /src="\/media\/photo.webp"/);
  assert.match(tag, /alt="Photo"/);
  assert.match(tag, /srcset="\/media\/photo-480.webp 480w, \/media\/photo.webp 1600w"/);
  assert.match(tag, /sizes="auto, 100vw"/);
  assert.match(tag, /loading="lazy"/);
  assert.match(tag, /width="1600" height="900"/);
  // A Decorative file goes in with empty words.
  const decorative = insertedImagePage(page(""), place, { ...image, alt: "" }, records({ "media/photo.webp": { decorative: true } }))!;
  assert.match(/<img[^>]*>/.exec(decorative.page)![0], /alt=""/);
  assert.equal(insertedImagePage(page(""), { path: "index.html", parent: [0, 0], index: 5 }, image, records()), undefined);
});

test("a picture spot becomes a looping video keeping its slot, shape and words; other pictures are no spot", () => {
  const spot = page('\n<card-photo><img slot="photo" class="shot" style="object-position:20% 30%" src="/a.webp" alt="Harbour"></card-photo>');
  const at = spot.indexOf("<card-photo>");
  assert.ok(at > 0);
  const node = [1, 0];
  const out = spotVideoPage(spot, node, { path: "media/loop.mp4", still: "media/loop.webp", width: 640, height: 360 }, locatePageElement)!;
  assert.deepEqual(out.node, node);
  assert.match(out.page, /<card-photo><video src="\/media\/loop.mp4" poster="\/media\/loop.webp" controls muted loop playsinline slot="photo" class="shot" style="object-position:20% 30%" width="640" height="360" aria-label="Harbour"><\/video><\/card-photo>/);
  const picture = page('\n<card-photo><picture slot="photo"><source srcset="/a.avif"><img src="/a.webp" alt=""></picture></card-photo>');
  const inPicture = spotVideoPage(picture, [1, 0, 1], { path: "media/loop.mp4" }, locatePageElement)!;
  assert.deepEqual(inPicture.node, [1, 0]);
  assert.match(inPicture.page, /<card-photo><video src="\/media\/loop.mp4" controls muted loop playsinline slot="photo"><\/video><\/card-photo>/);
  assert.equal(spotVideoPage(page(""), [0, 0, 0], { path: "media/loop.mp4" }, locatePageElement), undefined);
});

test("the picker's words follow what it lists and what is chosen", () => {
  assert.equal(pickerNoun("image/*"), "image");
  assert.equal(pickerNoun(".mp4,.m4v,.webm,.mov,.ogv"), "video");
  assert.equal(pickerNoun("image/*,.mp4,.webm"), "image or video");
  assert.equal(pickerNoun(undefined), "media");
  assert.equal(pickerFileWord("image/*"), "image");
  assert.equal(pickerFileWord("image/*,.mp4"), "file");
  assert.deepEqual(["a.webp", "a.mp4", "a.mp3", "a.pdf", "a.zip"].map(chosenNoun), ["image", "video", "audio", "file", "file"]);
});

test("placing into a component's items slot proves the template it read; the new element is selected", async () => {
  const { placeChosenMedia } = await import("../src/page-builder/media-insert");
  const template = '<div class="list"><slot></slot></div>';
  const source = '<html><head><link rel="stylesheet" href="/styles/media-player.css"><script type="module" src="/scripts/media-player.js"></script></head><body><main><card-list><p>One</p></card-list></main></body></html>';
  const batches: MediaWorkspaceBatch[] = [], selected: unknown[] = [];
  // eslint-disable-next-line no-restricted-syntax -- placing reads only these; the rest of a context is the browser's media workspace
  const ctx = {
    paths: ["index.html", "media/song.mp3", "components/card-list/card-list.html", "styles/media-player.css", "scripts/media-player.js", "scripts/media-online.js"],
    items: [{ path: "media/song.mp3", size: 10 }], assertLive() {},
    assetVersion: (path: string) => path === "media/song.mp3" ? "sha-1" : undefined,
    read: async () => undefined,
    applyBatch: async (batch: MediaWorkspaceBatch) => { batches.push(batch); },
  } as unknown as MediaWorkspaceContext;
  // eslint-disable-next-line no-restricted-syntax -- placing uses only these ports; the rest are the editor's
  const ports = {
    stamp: () => ({ holds: () => true }), source: (path: string) => path === "index.html" ? source : undefined, viewingVersion: () => false,
    openFile: () => "index.html", restoreFile: async () => undefined, announce() {}, select: (path: string, node: number[]) => { selected.push({ path, node }); },
  } as unknown as Parameters<typeof placeChosenMedia>[0];
  await placeChosenMedia(ports, async () => ctx, { kind: "insert", place: { path: "index.html", parent: [0, 0], index: 1, slot: "" },
    templates: tag => tag === "card-list" ? { path: "components/card-list/card-list.html", source: template } : undefined },
  { path: "media/song.mp3", alt: "" }, { stamp: { holds: () => true } as never, epoch: 1, source }, () => false);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].expectedSources.get("components/card-list/card-list.html"), template);
  assert.equal(batches[0].expectedAssets.get("media/song.mp3"), "sha-1");
  assert.match(batches[0].edits.get("index.html")!, /<card-list><p>One<\/p>\s*<audio src="\/media\/song.mp3" controls preload="none"><\/audio><\/card-list>/);
  assert.deepEqual(selected, [{ path: "index.html", node: [0, 0, 1] }]);
});

test("image insertion and player insertion write project-site addresses", () => {
  const source = '<html><body><main></main></body></html>';
  const image = insertedImagePage(source, { path: "index.html", parent: [0], index: 0 }, { path: "media/a.webp", alt: "A" }, records(), undefined, "/my-site");
  assert.equal(image?.page, '<html><body><main>\n  <img loading="lazy" decoding="async" src="/my-site/media/a.webp" alt="A">\n</main></body></html>');
  assert.equal(playerMediaMarkup("media/a.mp3", {}, "", "/my-site")?.markup, '<audio src="/my-site/media/a.mp3" controls preload="none"></audio>');
});
