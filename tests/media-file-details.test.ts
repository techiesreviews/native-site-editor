import { test } from "node:test";
import assert from "node:assert/strict";
import { canReplaceEverywhere, mediaDetailChanges, mediaDetailFacts, mediaMadeFrom, mediaDetailRename, mediaFamilyRows, mediaNameCheck, mediaRenamedPath } from "../src/page-builder/media-file-details";
import { tidyMediaName } from "../src/page-builder/media-names";

/** Where the rename engine (media-workspace.ts renameInto) puts a typed name; the field must agree. */
const mediaRenameTarget = (path: string, name: string) => {
  const extension = /\.[^./]+$/.exec(path)?.[0] ?? "", typed = /\.[^./]+$/.exec(name)?.[0];
  return path.slice(0, path.lastIndexOf("/") + 1) + tidyMediaName((typed ? name.slice(0, -typed.length) : name) + extension);
};
import { applyMediaMetadata, mediaMetadataView } from "../src/page-builder/media-metadata";
import { parseMediaRecords, serializeMediaRecords } from "../shared/media-records";

test("facts say when a file was added, after its size, in the reader's calendar and clock (slice 103)", async () => {
  const { formatMediaDate } = await import("../src/page-builder/media-file-details");
  const time = Date.UTC(2026, 9, 15, 8, 30);
  assert.equal(formatMediaDate(time, "en-GB", "UTC"), "15 Oct 2026, 08:30");
  assert.match(formatMediaDate(time, "en-US", "America/New_York"), /^Oct 15, 2026, 4:30\sAM$/);
  const facts = mediaDetailFacts({ path: "media/images/a.webp", size: 2048, date: time });
  assert.deepEqual(facts.map(fact => fact.label), ["Kind", "Size", "Added", "Folder"]);
  assert.equal(facts[2].value, formatMediaDate(time));
  assert.equal(mediaDetailFacts({ path: "images/a.webp" }).some(fact => fact.label === "Added"), false);
});

test("facts give kind, size, dimensions when read and folder", () => {
  assert.deepEqual(mediaDetailFacts({ path: "images/team/photo.webp", size: 438_272, width: 2400, height: 1345 }), [
    { label: "Kind", value: "Image" }, { label: "Size", value: "428 KB" },
    { label: "Dimensions", value: "2400 × 1345" }, { label: "Folder", value: "images/team" },
  ]);
  assert.deepEqual(mediaDetailFacts({ path: "guide.pdf" }), [{ label: "Kind", value: "Document" }, { label: "Folder", value: "Site root" }]);
  // A video's or audio file's recorded length follows its size.
  assert.deepEqual(mediaDetailFacts({ path: "v/clip.mp4", size: 1024, duration: 75 }).map(fact => fact.label + " " + fact.value), ["Kind Video", "Size 1 KB", "Length 1:15", "Folder v"]);
  assert.equal(mediaDetailFacts({ path: "guide.pdf", duration: 75 }).some(fact => fact.label === "Length"), false);
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
  assert.deepEqual(mediaFamilyRows("guide.pdf", [{ path: "guide.pdf" }]), []);
  assert.equal(mediaFamilyRows("notes.zip", [{ path: "notes.zip" }]), undefined);
  // A video's still and subtitles, and a PDF's first page, are listed with it.
  const files = [{ path: "v/clip.mp4" }, { path: "v/clip.webp", size: 2048 }, { path: "v/clip.vtt" }, { path: "d/report.pdf" }, { path: "d/report.webp" }];
  assert.deepEqual(mediaFamilyRows("v/clip.mp4", files), [{ path: "v/clip.webp", label: "Still picture", size: "2 KB" }, { path: "v/clip.vtt", label: "Subtitles" }]);
  assert.deepEqual(mediaFamilyRows("d/report.pdf", files), [{ path: "d/report.webp", label: "First page picture" }]);
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
  // Tidied as the rename itself does (slice 52): any language, punctuation to hyphens, the file's own format.
  assert.equal(mediaRenamedPath("images/tram.webp", "Café Ölçü!"), "images/café-ölçü.webp");
  assert.equal(mediaRenamedPath("docs/Guide.PDF", "Price list"), "docs/price-list.pdf");
  for (const [path, name] of [["images/tram.webp", "Lisbon Tram"], ["docs/Guide.PDF", "Price list.PDF"], ["a/Ö.png", "Ä b"]])
    assert.equal(mediaRenamedPath(path, name), mediaRenameTarget(path, name));
});

test("the name field says a taken name is taken, for any member of the family, and suggests the next number", () => {
  const paths = ["images/tram.webp", "images/tram-480.webp", "images/tram-960w.webp", "media/originals/tram.jpg",
    "images/lisbon.webp", "images/bus-480.webp", "images/bus-2.webp", "media/originals/cart.jpg", "guide.pdf", "price-list.pdf"];
  assert.deepEqual(mediaNameCheck("images/tram.webp", "tram", paths), { state: "same" });
  assert.deepEqual(mediaNameCheck("images/tram.webp", "Tram.webp", paths), { state: "same" });
  assert.deepEqual(mediaNameCheck("images/tram.webp", "Lisbon", paths), { state: "taken", taken: "images/lisbon.webp", suggestion: "images/lisbon-2.webp" });
  // A copy's name (bus-480) or the kept original's (cart.jpg) taken also counts; the number skips taken ones.
  assert.deepEqual(mediaNameCheck("images/tram.webp", "bus", paths), { state: "taken", taken: "images/bus.webp", suggestion: "images/bus-3.webp" });
  assert.deepEqual(mediaNameCheck("images/tram.webp", "cart", paths), { state: "taken", taken: "images/cart.webp", suggestion: "images/cart-2.webp" });
  assert.deepEqual(mediaNameCheck("images/tram.webp", "Old Tram", paths), { state: "free", to: "images/old-tram.webp" });
  assert.deepEqual(mediaNameCheck("guide.pdf", "Price List", paths), { state: "taken", taken: "price-list.pdf", suggestion: "price-list-2.pdf" });
  assert.deepEqual(mediaNameCheck("images/tram.webp", "tram.png", paths), { state: "problem", message: "Keep the webp format: only the name changes." });
  assert.deepEqual(mediaNameCheck("images/tram.webp", " ", paths), { state: "problem", message: "Enter a file name." });
  assert.deepEqual(mediaNameCheck("images/tram.webp", "x/y", paths), { state: "problem", message: "Enter a file name without a folder." });
});

test("Replace everywhere is offered for a picture's main, not a copy, a Trimmed copy, an original or an SVG", () => {
  const paths = ["images/tram.webp", "images/tram-480.webp", "logo.svg", "media/originals/tram.jpg", "images/tram-crop.webp", "a.gif", "doc.pdf"];
  const metadata = { "images/tram-crop.webp": { tags: [], alt: "", trimmedFrom: { source: "images/tram.webp", trim: { x: 0, y: 0, width: 1, height: 1 } } } };
  assert.equal(canReplaceEverywhere("images/tram.webp", paths, metadata), true);
  assert.equal(canReplaceEverywhere("a.gif", paths, metadata), true);
  for (const path of ["images/tram-480.webp", "logo.svg", "media/originals/tram.jpg", "images/tram-crop.webp", "doc.pdf"])
    assert.equal(canReplaceEverywhere(path, paths, metadata), false, path);
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


test("a recorded length reaches File details and tiles; a wrong one is left out, never refused", () => {
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {
    "a.mp4": { duration: 12.35 }, "b.mp4": { duration: "12" }, "c.mp3": { duration: -1 }, "d.mp3": { duration: 0 },
  } }));
  const view = mediaMetadataView(records);
  assert.deepEqual(["a.mp4", "b.mp4", "c.mp3", "d.mp3"].map(path => view[path].duration), [12.35, undefined, undefined, undefined]);
});
