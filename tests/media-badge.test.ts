import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUpMenuItem, mediaBadge, mediaBadgeLabel, readDismissed, suggestedFiles } from "../src/page-builder/media-badge";
import type { MediaCleanUpSuggestions } from "../src/page-builder/media-clean-up";

const item = (main: string) => ({ main, members: [main], size: 0 });
function ready(unused: string[], trimmed: string[] = []): MediaCleanUpSuggestions {
  const groups = [
    ...(unused.length ? [{ kind: "unused" as const, items: unused.map(item), count: unused.length, size: 0 }] : []),
    ...(trimmed.length ? [{ kind: "trimmed" as const, items: trimmed.map(item), count: trimmed.length, size: 0 }] : []),
  ];
  return { state: "ready", blockedBy: [], groups, count: unused.length + trimmed.length, size: 0 };
}

test("the badge counts every suggestion, like an unread count", () => {
  assert.deepEqual(mediaBadge(ready(["a.png", "b.pdf"], ["c-crop.webp"]), undefined), { count: 3, show: true });
  assert.deepEqual(suggestedFiles(ready(["b.pdf", "a.png"], ["c-crop.webp"])), ["a.png", "b.pdf", "c-crop.webp"]);
});

test("nothing left, nothing checked yet or an unreadable file hides the badge", () => {
  assert.deepEqual(mediaBadge(ready([]), undefined), { count: 0, show: false });
  assert.deepEqual(mediaBadge({ state: "not-checked", blockedBy: [], groups: [], count: 0, size: 0 }, undefined), { count: 0, show: false });
  assert.deepEqual(mediaBadge({ state: "blocked", blockedBy: ["notes.txt"], groups: [], count: 0, size: 0 }, undefined), { count: 0, show: false });
});

test("after a dismiss the badge returns only when a file not suggested then is", () => {
  const dismissed = ["a.png", "b.pdf"];
  assert.deepEqual(mediaBadge(ready(["a.png", "b.pdf"]), dismissed), { count: 2, show: false });
  assert.deepEqual(mediaBadge(ready(["a.png"]), dismissed), { count: 1, show: false });
  assert.deepEqual(mediaBadge(ready(["a.png", "b.pdf", "new.jpg"]), dismissed), { count: 3, show: true });
  assert.deepEqual(mediaBadge(ready([], ["a-crop.webp"]), dismissed), { count: 1, show: true });
  assert.deepEqual(mediaBadge(ready(["a.png"]), []), { count: 1, show: true });
});

test("stored dismissals are read leniently", () => {
  assert.deepEqual(readDismissed('["a.png","b.pdf"]'), ["a.png", "b.pdf"]);
  for (const text of [null, undefined, "", "{", '{"a":1}', "[1]", '"a.png"']) assert.equal(readDismissed(text), undefined);
});

test("the label counts files", () => {
  assert.equal(mediaBadgeLabel(1), "1 file to clean up");
  assert.equal(mediaBadgeLabel(4), "4 files to clean up");
});

test("Clean up in More carries the same count, or says why it cannot open", () => {
  assert.deepEqual(cleanUpMenuItem(ready(["a.png", "b.pdf"])), { label: "Clean up (2)" });
  assert.deepEqual(cleanUpMenuItem(ready([])), { label: "Clean up", disabled: "Nothing to clean up: every file is used or marked Always keep." });
  assert.deepEqual(cleanUpMenuItem({ state: "not-checked", blockedBy: [], groups: [], count: 0, size: 0 }), { label: "Clean up", disabled: "Still checking which files are used." });
  assert.deepEqual(cleanUpMenuItem({ state: "blocked", blockedBy: ["a.txt"], groups: [], count: 0, size: 0 }).disabled, "Nothing is suggested until every file can be read: a.txt.");
  assert.deepEqual(cleanUpMenuItem({ state: "blocked", blockedBy: ["a", "b", "c", "d", "e"], groups: [], count: 0, size: 0 }).disabled, "Nothing is suggested until every file can be read: a, b, c and 2 more.");
});
