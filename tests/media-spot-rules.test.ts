import assert from "node:assert/strict";
import test from "node:test";
import { readSource } from "../src/page-builder/source-tree";
import { inPictureSpot, mediaSpotAddress, mediaSpotFile, mediaSpotKind, mediaSpotTitle, mediaSpotTitleEdit } from "../src/page-builder/media-spot-rules";
import { pictureSpotVideo, spotPictureTag } from "../src/page-builder/looping-video";
import { insertAtPlace, spotVideoPage, locatePageElement } from "../src/page-builder/media-insert";

const at = (source: string, node = [0]) => { const tree = readSource(source), element = tree.at(node); return tree.range(element!)!; };
const apply = (source: string, edit?: { start: number; end: number; text: string }) => edit ? source.slice(0, edit.start) + edit.text + source.slice(edit.end) : source;

test("the Media popup tells a video, audio, a download and an Online video apart", () => {
  const kinds = [
    ['<video src="/media/a.mp4"></video>', "video"], ['<video data-background src="/media/a.mp4"></video>', undefined],
    ['<audio src="/media/a.mp3"></audio>', "audio"], ['<a class="download-card" href="/media/a.pdf"></a>', "download"],
    ['<a class="x online-video" href="https://vimeo.com/1"></a>', "online-video"], ['<a href="/about/">About</a>', undefined], ["<img src=x>", undefined],
  ] as const;
  for (const [source, kind] of kinds) assert.equal(mediaSpotKind(source, at(source)), kind, source);
  assert.equal(inPictureSpot('<video slot="media" src=a></video>', at('<video slot="media" src=a></video>')), true);
  assert.equal(inPictureSpot('<video src=a></video>', at("<video src=a></video>")), false);
});

test("the spot's file is its own src, its first source, or its link, as a site path", () => {
  const source = '<audio controls><source src="/media/talk.wav" type="audio/wav"><source src="/media/talk.mp3"></audio>';
  assert.equal(mediaSpotAddress(source, at(source)), "/media/talk.wav");
  assert.equal(mediaSpotFile('<video src="/my-site/media/a%20b.mp4"></video>', at('<video src="/my-site/media/a%20b.mp4"></video>'), "index.html", "/my-site"), "media/a b.mp4");
  assert.equal(mediaSpotFile('<a class="download-card" href="/media/list.pdf"></a>', at('<a class="download-card" href="/media/list.pdf"></a>'), "index.html"), "media/list.pdf");
});

test("a player's title is its aria-label: added, changed and taken off in one edit, bytes around it kept", () => {
  const plain = '<video src=a controls></video>';
  assert.equal(mediaSpotTitle(plain, at(plain), "video"), "");
  assert.equal(apply(plain, mediaSpotTitleEdit(plain, at(plain), "video", " Tour & talk ")), '<video aria-label="Tour &amp; talk" src=a controls></video>');
  const named = '<audio src=a  aria-label="Old" controls></audio>';
  assert.equal(apply(named, mediaSpotTitleEdit(named, at(named), "audio", "New")), '<audio src=a aria-label="New" controls></audio>');
  assert.equal(apply(named, mediaSpotTitleEdit(named, at(named), "audio", "")), "<audio src=a controls></audio>");
  assert.equal(mediaSpotTitleEdit(named, at(named), "audio", "Old"), undefined);
});

test("a download's title is its card's name; an empty one refuses, markup inside is left to Code", () => {
  const card = '<a class="download-card" href="/media/a.pdf"><span class="download-card-name">Price list</span><span class="download-card-meta">PDF</span></a>';
  assert.equal(mediaSpotTitle(card, at(card), "download"), "Price list");
  assert.equal(apply(card, mediaSpotTitleEdit(card, at(card), "download", "Prices <2026>")), card.replace("Price list", "Prices &lt;2026&gt;"));
  assert.throws(() => mediaSpotTitleEdit(card, at(card), "download", " "), /needs a name/);
  const marked = card.replace("Price list", "<b>Price</b> list");
  assert.equal(mediaSpotTitle(marked, at(marked), "download"), undefined);
  const online = '<a class="online-video" href="https://vimeo.com/1"><img src=a alt="Talk"></a>';
  assert.equal(mediaSpotTitle(online, at(online), "online-video"), undefined);
});

test("a picture spot's video gives way to another video or a picture, keeping the spot's layout and name", () => {
  const video = '<video slot="media" src="/media/a.mp4" poster="/media/a.webp" controls muted loop playsinline id="v" class="shot" style="aspect-ratio:1/1" width="800" height="600" aria-label="Old &amp; film"><track kind="subtitles" src="/media/a.vtt"></video>';
  assert.equal(pictureSpotVideo(video, { path: "media/b.mp4", still: "media/b.webp" }).markup,
    '<video src="/media/b.mp4" poster="/media/b.webp" controls muted loop playsinline slot="media" id="v" class="shot" style="aspect-ratio:1/1" width="800" height="600" aria-label="Old &amp; film"></video>');
  assert.equal(spotPictureTag(video), '<img src="" slot="media" id="v" class="shot" style="aspect-ratio:1/1" width="800" height="600" alt="Old &amp; film">');
  assert.throws(() => spotPictureTag('<video src="/media/a.mp4"></video>'), /picture spot/);
  const page = `<section><card-x>\n  ${video}\n</card-x></section>`;
  const swapped = spotVideoPage(page, [0, 0, 0], { path: "media/b.mp4" }, locatePageElement);
  assert.equal(swapped?.page, `<section><card-x>\n  <video src="/media/b.mp4" controls muted loop playsinline slot="media" id="v" class="shot" style="aspect-ratio:1/1" width="800" height="600" aria-label="Old &amp; film"></video>\n</card-x></section>`);
  assert.deepEqual(swapped?.node, [0, 0, 0]);
});

test("Replace puts the new media in the element's own place, its line kept", () => {
  const page = '<section>\n  <p>Before</p>\n  <audio src="/media/a.mp3" controls><track src="/media/a.vtt"></audio>\n  <p>After</p>\n</section>';
  assert.equal(insertAtPlace(page, { path: "index.html", parent: [0], index: 1, replaces: true }, '<video src="/media/b.mp4"></video>'),
    '<section>\n  <p>Before</p>\n  <video src="/media/b.mp4"></video>\n  <p>After</p>\n</section>');
});
