import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mediaAddingWords, mediaAddingCancellable, mediaAddingFailedLine, mediaAddingFailedReason, mediaAddingHoldText, mediaAddingShortName, mediaAddingOffers, mediaAddingPath, mediaAddingReveal, mediaAddingReviewable, mediaAddingShown, mediaAddingStatus,
} from "../src/page-builder/media-adding-rules";
import type { MediaLibraryFilter } from "../src/page-builder/media-library-filter";

const all: MediaLibraryFilter = { query: "", collection: "", kind: "all" };
const none = { metadata: {}, usage: {} };

test("the tray counts files settled out of those still being added; cancelled files leave the count", () => {
  assert.deepEqual(mediaAddingStatus(["waiting", "preparing"]), { text: "Adding 2 files", running: true, done: 0, total: 2 });
  assert.deepEqual(mediaAddingStatus(["ready", "preparing", "cancelled"]), { text: "Adding 2 files", running: true, done: 1, total: 2 });
  assert.deepEqual(mediaAddingStatus(["adding"]), { text: "Adding 1 file", running: true, done: 0, total: 1 });
  assert.deepEqual(mediaAddingStatus(["added", "cancelled"]), { text: "Added 1 file", running: false, done: 1, total: 1 });
  assert.equal(mediaAddingStatus(["added", "added", "failed"]).text, "2 added · 1 couldn't be added");
  assert.equal(mediaAddingStatus(["added", "failed", "failed"]).text, "1 added · 2 couldn't be added");
  assert.equal(mediaAddingStatus(["failed", "failed"]).text, "2 files couldn't be added");
  assert.equal(mediaAddingStatus(["failed"]).text, "1 file couldn't be added");
  // Everything cancelled: nothing to say, so the tray hides.
  assert.deepEqual(mediaAddingStatus(["cancelled", "cancelled"]), { text: "", running: false, done: 0, total: 0 });
  assert.equal(mediaAddingStatus([]).text, "");
});

test("a file being added shows where the view would show it: its collection, kind and search", () => {
  const path = mediaAddingPath("Downloads/Team photo.png");
  assert.equal(path, "media/images/team-photo.webp");
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

test("the summary offers Cancel while a file can be stopped, Retry once finished with failures, Dismiss when finished", () => {
  assert.deepEqual(mediaAddingOffers(["preparing", "failed"]), { cancel: true, retry: false, dismiss: false });
  assert.deepEqual(mediaAddingOffers(["ready", "adding"]), { cancel: true, retry: false, dismiss: false });
  // Being saved, a file can no longer be stopped.
  assert.deepEqual(mediaAddingOffers(["adding"]), { cancel: false, retry: false, dismiss: false });
  assert.deepEqual(mediaAddingOffers(["added", "failed"]), { cancel: false, retry: true, dismiss: true });
  assert.deepEqual(mediaAddingOffers(["added", "cancelled"]), { cancel: false, retry: false, dismiss: true });
  // The picker's Use and Cancel end its addition: no Dismiss there.
  assert.deepEqual(mediaAddingOffers(["failed"], true), { cancel: false, retry: true, dismiss: false });
  // Held for Use, ready files leave Retry available in the picker; in the pane they are about to be saved.
  assert.deepEqual(mediaAddingOffers(["ready", "failed"], true), { cancel: true, retry: true, dismiss: false });
  assert.equal(mediaAddingOffers(["ready", "failed"]).retry, false);
  assert.equal(mediaAddingOffers(["preparing", "failed"], true).retry, false);
  assert.deepEqual(["waiting", "preparing", "ready", "adding", "added", "failed", "cancelled"].map(state => mediaAddingCancellable(state as never)),
    [true, true, true, false, false, false, false]);
});

test("Review… from Files takes pictures not added yet, or that failed; other kinds keep going", () => {
  assert.equal(mediaAddingReviewable("Holiday.JPG", "preparing"), true);
  assert.equal(mediaAddingReviewable("shot.png", "failed"), true);
  assert.equal(mediaAddingReviewable("shot.png", "ready"), true);
  assert.equal(mediaAddingReviewable("shot.png", "adding"), false);
  assert.equal(mediaAddingReviewable("shot.png", "added"), false);
  assert.equal(mediaAddingReviewable("guide.pdf", "failed"), false);
  assert.equal(mediaAddingReviewable("logo.svg", "waiting"), true);
});

test("a failed file's line names it once and says what to do in at most two short sentences", () => {
  // The audit's example: the long middle sentence goes; the advice stays.
  const hidden = "phone-export.png could not be prepared. Hidden personal details could not be removed because the picture could not be prepared. Save it as a new JPEG or PNG and add it again.";
  assert.equal(mediaAddingFailedLine("phone-export.png", hidden), "phone-export.png couldn't be added. Save it as a new JPEG or PNG and add it again.");
  // A short reason and its advice both fit.
  assert.equal(mediaAddingFailedLine("big.jpg", "big.jpg could not be prepared. It is 25.3 MB and the limit is 20 MB. Try a smaller export."),
    "big.jpg couldn't be added. It is 25.3 MB and the limit is 20 MB. Try a smaller export.");
  assert.equal(mediaAddingFailedLine("clip.mov", "clip.mov could not be prepared. Export it as MP4 (H.264) and add it again."),
    "clip.mov couldn't be added. Export it as MP4 (H.264) and add it again.");
  assert.equal(mediaAddingFailedLine("a.png", "a.png could not be added to your drafts."), "a.png couldn't be added.");
  assert.equal(mediaAddingFailedLine("a.png", "a.png: Choose a website folder outside media/originals when keeping an original."),
    "a.png couldn't be added. Choose a website folder outside media/originals when keeping an original.");
  // A reason that does not name the file gets the name in front.
  assert.equal(mediaAddingFailedLine("a.png", "This folder changed. Try again."), "a.png couldn't be added. This folder changed. Try again.");
  assert.equal(mediaAddingFailedLine("a.png"), "a.png couldn't be added.");
  // Other sentences that name the file already read as a line of their own.
  assert.equal(mediaAddingFailedLine("huge.pdf", "huge.pdf is 20 MB; uploads are limited to 20 MB per file."), "huge.pdf is 20 MB; uploads are limited to 20 MB per file.");
  assert.equal(mediaAddingFailedLine("Refused.png", "Refused.png was not added."), "Refused.png was not added.");
});

test("a long file name in a tray line keeps its start and its end; Review keeps it whole", () => {
  const long = `${"holiday-photo-".repeat(10)}final.png`;
  assert.equal(mediaAddingShortName("phone-export.png"), "phone-export.png");
  assert.equal(mediaAddingShortName(long), "holiday-photo-holiday…-final.png");
  assert.equal(mediaAddingShortName(long).length, 32);
  assert.equal(mediaAddingFailedLine(long, `${long} could not be prepared. Hidden personal details could not be removed. Save it as a new JPEG or PNG and add it again.`),
    "holiday-photo-holiday…-final.png couldn't be added. Save it as a new JPEG or PNG and add it again.");
  assert.equal(mediaAddingFailedLine(long, `${long} was not added.`), "holiday-photo-holiday…-final.png was not added.");
  assert.equal(mediaAddingFailedReason(long, "Nope."), `${long}: Nope.`);
});

test("Review gets each failed file's full reason, named once", () => {
  assert.equal(mediaAddingFailedReason("a.png", "a.png could not be prepared. Long reason. Advice."), "a.png could not be prepared. Long reason. Advice.");
  assert.equal(mediaAddingFailedReason("a.png", "This folder changed. Try again."), "a.png: This folder changed. Try again.");
  assert.equal(mediaAddingFailedReason("a.png"), "a.png: The file could not be added.");
});

test("the picker's held files: how many are ready and how many failed, or the tray's own words", () => {
  assert.equal(mediaAddingHoldText(["ready", "ready"]), "2 ready · Use saves and places; Close saves without placing.");
  assert.equal(mediaAddingHoldText(["ready", "failed"]), "1 ready · 1 couldn't be added");
  // Nothing ready (all failed, or still preparing): the ordinary words.
  assert.equal(mediaAddingHoldText(["failed"]), undefined);
  assert.equal(mediaAddingHoldText(["ready", "preparing"]), undefined);
  assert.equal(mediaAddingHoldText(["waiting"]), undefined);
});

test("Smallest files preparing words say slower; ordinary and settled words stay the same", () => {
  assert.equal(mediaAddingWords("preparing", "smallest"), "Preparing (slower)…");
  assert.equal(mediaAddingWords("preparing", "balanced"), "Preparing…");
  assert.equal(mediaAddingWords("ready", "smallest"), "Ready");
});


test("pending video names predict MP4 in the video folder", () => {
  for (const extension of ["mp4", "m4v", "webm", "mov", "mkv", "ogv", "avi"])
    assert.equal(mediaAddingPath("Clip." + extension), "media/videos/clip.mp4");
});
