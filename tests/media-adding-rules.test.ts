import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaAddingPath, mediaAddingReveal, mediaAddingShown, mediaAddingStatus } from "../src/page-builder/media-adding-rules";
import type { MediaLibraryFilter } from "../src/page-builder/media-library-filter";

const all: MediaLibraryFilter = { query: "", collection: "", kind: "all" };
const none = { metadata: {}, usage: {} };

test("the tray counts files settled out of those still being added; cancelled files leave the count", () => {
  assert.deepEqual(mediaAddingStatus(["waiting", "preparing"]), { text: "Adding 2 files", running: true, done: 0, total: 2 });
  assert.deepEqual(mediaAddingStatus(["ready", "preparing", "cancelled"]), { text: "Adding 2 files", running: true, done: 1, total: 2 });
  assert.deepEqual(mediaAddingStatus(["adding"]), { text: "Adding 1 file", running: true, done: 0, total: 1 });
  assert.deepEqual(mediaAddingStatus(["added", "cancelled"]), { text: "Added 1 file", running: false, done: 1, total: 1 });
  assert.equal(mediaAddingStatus(["added", "added", "failed"]).text, "Added 2 files · 1 could not be added");
  assert.equal(mediaAddingStatus(["failed", "failed"]).text, "2 files could not be added");
  assert.equal(mediaAddingStatus(["failed"]).text, "1 file could not be added");
  // Everything cancelled: nothing to say, so the tray hides.
  assert.deepEqual(mediaAddingStatus(["cancelled", "cancelled"]), { text: "", running: false, done: 0, total: 0 });
  assert.equal(mediaAddingStatus([]).text, "");
});

test("a file being added shows where the view would show it: its collection, kind and search", () => {
  const path = mediaAddingPath("Downloads/Team photo.png");
  assert.equal(path, "images/Team photo.png");
  assert.equal(mediaAddingShown(none, all, path, ""), true);
  assert.equal(mediaAddingShown(none, all, path, "Studio picks"), true);
  // Viewing the collection it joins, or another one.
  assert.equal(mediaAddingShown(none, { ...all, collection: "Studio picks" }, path, "Studio picks"), true);
  assert.equal(mediaAddingShown(none, { ...all, collection: "Logos" }, path, "Studio picks"), false);
  assert.equal(mediaAddingShown(none, { ...all, collection: "Logos" }, path, ""), false);
  // Kind and search.
  assert.equal(mediaAddingShown(none, { ...all, kind: "video" }, path, ""), false);
  assert.equal(mediaAddingShown(none, { ...all, kind: "image" }, path, ""), true);
  assert.equal(mediaAddingShown(none, { ...all, query: "TEAM" }, path, ""), true);
  assert.equal(mediaAddingShown(none, { ...all, query: "desk" }, path, ""), false);
});

test("a saved file is matched by its own record", () => {
  const library = { metadata: { "images/team.webp": { alt: "Our desk", tags: ["Studio picks"] } }, usage: {} };
  assert.equal(mediaAddingShown(library, { ...all, query: "desk" }, "images/team.webp", "Studio picks"), true);
  assert.equal(mediaAddingShown(library, { ...all, collection: "Logos" }, "images/team.webp", "Studio picks"), false);
});

test("Show new files clears search and kind, and views the collection they joined when another is viewed", () => {
  assert.deepEqual(mediaAddingReveal({ query: "desk", collection: "", kind: "video" }, ""), { query: "", kind: "all" });
  assert.deepEqual(mediaAddingReveal({ query: "desk", collection: "Studio picks", kind: "all" }, "Studio picks"), { query: "", kind: "all" });
  assert.deepEqual(mediaAddingReveal({ query: "", collection: "Logos", kind: "all" }, "Studio picks"), { query: "", kind: "all", collection: "Studio picks" });
  // Dropped under All, now viewing a collection: back to All collections.
  assert.deepEqual(mediaAddingReveal({ query: "", collection: "Logos", kind: "all" }, ""), { query: "", kind: "all", collection: "" });
});
