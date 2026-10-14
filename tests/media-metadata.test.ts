import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaImageMarkup, mediaSrcset, mediaVariantName, mediaVariants } from "../src/page-builder/media-markup";

test("image insertion preserves unrelated source and escapes alt while adding responsive dimensions", () => {
  const existing = '<img class="portrait" data-key="hero" src="old.png" alt="Old" width="99" style="object-fit:cover" slot="photo">';
  const next = mediaImageMarkup({ path: "images/tea & cake.png", width: 1200, height: 800, alt: 'Café & "tea" <cup>', variants: [{ path: "images/tea-480w.png", width: 480 }] }, existing, { sizes: "auto, 700px", lazy: true, priority: false });
  assert.ok(next.includes('class="portrait"')); assert.ok(next.includes('data-key="hero"')); assert.ok(next.includes('slot="photo"')); assert.ok(next.includes('style="object-fit:cover"'));
  assert.ok(next.includes('src="/images/tea%20%26%20cake.png"')); assert.ok(next.includes('alt="Café &amp; &quot;tea&quot; &lt;cup&gt;"'));
  assert.ok(next.includes('width="1200"')); assert.ok(next.includes('height="800"')); assert.ok(next.includes('sizes="auto, 700px"'));
  assert.ok(next.includes('loading="lazy"')); assert.ok(next.includes('decoding="async"'));
  assert.throws(() => mediaImageMarkup({ path: "a.png", alt: "" }, "<video>"), /Choose an image/);
});
test("responsive variants are sorted, deduplicated and do not upscale", () => {
  assert.equal(mediaSrcset({ path: "a.png", alt: "", width: 960, variants: [{ path: "a-1600w.png", width: 1600 }, { path: "a-480w.png", width: 480 }, { path: "other-480w.png", width: 480 }] }), "/other-480w.png 480w, /a.png 960w");
  assert.equal(mediaVariantName("images/a.png", 480), "images/a-480.png"); assert.throws(() => mediaVariantName("a.png", 0));
  assert.deepEqual(mediaVariants("images/a.png", ["images/a.png", "images/a-960w.png", "images/a-480w.png", "images/ab-480w.png"]), [{ path: "images/a-480w.png", width: 480 }, { path: "images/a-960w.png", width: 960 }]);
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

test("Decorative metadata writes only changed fields and remains exclusive with a description", async () => {
  const { applyMediaMetadata, mediaMetadataView } = await import("../src/page-builder/media-metadata");
  const { parseMediaRecords, setMediaDescription } = await import("../shared/media-records");
  const original = setMediaDescription(parseMediaRecords(undefined), "a.png", "Agent words", true);
  const unchanged = applyMediaMetadata(original, { "a.png": { alt: "Agent words", tags: [], decorative: false } });
  assert.equal(unchanged, original);
  const decorative = applyMediaMetadata(original, { "a.png": { decorative: true } });
  assert.deepEqual(mediaMetadataView(decorative)["a.png"], { tags: [], alt: "", decorative: true });
  assert.equal(decorative.files["a.png"].description, undefined);
  assert.equal(applyMediaMetadata(decorative, { "a.png": { decorative: true, alt: "", tags: [] } }), decorative);
  const undescribed = applyMediaMetadata(decorative, { "a.png": { decorative: false } });
  assert.deepEqual(mediaMetadataView(undescribed)["a.png"], { tags: [], alt: "" });
  const text = applyMediaMetadata(decorative, { "a.png": { alt: "Lex words", decorative: false } });
  assert.deepEqual(mediaMetadataView(text)["a.png"], { tags: [], alt: "Lex words" });
});
