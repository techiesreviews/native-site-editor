import { test } from "node:test";
import assert from "node:assert/strict";
import { startTags, elementEnd, type ElementRange } from "../shared/html-source";
import { backgroundVideoMarkup, isPictureSpot, loopingVideoMarkup, loopsFromStart, pictureSpotVideo, placedVideoMarkup, readLooping, readSectionBackground, sectionBackgroundEdits, writeLooping } from "../src/page-builder/looping-video";
import { readPlaceFrame } from "../src/page-builder/place-frame";
import { mediaPlayerPlan } from "../src/page-builder/player-markup";

const range = (source: string): ElementRange => {
  const tags = startTags(source), index = tags.findIndex(tag => tag.name === "section");
  const section = elementEnd(source, tags, index, source.length);
  assert.ok(section); return section;
};
const background = (source: string, video?: { path: string; still?: string }) => {
  for (const edit of sectionBackgroundEdits(source, range(source), video).reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
};
test("looping exact contract, encoded paths, optional positive sizes and no subtitles or autoplay", () => {
  assert.deepEqual(loopingVideoMarkup({ path: "media/loop.mp4" }), { markup: '<video src="/media/loop.mp4" controls muted loop playsinline></video>', notes: [] });
  assert.equal(loopingVideoMarkup({ path: "media/a b.mp4", still: "media/a b.webp", width: 640, height: 360, name: 'A & "B"', subtitles: { path: "media/c.vtt" } }).markup,
    '<video src="/media/a%20b.mp4" poster="/media/a%20b.webp" controls muted loop playsinline width="640" height="360" aria-label="A &amp; &quot;B&quot;"></video>');
  assert.equal(loopingVideoMarkup({ path: "v.mp4", width: -1, height: NaN }).markup, loopingVideoMarkup({ path: "v.mp4" }).markup);
});
test("only fromGif true starts looping; ordinary placement keeps subtitles and page language", () => {
  assert.equal(loopsFromStart(), false);
  assert.equal(loopsFromStart({ fromGif: "true" }), false);
  assert.equal(loopsFromStart({ fromGif: true }), true);
  assert.equal(readLooping(placedVideoMarkup({ path: "v.mp4" }, { fromGif: true }).markup), true);
  assert.match(placedVideoMarkup({ path: "v.mp4", subtitles: { path: "c.vtt" } }, undefined, "nl").markup, /srclang="nl"/);
  assert.doesNotMatch(placedVideoMarkup({ path: "v.mp4", subtitles: { path: "c.vtt" } }, { fromGif: true }).markup, /track|autoplay/);
});
test("on and off retain unrelated attributes byte for byte, including quoted attribute-like text", () => {
  const tag = `<VIDEO id='one' data-note='muted loop autoplay' src = 'v.mp4' style="color:red" controls preload='none' playsinline>`;
  const on = writeLooping(tag, true);
  assert.equal(readLooping(on), true);
  assert.doesNotMatch(on, /preload=/);
  assert.equal(writeLooping(on, false), `<VIDEO id='one' data-note='muted loop autoplay' src = 'v.mp4' style="color:red" controls playsinline preload="none">`);
  assert.equal(writeLooping(on, true), on);
  assert.match(writeLooping('<video autoplay autoplay="true" muted="false" loop preload="auto">', false), /^<video controls playsinline preload="none">$/);
  assert.equal(readLooping('<img muted loop>'), false);
  assert.equal(readLooping('<video loop>'), false);
});
test("boolean attributes are ensured once; other attributes and content survive", () => {
  const on = writeLooping('<video title="x > y">fallback</video>', true);
  assert.equal(on, '<video title="x > y" muted loop playsinline controls>fallback</video>');
  assert.equal(writeLooping(on, false), '<video title="x > y" playsinline controls preload="none">fallback</video>');
});
test("picture spots accept pictures and silent loops, exclude ordinary and background videos", () => {
  assert.equal(isPictureSpot('<img slot="image">'), true);
  assert.equal(isPictureSpot('<picture slot="image">'), true);
  assert.equal(isPictureSpot('<video slot="image" muted loop>'), true);
  assert.equal(isPictureSpot('<img>'), false);
  for (const tag of ['<video slot="image" muted loop>', '<video slot="image" controls>'])
    assert.throws(() => writeLooping(tag, false), /A video in a picture spot always loops silently\./);
});
test("picture replacement keeps slot, identity, style, shape, focus, dimensions and decoded alt", () => {
  const spot = `<img slot='image' id="hero" class='photo' style="aspect-ratio: 4 / 5; object-fit: cover; object-position: 22% 78%; color:red" width="400" height='500' alt="A &amp; B">`;
  const video = pictureSpotVideo(spot, { path: "v.mp4", name: "Ignored", width: 1280, height: 720 }).markup;
  assert.match(video, /slot='image' id="hero" class='photo'/);
  assert.match(video, /width="400" height='500' aria-label="A &amp; B"/);
  assert.deepEqual(readPlaceFrame(video), { shape: "4:5", focus: { x: 22, y: 78 }, trimmed: false, file: "v.mp4" });
  assert.equal(readLooping(video), true);
  assert.doesNotMatch(pictureSpotVideo('<img slot="image" alt="">', { path: "v.mp4", name: "Ignored" }).markup, /aria-label/);
});
test("picture wrappers keep their own style and take dimensions and alt from the inner image", () => {
  const spot = '<picture slot="image" class="photo" style="aspect-ratio:1 / 1;object-fit:cover;object-position:10% 20%"><source srcset="a.webp"><img width="100" height="100" alt="Picture"></picture>';
  const video = pictureSpotVideo(spot, { path: "v.mp4" }).markup;
  assert.match(video, /class="photo"/);
  assert.match(video, /aria-label="Picture"/);
  assert.doesNotMatch(video, /source|<img|picture/);
  assert.equal(readPlaceFrame(video).shape, "square");
  assert.deepEqual(readPlaceFrame(video).focus, { x: 10, y: 20 });
});
test("background exact contract without controls, autoplay, size or label", () => {
  assert.equal(backgroundVideoMarkup({ path: "media/bg.mp4", still: "media/bg.webp" }), '<video data-background src="/media/bg.mp4" poster="/media/bg.webp" muted loop playsinline preload="none"></video>');
  assert.equal(backgroundVideoMarkup({ path: "bg.mp4" }), '<video data-background src="/bg.mp4" muted loop playsinline preload="none"></video>');
});
for (const newline of ["\n", "\r\n"]) test(`section background insert, replace, remove preserves indentation and ${JSON.stringify(newline)}`, () => {
  const source = ['<main>', '\t<section id="one">', '\t\t<h2>Words</h2>', '\t</section>', '</main>'].join(newline);
  const added = background(source, { path: "bg.mp4" });
  assert.equal(added, source.replace(`<section id="one">`, `<section id="one">${newline}\t\t${backgroundVideoMarkup({ path: "bg.mp4" })}`));
  const found = readSectionBackground(added, range(added)); assert.ok(found);
  assert.equal(added.slice(found.start, found.end), backgroundVideoMarkup({ path: "bg.mp4" }));
  const changed = background(added, { path: "next.webm", still: "next.webp" });
  assert.match(changed, /next.webm/); assert.doesNotMatch(changed, /bg.mp4/);
  assert.equal(background(changed), source);
  assert.equal(background(source), source);
});
test("inline, empty and nested sections: only the selected section's first child counts", () => {
  const inline = '<section><h2>Hi</h2></section>';
  assert.equal(background(background(inline, { path: "v.mp4" })), inline);
  const empty = background('<section></section>', { path: "v.mp4" });
  assert.match(empty, /^<section>\n  <video/);
  assert.equal(readSectionBackground('<section><p>Hi</p><video data-background></video></section>', range('<section><p>Hi</p><video data-background></video></section>')), undefined);
  const nested = '<section><section><video data-background></video></section></section>';
  assert.equal(readSectionBackground(nested, range(nested)), undefined);
});
test("refuse non-video, background toggles, non-picture spots and non-sections", () => {
  for (const text of ['<img>', '<video data-background muted loop>']) assert.throws(() => writeLooping(text, true), /Choose a video/);
  // A video already in a picture spot gives way to another (slice 119's Replace); a slotless one is no spot.
  for (const text of ['<img>', '<video muted loop>', '<section slot="image">']) assert.throws(() => pictureSpotVideo(text, { path: "v.mp4" }), /Choose a picture spot/);
  const source = '<div></div>', tags = startTags(source), div = elementEnd(source, tags, 0, source.length)!;
  assert.throws(() => sectionBackgroundEdits(source, div, { path: "v.mp4" }), /Choose a section/);
  assert.throws(() => readSectionBackground(source, div), /Choose a section/);
});
for (const kind of ["looping-video", "background-video"] as const) test(`${kind} installs player files and page links once`, () => {
  const files = { "styles/media-player.css": "style", "scripts/media-player.js": "player", "scripts/media-online.js": "online" };
  const plan = mediaPlayerPlan({ prefix: "", pages: ["index.html"], sources: { "index.html": "<html><head></head><body></body></html>" }, exists: () => false, kinds: [kind], files });
  assert.equal(plan?.creates.length, 3);
  const source = plan!.edits.get("index.html")!;
  assert.match(source, /media-player.js/);
  assert.equal(mediaPlayerPlan({ prefix: "", pages: ["index.html"], sources: { "index.html": source }, exists: () => true, kinds: [kind] }), undefined);
});

test("looping and background writers carry the project prefix", () => {
  const video = { path: "media/a.mp4", still: "media/a.webp" };
  assert.equal(loopingVideoMarkup(video, "/my-site").markup, '<video src="/my-site/media/a.mp4" poster="/my-site/media/a.webp" controls muted loop playsinline></video>');
  assert.equal(backgroundVideoMarkup(video, "/my-site"), '<video data-background src="/my-site/media/a.mp4" poster="/my-site/media/a.webp" muted loop playsinline preload="none"></video>');
  assert.equal(placedVideoMarkup(video, { fromGif: true }, undefined, "/my-site").markup, loopingVideoMarkup(video, "/my-site").markup);
  assert.equal(pictureSpotVideo('<img slot="hero">', video, "/my-site").markup, '<video src="/my-site/media/a.mp4" poster="/my-site/media/a.webp" controls muted loop playsinline slot="hero"></video>');
});
