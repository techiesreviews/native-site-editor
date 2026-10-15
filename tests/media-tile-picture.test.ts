import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaTileCopySize, mediaTileWhole, TILE_COPY_EDGE } from "../src/page-builder/media-tile-picture.ts";

test("a heavy picture's tile copy keeps its shape with the shorter side at the tile edge", () => {
  assert.deepEqual(mediaTileCopySize(6000, 4000), { width: 720, height: TILE_COPY_EDGE });
  assert.deepEqual(mediaTileCopySize(1600, 900), { width: 853, height: 480 });
  assert.deepEqual(mediaTileCopySize(3000, 4500), { width: 480, height: 720 });
  assert.equal(mediaTileCopySize(480, 900), undefined, "no copy when the picture is already that small");
  assert.equal(mediaTileCopySize(300, 200), undefined);
});

test("only pictures wider than 2:1 show whole on their tile", () => {
  assert.equal(mediaTileWhole(2001, 1000), true);
  assert.equal(mediaTileWhole(2000, 1000), false, "exactly 2:1 still fills the square");
  assert.equal(mediaTileWhole(1000, 3000), false, "tall pictures crop like photos");
  assert.equal(mediaTileWhole(undefined, 100), false);
  assert.equal(mediaTileWhole(100, 0), false);
});
