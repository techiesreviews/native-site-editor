import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaImageMarkup, mediaAttributes, mediaPictureUnwrap, mediaPlacement, mediaPriority, mediaSrcset } from "../src/page-builder/media-markup";
import { mediaPageEdits } from "../src/page-builder/media-page-markup";
import { readSource } from "../src/page-builder/source-tree";

const image = { path: "media/images/photo.webp", width: 1600, height: 900, alt: "Photo", variants: [
  { path: "media/images/photo-960.webp", width: 960 }, { path: "media/originals/photo.jpg", width: 300 },
  { path: "media/images/photo-480.webp", width: 480 }, { path: "media/images/photo-2400.webp", width: 2400 },
] };
test("srcset includes smaller copies ascending and the main at its real width, never originals", () => {
  assert.equal(mediaSrcset(image), "/media/images/photo-480.webp 480w, /media/images/photo-960.webp 960w, /media/images/photo.webp 1600w");
  assert.equal(mediaSrcset({ ...image, width: undefined }), undefined);
});
test("measured first-screen images are eager; other images and failures use auto", () => {
  const eager = mediaImageMarkup(image, '<img loading="lazy" fetchpriority="high">', mediaPlacement({ sizes: "80vw", firstScreen: true }, true));
  assert.match(eager, /sizes="80vw"/); assert.match(eager, /fetchpriority="high"/); assert.doesNotMatch(eager, /loading=/);
  const lazy = mediaImageMarkup(image, eager, mediaPlacement({ sizes: "700px", firstScreen: false }, true));
  assert.match(lazy, /sizes="auto, 700px"/); assert.match(lazy, /loading="lazy"/); assert.doesNotMatch(lazy, /fetchpriority/);
  assert.match(mediaImageMarkup(image), /sizes="auto, 100vw"/);
});
test("file dimensions replace old values; SVG has dimensions without srcset or sizes; unknown dimensions remove stale values", () => {
  assert.match(mediaImageMarkup(image), /width="1600" height="900"/);
  const svg = mediaImageMarkup({ path: "a.svg", width: 120, height: 80, alt: "" }, '<img width="3" height="4" srcset="old 3w" sizes="3px">');
  assert.match(svg, /width="120" height="80"/); assert.doesNotMatch(svg, /srcset|sizes/);
  assert.doesNotMatch(mediaImageMarkup({ path: "a.png", alt: "" }, svg), /width=|height=|sizes=|srcset=/);
});
test("slot, class, style and other attributes survive; keepAlt preserves source spelling", () => {
  const tag = `<img slot="photo" class="hero" style="object-fit:cover" data-note="keep" alt='A &#38; B'>`;
  const result = mediaImageMarkup(image, tag, undefined, true);
  for (const attr of ['slot="photo"', 'class="hero"', 'style="object-fit:cover"', 'data-note="keep"', "alt='A &#38; B'"]) assert.ok(result.includes(attr));
});
test("priority chooses the first large first-screen page image in document order", () => {
  assert.deepEqual(mediaPriority([{ node: [2], firstScreen: true, large: true }, { node: [0], firstScreen: true, large: false }, { node: [1], firstScreen: true, large: true }]), [1]);
  assert.equal(mediaPriority([{ node: [0], firstScreen: false, large: true }]), undefined);
});
test("other images change priority in the placement batch; template fallback is untouched", () => {
  const source = '<img sizes="auto, 80vw" loading="lazy" class="a"><img fetchpriority="high" data-key="b"><template><img fetchpriority="high"></template>';
  const tree = readSource(source, { page: true });
  const locate = (_source: string, node: number[]) => { const element = tree.at(node); return element && tree.range(element); };
  const result = mediaPageEdits(source, { sizes: "400px", firstScreen: true, large: true, images: [{ node: [0], firstScreen: true, large: true }, { node: [1], firstScreen: true, large: true }] }, [1], locate);
  assert.equal(result.placement.priority, false);
  assert.equal(result.edits.length, 1);
  assert.match(result.edits[0].text, /fetchpriority="high"/); assert.match(result.edits[0].text, /sizes="80vw"/);
  assert.doesNotMatch(result.edits[0].text, /loading=/);
  let after = source;
  for (const edit of result.edits) after = after.slice(0, edit.start) + edit.text + after.slice(edit.end);
  assert.ok(after.endsWith('<template><img fetchpriority="high"></template>'));
});

test("priority uses the measured rendered box rather than cover width or content-box area", () => {
  const measured = { sizes: "400px", firstScreen: true, large: false, images: [{ node: [0], firstScreen: true, large: true }] };
  assert.equal(mediaPageEdits("", measured, [0], () => undefined).placement.priority, true);
  assert.equal(mediaPageEdits("", { ...measured, large: true, images: [{ node: [0], firstScreen: false, large: false }] }, [0], () => undefined).placement.lazy, true);
});

test("a component template's own fallback keeps a plain address; slot images on pages are measured (native-components spec)", async () => {
  const { prepareMediaPath } = await import("../src/page-builder/media-page-markup");
  const picked = { path: "media/images/desk.webp", width: 1600, height: 900, alt: "", variants: [{ path: "media/images/desk-480.webp", width: 480 }] };
  let measured = 0;
  const ports: Parameters<typeof prepareMediaPath>[0] = { measureImage: async () => { measured++; return undefined; } };
  const template = '<article><slot name="image"><img src="/images/placeholder.svg" alt=""></slot></article>';
  const edit = (url: string) => template.replace(/src="[^"]*"/, `src="${url}"`);
  const fallback = await prepareMediaPath(ports, { path: "components/media-card/media-card.html", source: template, edit }, picked);
  assert.equal(fallback(picked), '<article><slot name="image"><img src="/media/images/desk.webp" alt=""></slot></article>');
  assert.equal(measured, 0);
});

test("a placement re-checks other placed images across the fold both ways; hand-written images keep their loading", () => {
  const source = '<img sizes="auto, 50vw" loading="lazy" class="up"><img sizes="40vw" class="down"><img class="plain" loading="lazy"><img class="target">';
  const tree = readSource(source, { page: true });
  const locate = (_source: string, node: number[]) => { const element = tree.at(node); return element && tree.range(element); };
  const images = [{ node: [0], firstScreen: true, large: false }, { node: [1], firstScreen: false, large: false }, { node: [2], firstScreen: true, large: false }];
  const result = mediaPageEdits(source, { sizes: "400px", firstScreen: false, large: false, images }, [3], locate);
  let after = source;
  for (const edit of [...result.edits].sort((a, b) => b.start - a.start)) after = after.slice(0, edit.start) + edit.text + after.slice(edit.end);
  assert.match(after, /<img sizes="50vw" class="up">/);
  assert.match(after, /<img sizes="auto, 40vw" class="down" loading="lazy">|<img loading="lazy" sizes="auto, 40vw" class="down">/);
  assert.match(after, /<img class="plain" loading="lazy">/);
});

for (const [sources, artDirected] of [
  ["", false], ['<source type="image/avif" srcset="old.avif">', false],
  ['<source MEDIA="(max-width: 600px)" srcset="phone.jpg">', true],
  ['<source media="  " srcset="old.jpg">', false],
] as const) test(`picture cleanup preserves image attributes and surrounding whitespace: ${sources}`, () => {
  const tag = `<img class="hero" alt='A &#38; B' data-note="keep" style="object-fit:cover" id="photo">`;
  const source = ` \n<picture slot="hero&amp;photo" class="discard">${sources}<!-- discard -->\n${tag}\n</picture>\n `;
  const tree = readSource(source), picture = tree.at([0])!, img = tree.children(picture).find(child => child.type === "element" && child.name === "img")!;
  const unwrap = mediaPictureUnwrap(source, tree.range(img)!, tree.range(picture));
  assert.ok(unwrap); assert.equal(unwrap.artDirected, artDirected); assert.equal(unwrap.slot, "hero&photo");
  const markup = mediaAttributes(mediaImageMarkup(image, tag, undefined, true), { slot: unwrap.slot });
  const edits = [...unwrap.edits, { start: tree.range(img)!.start, end: tree.range(img)!.end, text: markup }];
  const result = edits.sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
  assert.equal(result, ` \n${markup}\n `);
  assert.doesNotMatch(result, /<picture|<source|discard/);
  for (const attribute of ['class="hero"', "alt='A &#38; B'", 'data-note="keep"', 'style="object-fit:cover"', 'id="photo"', 'slot="hero&amp;photo"']) assert.ok(result.includes(attribute));
});
test("picture cleanup leaves an image's own slot and refuses a non-picture parent", () => {
  const source = '<picture slot="wrapper"><img slot="own"></picture><section><img></section>';
  const tree = readSource(source), picture = tree.at([0])!, img = tree.at([0, 0])!;
  assert.equal(mediaPictureUnwrap(source, tree.range(img)!, tree.range(picture))?.slot, undefined);
  assert.equal(mediaPictureUnwrap(source, tree.range(tree.at([1, 0])!)!, tree.range(tree.at([1])!)), undefined);
  assert.equal(mediaPictureUnwrap(source, tree.range(img)!, undefined), undefined);
});
