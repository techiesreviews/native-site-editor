import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftStore, type SavedDraft } from "../src/drafts";
import { discardUploadDraft, recordsAfterDiscard } from "../src/page-builder/media-upload-discard";
import { parseMediaRecords, serializeMediaRecords } from "../shared/media-records";

test("discard drops all per-file fields, keeps other files and collection definitions", () => {
  const original = '{"version":2,"collections":["Work"],"files":{"saved.png":{"alwaysKeep":true}}}';
  const records = parseMediaRecords(original);
  records.files["new.png"] = { added: "2026-10-15T00:00:00Z", collections: ["Work"], description: { text: "Draft" }, duration: 1.6 };
  assert.equal(recordsAfterDiscard(serializeMediaRecords(records), original, ["new.png"]), original);
  records.files["other.png"] = { alwaysKeep: true };
  const next = parseMediaRecords(recordsAfterDiscard(serializeMediaRecords(records), original, ["new.png"]));
  assert.equal(next.files["new.png"], undefined);
  assert.deepEqual(next.files["other.png"], { alwaysKeep: true });
  assert.deepEqual(next.collections, ["Work"]);
});

test("discarding the only upload leaves no new records draft", () => {
  assert.equal(recordsAfterDiscard(serializeMediaRecords({ version: 2, collections: [], files: { "new.svg": { added: "today" } } }), "", ["new.svg"]), "");
});


function drafts() {
  const data = new Map<string, string>();
  return new DraftStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); }, key: index => [...data.keys()][index] ?? null, get length() { return data.size; } });
}
const upload = { version: 1, account: "lex", repoId: 1, repo: "lex/site", branch: "main", path: "new.png", baseSha: null,
  original: "", content: "", updatedAt: 1, opaque: true, sourceSha: "a".repeat(40), upload: { size: 1, type: "image/png" } } satisfies SavedDraft;

test("discard removes the upload and its only records draft; a saved records file becomes clean", () => {
  for (const original of ["", '{"version":2,"collections":[],"files":{}}']) {
    const store = drafts(); store.save(upload);
    store.save({ ...upload, opaque: undefined, sourceSha: undefined, upload: undefined, path: ".editor/media.json",
      original, baseSha: original ? "b".repeat(40) : null,
      content: serializeMediaRecords({ version: 2, collections: [], files: { "new.png": { added: "today" } } }) });
    assert.equal(discardUploadDraft(store, upload, "new.png"), true);
    assert.deepEqual(store.list(upload), []);
  }
});

test("discard keeps unrelated records edits and refuses uploads that replace saved files", () => {
  const store = drafts(); store.save(upload);
  store.save({ ...upload, opaque: undefined, sourceSha: undefined, upload: undefined, path: ".editor/media.json",
    content: serializeMediaRecords({ version: 2, collections: ["Work"], files: { "new.png": { added: "today" }, "other.png": { alwaysKeep: true } } }) });
  assert.equal(discardUploadDraft(store, upload, "new.png"), true);
  const records = parseMediaRecords(store.get(upload, ".editor/media.json")?.content);
  assert.deepEqual(Object.keys(records.files), ["other.png"]);
  store.save({ ...upload, baseSha: "b".repeat(40) });
  assert.equal(discardUploadDraft(store, upload, "new.png"), false);
  assert.ok(store.get(upload, "new.png"));
});
