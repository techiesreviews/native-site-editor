import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMediaTags, mergeMediaMetadata, parseMediaMetadata } from "../src/page-builder/media-metadata";
import { mediaImageMarkup, mediaSrcset, mediaVariantName, mediaVariants } from "../src/page-builder/media-markup";

test("metadata validates, sorts tags, preserves unknown fields and deletes only selected entries", () => {
  const source = '{"images/a.png":{"alt":"Old","tags":[" hero ","hero"],"credit":"Artist"},"images/b.png":{"alt":"Other"}}';
  const next = JSON.parse(mergeMediaMetadata(source, { "images/a.png": { alt: "New", tags: ["z", "a", "z"] } }));
  assert.equal(next["images/a.png"].credit, "Artist"); assert.deepEqual(next["images/a.png"].tags, ["a", "z"]);
  assert.equal(next["images/b.png"].alt, "Other");
  assert.equal(JSON.parse(mergeMediaMetadata(JSON.stringify(next), { "images/a.png": null }))["images/a.png"], undefined);
  assert.deepEqual(cleanMediaTags(["a", " a ", ""]), ["a"]);
  for (const invalid of ["null", "[]", "bad", '{"a":{"tags":[2]}}', '{"a":{"alt":2}}']) assert.throws(() => parseMediaMetadata(invalid));
});
test("metadata path keys cannot alter object prototypes", () => {
  const changes = Object.fromEntries([["__proto__", { alt: "literal", tags: [] }]]);
  const next = JSON.parse(mergeMediaMetadata(undefined, changes));
  assert.equal(next.__proto__.alt, "literal"); assert.equal(Object.prototype.hasOwnProperty.call(next, "__proto__"), true);
});
test("image insertion preserves unrelated source and escapes alt while adding responsive dimensions", () => {
  const existing = '<img class="portrait" data-key="hero" src="old.png" alt="Old" width="99" style="object-fit:cover" slot="photo">';
  const next = mediaImageMarkup({ path: "images/tea & cake.png", width: 1200, height: 800, alt: 'Café & "tea" <cup>', variants: [{ path: "images/tea-480w.png", width: 480 }] }, existing, 700);
  assert.ok(next.includes('class="portrait"')); assert.ok(next.includes('data-key="hero"')); assert.ok(next.includes('slot="photo"')); assert.ok(next.includes('style="object-fit:cover"'));
  assert.ok(next.includes('src="/images/tea%20%26%20cake.png"')); assert.ok(next.includes('alt="Café &amp; &quot;tea&quot; &lt;cup&gt;"'));
  assert.ok(next.includes('width="1200"')); assert.ok(next.includes('height="800"')); assert.ok(next.includes('sizes="(max-width: 768px) 100vw, 700px"'));
  assert.ok(next.includes('loading="lazy"')); assert.ok(next.includes('decoding="async"'));
  assert.throws(() => mediaImageMarkup({ path: "a.png", alt: "" }, "<video>"), /Choose an image/);
});
test("responsive variants are sorted, deduplicated and do not upscale", () => {
  assert.equal(mediaSrcset({ path: "a.png", alt: "", width: 960, variants: [{ path: "a-1600w.png", width: 1600 }, { path: "a-480w.png", width: 480 }, { path: "other-480w.png", width: 480 }] }), "/other-480w.png 480w, /a.png 960w");
  assert.equal(mediaVariantName("images/a.png", 480), "images/a-480w.png"); assert.throws(() => mediaVariantName("a.png", 0));
  assert.deepEqual(mediaVariants("images/a.png", ["images/a-960w.png", "images/a-480w.png", "images/ab-480w.png"]), [{ path: "images/a-480w.png", width: 480 }, { path: "images/a-960w.png", width: 960 }]);
});
test("image replacement leaves attribute-name lookalikes in quoted values intact", () => {
  const existing = '<img data-note=\' src="fake.png" alt="fake" \' src="real.png" alt="Real">';
  const next = mediaImageMarkup({ path: "images/new.png", alt: "New" }, existing);
  assert.ok(next.includes('data-note=\' src="fake.png" alt="fake" \''));
  assert.ok(next.includes('src="/images/new.png"')); assert.ok(next.includes('alt="New"'));
});
test("boolean media attributes keep adjacent attributes separated; incomplete tags fail closed", () => {
  const next = mediaImageMarkup({ path: "images/new.png", alt: "New" }, '<img width alt="Old" loading data-note="Keep">');
  assert.ok(next.includes(' alt="New"')); assert.ok(next.includes('loading="lazy" data-note="Keep"'));
  assert.equal(next.includes("<imgalt"), false);
  assert.throws(() => mediaImageMarkup({ path: "a.png", alt: "" }, '<img src="broken'), /incomplete/);
});
