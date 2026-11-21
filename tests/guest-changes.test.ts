import assert from "node:assert/strict";
import test from "node:test";
import { guestHref, guestPhoto, guestPicturePath, readGuestChange, readPopupEdit } from "../src/guest-changes";

const at = { path: "index.html", node: [0, 2, 1] };
const crop = { shape: "16:9", focus: { x: 30, y: 70 }, cut: { turn: 90, zoom: 2, rect: { x: 0, y: 0, w: 1, h: 1 } } };

test("a guest's link change keeps a page, part, mail, phone or web address and refuses scripts and hidden characters", () => {
  for (const href of ["/about.html", "about.html#team", "#menu", "https://example.com/a?b=c", "mailto:anna@example.com", "tel:+3212345", ""])
    assert.deepEqual(readGuestChange({ kind: "link", ...at, href }), { kind: "link", ...at, href }, href);
  for (const href of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "data:text/html,hi", "vbscript:x", "a\u0000b", "x".repeat(2001), 42])
    assert.equal(readGuestChange({ kind: "link", ...at, href }), undefined, String(href));
  assert.equal(guestHref("  /menu.html "), "/menu.html", "the address is kept trimmed");
});

test("a guest's picture is a picture file inside the site: no scheme, no way up, no other file", () => {
  assert.deepEqual(readGuestChange({ kind: "picture", ...at, file: "images/bread.jpg" }), { kind: "picture", ...at, file: "images/bread.jpg" });
  for (const file of ["../secret.png", "images/../../x.png", "/etc/x.png", "https://example.com/x.png", "data:image/png;base64,AA", "notes.txt", "images//x.png", "./x.png", 7])
    assert.equal(guestPicturePath(file), undefined, String(file));
});

test("a guest's place on the page is a path and steps of whole numbers, whatever the change", () => {
  for (const bad of [{ ...at, path: 42 }, { ...at, node: [0, -1] }, { ...at, node: [0.5] }, { ...at, node: "0,1" }, { ...at, path: "x".repeat(501) }])
    assert.equal(readGuestChange({ kind: "picture", ...bad, file: "images/bread.jpg" }), undefined, JSON.stringify(bad).slice(0, 60));
  assert.equal(readGuestChange({ kind: "settings", ...at }), undefined, "only the kinds guests have");
  assert.equal(readGuestChange(null), undefined);
});

test("a guest's upload is a named picture in base64 under the size limit", () => {
  const upload = { kind: "upload", ...at, name: "cake.png", type: "image/png", data: "iVBORw0KGgo=" };
  assert.deepEqual(readGuestChange(upload), upload);
  assert.equal(readGuestChange({ ...upload, type: "text/html" }), undefined, "not a picture");
  assert.equal(readGuestChange({ ...upload, type: "image/svg+xml", name: "x.svg" }), undefined, "a drawing can carry a script");
  assert.equal(readGuestChange({ ...upload, name: "cake.svg" }), undefined, "named as a drawing");
  assert.equal(readGuestChange({ ...upload, data: "<script>" }), undefined, "not base64");
  assert.equal(readGuestChange({ ...upload, data: "A".repeat(21_000_000) }), undefined, "too big");
  assert.equal(readGuestChange({ ...upload, name: "x".repeat(201) }), undefined);
  // A web page or anything else named as such would run its script from Lex's site once saved.
  for (const name of ["x.html", "x.xhtml", "x.xml", "x.htm", "x", "x.png.html"]) assert.equal(readGuestChange({ ...upload, name }), undefined, name);
  assert.equal(readGuestChange({ ...upload, name: "cake.jpg" }), undefined, "the type must be the one the name means");
  assert.deepEqual(readGuestChange({ ...upload, name: "Cake.JPEG", type: "image/jpeg" }), { ...upload, name: "Cake.JPEG", type: "image/jpeg" });
});

test("the guest's bar offers the upload Lex's tab takes: the same photo check on both sides", () => {
  assert.equal(guestPhoto("cake.png", "image/png"), true);
  assert.equal(guestPhoto("Cake.JPEG", "image/jpeg"), true);
  assert.equal(guestPhoto("x.svg", "image/svg+xml"), false, "a drawing");
  assert.equal(guestPhoto("x.html", "image/png"), false, "a web page named as such");
  assert.equal(guestPhoto("cake.jpg", "image/png"), false, "a type the name does not mean");
  assert.equal(guestPhoto("photo.heic", "image/heic"), false, "not a type Lex's tab takes");
});

test("a guest's heading level, text size and bold are the host bar's own choices, nothing else", () => {
  for (const level of ["h1", "h2", "h6"]) assert.deepEqual(readGuestChange({ kind: "heading", ...at, level }), { kind: "heading", ...at, level });
  for (const level of ["h7", "H2", "p", "div", "h2 onclick", 2]) assert.equal(readGuestChange({ kind: "heading", ...at, level }), undefined, String(level));
  for (const size of ["default", "text-large", "--text-l", "2xl", "fs-body_small"]) assert.deepEqual(readGuestChange({ kind: "size", ...at, size }), { kind: "size", ...at, size });
  for (const size of ["", "1rem; color: red", "a b", "x\"y", "x".repeat(81), 12]) assert.equal(readGuestChange({ kind: "size", ...at, size }), undefined, String(size));
  assert.deepEqual(readGuestChange({ kind: "bold", ...at, on: true, extra: 1 }), { kind: "bold", ...at, on: true });
  assert.deepEqual(readGuestChange({ kind: "bold", ...at, on: false }), { kind: "bold", ...at, on: false });
  assert.equal(readGuestChange({ kind: "bold", ...at, on: "yes" }), undefined);
  assert.equal(readGuestChange({ kind: "bold", ...at }), undefined, "it says whether bold goes on or off");
});

test("a guest's focus and crop is rebuilt from the popup's known shapes and ranges, nothing extra kept", () => {
  assert.deepEqual(readGuestChange({ kind: "crop", ...at, edit: { ...crop, extra: "x" }, recrop: false }), { kind: "crop", ...at, edit: crop, recrop: false });
  assert.equal(readGuestChange({ kind: "crop", ...at, edit: crop }), undefined, "it says which picture the crop was made on");
  assert.equal(readGuestChange({ kind: "crop", ...at, edit: crop, recrop: "yes" }), undefined);
  const free = { shape: "free", focus: { x: 50, y: 50 }, cut: { turn: 0, zoom: 1, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, straighten: -3.5, flipX: true }, around: "4:3", aroundFocus: { x: 10, y: 90 } };
  assert.deepEqual(readPopupEdit(free), free);
  assert.deepEqual(readPopupEdit({ ...crop, shape: { kind: "other", value: "3 / 2" } })?.shape, { kind: "other", value: "3 / 2" });
  for (const bad of [
    { ...crop, shape: "circle" }, { ...crop, shape: { kind: "other", value: "url(x)" } }, { ...crop, focus: { x: 101, y: 0 } },
    { ...crop, cut: { ...crop.cut, turn: 45 } }, { ...crop, cut: { ...crop.cut, zoom: 6 } }, { ...crop, cut: { ...crop.cut, rect: { x: 0.6, y: 0, w: 0.6, h: 1 } } },
    { ...crop, cut: { ...crop.cut, rect: { x: 0, y: 0, w: 0, h: 1 } } }, { ...crop, cut: { ...crop.cut, straighten: 90 } }, { ...crop, cut: { ...crop.cut, flipY: false } },
    { ...crop, around: "circle" }, { ...crop, aroundFocus: { x: "1", y: 2 } },
  ]) assert.equal(readPopupEdit(bad), undefined, JSON.stringify(bad).slice(0, 90));
});
