import test from "node:test";
import assert from "node:assert/strict";
import { singleBackgroundAsset, nativeImageAsset } from "../src/page-builder/style-image-source";

test("focus assets resolve from their native page or winning declaration path", () => {
  assert.equal(nativeImageAsset("pages/work.html", "../images/work.svg"), "images/work.svg");
  assert.equal(singleBackgroundAsset('url("../images/work.svg")', "styles/site.css"), "images/work.svg");
  assert.equal(singleBackgroundAsset("URL('/images/a.png?size=2')", "styles/site.css"), "images/a.png");
});
test("focus preview excludes external, escaping-root, layered and generated images", () => {
  for (const value of ['url("https://example.com/a.png")', 'url("//example.com/a.png")', 'url("data:image/png;base64,abc")', 'url("../../a.png")', 'url("a.svg"), url("b.svg")', 'linear-gradient(red,blue)', 'image-set(url("a.png") 1x)', 'url("a.svg") red', 'var(--image)']) assert.equal(singleBackgroundAsset(value, "styles/site.css"), undefined, value);
});
