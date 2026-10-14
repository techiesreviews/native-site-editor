import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaDetailChanges, mediaDetailFacts, mediaMadeFrom, mediaDetailRename, mediaFamilyRows, mediaRenamedPath } from "../src/page-builder/media-file-details";
import { applyMediaMetadata, mediaMetadataView } from "../src/page-builder/media-metadata";
import { parseMediaRecords, serializeMediaRecords } from "../shared/media-records";

test("facts give kind, size, dimensions when read and folder", () => {
  assert.deepEqual(mediaDetailFacts({ path: "images/team/photo.webp", size: 438_272, width: 2400, height: 1345 }), [
    { label: "Kind", value: "Image" }, { label: "Size", value: "428 KB" },
    { label: "Dimensions", value: "2400 × 1345" }, { label: "Folder", value: "images/team" },
  ]);
  assert.deepEqual(mediaDetailFacts({ path: "guide.pdf" }), [{ label: "Kind", value: "Document" }, { label: "Folder", value: "Site root" }]);
  assert.equal(mediaDetailFacts({ path: "media/intro.mp4", size: 10, width: 0, height: 0 })[0].value, "Video");
});

test("the Image family lists copies narrowest first, then kept originals, with known sizes", () => {
  const items = [
    { path: "images/tram.webp", size: 2048 }, { path: "images/tram-960w.webp", size: 1024 },
    { path: "images/tram-480w.webp" }, { path: "media/originals/tram.jpg", size: 3 * 1024 * 1024 },
    { path: "images/other.png" },
  ];
  assert.deepEqual(mediaFamilyRows("images/tram.webp", items), [
    { path: "images/tram-480w.webp", label: "Smaller copy · 480 px wide" },
    { path: "images/tram-960w.webp", label: "Smaller copy · 960 px wide", size: "1 KB" },
    { path: "media/originals/tram.jpg", label: "Original, kept", original: true, size: "3 MB" },
  ]);
  assert.deepEqual(mediaFamilyRows("images/other.png", items), []);
  // A copy is not a family's main; other kinds have no Image family.
  assert.equal(mediaFamilyRows("images/tram-480w.webp", items), undefined);
  assert.equal(mediaFamilyRows("guide.pdf", [{ path: "guide.pdf" }]), undefined);
});

test("Save details writes description fields only for images; Decorative has no description", () => {
  const form = { name: "x", description: "Two trams", decorative: false, alwaysKeep: true };
  assert.deepEqual(mediaDetailChanges("images/tram.webp", form), { alt: "Two trams", decorative: false, alwaysKeep: true });
  assert.deepEqual(mediaDetailChanges("images/tram.webp", { ...form, decorative: true }), { alt: "", decorative: true, alwaysKeep: true });
  assert.deepEqual(mediaDetailChanges("guide.pdf", form), { alwaysKeep: true });
});

test("the name asks for a rename only when changed, without folders, and lands in the same folder", () => {
  assert.equal(mediaDetailRename("images/tram.webp", " tram.webp "), undefined);
  assert.deepEqual(mediaDetailRename("images/tram.webp", "  "), { error: "Enter a file name." });
  assert.deepEqual(mediaDetailRename("images/tram.webp", "a/b.webp"), { error: "Enter a file name without a folder." });
  assert.deepEqual(mediaDetailRename("images/tram.webp", " Lisbon Tram.webp"), { name: "Lisbon Tram.webp" });
  assert.equal(mediaRenamedPath("images/tram.webp", "Lisbon Tram.webp"), "images/lisbon-tram.webp");
  assert.equal(mediaRenamedPath("tram.webp", "New.webp"), "new.webp");
});

test("Always keep is read, written only when changed, cleared, and survives saving", () => {
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: { "a.pdf": { alwaysKeep: true }, "b.png": { description: { text: "B", byAgent: true } } } }));
  assert.deepEqual(mediaMetadataView(records)["a.pdf"], { tags: [], alt: "", alwaysKeep: true });
  assert.equal(applyMediaMetadata(records, { "a.pdf": { alwaysKeep: true } }), records);
  const kept = applyMediaMetadata(records, { "b.png": { alt: "B", alwaysKeep: true } });
  // An unchanged description keeps its by-agent mark.
  assert.deepEqual(kept.files["b.png"], { description: { text: "B", byAgent: true }, alwaysKeep: true });
  assert.equal(parseMediaRecords(serializeMediaRecords(kept)).files["b.png"].alwaysKeep, true);
  assert.deepEqual(applyMediaMetadata(kept, { "a.pdf": { alwaysKeep: false } }).files["a.pdf"], {});
});

test("trimmed copies show Made from even when the source no longer exists", () => {
  const records = parseMediaRecords('{"version":2,"collections":[],"files":{"media/images/photo-crop.webp":{"trimmedFrom":{"source":"images/Original Photo.jpg","trim":{"x":0,"y":0,"width":0.5,"height":1}}}}}');
  const meta = mediaMetadataView(records)["media/images/photo-crop.webp"];
  assert.deepEqual(mediaMadeFrom(meta), [{ label: "Made from", value: "Original Photo.jpg" }]);
  assert.deepEqual(mediaMadeFrom({}), []);
});
