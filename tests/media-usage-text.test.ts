import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaOtherUseLabel, mediaUsageBadge, mediaUsageFor } from "../src/page-builder/media-usage-text";
import { mediaUsageRecords, type MediaUsageRecord } from "../src/page-builder/media-usage";

const record = (change: Partial<MediaUsageRecord>): MediaUsageRecord => ({ main: "a.png", members: ["a.png"], checked: true, pages: [], otherUses: [], ...change });

test("the badge counts distinct pages, with one page and several worded apart", () => {
  assert.deepEqual(mediaUsageBadge(record({ pages: ["index.html"] })), { state: "used-on-pages", count: "1", label: "Used on 1 page" });
  assert.deepEqual(mediaUsageBadge(record({ pages: ["index.html", "about.html", "work.html"], otherUses: [{ file: "site.css", kind: "stylesheet" }] })),
    { state: "used-on-pages", count: "3", label: "Used on 3 pages" });
});

test("a checked file with no uses is 0 / No uses found; other uses alone are not unused", () => {
  assert.deepEqual(mediaUsageBadge(record({})), { state: "no-uses-found", count: "0", label: "No uses found" });
  assert.deepEqual(mediaUsageBadge(record({ otherUses: [{ file: "feed.xml", kind: "feed" }] })),
    { state: "other-uses-only", count: "0", label: "0 pages · Other uses found" });
});

test("an unfinished check is Not checked yet with a question mark, even when pages were found", () => {
  assert.deepEqual(mediaUsageBadge(record({ checked: false })), { state: "not-checked", count: "?", label: "Not checked yet" });
  assert.deepEqual(mediaUsageBadge(record({ checked: false, pages: ["index.html"] })), { state: "not-checked", count: "?", label: "Not checked yet" });
});

test("no records yet, or a path the check never reached, is Not checked yet; members share their family's record", () => {
  assert.equal(mediaUsageBadge(mediaUsageFor(undefined, "images/new.png")).label, "Not checked yet");
  const records = mediaUsageRecords({
    media: ["images/photo.jpg", "images/photo-480w.webp"],
    sources: { "index.html": '<img srcset="/images/photo-480w.webp 480w">' }, pages: ["index.html"],
  });
  assert.equal(mediaUsageFor(records, "images/photo.jpg"), mediaUsageFor(records, "images/photo-480w.webp"));
  assert.equal(mediaUsageBadge(mediaUsageFor(records, "images/photo.jpg")).label, "Used on 1 page");
  assert.equal(mediaUsageBadge(mediaUsageFor(records, "images/elsewhere.png")).label, "Not checked yet");
});

test("other uses are named in plain words", () => {
  assert.equal(mediaOtherUseLabel("sharing"), "Sharing preview");
  assert.equal(mediaOtherUseLabel("feed"), "Feed or sitemap");
  assert.equal(mediaOtherUseLabel("settings"), "Site settings");
});
