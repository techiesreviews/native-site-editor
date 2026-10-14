import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaFamilies, mediaFamilyOf, renamedFamily } from "../src/page-builder/media-families";
import { mediaVariants } from "../src/page-builder/media-markup";

test("both responsive names join a main and sort by width", () => {
  const paths = ["images/photo.jpg", "images/photo-960.webp", "images/photo-480w.webp", "images/photo-0w.jpg", "images/photo-0480.jpg"];
  assert.deepEqual(mediaFamilyOf(paths[0], paths)?.copies, [
    { path: "images/photo-480w.webp", width: 480 }, { path: "images/photo-960.webp", width: 960 },
  ]);
  assert.deepEqual(mediaVariants(paths[0], paths), mediaFamilyOf(paths[0], paths)?.copies);
  assert.equal(mediaFamilyOf(paths[1], paths), undefined);
});

test("conflict numbers and trimmed copies stay separate, with their own copies", () => {
  const paths = ["photo.webp", "photo-2.webp", "photo-2-480.webp", "photo-crop.webp", "photo-crop-2.webp", "photo-crop-480.webp", "photo-1w.webp"];
  assert.deepEqual(mediaFamilyOf("photo.webp", paths)?.copies, [{ path: "photo-1w.webp", width: 1 }]);
  assert.deepEqual(mediaFamilyOf("photo-2.webp", paths)?.copies, [{ path: "photo-2-480.webp", width: 480 }]);
  assert.deepEqual(mediaFamilyOf("photo-crop.webp", paths)?.copies, [{ path: "photo-crop-480.webp", width: 480 }]);
  assert.ok(mediaFamilyOf("photo-crop-2.webp", paths));
});

test("orphan copies are their own files; non-images do not participate", () => {
  assert.deepEqual(mediaFamilies(["lone-480.webp", "other-480w.webp", "notes.txt"]), [
    { main: "lone-480.webp", copies: [], originals: [] }, { main: "other-480w.webp", copies: [], originals: [] },
  ]);
});

test("copies stay beside their main and prefer the same extension", () => {
  const paths = ["a/photo.jpg", "b/photo.jpg", "b/photo-480.webp", "c/photo-480w.jpg", "a/photo.webp", "a/photo-960.webp", "a/photo-480.png"];
  assert.deepEqual(mediaFamilyOf("a/photo.jpg", paths)?.copies, []);
  assert.deepEqual(mediaFamilyOf("a/photo.webp", paths)?.copies, [{ path: "a/photo-960.webp", width: 960 }]);
  assert.deepEqual(mediaFamilyOf("b/photo.jpg", paths)?.copies, [{ path: "b/photo-480.webp", width: 480 }]);
  assert.ok(mediaFamilyOf("a/photo-480.png", paths));
  assert.ok(mediaFamilyOf("c/photo-480w.jpg", paths));
});

test("originals of any extension join only a unique main, never claim copies", () => {
  const paths = ["images/photo.webp", "media/originals/photo.heic", "media/originals/photo.HEIC", "media/originals/photo.raw", "else/photo-480.webp", "media/originals/photo-480.webp"];
  assert.deepEqual(mediaFamilyOf(paths[0], paths)?.originals, paths.slice(1, 4));
  assert.ok(mediaFamilyOf("else/photo-480.webp", paths));
  assert.deepEqual(mediaFamilyOf("else/photo-480.webp", paths)?.originals, ["media/originals/photo-480.webp"]);
  for (const mains of [[], ["a/photo.jpg", "b/photo.webp"]]) {
    const all = [...mains, "media/originals/photo.heif", "media/originals/photo.HEIC"];
    assert.ok(mediaFamilyOf("media/originals/photo.heif", all));
    assert.ok(mediaFamilyOf("media/originals/photo.HEIC", all));
  }
});

test("renaming moves copies beside the new main, preserving suffixes and original extensions", () => {
  const paths = ["images/photo.jpg", "images/photo-480w.webp", "images/photo-960.jpg", "media/originals/photo.HEIC"];
  assert.deepEqual(renamedFamily(mediaFamilyOf(paths[0], paths)!, "other/garden.jpg"), [
    { from: paths[0], to: "other/garden.jpg" }, { from: paths[1], to: "other/garden-480w.webp" },
    { from: paths[2], to: "other/garden-960.jpg" }, { from: paths[3], to: "media/originals/garden.HEIC" },
  ]);
});
