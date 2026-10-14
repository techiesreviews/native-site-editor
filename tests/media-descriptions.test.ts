import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMediaRecords, serializeMediaRecords, renameMediaRecord, setMediaDescription } from "../shared/media-records";
import { fileDescriptionState, placeDescriptionState, newPlaceAlt, descriptionPlaceEdits, setMediaFileDecorative, setMediaPlaceDecorative, setMediaPlaceByAgent, confirmMediaDescription } from "../src/page-builder/media-descriptions";

const file = "images/a.png", page = "news/index.html";
const empty = () => parseMediaRecords(undefined);
const described = () => setMediaDescription(empty(), file, "Old & familiar");
const before = { text: "Old & familiar", decorative: false };
const after = { text: 'New & "bright" <view>', decorative: false };

test("file description flows to new places; Decorative gives empty alt; missing allows filename fallback", () => {
  assert.equal(newPlaceAlt(empty(), file), undefined);
  assert.deepEqual(fileDescriptionState(), { state: "missing", text: "", byAgent: false });
  const records = described();
  assert.equal(newPlaceAlt(records, file), before.text);
  assert.deepEqual(placeDescriptionState(records, file, page, before.text), { state: "described", own: false, byAgent: false });
  assert.equal(placeDescriptionState(records, file, page, "My words").own, true);
  assert.equal(newPlaceAlt(setMediaFileDecorative(records, file, true), file), "");
});

test("description changes rewrite shared, missing and old empty alts, preserving own words and unrelated source", () => {
  const records = described();
  const source = `<!-- <img src="/images/a.png"> --><script>"<img src='/images/a.png'>"</script><p data-note='alt="untouched"'>
<img class="photo" src="../images/a.png?x=1&amp;y=2" alt='Old &amp; familiar' title="keep">
<img src="/images/a.png"><img src="/images/a.png" alt=""><img src="/images/a.png" alt="My words">
<img src="/images/other.png" alt="Old &amp; familiar"><source src="/images/a.png"></p>`;
  const next = descriptionPlaceEdits(records, file, page, source, before, after);
  assert.equal((next.match(/alt="New &amp; &quot;bright&quot; &lt;view&gt;"/g) ?? []).length, 3);
  assert.ok(next.includes('class="photo"')); assert.ok(next.includes('title="keep"'));
  assert.ok(next.includes('alt="My words"')); assert.ok(next.includes('<img src="/images/other.png" alt="Old &amp; familiar">'));
  assert.ok(next.includes('<!-- <img src="/images/a.png"> -->'));
  assert.ok(next.includes('<source src="/images/a.png">'));
  assert.equal(descriptionPlaceEdits(records, file, "site.css", source, before, after), source);
  assert.equal(descriptionPlaceEdits(records, file, page, source, before, before), source);
});

test("Decorative places keep empty alt during description changes; a nonempty alt still uses its description", () => {
  const records = setMediaPlaceDecorative(described(), file, page, true);
  const source = '<img src="/images/a.png" alt=""><img src="/images/a.png" alt="Old &amp; familiar">';
  const next = descriptionPlaceEdits(records, file, page, source, before, after);
  assert.ok(next.startsWith('<img src="/images/a.png" alt="">'));
  assert.ok(next.endsWith('alt="New &amp; &quot;bright&quot; &lt;view&gt;">'));
  assert.equal(placeDescriptionState(records, file, page, "").state, "decorative");
  assert.equal(placeDescriptionState(records, file, page, undefined).state, "missing");
});

test("file Decorative clears description and shared/missing alts; unmark leaves page text alone", () => {
  const records = described(), next = setMediaFileDecorative(records, file, true);
  assert.equal(next.files[file].description, undefined);
  assert.equal(next.files[file].decorative, true);
  assert.equal(setMediaFileDecorative(next, file, true), next);
  const source = '<img src="/images/a.png" alt="Old &amp; familiar"><img src="/images/a.png"><img src="/images/a.png" alt="My words">';
  const result = descriptionPlaceEdits(records, file, page, source, before, { text: "", decorative: true });
  assert.equal(result, '<img src="/images/a.png" alt=""><img alt="" src="/images/a.png"><img src="/images/a.png" alt="My words">');
  assert.equal(descriptionPlaceEdits(next, file, page, result, { text: "", decorative: true }, { text: "", decorative: false }), result);
  const unmarked = setMediaFileDecorative(next, file, false);
  assert.equal(placeDescriptionState(unmarked, file, page, "").state, "missing");
  assert.equal(setMediaDescription(next, file, "New words").files[file].decorative, undefined);
});

test("describing a Decorative file fills its empty places, except places marked Decorative", () => {
  const records = setMediaPlaceDecorative(setMediaFileDecorative(empty(), file, true), file, page, true);
  const source = '<img src="/images/a.png" alt=""><img src="/images/a.png"><img src="/images/a.png" alt="My words">';
  assert.equal(descriptionPlaceEdits(records, file, page, source, { text: "", decorative: true }, { text: "A desk", decorative: false }),
    '<img src="/images/a.png" alt=""><img alt="A desk" src="/images/a.png"><img src="/images/a.png" alt="My words">');
  const unmarked = setMediaPlaceDecorative(records, file, page, false);
  assert.equal(descriptionPlaceEdits(unmarked, file, page, source, { text: "", decorative: true }, { text: "A desk", decorative: false }),
    '<img src="/images/a.png" alt="A desk"><img alt="A desk" src="/images/a.png"><img src="/images/a.png" alt="My words">');
  // An emptied description empties the places that used it but never adds alt="" where none was written.
  assert.equal(descriptionPlaceEdits(described(), file, page, '<img src="/images/a.png" alt="Old &amp; familiar"><img src="/images/a.png">', before, { text: "", decorative: false }),
    '<img src="/images/a.png" alt=""><img src="/images/a.png">');
});

test("old empty alt is missing until explicitly marked; place mark survives save and media rename", () => {
  const records = described();
  assert.equal(placeDescriptionState(records, file, page, "").state, "missing");
  const marked = setMediaPlaceDecorative(records, file, page, true);
  const roundTrip = parseMediaRecords(serializeMediaRecords(marked));
  assert.equal(roundTrip.files[file].places?.[page].decorative, true);
  const renamed = renameMediaRecord(roundTrip, file, "images/new.png");
  assert.equal(placeDescriptionState(renamed, "images/new.png", page, "").state, "decorative");
  assert.equal(setMediaPlaceDecorative(marked, file, page, true), marked);
  assert.equal(setMediaPlaceDecorative(marked, file, page, false).files[file].places, undefined);
  assert.equal(setMediaPlaceDecorative(records, file, page, false), records);
});

test("by-agent marks survive save and clear on confirmation or a non-agent text edit", () => {
  let records = setMediaDescription(empty(), file, "Agent text", true);
  records = setMediaPlaceByAgent(records, file, page, true);
  records = parseMediaRecords(serializeMediaRecords(records));
  assert.equal(fileDescriptionState(records.files[file]).byAgent, true);
  assert.equal(placeDescriptionState(records, file, page, "Own text").byAgent, true);
  assert.equal(placeDescriptionState(records, file, page, "Agent text").byAgent, true);
  assert.equal(confirmMediaDescription(records, file).files[file].description?.byAgent, undefined);
  assert.equal(confirmMediaDescription(records, file, page).files[file].places, undefined);
  assert.equal(setMediaDescription(records, file, "Lex text").files[file].description?.byAgent, undefined);
  assert.equal(setMediaPlaceByAgent(records, file, page, false).files[file].places, undefined);
  assert.equal(setMediaPlaceByAgent(records, file, page, true), records);
  assert.equal(setMediaPlaceDecorative(records, file, page, true).files[file].places?.[page].byAgent, undefined);
  const missing = empty();
  assert.equal(confirmMediaDescription(missing, file), missing);
});

test("place validation rejects bad types, drops empty entries, preserves unknown and prototype keys, sorts pages", () => {
  for (const places of [null, [], 2, { page: null }, { page: [] }, { page: { decorative: "yes" } }, { page: { byAgent: 1 } }]) {
    assert.throws(() => parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: { a: { places } } })), /places/);
  }
  const records = parseMediaRecords('{"version":2,"collections":[],"files":{"a":{"places":{"z.html":{"decorative":true,"future":1},"empty":{},"false":{"decorative":false,"byAgent":false},"a.html":{"byAgent":true},"__proto__":{"decorative":true}}}}}');
  const places = records.files.a.places!;
  assert.equal(Object.getPrototypeOf(places), null);
  assert.equal(places.empty, undefined); assert.equal(places.false, undefined);
  assert.equal(places["z.html"].future, 1); assert.equal(places.__proto__.decorative, true);
  assert.deepEqual(Object.keys(JSON.parse(serializeMediaRecords(records)).files.a.places), ["__proto__", "a.html", "z.html"]);
  assert.deepEqual(parseMediaRecords(serializeMediaRecords(records)), records);
  assert.equal(parseMediaRecords('{"version":2,"collections":[],"files":{"a":{"places":{"empty":{}}}}}').files.a.places, undefined);
  const next = setMediaPlaceByAgent(records, "a", "__proto__", true);
  assert.equal(next.files.a.places?.__proto__.byAgent, true);
  assert.equal(Object.getPrototypeOf(next.files.a.places), null);
});
