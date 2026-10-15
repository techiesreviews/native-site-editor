import { test } from "node:test";
import assert from "node:assert/strict";
import { improvePictureLine, improvePictureName, improveProgress, improveRowLine, improveRowStatus, improveRunMessage } from "../src/page-builder/improve-images-words";
import type { ImproveImagesRow, ImprovePicture } from "../src/page-builder/improve-images";

const picture = (over: Partial<ImprovePicture>): ImprovePicture => ({ key: "k", address: "/a.jpg", kind: "image", tag: { start: 0, end: 1 }, changes: [], ticked: true, ...over });
const row = (over: Partial<ImproveImagesRow>): ImproveImagesRow => ({
  kind: "page", file: "index.html", label: "Home", pages: ["index.html"], pictures: [], leftAlone: [], count: 1,
  counts: { "bring-in": 0, lighten: 0, copies: 0, size: 0, sizes: 0, loading: 0, loop: 0, "first-frame": 0, player: 0 }, summary: "Home: 2 heavy pictures", ...over });

test("a row says where it shows, how many pictures change and what they get, in plain words", () => {
  const copies = picture({ key: "a", changes: ["copies", "size", "sizes"] }), heavy = picture({ key: "b", changes: ["lighten", "loading"] });
  assert.equal(improveRowLine(row({ pictures: [copies, { ...copies, key: "c" }, { ...copies, key: "d" }, { ...copies, key: "e" }] })), "4 pictures · lighter copies for phones");
  // The same picture twice on a page counts once; an unticked one does not count.
  assert.equal(improveRowLine(row({ pictures: [copies, copies, { ...heavy, ticked: false }] })), "1 picture · lighter copies for phones");
  assert.equal(improveRowLine(row({ pictures: [heavy, copies] })), "2 pictures · lighter files, lighter copies for phones");
  assert.equal(improveRowLine(row({ pictures: [picture({ changes: ["size", "loading"] })] })), "1 picture · faster loading");
  assert.equal(improveRowLine(row({ kind: "component", label: "Site header", reach: 97, pictures: [picture({ kind: "gif", changes: ["loop"] })] })), "On 97 pages · 1 picture · lighter GIFs");
  assert.equal(improveRowLine(row({ kind: "component", label: "Card", reach: 1, pictures: [picture({ kind: "youtube", changes: ["player"] })] })), "On 1 page · 1 picture · videos load on tap");
  assert.equal(improveRowLine(row({ pictures: [picture({ kind: "outside", changes: ["bring-in", "size"] })] })), "1 picture · copies from other websites");
  assert.equal(improveRowLine(row({ pictures: [{ ...copies, ticked: false }] })), "Every picture left as it is");
});

test("a picture is named and its change said in plain words", () => {
  assert.equal(improvePictureName(picture({ path: "images/desk.jpg" })), "desk.jpg");
  assert.equal(improvePictureName(picture({ kind: "outside", url: "https://mobbin.com/a.png", host: "mobbin.com" })), "mobbin.com");
  assert.equal(improvePictureName(picture({ kind: "youtube" })), "YouTube video");
  assert.equal(improvePictureName(picture({ kind: "vimeo" })), "Vimeo video");
  assert.equal(improvePictureName(picture({ kind: "sharing" })), "Sharing picture");
  assert.equal(improvePictureLine(picture({ changes: ["bring-in", "size", "sizes"] })), "From another website: keep a copy here");
  assert.equal(improvePictureLine(picture({ changes: ["lighten", "sizes", "loading"] })), "Heavy: a lighter file");
  assert.equal(improvePictureLine(picture({ changes: ["copies", "size"] })), "Copies for smaller screens");
  assert.equal(improvePictureLine(picture({ changes: ["loop"] })), "GIF: becomes a looping video");
  assert.equal(improvePictureLine(picture({ changes: ["first-frame"] })), "GIF: sharing uses its first frame");
  assert.equal(improvePictureLine(picture({ changes: ["player"] })), "Shows a picture until tapped");
  assert.equal(improvePictureLine(picture({ changes: ["size", "loading"] })), "Faster loading");
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
