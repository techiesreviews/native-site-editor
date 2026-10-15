import { test } from "node:test";
import assert from "node:assert/strict";
import { improvePictureLine, improvePictureName, improveProgress, improveRowLine, improveRowStatus, improveRunMessage } from "../src/page-builder/improve-images-words";
import type { ImproveImagesRow, ImprovePicture } from "../src/page-builder/improve-images";

const picture = (over: Partial<ImprovePicture>): ImprovePicture => ({ key: "k", address: "/a.jpg", kind: "image", tag: { start: 0, end: 1 }, changes: [], ticked: true, ...over });
const row = (over: Partial<ImproveImagesRow>): ImproveImagesRow => ({
  kind: "page", file: "index.html", label: "Home", pages: ["index.html"], pictures: [], leftAlone: [], count: 1,
  counts: { "bring-in": 0, lighten: 0, copies: 0, size: 0, sizes: 0, loading: 0, loop: 0, "first-frame": 0, player: 0 }, summary: "Home: 2 heavy pictures", ...over });

test("a row says where it shows and what would change", () => {
  assert.equal(improveRowLine(row({})), "2 heavy pictures");
  assert.equal(improveRowLine(row({ kind: "component", label: "Site header", reach: 97, summary: "Site header, on 97 pages: 1 GIF" })), "On 97 pages · 1 GIF");
  assert.equal(improveRowLine(row({ kind: "component", label: "Card", reach: 1, summary: "Card, on 1 page: 1 player" })), "On 1 page · 1 player");
  assert.equal(improveRowLine(row({ label: "Notes: a: b", summary: "Notes: a: b: 1 GIF" })), "1 GIF");
});

test("a picture is named and its change said in plain words", () => {
  assert.equal(improvePictureName(picture({ path: "images/desk.jpg" })), "desk.jpg");
  assert.equal(improvePictureName(picture({ kind: "outside", url: "https://mobbin.com/a.png", host: "mobbin.com" })), "mobbin.com");
  assert.equal(improvePictureName(picture({ kind: "youtube" })), "YouTube video");
  assert.equal(improvePictureName(picture({ kind: "vimeo" })), "Vimeo video");
  assert.equal(improvePictureName(picture({ kind: "sharing" })), "Sharing picture");
  assert.equal(improvePictureLine(picture({ changes: ["bring-in", "size", "sizes"] })), "From another website: keep a copy here");
  assert.equal(improvePictureLine(picture({ changes: ["lighten", "sizes", "loading"] })), "Heavy: a lighter file");
  assert.equal(improvePictureLine(picture({ changes: ["copies", "size"] })), "Copies for smaller screens, size details");
  assert.equal(improvePictureLine(picture({ changes: ["loop"] })), "GIF: becomes a looping video");
  assert.equal(improvePictureLine(picture({ changes: ["first-frame"] })), "GIF: sharing uses its first frame");
  assert.equal(improvePictureLine(picture({ changes: ["player"] })), "Shows a picture until tapped");
  assert.equal(improvePictureLine(picture({ changes: ["size", "loading"] })), "Add size details");
});

test("progress, row marks and the run's message", () => {
  assert.equal(improveProgress(1, 5, "Home"), "Improving 2 of 5: Home");
  assert.equal(improveProgress(0, 1, "Home"), "Improving Home");
  assert.equal(improveRowStatus("done"), "Done");
  assert.equal(improveRowStatus("unchanged"), "Nothing to change");
  assert.equal(improveRowStatus("failed", "index.html changed."), "Not changed: index.html changed.");
  assert.equal(improveRowStatus(undefined), "");
  assert.equal(improveRunMessage(2, false, 0), "Changed 2 pages.");
  assert.equal(improveRunMessage(1, true, 1), "Changed 1 page. 1 page could not be changed. Stopped. The rest are still listed.");
  assert.equal(improveRunMessage(0, false, 0), "Nothing was changed.");
});
