import { test } from "node:test";
import assert from "node:assert/strict";
import { REPLACE_ACCEPT, existingReplacement, replaceChoiceProblem, replaceNotice, replacedMessage, trimsOf } from "../src/page-builder/media-replace-rules";
import { accepts } from "../src/page-builder/media-library-filter";

const paths = ["images/tram.webp", "images/tram-480.webp", "media/originals/tram.jpg", "images/new.jpg", "images/new-960.jpg", "logo.svg", "a.gif"];

test("the picker offers only what can take a picture's place: JPEG, PNG, WebP and AVIF", () => {
  for (const path of ["a.jpg", "a.jpeg", "a.png", "a.webp", "a.avif"]) assert.equal(accepts(path, REPLACE_ACCEPT), true, path);
  for (const path of ["a.svg", "a.gif", "a.ico", "a.pdf"]) assert.equal(accepts(path, REPLACE_ACCEPT), false, path);
});

test("the chosen picture must not be the one being replaced, or one of its copies or its original", () => {
  for (const chosen of ["images/tram.webp", "images/tram-480.webp", "media/originals/tram.jpg"])
    assert.equal(replaceChoiceProblem("images/tram.webp", chosen, paths), "That is the picture being replaced. Choose a different one.");
  assert.equal(replaceChoiceProblem("images/tram.webp", "a.gif", paths), "Choose a JPEG, PNG, WebP or AVIF picture.");
  assert.equal(replaceChoiceProblem("images/tram.webp", "images/new.jpg", paths), undefined);
});

test("a picture already in Media brings its main, its copies and its kept original as they are", () => {
  const main = new Blob(["main"]), copy = new Blob(["copy"]), original = new Blob(["raw"]);
  const made = existingReplacement({ path: "images/new.JPG", blob: main, width: 1600, height: 900 }, [{ width: 960, blob: copy }],
    { path: "media/originals/new.heic", blob: original });
  assert.deepEqual(made.result.outputs, [
    { blob: main, width: 1600, height: 900, extension: "jpg" },
    { blob: copy, extension: "jpg", variantWidth: 960 },
  ]);
  assert.deepEqual({ before: made.result.before, after: made.result.after }, { before: 8, after: 8 });
  assert.deepEqual(made.original, { blob: original, extension: "heic" });
  assert.equal(existingReplacement({ path: "b.png", blob: main, width: 1, height: 1 }, []).original, undefined);
});

test("the confirmation says where it shows, that the address stays, and where the old picture goes", () => {
  const notice = replaceNotice({ path: "images/tram.webp", next: { name: "photo.jpg", extension: "webp" }, pages: 2, trims: 0, kept: false });
  assert.equal(notice.title, "Replace tram.webp everywhere?");
  assert.equal(notice.address, "images/tram.webp");
  assert.equal(notice.forward, undefined);
  assert.deepEqual(notice.lines, [
    "2 pages show tram.webp. They will show the new picture instead, as will links to it from other sites.",
    "It keeps the name and address /images/tram.webp. Visitors' browsers fetch the new picture at once.",
    "Each place keeps its shape; its focus point goes back to the middle.",
    "The old picture goes to Recently removed for 30 days.",
  ]);
  const one = replaceNotice({ path: "a.png", next: { name: "new.png", extension: "png", inMedia: true }, pages: 1, trims: 2, kept: false });
  assert.deepEqual(one.lines, [
    "1 page shows a.png. It will show the new picture instead, as will links to it from other sites.",
    "It keeps the name and address /a.png. Visitors' browsers fetch the new picture at once.",
    "Each place keeps its shape; its focus point goes back to the middle.",
    "2 trimmed copies of it are replaced by the new picture in the same shape.",
    "new.png also stays in Media as it is.",
    "The old picture goes to Recently removed for 30 days.",
  ]);
  assert.equal(replaceNotice({ path: "a.png", next: { name: "b", extension: "png" }, pages: 0, trims: 0, kept: false }).lines[0],
    "No page shows a.png yet. Links to it will show the new picture.");
});

test("a new format changes the address and offers Keep the old address working, ticked for Always keep", () => {
  const notice = replaceNotice({ path: "images/tram.jpg", next: { name: "photo.heic", extension: "webp" }, pages: 1, trims: 0, kept: true });
  assert.equal(notice.address, "images/tram.webp");
  assert.equal(notice.lines[1], "The new picture is WEBP, so the address becomes /images/tram.webp. Every mention on the site is updated.");
  assert.deepEqual(notice.forward, { label: "Keep the old address working", checked: true,
    hint: "Links from other sites to /images/tram.jpg forward to the new address, on hosts that read the site's _redirects file." });
  assert.equal(replaceNotice({ path: "a.JPG", next: { name: "b", extension: "jpg" }, pages: 0, trims: 0, kept: false }).forward, undefined);
  // As the engine decides, .jpeg for a .jpg is a new address.
  assert.equal(replaceNotice({ path: "a.jpg", next: { name: "b", extension: "jpeg" }, pages: 0, trims: 0, kept: false }).forward?.checked, false);
});

test("trimmed copies made from any member of the family are counted, and the message names the pages", () => {
  const trim = { x: 0, y: 0, width: 1, height: 1 };
  const metadata = {
    "images/t1.webp": { tags: [], alt: "", trimmedFrom: { source: "images/tram.webp", trim } },
    "images/t2.webp": { tags: [], alt: "", trimmedFrom: { source: "images/tram-480.webp", trim } },
    "images/t3.webp": { tags: [], alt: "", trimmedFrom: { source: "images/new.jpg", trim } },
  };
  assert.equal(trimsOf("images/tram.webp", paths, metadata), 2);
  assert.equal(replacedMessage("images/tram.webp", 2), "Replaced tram.webp everywhere on 2 pages, as a draft. The old picture is in More → Recently removed.");
  assert.equal(replacedMessage("a.png", 0), "Replaced a.png everywhere, as a draft. The old picture is in More → Recently removed.");
});
