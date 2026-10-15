import { test } from "node:test";
import assert from "node:assert/strict";
import { familyMembers, alwaysKeptFiles, isLeftoverCopy, mediaFamilies, mediaFamilyOf, renamedFamily } from "../src/page-builder/media-families";
import { mediaVariants } from "../src/page-builder/media-markup";

test("a leftover copy is a responsive copy name with no image at its base name", () => {
  for (const path of ["images/photo-480w.webp", "photo-1w.jpg", "photo-1200w.png", "photo-480.webp", "photo-960.webp", "photo-1600.webp"]) {
    assert.equal(isLeftoverCopy(path, [path, "other.jpg", "media/originals/photo.png", "photo.pdf"]), true, path);
  }
  for (const path of ["photo.jpg", "photo-2.webp", "report-2024.png", "photo-0w.jpg", "photo-0480.jpg", "photo-0480w.jpg", "photo-9007199254740992w.jpg", "folder-480w/photo.jpg", "docs/report-480.pdf", "media/originals/photo-480w.webp"]) {
    assert.equal(isLeftoverCopy(path, [path]), false, path);
  }
  // Two possible mains leave the copy outside any family, but its main is not gone.
  const paths = ["a/photo.jpg", "a/photo.webp", "a/photo-480.png"];
  assert.equal(mediaFamilies(paths).some(family => family.main === "a/photo-480.png"), true);
  assert.equal(isLeftoverCopy("a/photo-480.png", paths), false);
  assert.equal(isLeftoverCopy("a/photo-480.png", ["b/photo.jpg", "a/photo-480.png"]), true);
});

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
    { main: "lone-480.webp", copies: [], originals: [], subtitles: [] }, { main: "other-480w.webp", copies: [], originals: [], subtitles: [] },
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

test("bare numbers count only at copy widths, so numbered and dated names stay apart", () => {
  const paths = ["photo.webp", "photo-100.webp", "photo-2.webp", "photo-480.webp", "report.png", "report-2024.png", "report-1600.png", "report-1200w.png"];
  assert.deepEqual(mediaFamilyOf("photo.webp", paths)?.copies, [{ path: "photo-480.webp", width: 480 }]);
  assert.deepEqual(mediaFamilyOf("report.png", paths)?.copies, [{ path: "report-1200w.png", width: 1200 }, { path: "report-1600.png", width: 1600 }]);
  for (const path of ["photo-100.webp", "photo-2.webp", "report-2024.png"]) assert.ok(mediaFamilyOf(path, paths));
});

test("the Always keep mark shows on kept files and on the main of a family with a kept member", () => {
  const paths = ["images/photo.jpg", "images/photo-480w.webp", "media/originals/photo.HEIC", "images/logo.png", "images/logo-960.png", "files/guide.pdf", "images/plain.png"];
  assert.deepEqual([...alwaysKeptFiles(paths, new Set(["images/photo-480w.webp", "files/guide.pdf", "gone.png"]))].sort(),
    ["files/guide.pdf", "images/photo-480w.webp", "images/photo.jpg"]);
  assert.deepEqual([...alwaysKeptFiles(paths, new Set(["media/originals/photo.HEIC"]))].sort(), ["images/photo.jpg", "media/originals/photo.HEIC"]);
  assert.deepEqual([...alwaysKeptFiles(paths, new Set(["images/logo.png"]))], ["images/logo.png"]);
  assert.equal(alwaysKeptFiles(paths, new Set()).size, 0);
});

test("WordPress dimensions and cross-format handmade sets are adopted without widening leftovers", () => {
  const paths = ["images/photo.jpg", "images/photo-480x320.jpg", "images/photo-1024x683.webp",
    "panel.jpg", "panel-400.webp", "panel-800.webp", "panel-1200.webp",
    "report.jpg", "report-2024.webp", "maxresdefault.jpg", "maxresdefault-34.jpg", "maxresdefault-71.jpg", "panel-2.webp"];
  assert.deepEqual(mediaFamilyOf(paths[0], paths)?.copies, [{ path: paths[1], width: 480 }, { path: paths[2], width: 1024 }]);
  assert.deepEqual(mediaFamilyOf("panel.jpg", paths)?.copies.map(copy => copy.width), [400, 800, 1200]);
  for (const path of paths.slice(8)) assert.ok(mediaFamilyOf(path, paths), path);
  assert.deepEqual(renamedFamily(mediaFamilyOf(paths[0], paths)!, "new/garden.jpg"), [
    { from: paths[0], to: "new/garden.jpg" }, { from: paths[1], to: "new/garden-480x320.jpg" }, { from: paths[2], to: "new/garden-1024x683.webp" },
  ]);
  assert.deepEqual(renamedFamily(mediaFamilyOf("panel.jpg", paths)!, "new/panel.jpg").map(move => move.to),
    ["new/panel.jpg", "new/panel-400.webp", "new/panel-800.webp", "new/panel-1200.webp"]);
  for (const path of ["photo-480x320.jpg", "panel-400.webp"]) assert.equal(isLeftoverCopy(path, [path]), false);
  for (const suffix of ["-0x320.jpg", "-480x0.jpg", "-10001x320.jpg", "-0480x320.jpg", "-99.webp", "-10001.webp"]) {
    const path = "photo" + suffix; assert.ok(mediaFamilyOf(path, ["photo.jpg", path]));
  }
  assert.ok(mediaFamilyOf("photo-400.jpeg", ["photo.jpg", "photo-400.jpeg", "photo-800.jpeg"]));
  assert.deepEqual(mediaFamilyOf("photo.jpg", ["photo.jpg", "photo-400.webp", "photo-480.webp"])?.copies.map(copy => copy.width), [400, 480]);
});

import { olderCopyWidths, olderCopyPaths, olderCopyFormat } from "../src/page-builder/media-older-copies";

test("older widths use every existing copy family and prepare only eligible mains", () => {
  for (const copies of [["photo-480.webp"], ["photo-480w.webp"], ["photo-480x320.jpg"], ["photo-400.webp", "photo-800.webp"]]) {
    const paths = ["photo.jpg", ...copies];
    assert.deepEqual(olderCopyWidths({ path: paths[0], width: 2000, paths }), []);
    assert.deepEqual(olderCopyWidths({ path: copies[0], width: 2000, paths }), []);
  }
  for (const [width, expected] of [[2000, [480, 960, 1600]], [800, [480]], [400, []], [undefined, []]] as const)
    assert.deepEqual(olderCopyWidths({ path: "photo.jpg", width, paths: ["photo.jpg"] }), expected);
  for (const path of ["logo.svg", "media/originals/photo.jpg", "photo.tiff", "missing.jpg"])
    assert.deepEqual(olderCopyWidths({ path, width: 2000, paths: ["logo.svg", "media/originals/photo.jpg", "photo.tiff"] }), []);
  assert.deepEqual(olderCopyWidths({ path: "scan.bmp", width: 2000, paths: ["scan.bmp"] }), [480, 960, 1600]);
});

test("older copy plans preserve the exact stem, reject taken files and folders, and preserve other families", () => {
  const main = "images/Old Photo.JPG", widths = [480, 960, 1600];
  assert.deepEqual(olderCopyPaths(main, widths, "webp", [main]), widths.map(width => `images/Old Photo-${width}.webp`));
  for (const taken of ["images/old photo-480.WEBP", "images/Old Photo-480.webp/child", "images"])
    assert.deepEqual(olderCopyPaths(main, widths, "webp", [main, taken]), []);
  const ambiguous = ["photo.jpg", "photo.png"];
  assert.deepEqual(olderCopyPaths("photo.jpg", widths, "webp", ambiguous), []);
  assert.equal(olderCopyFormat("photo.jpg", widths, "avif", ambiguous), "jpg");
  assert.equal(olderCopyFormat("photo.gif", widths, "webp", ["photo.gif", "photo.png"]), undefined);
  assert.deepEqual(olderCopyPaths("photo.jpg", widths, "webp", ["photo.jpg", "photo-480w.webp"]), []);
});

import { familyMembers } from "../src/page-builder/media-families";

test("a video's or PDF's still picture and subtitles join its family by its exact name", () => {
  const paths = ["media/videos/holiday.mp4", "media/videos/holiday.webp", "media/videos/holiday.vtt",
    "media/downloads/report.pdf", "media/downloads/report.webp", "media/audio/talk.mp3", "media/audio/talk.srt", "media/images/holiday.webp"];
  assert.deepEqual(mediaFamilyOf("media/videos/holiday.mp4", paths), { main: "media/videos/holiday.mp4", copies: [], originals: [], still: "media/videos/holiday.webp", subtitles: ["media/videos/holiday.vtt"] });
  assert.equal(mediaFamilyOf("media/downloads/report.pdf", paths)?.still, "media/downloads/report.webp");
  // Audio has subtitles, never a still; a picture in another folder stays its own image.
  assert.deepEqual(mediaFamilyOf("media/audio/talk.mp3", paths)?.subtitles, ["media/audio/talk.srt"]);
  assert.ok(mediaFamilyOf("media/images/holiday.webp", paths));
  // The members are hidden from the grid: one tile per family.
  assert.deepEqual(mediaFamilies(paths).map(family => family.main).sort(), ["media/audio/talk.mp3", "media/downloads/report.pdf", "media/images/holiday.webp", "media/videos/holiday.mp4"]);
  assert.deepEqual(familyMembers(mediaFamilyOf("media/videos/holiday.mp4", paths)!), ["media/videos/holiday.mp4", "media/videos/holiday.webp", "media/videos/holiday.vtt"]);
});

test("a still needs one owner and must be a lone picture; other names stay their own files", () => {
  // Two owners (a video and a PDF of one name), two pictures, or a picture with copies: no still.
  for (const paths of [["a.mp4", "a.pdf", "a.webp"], ["a.mp4", "a.webp", "a.jpg"], ["a.mp4", "a.webp", "a-480w.webp"], ["a.mp4", "media/originals/a.webp"]]) {
    assert.equal(mediaFamilyOf("a.mp4", paths)?.still, undefined, paths.join());
  }
  assert.ok(mediaFamilyOf("a.webp", ["a.mp4", "a.pdf", "a.webp"]));
  // Subtitles beside a video and an audio file of one name belong to neither; nearby names never join.
  assert.deepEqual(mediaFamilyOf("a.mp4", ["a.mp4", "a.mp3", "a.vtt"])?.subtitles, []);
  assert.deepEqual(mediaFamilyOf("a.mp4", ["a.mp4", "a-2.webp", "b/a.webp", "a.en.vtt", "A.webp"]), { main: "a.mp4", copies: [], originals: [], subtitles: [] });
  // Other downloads have no family; an image keeps its own (a still of nothing).
  assert.equal(mediaFamilyOf("notes.zip", ["notes.zip", "notes.webp"]), undefined);
  // A kept original still finds its picture when a video shares the base name in another folder.
  assert.deepEqual(mediaFamilyOf("media/images/a.webp", ["media/images/a.webp", "media/videos/a.mp4", "media/originals/a.jpg"])?.originals, ["media/originals/a.jpg"]);
});

test("renaming a video takes its still and subtitles beside it, with the new name", () => {
  const family = mediaFamilyOf("media/videos/holiday.mp4", ["media/videos/holiday.mp4", "media/videos/holiday.webp", "media/videos/holiday.vtt"])!;
  assert.deepEqual(renamedFamily(family, "media/videos/summer.mp4"), [
    { from: "media/videos/holiday.mp4", to: "media/videos/summer.mp4" },
    { from: "media/videos/holiday.webp", to: "media/videos/summer.webp" },
    { from: "media/videos/holiday.vtt", to: "media/videos/summer.vtt" },
  ]);
  // Always keep on the still marks the video's tile.
  assert.deepEqual([...alwaysKeptFiles(familyMembers(family), new Set(["media/videos/holiday.webp"]))].sort(), ["media/videos/holiday.mp4", "media/videos/holiday.webp"]);
});

for (const extension of ["avif", "webp", "jpg", "png"]) test(`sharing JPEG family rule for ${extension}`, () => {
  const main = `images/x.${extension}`, sharing = "images/x-sharing.jpg", social = "images/x-social.jpg";
  const paths = [main, sharing, social], family = mediaFamilyOf(main, paths)!;
  if (["avif", "webp"].includes(extension)) {
    assert.equal(family.sharing, sharing); assert.ok(familyMembers(family).includes(sharing));
    assert.ok(renamedFamily(family, `new/y.${extension}`).some(move => move.from === sharing && move.to === "new/y-sharing.jpg"));
    assert.ok(alwaysKeptFiles(paths, new Set([sharing])).has(main));
  } else { assert.equal(family.sharing, undefined); assert.ok(mediaFamilyOf(sharing, paths)); }
  assert.ok(mediaFamilyOf(social, paths));
});

test("a main with a sharing picture stays a picture family beside a PDF", () => {
  const paths = ["x.webp", "x-sharing.jpg", "x.pdf"];
  assert.equal(mediaFamilyOf("x.webp", paths)?.sharing, "x-sharing.jpg");
  assert.equal(mediaFamilyOf("x.pdf", paths)?.still, undefined);
});
