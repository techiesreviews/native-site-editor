import { test } from "node:test";
import assert from "node:assert/strict";
import { REPLACE_ACCEPT, pageList, replaceChoiceProblem, replaceNotice, replacedMessage, replacedPages, shownPages, trimmedCopiesOf, trimsOf } from "../src/page-builder/media-replace-rules";
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

test("the confirmation keeps the same address in one line, then focus points and where the old picture goes", () => {
  const notice = replaceNotice({ path: "images/tram.webp", next: { extension: "webp" }, pages: 2, trims: 0, kept: false });
  assert.equal(notice.title, "Replace tram.webp everywhere?");
  assert.equal(notice.address, "images/tram.webp");
  assert.equal(notice.forward, undefined);
  assert.deepEqual(notice.lines, [
    "Same name and address, so links from other sites show it too.",
    "Focus points go back to the middle.",
    "The old picture goes to Recently removed for 30 days.",
  ]);
  // The trimmed-copies line stays when it applies; "… also stays in Media as it is." is gone (slice 113).
  assert.deepEqual(replaceNotice({ path: "a.png", next: { extension: "png" }, pages: 1, trims: 2, kept: false }).lines, [
    "Same name and address, so links from other sites show it too.",
    "Focus points go back to the middle.",
    "2 trimmed copies of it are replaced by the new picture in the same shape.",
    "The old picture goes to Recently removed for 30 days.",
  ]);
  // No page uses it: no focus points line.
  assert.deepEqual(replaceNotice({ path: "a.png", next: { extension: "png" }, pages: 0, trims: 0, kept: false }).lines, [
    "Same name and address, so links from other sites show it too.",
    "The old picture goes to Recently removed for 30 days.",
  ]);
});

test("a new format changes the address and offers Keep the old address working, ticked for Always keep", () => {
  const notice = replaceNotice({ path: "images/tram.jpg", next: { extension: "webp" }, pages: 1, trims: 0, kept: true });
  assert.equal(notice.address, "images/tram.webp");
  assert.equal(notice.lines[0], "It's a WebP, so its address becomes /images/tram.webp. Every mention is updated.");
  assert.deepEqual(notice.forward, { label: "Keep the old address working", checked: true,
    hint: "Links from other sites to /images/tram.jpg forward to the new address, on hosts that read the site's _redirects file." });
  assert.equal(replaceNotice({ path: "a.JPG", next: { extension: "jpg" }, pages: 0, trims: 0, kept: false }).forward, undefined);
  // As the engine decides, .jpeg for a .jpg is a new address.
  assert.equal(replaceNotice({ path: "a.jpg", next: { extension: "jpeg" }, pages: 0, trims: 0, kept: false }).forward?.checked, false);
  assert.equal(replaceNotice({ path: "a.png", next: { extension: "avif" }, pages: 0, trims: 0, kept: false }).lines[0],
    "It's an AVIF, so its address becomes /a.avif. Every mention is updated.");
});

test("the box names up to five pages, then how many more", () => {
  assert.deepEqual(shownPages(["a", "b"]), { shown: ["a", "b"], more: 0 });
  assert.deepEqual(shownPages(["a", "b", "c", "d", "e", "f", "g", "h"]), { shown: ["a", "b", "c", "d", "e"], more: 3 });
  assert.deepEqual(shownPages([]), { shown: [], more: 0 });
});

test("the result names the old file, the new picture and the pages", () => {
  assert.equal(replacedMessage("media/images/red-acer.webp", "bluebells.webp", ["Home", "About"]), "red-acer.webp now shows the bluebells picture on Home and About.");
  assert.equal(replacedMessage("a.png", "Photo.HEIC", []), "a.png now shows the Photo picture.");
  assert.equal(pageList(["Home"]), "Home");
  assert.equal(pageList(["Home", "About", "Work"]), "Home, About and Work");
  assert.equal(pageList(["Home", "About", "Work", "Contact"]), "Home, About, Work and 1 more page");
  assert.equal(pageList(["Home", "About", "Work", "Contact", "Blog"]), "Home, About, Work and 2 more pages");
});

test("trimmed copies made from any member of the family are counted", () => {
  const trim = { x: 0, y: 0, width: 1, height: 1 };
  const metadata = {
    "images/t1.webp": { tags: [], alt: "", trimmedFrom: { source: "images/tram.webp", trim } },
    "images/t2.webp": { tags: [], alt: "", trimmedFrom: { source: "images/tram-480.webp", trim } },
    "images/t3.webp": { tags: [], alt: "", trimmedFrom: { source: "images/new.jpg", trim } },
  };
  assert.equal(trimsOf("images/tram.webp", paths, metadata), 2);
  assert.deepEqual(trimmedCopiesOf("images/tram.webp", paths, metadata), ["images/t1.webp", "images/t2.webp"]);
  // The confirm and the toast name pages that show only a Trimmed copy too, once each (review of slice 113).
  const usage = { "images/tram.webp": { pages: ["index.html"] }, "images/t1.webp": { pages: ["index.html", "about/index.html"] },
    "images/t2.webp": { pages: ["work/index.html"] }, "images/t3.webp": { pages: ["contact/index.html"] } };
  assert.deepEqual(replacedPages("images/tram.webp", paths, metadata, usage), ["index.html", "about/index.html", "work/index.html"]);
  assert.deepEqual(replacedPages("logo.svg", paths, metadata, usage), []);
});
