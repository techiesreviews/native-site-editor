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

test("Added is a short date in the reader's calendar, with the year only when it is not this year (slice 108)", async () => {
  const { formatMediaAdded } = await import("../src/page-builder/media-file-details");
  const time = Date.UTC(2026, 9, 14, 8, 30);
  assert.equal(formatMediaAdded(time, "en-GB", "UTC", Date.UTC(2026, 11, 31)), "Added 14 Oct");
  assert.equal(formatMediaAdded(time, "en-GB", "UTC", Date.UTC(2027, 0, 1)), "Added 14 Oct 2026");
  assert.equal(formatMediaAdded(time, "en-US", "UTC", Date.UTC(2026, 9, 15)), "Added Oct 14");
  // The year is the reader's: 23:30 on 31 Dec in UTC is already next year in Tokyo.
  assert.equal(formatMediaAdded(Date.UTC(2026, 11, 31, 23, 30), "en-GB", "Asia/Tokyo", Date.UTC(2027, 0, 2)), "Added 1 Jan");
});

test("facts are one line: format, dimensions when read, length, size and folder (slice 108)", () => {
  const line = (file: Parameters<typeof mediaDetailFacts>[0]) => mediaDetailFacts(file).map(fact => fact.value).join(" · ");
  assert.equal(line({ path: "media/images/red-acer.webp", size: 48_128, width: 2000, height: 1125 }), "WebP · 2000 × 1125 · 47 KB · media/images");
  assert.deepEqual(mediaDetailFacts({ path: "images/team/photo.jpeg", size: 438_272, width: 2400, height: 1345 }).map(fact => fact.key),
    ["format", "dimensions", "size", "folder"]);
  assert.equal(line({ path: "guide.pdf" }), "PDF · Site root");
  assert.equal(line({ path: "files/brochure.zip", size: 22 }), "ZIP · 22 B · files");
  assert.equal(line({ path: "README" }), "File · Site root");
  // A video's or audio file's recorded length comes before its size.
  assert.equal(line({ path: "v/clip.mp4", size: 1024, duration: 75 }), "MP4 · 1:15 · 1 KB · v");
  assert.equal(mediaDetailFacts({ path: "guide.pdf", duration: 75 }).some(fact => fact.key === "length"), false);
  assert.equal(line({ path: "media/intro.mp4", size: 10, width: 0, height: 0 }), "MP4 · 10 B · media");
});

test("the Image family lists copies narrowest first, then kept originals, with known sizes", () => {
  const items = [
    { path: "images/tram.webp", size: 2048 }, { path: "images/tram-960w.webp", size: 1024 },
    { path: "images/tram-480w.webp" }, { path: "media/originals/tram.jpg", size: 3 * 1024 * 1024 },
    { path: "images/other.png" },
  ];
  assert.deepEqual(mediaFamilyRows("images/tram.webp", items), [
    { path: "images/tram-480w.webp", label: "Smaller copy · 480 px" },
    { path: "images/tram-960w.webp", label: "Smaller copy · 960 px", size: "1 KB" },
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
  assert.equal(mediaMadeFrom(meta), "Made from Original Photo.jpg");
  assert.equal(mediaMadeFrom({}), undefined);
});


test("a recorded length reaches File details and tiles; a wrong one is left out, never refused", () => {
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {
    "a.mp4": { duration: 12.35 }, "b.mp4": { duration: "12" }, "c.mp3": { duration: -1 }, "d.mp3": { duration: 0 },
  } }));
  const view = mediaMetadataView(records);
  assert.deepEqual(["a.mp4", "b.mp4", "c.mp3", "d.mp3"].map(path => view[path].duration), [12.35, undefined, undefined, undefined]);
});

test("File details' Save bar follows what the fields hold: words and ticks, back to unchanged when undone (slice 123)", async () => {
  const { mediaDetailFormState } = await import("../src/page-builder/media-file-details");
  const opened = [{ checkbox: false, checked: false, value: "desk.svg" }, { checkbox: true, checked: false, value: "on" }, { checkbox: false, checked: false, value: "" }];
  const saved = mediaDetailFormState(opened);
  assert.equal(mediaDetailFormState(opened.map(control => ({ ...control }))), saved);
  assert.notEqual(mediaDetailFormState([opened[0], { ...opened[1], checked: true }, opened[2]]), saved);
  assert.notEqual(mediaDetailFormState([opened[0], opened[1], { ...opened[2], value: "A desk" }]), saved);
  // A tick box counts by its tick only; its value never changes the state.
  assert.equal(mediaDetailFormState([opened[0], { ...opened[1], value: "Brand" }, opened[2]]), saved);
  // Words that only move between fields still differ.
  assert.notEqual(mediaDetailFormState([{ ...opened[0], value: "" }, opened[1], { ...opened[2], value: "desk.svg" }]), saved);
});

test("A file's ⋯ menu: Copy path, Download, then Remove… last and in red (slices 108, 123)", async () => {
  const { mediaFileMenu } = await import("../src/page-builder/media-file-details");
  const ran: string[] = [];
  const menu = mediaFileMenu({ copy: () => ran.push("copy"), download: () => ran.push("download"), remove: () => ran.push("remove") });
  assert.deepEqual(menu.map(item => item.label), ["Copy path", "Download", "Remove…"]);
  assert.deepEqual(menu.map(item => Boolean((item as { danger?: boolean }).danger)), [false, false, true]);
  for (const item of menu) item.run();
  assert.deepEqual(ran, ["copy", "download", "remove"]);
});
