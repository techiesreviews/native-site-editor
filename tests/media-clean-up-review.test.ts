import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMediaRecords, type RemovedMedia } from "../shared/media-records";
import { mediaCleanUpSuggestions } from "../src/page-builder/media-clean-up";
import {
  cleanedMessage, cleanUpScope, groupLine, itemLine, keepSelected, selectionLine, sizedSuggestions, undoEntries, undoneMessage,
} from "../src/page-builder/media-clean-up-review";
import { mediaUsageRecords, type MediaUsageRecords } from "../src/page-builder/media-usage";

const usage = mediaUsageRecords({
  media: ["media/hero.jpg", "media/hero-480.webp", "media/spare.svg", "media/used.png", "media/styled.png"],
  sources: { "index.html": '<img src="/media/used.png">', "site.css": "body { background: url(/media/styled.png) }" },
  pages: ["index.html"],
});
const suggestions = mediaCleanUpSuggestions({ usage, records: parseMediaRecords(undefined) });

test("sizes come from the library: a family's copies count with its main, groups and the total follow", () => {
  const sized = sizedSuggestions(suggestions, { "media/hero.jpg": 2048, "media/hero-480.webp": 1024, "media/spare.svg": 300, "media/used.png": 9 });
  assert.deepEqual(sized.groups[0].items, [
    { main: "media/hero.jpg", members: ["media/hero.jpg", "media/hero-480.webp"], size: 3072 },
    { main: "media/spare.svg", members: ["media/spare.svg"], size: 300 },
  ]);
  assert.equal(sized.groups[0].size, 3372);
  assert.equal(sized.size, 3372);
  assert.equal(sized.count, 2);
  assert.equal(groupLine(sized.groups[0]), "2 files · 3 KB");
  assert.equal(groupLine({ count: 1, size: 300 }), "1 file · 300 B");
  // Unknown sizes count nothing rather than guessing.
  assert.equal(sizedSuggestions(suggestions, {}).size, 0);
});

test("a reviewed file says what the check found and the copies that go with it", () => {
  assert.equal(itemLine({ main: "media/hero.jpg", members: ["media/hero.jpg", "media/hero-480.webp"], size: 3072 }), "3 KB · No uses found · with its 1 copy");
  assert.equal(itemLine({ main: "a.jpg", members: ["a.jpg", "a-480.jpg", "a-960.jpg"], size: 10 }), "10 B · No uses found · with its 2 copies");
  assert.equal(itemLine({ main: "media/spare.svg", members: ["media/spare.svg"], size: 300 }), "300 B · No uses found");
});

test("the scope keeps checked, other-use, not-checked and Always keep files apart", () => {
  const scope = cleanUpScope(usage, 0);
  assert.deepEqual({ checked: scope.checked, otherUses: scope.otherUses, notChecked: scope.notChecked }, { checked: 4, otherUses: 1, notChecked: 0 });
  assert.deepEqual(scope.lines, [
    "Checked 4 files against every page, style, script, feed, data and notes file on the site.",
    "1 file only other site files use is kept out of Clean up.",
  ]);
  const partly: MediaUsageRecords = { ...usage, families: [...usage.families, { main: "media/new.png", members: ["media/new.png"], checked: false, pages: [], otherUses: [] }] };
  assert.deepEqual(cleanUpScope(partly, 2).lines.slice(1), [
    "1 file only other site files use is kept out of Clean up.",
    "1 file not checked yet is never suggested.",
    "2 files marked Always keep are never suggested.",
  ]);
  assert.deepEqual(cleanUpScope(undefined, 0).lines, ["Checked 0 files against every page, style, script, feed, data and notes file on the site."]);
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
