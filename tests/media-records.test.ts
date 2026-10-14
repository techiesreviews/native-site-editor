import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords, renameMediaRecord, removeMediaRecords, setMediaCollections, setMediaDescription } from "../shared/media-records";
import { applyMediaMetadata, cleanMediaTags, mediaMetadataView } from "../src/page-builder/media-metadata";
import { createMediaWorkspace, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";

const source = {
  version: 2, collections: ["First", "Second"],
  files: {
    "z.png": { collections: ["First", "Second"], description: { text: "A picture", byAgent: true }, decorative: true, alwaysKeep: true,
      trimmedFrom: { source: "a.png", trim: { x: 1, y: 2, width: 300, height: 200, turn: 90, straighten: -2.5, flipX: true, flipY: true, future: { mode: "crop" } } },
      still: "a.png", subtitles: "captions.vtt", credit: { name: "Artist" } },
    "a.png": { description: { text: "Source" } },
  },
  onlineVideos: [{ service: "youtube", id: "abc", title: "Film", still: "a.png", future: [1, 2] }, { service: "vimeo", id: "123" }],
  removed: [{ path: "gone.png", date: "2026-10-14", sha: "blob", family: [{ path: "gone-480.png", sha: "small" }], record: { description: { text: "Gone", byAgent: true }, alwaysKeep: true } },
    { path: "local.mp4", date: "2026-10-13", browserKey: "local", family: [{ path: "local.webp", browserKey: "still" }] }],
  adding: { image: "smallest", video: "smaller", audio: "speech", keepOriginal: true },
  future: { nested: [null, false, { "key": "value" }] },
};

test("every media field and unknown keys survive a stable round trip", () => {
  const records = parseMediaRecords(JSON.stringify(source));
  const written = serializeMediaRecords(records);
  assert.deepEqual(parseMediaRecords(written), records);
  assert.equal(serializeMediaRecords(parseMediaRecords(written)), written);
  assert.ok(written.endsWith("\n"));
  assert.ok(written.includes('\n  "version": 2,'));
  assert.deepEqual(Object.keys(JSON.parse(written)), ["version", "collections", "files", "onlineVideos", "removed", "adding", "future"]);
  assert.deepEqual(Object.keys(JSON.parse(written).files), ["a.png", "z.png"]);
  assert.deepEqual(records.files["z.png"].trimmedFrom?.trim.future, { mode: "crop" });
  assert.deepEqual(records.onlineVideos?.[0].future, [1, 2]);
  assert.deepEqual(records.future, source.future);
  assert.deepEqual(records.files["z.png"].credit, { name: "Artist" });
  for (const turn of [0, 90, 180, 270]) {
    const next = parseMediaRecords(JSON.stringify({ ...source, files: { crop: { trimmedFrom: { source: "a", trim: { x: 0, y: 0, width: 1, height: 1, turn } } } } }));
    assert.deepEqual(parseMediaRecords(serializeMediaRecords(next)), next);
  }
});

test("legacy tags and alt migrate, retaining unknown file keys and empty alt as undescribed", () => {
  const records = parseMediaRecords('{"images/a.png":{"alt":"Old","tags":[" hero ","hero","z",""],"credit":"Artist"},"images/b.png":{"alt":"","tags":["a"]}}');
  assert.deepEqual(records.collections, ["a", "hero", "z"]);
  assert.deepEqual(records.files["images/a.png"], { credit: "Artist", collections: ["hero", "z"], description: { text: "Old" } });
  assert.deepEqual(records.files["images/b.png"], { collections: ["a"] });
  assert.equal(records.files["images/b.png"].decorative, undefined);
  const next = applyMediaMetadata(records, { "images/a.png": { alt: "New", tags: ["z", "a", "z"] } });
  assert.equal(next.files["images/a.png"].credit, "Artist");
  assert.deepEqual(mediaMetadataView(next)["images/a.png"], { tags: ["a", "z"], alt: "New" });
  assert.equal(applyMediaMetadata(next, { "images/a.png": null }).files["images/a.png"], undefined);
  assert.deepEqual(cleanMediaTags(["a", " a ", ""]), ["a"]);
  assert.equal(records.files["images/a.png"].description?.text, "Old");
});

test("collections normalize leniently; empty optional fields and false marks disappear", () => {
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [" z ", "z", "", "b"], files: {
    a: { collections: [" y ", "a", "a"], description: { text: "", byAgent: false }, decorative: false, alwaysKeep: false, still: "", subtitles: "" },
    b: { collections: [] },
  }, onlineVideos: [], removed: [], adding: { keepOriginal: false } }));
  assert.deepEqual(records.collections, ["z", "b", "a", "y"]);
  assert.deepEqual(records.files.a, { collections: ["a", "y"] });
  assert.deepEqual(records.files.b, {});
  assert.deepEqual(Object.keys(records), ["version", "collections", "files"]);
  assert.deepEqual(parseMediaRecords(undefined), parseMediaRecords("{}"));
  const videos = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {}, onlineVideos: [
    { service: "youtube", id: "a", title: "", still: "" }, { service: "youtube", id: "a", title: "Duplicate" }, { service: "vimeo", id: "a" },
  ] }));
  assert.deepEqual(videos.onlineVideos, [{ service: "youtube", id: "a" }, { service: "vimeo", id: "a" }]);
});

test("all adding presets round trip", () => {
  for (const image of ["smaller", "balanced", "higher", "smallest"]) for (const video of ["smaller", "balanced", "higher"]) for (const audio of ["balanced", "higher", "speech"]) {
    const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {}, adding: { image, video, audio } }));
    assert.deepEqual(parseMediaRecords(serializeMediaRecords(records)), records);
  }
});

test("rename moves records and all active references immutably, even without a source record", () => {
  const records = parseMediaRecords(JSON.stringify(source)), before = serializeMediaRecords(records);
  const moved = renameMediaRecord(records, "a.png", "new.png");
  assert.equal(moved.files["a.png"], undefined);
  assert.deepEqual(moved.files["new.png"], records.files["a.png"]);
  assert.equal(moved.files["z.png"].trimmedFrom?.source, "new.png");
  assert.equal(moved.files["z.png"].still, "new.png");
  assert.equal(moved.onlineVideos?.[0].still, "new.png");
  assert.equal(renameMediaRecord(records, "captions.vtt", "new.vtt").files["z.png"].subtitles, "new.vtt");
  const stale = renameMediaRecord(records, "a.png", "z.png");
  assert.deepEqual(stale.files["z.png"], records.files["a.png"]);
  assert.equal(renameMediaRecord(records, "absent", "z.png").files["z.png"], undefined);
  assert.equal(renameMediaRecord(records, "absent", "unused"), records);
  assert.equal(renameMediaRecord(records, "a.png", "a.png"), records);
  assert.equal(serializeMediaRecords(records), before);
  assert.deepEqual(moved.removed, records.removed);
});

test("remove deletes only requested records and leaves restoration history and collections alone", () => {
  const records = parseMediaRecords(JSON.stringify(source));
  const next = removeMediaRecords(records, ["a.png", "missing", "a.png"]);
  assert.equal(next.files["a.png"], undefined);
  assert.deepEqual(next.files["z.png"], records.files["z.png"]);
  assert.deepEqual(next.removed, records.removed);
  assert.deepEqual(next.collections, records.collections);
  assert.ok(records.files["a.png"]);
  assert.equal(removeMediaRecords(records, ["missing"]), records);
});

test("description edits clear agent marks, preserve other fields and remove empty descriptions", () => {
  const records = parseMediaRecords(JSON.stringify(source));
  const next = setMediaDescription(records, "z.png", "Lex's words");
  assert.deepEqual(next.files["z.png"].description, { text: "Lex's words" });
  assert.equal(next.files["z.png"].alwaysKeep, true);
  assert.deepEqual(records.files["z.png"].description, { text: "A picture", byAgent: true });
  assert.deepEqual(setMediaDescription(records, "a.png", "Agent's words", true).files["a.png"].description, { text: "Agent's words", byAgent: true });
  assert.equal(setMediaDescription(records, "z.png", "").files["z.png"].description, undefined);
  const tagged = setMediaCollections(records, "z.png", [" new ", "First", "new"]);
  assert.deepEqual(tagged.files["z.png"].collections, ["First", "new"]);
  assert.deepEqual(tagged.collections, ["First", "Second", "new"]);
  assert.equal(setMediaCollections(records, "z.png", []).files["z.png"].collections, undefined);
  assert.equal(applyMediaMetadata(records, { "z.png": { tags: ["First"] } }).files["z.png"].description?.byAgent, true);
  const view = mediaMetadataView(records); view["z.png"].tags.push("view only");
  assert.deepEqual(records.files["z.png"].collections, ["First", "Second"]);
});

test("malformed and wrong types name their fields; newer versions fail closed", () => {
  for (const invalid of ["null", "[]", "bad"]) assert.throws(() => parseMediaRecords(invalid), /\.editor\/media\.json/);
  for (const [input, error] of [['{"a":2}', /Invalid image metadata for a/], ['{"a":{"tags":[2]}}', /Invalid tags for a/], ['{"a":{"alt":2}}', /Invalid alt text for a/]] as const) assert.throws(() => parseMediaRecords(input), error);
  assert.throws(() => parseMediaRecords('{"version":3}'), /written by a newer editor/);
  const wrong: [object, string][] = [
    [{ version: "2" }, "version"], [{ collections: "a" }, "collections"], [{ collections: [2] }, "collections"], [{ files: [] }, "files"],
    [{ files: { a: null } }, "files[a]"], [{ files: { a: { collections: [2] } } }, "collections"],
    [{ files: { a: { description: "text" } } }, "description"], [{ files: { a: { description: { text: 2 } } } }, "description.text"],
    [{ files: { a: { description: { text: "A", byAgent: 1 } } } }, "byAgent"], [{ files: { a: { decorative: 1 } } }, "decorative"],
    [{ files: { a: { alwaysKeep: "yes" } } }, "alwaysKeep"], [{ files: { a: { still: 2 } } }, "still"], [{ files: { a: { subtitles: [] } } }, "subtitles"],
    [{ files: { a: { trimmedFrom: { source: 2, trim: {} } } } }, "source"], [{ files: { a: { trimmedFrom: { source: "a", trim: {} } } } }, "trim.x"],
    [{ files: { a: { trimmedFrom: { source: "a", trim: { x: 0, y: 0, width: 1, height: 1, turn: 45 } } } } }, "turn"],
    [{ files: { a: { trimmedFrom: { source: "a", trim: { x: 0, y: 0, width: 1, height: 1, flipX: 1 } } } } }, "flipX"],
    [{ onlineVideos: {} }, "onlineVideos"], [{ onlineVideos: [{ service: "other", id: "a" }] }, "service"], [{ onlineVideos: [{ service: "vimeo", id: 2 }] }, "id"],
    [{ removed: [{ path: "a", date: "2026-10-14" }] }, "sha or browserKey"], [{ removed: [{ path: "a", date: "2026-10-14", sha: "a", browserKey: "b" }] }, "sha or browserKey"],
    [{ removed: [{ path: "a", date: "2026-02-30", sha: "a" }] }, "date"], [{ removed: [{ path: "a", date: "2026-10-14", sha: "a", family: [{ path: "b" }] }] }, "family[0]"],
    [{ adding: { image: "speech" } }, "adding.image"], [{ adding: { video: "smallest" } }, "adding.video"], [{ adding: { audio: "smaller" } }, "adding.audio"], [{ adding: { keepOriginal: 1 } }, "keepOriginal"],
  ];
  for (const [fields, field] of wrong) assert.throws(() => parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {}, ...fields })), error => error instanceof Error && error.message.includes(MEDIA_RECORDS_PATH) && error.message.includes(field));
});

test("__proto__ path keys stay safe through migration, adapters, setters, rename and round trip", () => {
  const records = parseMediaRecords('{"__proto__":{"alt":"literal","tags":["a"]}}');
  assert.equal(Object.getPrototypeOf(records.files), null);
  assert.equal(records.files.__proto__.description?.text, "literal");
  const changes = Object.fromEntries([["__proto__", { alt: "edited", tags: ["b"] }]]);
  const next = applyMediaMetadata(records, changes);
  assert.equal(mediaMetadataView(next).__proto__.alt, "edited");
  assert.equal(Object.getPrototypeOf(next.files), null);
  assert.deepEqual(parseMediaRecords(serializeMediaRecords(next)), next);
  const moved = renameMediaRecord(next, "__proto__", "constructor");
  assert.equal(moved.files.constructor.description?.text, "edited");
  assert.equal(removeMediaRecords(moved, ["constructor"]).files.constructor, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(serializeMediaRecords(next)).files, "__proto__"), true);
});

test("workspace leaves unchanged legacy metadata untouched, including batches changing other files", async () => {
  const legacy = '{"images/a.png":{"tags":[" hero ","hero"],"alt":"Old","credit":"Artist"}}';
  const text = new Map([[MEDIA_RECORDS_PATH, legacy], ["index.html", '<img src="/images/a.png">']]);
  let batches = 0;
  const context: MediaWorkspaceContext = {
    key: "site", scope: { account: "a", repoId: 1, repo: "a/r", branch: "main" },
    drafts: { get: () => undefined, save: () => false, remove: () => false },
    paths: [MEDIA_RECORDS_PATH, "index.html", "images/a.png"], items: [{ path: "images/a.png" }], pages: ["index.html"], components: {},
    assertLive() {}, read: async path => text.get(path), blob: async () => new Blob(), assetVersion: () => "sha",
    openPage: async () => {},
    async applyBatch(batch) {
      batches++;
      assert.equal(batch.expectedSources.get(MEDIA_RECORDS_PATH), legacy);
      assert.equal(batch.edits.has(MEDIA_RECORDS_PATH), false);
      for (const [path, value] of batch.edits) text.set(path, value);
    },
  };
  const host = createMediaWorkspace(async () => context);
  assert.deepEqual((await host.load()).metadata["images/a.png"], { tags: ["hero"], alt: "Old" });
  await host.metadata({ "images/a.png": { tags: ["hero"], alt: "Old" } });
  assert.equal(batches, 0);
  // Replacing a.png rewrites the page reference and changes no records.
  await host.import([{ file: new File(["new"], "new.png"), result: { outputs: [{ blob: new Blob(["new"]), extension: "png" }], before: 3, after: 3 }, folder: "images", replaceFrom: "images/a.png", expectedAssetVersion: "sha" }]);
  assert.equal(batches, 1);
  assert.equal(text.get(MEDIA_RECORDS_PATH), legacy);
  assert.ok(text.get("index.html")?.includes("/images/new.png"));
  text.set(MEDIA_RECORDS_PATH, "bad");
  await assert.rejects(host.metadata({ "images/a.png": { alt: "Changed" } }), /media.json.*malformed/);
  assert.equal(text.get(MEDIA_RECORDS_PATH), "bad");
  assert.equal(batches, 1);
});
test("the panel's tags-and-alt save writes only changed fields, so an unchanged description keeps its by-agent mark", () => {
  const records = parseMediaRecords(JSON.stringify(source));
  const tagsOnly = applyMediaMetadata(records, { "z.png": { alt: "A picture", tags: ["First", "Third"] } });
  assert.deepEqual(tagsOnly.files["z.png"].description, { text: "A picture", byAgent: true });
  assert.deepEqual(tagsOnly.files["z.png"].collections, ["First", "Third"]);
  assert.equal(applyMediaMetadata(records, { "z.png": { alt: "A picture", tags: ["Second", "First"] } }), records);
  assert.deepEqual(applyMediaMetadata(records, { "z.png": { alt: "Edited" } }).files["z.png"].description, { text: "Edited" });
});
test("migrated old entries are validated as new fields, so a written file always reads back", () => {
  assert.throws(() => parseMediaRecords('{"a.png":{"alt":"x","decorative":"yes"}}'), /decorative/);
});
test("an empty description with unknown keys survives a round trip and unrelated edits", () => {
  const records = parseMediaRecords('{"version":2,"collections":[],"files":{"a.png":{"description":{"text":"","future":"must survive"}}}}');
  assert.deepEqual(parseMediaRecords(serializeMediaRecords(records)).files["a.png"].description, { text: "", future: "must survive" });
  const tagged = applyMediaMetadata(records, { "a.png": { alt: "", tags: ["Hero"] } });
  assert.deepEqual(tagged.files["a.png"].description, { text: "", future: "must survive" });
  assert.deepEqual(setMediaDescription(records, "a.png", "").files["a.png"].description, { text: "", future: "must survive" });
  assert.equal(parseMediaRecords('{"version":2,"collections":[],"files":{"a.png":{"description":{"text":""}}}}').files["a.png"].description, undefined);
});
