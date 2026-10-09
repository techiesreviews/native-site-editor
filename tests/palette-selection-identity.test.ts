import assert from "node:assert/strict";
import test from "node:test";
import { selectionIdentity } from "../src/page-builder/palette.ts";

const selected = { path: "index.html", tag: "h1", node: [0, 1], rect: { top: 400, left: 10, width: 200, height: 40 } };

test("a scrolled selection keeps its palette identity", () => {
  assert.equal(selectionIdentity({ ...selected, rect: { ...selected.rect, top: 120 } }), selectionIdentity(selected));
  assert.equal(selectionIdentity({ ...selected, rect: undefined }), selectionIdentity(selected));
});

test("another element, file or tag is another selection", () => {
  const before = selectionIdentity(selected);
  assert.notEqual(selectionIdentity({ ...selected, node: [0, 2] }), before);
  assert.notEqual(selectionIdentity({ ...selected, path: "about/index.html" }), before);
  assert.notEqual(selectionIdentity({ ...selected, tag: "h2" }), before);
  assert.notEqual(selectionIdentity(undefined), before);
});
