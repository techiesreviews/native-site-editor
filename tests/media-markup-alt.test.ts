import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaExistingAlt, mediaImageMarkup } from "../src/page-builder/media-markup";

const image = { path: "images/desk.svg", alt: "desk" };

test("the existing alt is read decoded, empty for a decorative image, undefined when absent", () => {
  assert.equal(mediaExistingAlt(`<img src="/a.svg" alt="Tom &amp; Jerry&#39;s">`), "Tom & Jerry's");
  assert.equal(mediaExistingAlt(`<img src="/a.svg" alt="">`), "");
  assert.equal(mediaExistingAlt(`<img src="/a.svg" data-alt="no">`), undefined);
  assert.equal(mediaExistingAlt(`<p alt="x">`), undefined);
});

test("keepAlt leaves the written alt attribute byte for byte; without it the explicit alt is written", () => {
  const existing = `<img class="x" src="/a.svg" alt='Tom &#38; Jerry'>`;
  assert.equal(mediaImageMarkup({ ...image, alt: "Tom & Jerry" }, existing, undefined, true), `<img loading="lazy" decoding="async" class="x" src="/images/desk.svg" alt='Tom &#38; Jerry'>`);
  assert.equal(mediaImageMarkup({ ...image, alt: "Tom & Jerry" }, existing), `<img loading="lazy" decoding="async" class="x" src="/images/desk.svg" alt="Tom &amp; Jerry">`);
  // No alt attribute to keep: the picked alt is added as before.
  assert.equal(mediaImageMarkup(image, `<img src="/a.svg">`, undefined, true), `<img alt="desk" loading="lazy" decoding="async" src="/images/desk.svg">`);
});
