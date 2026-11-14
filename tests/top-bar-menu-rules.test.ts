import test from "node:test";
import assert from "node:assert/strict";
import { menuRows } from "../src/components/top-bar-menu-rules.ts";

const all = { setup: false, blocks: true, sheet: true, devices: true, history: true, project: true };

test("with a page open, the phone menu lists every row in the approved order", () => {
  assert.deepEqual(menuRows(all), ["pages", "blocks", "structure", "code", "screen", "history", "inbox", "share", "settings", "switch"]);
});

test("a row whose control is not there is left out, never shown doing nothing", () => {
  // A stylesheet open: no blocks to add, no page structure sheet, no screen sizes.
  assert.deepEqual(menuRows({ ...all, blocks: false, sheet: false, devices: false }), ["pages", "history", "inbox", "share", "settings", "switch"]);
  // No project yet: only Pages and Switch site.
  assert.deepEqual(menuRows({ setup: false, blocks: false, sheet: false, devices: false, history: false, project: false }), ["pages", "switch"]);
});

test("a site not yet set up gets its checklist first, as the pill it stands for leaves the phone's bar", () => {
  assert.deepEqual(menuRows({ ...all, setup: true }).slice(0, 2), ["setup", "pages"]);
});

test("the Inbox sits behind the phone's Menu right after History while a project is open (TOOLS-222)", () => {
  const rows = menuRows(all);
  assert.equal(rows.indexOf("inbox"), rows.indexOf("history") + 1);
  assert.ok(!menuRows({ ...all, project: false }).includes("inbox"));
});
