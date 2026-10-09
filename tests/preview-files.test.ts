import assert from "node:assert/strict";
import test from "node:test";
import { samePreviewFiles } from "../src/components/preview-files.ts";

test("preview file equality compares names and bytes, independent of insertion order", () => {
  assert.equal(samePreviewFiles({}, {}), true);
  assert.equal(samePreviewFiles({ page: "<main>", css: "body{}" }, { css: "body{}", page: "<main>" }), true);
  assert.equal(samePreviewFiles({ page: "before" }, { page: "after" }), false);
  assert.equal(samePreviewFiles({ page: "" }, { renamed: "" }), false);
  assert.equal(samePreviewFiles({ page: "" }, {}), false);
  assert.equal(samePreviewFiles({}, { page: "" }), false);
});
