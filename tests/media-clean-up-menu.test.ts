import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUpMenuItem, improveMenuItem } from "../src/page-builder/media-clean-up-menu";
import type { MediaCleanUpSuggestions } from "../src/page-builder/media-clean-up";

const item = (main: string) => ({ main, members: [main], size: 0 });
function ready(unused: string[], trimmed: string[] = []): MediaCleanUpSuggestions {
  const groups = [
    ...(unused.length ? [{ kind: "unused" as const, items: unused.map(item), count: unused.length, size: 0 }] : []),
    ...(trimmed.length ? [{ kind: "trimmed" as const, items: trimmed.map(item), count: trimmed.length, size: 0 }] : []),
  ];
  return { state: "ready", blockedBy: [], groups, count: unused.length + trimmed.length, size: 0 };
}

test("Clean up in More carries its count, or says why it cannot open", () => {
  assert.deepEqual(cleanUpMenuItem(ready(["a.png", "b.pdf"], ["c-crop.webp"])), { label: "Clean up (3)" });
  // Slice 121: the count is the settled check's, none before there is one.
  assert.deepEqual(cleanUpMenuItem(ready(["a.png", "b.pdf"]), null), { label: "Clean up" });
  assert.deepEqual(cleanUpMenuItem(ready(["a.png"]), ready(["a.png", "b.pdf"])), { label: "Clean up (2)" });
  assert.deepEqual(cleanUpMenuItem(ready([])), { label: "Clean up", disabled: true });
  assert.deepEqual(cleanUpMenuItem({ state: "not-checked", blockedBy: [], groups: [], count: 0, size: 0 }), { label: "Clean up", disabled: "Still checking which files are used." });
  assert.deepEqual(cleanUpMenuItem({ state: "blocked", blockedBy: ["a.txt"], groups: [], count: 0, size: 0 }).disabled, "Nothing is suggested until every file can be read: a.txt.");
  assert.deepEqual(cleanUpMenuItem({ state: "blocked", blockedBy: ["a", "b", "c", "d", "e"], groups: [], count: 0, size: 0 }).disabled, "Nothing is suggested until every file can be read: a, b, c and 2 more.");
});

test("Improve images in More shows its rows when there are any", () => {
  assert.deepEqual(improveMenuItem(4), { label: "Improve images (4)" });
  assert.deepEqual(improveMenuItem(0), { label: "Improve images" });
  assert.deepEqual(improveMenuItem(undefined), { label: "Improve images" });
});
