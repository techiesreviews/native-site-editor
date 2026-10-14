import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../shared/media-records";
import { mediaCleanUpSuggestions, type MediaCleanUpSuggestions } from "../src/page-builder/media-clean-up";
import { mediaUsageRecords } from "../src/page-builder/media-usage";

const emptyRecords = () => parseMediaRecords(undefined);
const unusedUsage = (media: string[]) => mediaUsageRecords({ media, sources: { "index.html": "<p>Hello</p>" }, pages: ["index.html"] });
const emptyResult = (state: MediaCleanUpSuggestions["state"], blockedBy: string[] = []): MediaCleanUpSuggestions => ({
  state, blockedBy, groups: [], count: 0, size: 0,
});
const trimmedFrom = { source: "media/source.jpg", trim: { x: 0, y: 0, width: 1, height: 1 } };

test("groups all media kinds in fixed order with sorted items, counts and bytes", () => {
  const usage = unusedUsage([
    "media/z.svg", "media/z-trim.webp", "media/z-960.webp", "media/a-480w.webp",
    "media/a-trim.webp", "downloads/guide.pdf", "media/audio.mp3", "media/video.mp4", "media/custom.bin",
  ]);
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {
    "media/z-trim.webp": { trimmedFrom }, "media/a-trim.webp": { trimmedFrom },
  } }));
  const result = mediaCleanUpSuggestions({ usage, records, sizes: {
    "downloads/guide.pdf": 100, "media/audio.mp3": 200, "media/video.mp4": 300,
    "media/z.svg": 400, "media/z-960.webp": 50, "media/a-trim.webp": 20,
    "media/z-trim.webp": 30, "media/a-480w.webp": 10, "media/custom.bin": undefined,
  } });
  assert.deepEqual(result, {
    state: "ready", blockedBy: [], count: 8, size: 1110,
    groups: [
      { kind: "unused", count: 5, size: 1050, items: [
        { main: "downloads/guide.pdf", members: ["downloads/guide.pdf"], size: 100 },
        { main: "media/audio.mp3", members: ["media/audio.mp3"], size: 200 },
        { main: "media/custom.bin", members: ["media/custom.bin"], size: 0 },
        { main: "media/video.mp4", members: ["media/video.mp4"], size: 300 },
        { main: "media/z.svg", members: ["media/z.svg", "media/z-960.webp"], size: 450 },
      ] },
      { kind: "trimmed", count: 2, size: 50, items: [
        { main: "media/a-trim.webp", members: ["media/a-trim.webp"], size: 20 },
        { main: "media/z-trim.webp", members: ["media/z-trim.webp"], size: 30 },
      ] },
      { kind: "leftover", count: 1, size: 10, items: [
        { main: "media/a-480w.webp", members: ["media/a-480w.webp"], size: 10 },
      ] },
    ],
  });
});

test("an unused image family includes copies and retained original as one item", () => {
  const members = ["media/photo.jpg", "media/photo-480w.webp", "media/photo-960.webp", "media/originals/photo.heic"];
  const usage = unusedUsage(members);
  const before = structuredClone(usage);
  const result = mediaCleanUpSuggestions({ usage, records: emptyRecords(), sizes: {
    [members[0]]: 100, [members[1]]: 20, [members[2]]: 40, [members[3]]: 1000,
  } });
  assert.deepEqual(result, {
    state: "ready", blockedBy: [], count: 1, size: 1160,
    groups: [{ kind: "unused", count: 1, size: 1160, items: [{ main: members[0], members, size: 1160 }] }],
  });
  assert.deepEqual(usage, before);
  result.groups[0].items[0].members.push("changed.jpg");
  assert.deepEqual(usage, before);
});

test("any family member used on a page, in CSS or in another text file protects the whole family", () => {
  for (const member of ["media/photo.jpg", "media/photo-480w.webp", "media/originals/photo.heic"]) {
    for (const sources of [
      { "index.html": `<img src="/${member}">` },
      { "styles/site.css": `.hero{background:url(/${member})}` },
      { "sitemap.xml": `<url><loc>/${member}</loc></url>` },
    ]) {
      const usage = mediaUsageRecords({
        media: ["media/photo.jpg", "media/photo-480w.webp", "media/photo-960.webp", "media/originals/photo.heic"],
        sources, pages: [],
      });
      // Only the HTML case needs to be treated as a page; the others are other uses.
      if (Object.hasOwn(sources, "index.html")) {
        const pageUsage = mediaUsageRecords({ media: usage.families[0].members, sources, pages: ["index.html"] });
        assert.deepEqual(mediaCleanUpSuggestions({ usage: pageUsage, records: emptyRecords() }), emptyResult("ready"));
      }
      assert.deepEqual(mediaCleanUpSuggestions({ usage, records: emptyRecords() }), emptyResult("ready"));
    }
  }
});

test("Always keep on the main, a responsive copy or retained original excludes its family", () => {
  const members = ["media/photo.jpg", "media/photo-480w.webp", "media/originals/photo.heic"];
  for (const path of members) {
    const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: { [path]: { alwaysKeep: true } } }));
    assert.deepEqual(mediaCleanUpSuggestions({ usage: unusedUsage(members), records }), emptyResult("ready"));
  }
});

test("no completed check and pending text return no suggestions", () => {
  assert.deepEqual(mediaCleanUpSuggestions({ usage: undefined, records: emptyRecords() }), emptyResult("not-checked"));
  const usage = mediaUsageRecords({ media: ["unused.png"], files: ["app.js"], sources: {}, pages: [] });
  assert.deepEqual(usage.pending, ["app.js"]);
  assert.deepEqual(mediaCleanUpSuggestions({ usage, records: emptyRecords() }), emptyResult("not-checked"));
});

test("an individually unchecked family is never suggested", () => {
  const usage = unusedUsage(["unchecked.jpg", "checked.jpg"]);
  usage.families[0].checked = false;
  const result = mediaCleanUpSuggestions({ usage, records: emptyRecords() });
  assert.equal(result.state, "ready");
  assert.equal(result.count, 1);
  assert.deepEqual(result.groups[0].items, [{ main: "checked.jpg", members: ["checked.jpg"], size: 0 }]);
});

test("unreadable files block everything, including while other files are pending", () => {
  for (const files of [[], ["pending.js"]]) {
    const usage = mediaUsageRecords({ media: ["unused.png"], files, sources: { "broken.css": undefined }, pages: [] });
    assert.deepEqual(usage.pending, files);
    assert.deepEqual(mediaCleanUpSuggestions({ usage, records: emptyRecords() }), emptyResult("blocked", ["broken.css"]));
    assert.deepEqual(mediaCleanUpSuggestions({ usage, records: null }), emptyResult("blocked", ["broken.css"]));
  }
});

test("unreadable media records block suggestions even before the usage check finishes", () => {
  for (const usage of [unusedUsage(["unused.png"]), undefined,
    mediaUsageRecords({ media: ["unused.png"], files: ["pending.js"], sources: {}, pages: [] })]) {
    assert.deepEqual(mediaCleanUpSuggestions({ usage, records: null }), emptyResult("blocked", [MEDIA_RECORDS_PATH]));
  }
});

test("orphan responsive copies are leftovers; conflict numbers, dates and non-images are unused", () => {
  const result = mediaCleanUpSuggestions({
    usage: unusedUsage(["photo-480w.webp", "other-960.webp", "photo-2.webp", "report-2024.png", "wide-1234w.webp", "docs/guide-480.pdf"]),
    records: emptyRecords(),
  });
  assert.deepEqual(result.groups.map(group => ({ kind: group.kind, mains: group.items.map(item => item.main), count: group.count, size: group.size })), [
    { kind: "unused", mains: ["docs/guide-480.pdf", "photo-2.webp", "report-2024.png"], count: 3, size: 0 },
    { kind: "leftover", mains: ["other-960.webp", "photo-480w.webp", "wide-1234w.webp"], count: 3, size: 0 },
  ]);
  assert.equal(result.count, 6);
  assert.equal(result.size, 0);
});

test("orphan kept originals are excluded, even with copy names or trim records", () => {
  const media = ["media/originals/photo.heic", "media/originals/photo-480w.webp", "MEDIA/ORIGINALS/other-960.webp"];
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {
    [media[1]]: { trimmedFrom },
  } }));
  assert.deepEqual(mediaCleanUpSuggestions({ usage: unusedUsage(media), records }), emptyResult("ready"));
  assert.deepEqual(mediaCleanUpSuggestions({ usage: unusedUsage([]), records }), emptyResult("ready"));
});

test("a Trimmed copy takes precedence over its responsive-looking name", () => {
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: { "trim-480w.webp": { trimmedFrom } } }));
  const result = mediaCleanUpSuggestions({ usage: unusedUsage(["trim-480w.webp"]), records });
  assert.equal(result.groups[0].kind, "trimmed");
  assert.equal(result.count, 1);
});
