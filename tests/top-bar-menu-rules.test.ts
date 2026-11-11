import test from "node:test";
import assert from "node:assert/strict";
import { menuRows } from "../src/components/top-bar-menu-rules.ts";

const all = { blocks: true, sheet: true, devices: true, history: true, project: true };

test("with a page open, the phone menu lists every row in the approved order", () => {
  assert.deepEqual(menuRows(all), ["pages", "blocks", "structure", "code", "screen", "history", "share", "settings", "switch"]);
});

test("a row whose control is not there is left out, never shown doing nothing", () => {
  // A stylesheet open: no blocks to add, no page structure sheet, no screen sizes.
  assert.deepEqual(menuRows({ ...all, blocks: false, sheet: false, devices: false }), ["pages", "history", "share", "settings", "switch"]);
  // No project yet: only Pages and Switch site.
  assert.deepEqual(menuRows({ blocks: false, sheet: false, devices: false, history: false, project: false }), ["pages", "switch"]);
});
