import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMediaRecords, type RemovedMedia } from "../shared/media-records";
import { mediaCleanUpSuggestions } from "../src/page-builder/media-clean-up";
import {
  bytesText, cleanedMessage, cleanUpTitle, groupLine, itemLine, keepSelected, selectionLine, sizedSuggestions, undoEntries, undoneMessage,
} from "../src/page-builder/media-clean-up-review";
import { mediaUsageRecords } from "../src/page-builder/media-usage";

const usage = mediaUsageRecords({
  media: ["media/hero.jpg", "media/hero-480.webp", "media/spare.svg", "media/used.png", "media/styled.png"],
  sources: { "index.html": '<img src="/media/used.png">', "site.css": "body { background: url(/media/styled.png) }" },
  pages: ["index.html"],
});
const suggestions = mediaCleanUpSuggestions({ usage, records: parseMediaRecords(undefined) });

test("sizes come from the library: a family's copies count with its main, groups and the total follow", () => {
  const sized = sizedSuggestions(suggestions, { "media/hero.jpg": 2048, "media/hero-480.webp": 1024, "media/spare.svg": 300, "media/used.png": 9 });
  assert.deepEqual(sized.groups[0].items, [
    { main: "media/hero.jpg", members: ["media/hero.jpg", "media/hero-480.webp"], size: 3072, unknown: 0 },
    { main: "media/spare.svg", members: ["media/spare.svg"], size: 300, unknown: 0 },
  ]);
  assert.equal(sized.groups[0].size, 3372);
  assert.equal(sized.size, 3372);
  assert.equal(sized.count, 2);
  assert.equal(groupLine(sized.groups[0]), "2 files · 3 KB");
});

test("the groups screen's title names what all groups free together, counting a file once", () => {
  const sized = sizedSuggestions(suggestions, { "media/hero.jpg": 2048, "media/hero-480.webp": 1024, "media/spare.svg": 300 });
  assert.equal(cleanUpTitle(sized.groups), "Clean up · 3 KB");
  assert.equal(cleanUpTitle([...sized.groups, sized.groups[0]]), "Clean up · 3 KB");
  assert.equal(cleanUpTitle(sizedSuggestions(suggestions, { "media/hero.jpg": 2048 }).groups), "Clean up · at least 2 KB");
  assert.equal(cleanUpTitle(sizedSuggestions(suggestions, {}).groups), "Clean up");
  assert.equal(cleanUpTitle([]), "Clean up");
});

test("unknown sizes are never shown as exact: nothing when none is listed, at least when some are", () => {
  const none = sizedSuggestions(suggestions, {});
  assert.equal(groupLine(none.groups[0]), "2 files");
  assert.equal(itemLine(none.groups[0].items[1]), "No uses found");
  assert.equal(selectionLine(none.groups[0].items, new Set(["media/spare.svg"])), "1 selected");
  // A family whose copy has no listed size.
  const some = sizedSuggestions(suggestions, { "media/hero.jpg": 2048, "media/spare.svg": 300 });
  assert.equal(groupLine(some.groups[0]), "2 files · at least 2 KB");
  assert.equal(itemLine(some.groups[0].items[0]), "at least 2 KB · No uses found · with its 1 copy");
  assert.equal(selectionLine(some.groups[0].items, new Set(["media/spare.svg"])), "1 selected · 300 B");
  assert.equal(bytesText([]), "0 B");
});

test("a reviewed file says what the check found and the copies that go with it", () => {
  assert.equal(itemLine({ main: "media/hero.jpg", members: ["media/hero.jpg", "media/hero-480.webp"], size: 3072, unknown: 0 }), "3 KB · No uses found · with its 1 copy");
  assert.equal(itemLine({ main: "a.jpg", members: ["a.jpg", "a-480.jpg", "a-960.jpg"], size: 10, unknown: 0 }), "10 B · No uses found · with its 2 copies");
  assert.equal(itemLine({ main: "media/spare.svg", members: ["media/spare.svg"], size: 300, unknown: 0 }), "300 B · No uses found");
});

test("the selection sums the chosen families and drops files no longer suggested", () => {
  const items = sizedSuggestions(suggestions, { "media/hero.jpg": 2048, "media/hero-480.webp": 1024, "media/spare.svg": 300 }).groups[0].items;
  assert.equal(selectionLine(items, new Set()), "0 selected · 0 B");
  assert.equal(selectionLine(items, new Set(["media/hero.jpg", "media/gone.png"])), "1 selected · 3 KB");
  assert.deepEqual([...keepSelected(new Set(["media/hero.jpg", "media/gone.png"]), items)], ["media/hero.jpg"]);
});

test("Undo restores each removed family's newest entry, by blob or browser copy", () => {
  const removed: RemovedMedia[] = [
    { path: "media/spare.svg", date: "2026-10-14", sha: "new" },
    { path: "media/hero.jpg", date: "2026-10-14", browserKey: "removed:2026-10-14:abc" },
    { path: "media/spare.svg", date: "2026-10-01", sha: "old" },
    { path: "media/nameless.png", date: "2026-10-14" },
  ];
  assert.deepEqual(undoEntries(removed, ["media/spare.svg", "media/hero.jpg"]), [
    { path: "media/spare.svg", id: "new" }, { path: "media/hero.jpg", id: "removed:2026-10-14:abc" },
  ]);
  // An entry without an identity cannot come back; the caller sends Lex to Recently removed.
  assert.deepEqual(undoEntries(removed, ["media/nameless.png"]), []);
  assert.deepEqual(undoEntries(undefined, ["media/spare.svg"]), []);
});

test("messages after removing and after Undo", () => {
  assert.equal(cleanedMessage(["media/spare.svg"]), "Removed spare.svg. It stays in Recently removed for 30 days.");
  assert.equal(cleanedMessage(["a.png", "b.png"]), "Removed 2 files. They stay in Recently removed for 30 days.");
  assert.equal(undoneMessage(["media/spare.svg"]), "Brought back spare.svg to its address.");
  assert.equal(undoneMessage(["a.png", "b.png"]), "Brought back 2 files to their addresses.");
});
