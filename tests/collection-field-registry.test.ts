import assert from "node:assert/strict";
import test from "node:test";
import { planBake, applyCollectionEdits } from "../src/page-builder/collection-bake";
import { readCollections, collectionRecords, makeGridCollection } from "../src/page-builder/collection-model";
import { planNativeCollectionOperation } from "../src/page-builder/native-collection-host";
import { deriveNativeRoutes } from "../shared/native-routes";

const page = (title: string, body = "", fields = "") => `<html><head><title>${title}</title>${fields}</head><body>${body}</body></html>`;
const grid = (fields: string, extra = "") => `<div data-each="/work/" data-fields="${fields}" ${extra}><template><a href="{url}">{title}</a><p data-if="note">{note}</p></template></div>`;
const identity = { name: "Studio" };
const sources = () => ({
  "index.html": page("Home", grid("note")),
  "work/a/index.html": page("A", "", '<meta name="field:note" content="Original note">'),
  "work/b/index.html": page("B"),
});
function bake(input: Record<string, string>) {
  const result = planBake(input, deriveNativeRoutes(Object.keys(input)), identity);
  if ("error" in result) assert.fail(result.error);
  return Object.fromEntries(Object.entries(input).map(([path, text]) => [path, applyCollectionEdits(text, result.edits[path] ?? [])]));
}

test("deleting the last page supplying a declared field rebakes survivors in one native plan", () => {
  const before = bake(sources());
  const files = Object.keys(before);
  const result = planNativeCollectionOperation({ sources: before, files, routes: deriveNativeRoutes(files), identity, revision: "r1",
    origin: { deletes: ["work/a/index.html"], done: "Deleted page", undone: "Restored page" } });
  if ("error" in result) assert.fail(result.error);
  const home = result.operation.edits?.get("index.html");
  assert.ok(home);
  assert.ok(home.includes('href="/work/b/"'));
  assert.ok(!home.includes('href="/work/a/"'));
  assert.ok(!home.includes("Original note"));
  assert.deepEqual(result.operation.deletes, ["work/a/index.html"]);
  assert.equal(result.operation.expectedSources?.get("index.html"), before["index.html"]);
});

test("declared missing fields remain valid for empty filters and stable sorting", () => {
  const input = { "index.html": page("Home", grid("note", 'data-sort="note" data-filter="note="')), "work/b/index.html": page("B") };
  const result = bake(input);
  assert.ok(result["index.html"].includes('href="/work/b/"'));
  const collection = readCollections(input["index.html"])[0];
  assert.equal(collectionRecords(input, deriveNativeRoutes(Object.keys(input)), identity, collection.spec, "index.html", collection.fields).length, 1);
});

test("a declaration in another grid does not hide a misspelled field", () => {
  const input = { "index.html": page("Home", grid("note") + '<div data-each="/work/"><template><b>{note}</b></template></div>'), "work/b/index.html": page("B") };
  const result = planBake(input, deriveNativeRoutes(Object.keys(input)), identity);
  assert.ok("error" in result);
  assert.match(result.error, /Unknown collection field: note/);
  const misspelled = { "index.html": page("Home", grid("note").replace("{note}", "{notte}")), "work/b/index.html": page("B") };
  const typo = planBake(misspelled, deriveNativeRoutes(Object.keys(misspelled)), identity);
  assert.ok("error" in typo);
  assert.match(typo.error, /Unknown collection field: notte/);
});

test("declarations validate names, deduplicate and survive collection edits", () => {
  assert.deepEqual(readCollections(page("Home", grid("note note")))[0].fields, ["note"]);
  for (const fields of ["!note", "note=value", "note\u00a0date", "Note"]) assert.throws(() => readCollections(page("Home", grid(fields))), /space-separated field names/);
  const empty = bake({ "index.html": page("Home", grid("note")) });
  assert.ok(empty["index.html"].includes('data-fields="note"'));
  const original = empty["index.html"], collection = readCollections(original)[0];
  const edited = makeGridCollection(original, collection.element.start, { folder: "/work/", limit: "1", template: "<a>{title}</a>" });
  assert.deepEqual(readCollections(edited)[0].fields, ["note"]);
});
