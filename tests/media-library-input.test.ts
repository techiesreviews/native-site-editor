import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaLibraryArrowStep } from "../src/page-builder/media-library-input";

test("arrow keys step by one thumbnail or one row", () => {
  assert.equal(mediaLibraryArrowStep("ArrowRight", 4, 12, 3), 5);
  assert.equal(mediaLibraryArrowStep("ArrowLeft", 4, 12, 3), 3);
  assert.equal(mediaLibraryArrowStep("ArrowDown", 4, 12, 3), 7);
  assert.equal(mediaLibraryArrowStep("ArrowUp", 4, 12, 3), 1);
});

test("steps clamp at either end, including incomplete rows and a single thumbnail", () => {
  assert.equal(mediaLibraryArrowStep("ArrowLeft", 0, 10, 3), 0);
  assert.equal(mediaLibraryArrowStep("ArrowUp", 1, 10, 3), 0);
  assert.equal(mediaLibraryArrowStep("ArrowRight", 9, 10, 3), 9);
  assert.equal(mediaLibraryArrowStep("ArrowDown", 8, 10, 3), 9);
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"])
    assert.equal(mediaLibraryArrowStep(key, 0, 1, 1), 0);
});

test("other keys leave keyboard handling to the browser", () => {
  assert.equal(mediaLibraryArrowStep("Enter", 4, 12, 3), undefined);
  assert.equal(mediaLibraryArrowStep("Tab", 4, 12, 3), undefined);
  assert.equal(mediaLibraryArrowStep("", 4, 12, 3), undefined);
});
