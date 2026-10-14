import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMediaRecords, serializeMediaRecords, renameMediaRecord, setMediaDescription } from "../shared/media-records";
import { fileDescriptionState, placeDescriptionState, newPlaceAlt, descriptionPlaceEdits, setMediaFileDecorative, setMediaPlaceDecorative, setMediaPlaceAgentText, confirmMediaDescription, mediaToCheck, placeWordsEdits, swapPlaceImage, pageUsesFile, mediaNameAlt, followsFileName, strandsAgentWords } from "../src/page-builder/media-descriptions";
import { mediaMetadataView } from "../src/page-builder/media-metadata";

const file = "images/a.png", page = "news/index.html";
const empty = () => parseMediaRecords(undefined);
const described = () => setMediaDescription(empty(), file, "Old & familiar");
const before = { text: "Old & familiar", decorative: false };
const after = { text: 'New & "bright" <view>', decorative: false };

test("file description flows to new places; Decorative and missing give empty alt", () => {
  assert.equal(newPlaceAlt(empty(), file), "");
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
  records = setMediaPlaceAgentText(records, file, page, "Own text");
  records = parseMediaRecords(serializeMediaRecords(records));
  assert.equal(fileDescriptionState(records.files[file]).byAgent, true);
  assert.equal(placeDescriptionState(records, file, page, "Own text").byAgent, true);
  assert.equal(placeDescriptionState(records, file, page, "Agent text").byAgent, true);
  // Lex editing the place's words clears its mark with no records write; Undo of that edit brings it back.
  assert.equal(placeDescriptionState(records, file, page, "Lex's own text").byAgent, false);
  assert.equal(confirmMediaDescription(records, file).files[file].description?.byAgent, undefined);
  assert.equal(confirmMediaDescription(records, file, page).files[file].places, undefined);
  assert.equal(setMediaDescription(records, file, "Lex text").files[file].description?.byAgent, undefined);
  assert.equal(setMediaPlaceAgentText(records, file, page, undefined).files[file].places, undefined);
  assert.equal(setMediaPlaceAgentText(records, file, page, "Own text"), records);
  assert.equal(setMediaPlaceDecorative(records, file, page, true).files[file].places?.[page].agentText, undefined);
  const missing = empty();
  assert.equal(confirmMediaDescription(missing, file), missing);
});

test("place validation rejects bad types, drops empty entries, preserves unknown and prototype keys, sorts pages", () => {
  for (const places of [null, [], 2, { page: null }, { page: [] }, { page: { decorative: "yes" } }, { page: { agentText: 1 } }]) {
    assert.throws(() => parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: { a: { places } } })), /places/);
  }
  const records = parseMediaRecords('{"version":2,"collections":[],"files":{"a":{"places":{"z.html":{"decorative":true,"future":1},"empty":{},"false":{"decorative":false,"agentText":""},"a.html":{"agentText":"Words"},"__proto__":{"decorative":true}}}}}');
  const places = records.files.a.places!;
  assert.equal(Object.getPrototypeOf(places), null);
  assert.equal(places.empty, undefined); assert.equal(places.false, undefined);
  assert.equal(places["z.html"].future, 1); assert.equal(places.__proto__.decorative, true);
  assert.deepEqual(Object.keys(JSON.parse(serializeMediaRecords(records)).files.a.places), ["__proto__", "a.html", "z.html"]);
  assert.deepEqual(parseMediaRecords(serializeMediaRecords(records)), records);
  assert.equal(parseMediaRecords('{"version":2,"collections":[],"files":{"a":{"places":{"empty":{}}}}}').files.a.places, undefined);
  const next = setMediaPlaceAgentText(records, "a", "__proto__", "Words");
  assert.equal(next.files.a.places?.__proto__.agentText, "Words");
  assert.equal(Object.getPrototypeOf(next.files.a.places), null);
});

test("To check lists agent descriptions of listed files, then agent words still on their page", () => {
  let records = setMediaDescription(empty(), "images/b.png", "Agent words for b", true);
  records = setMediaDescription(records, file, "Checked words");
  records = setMediaPlaceAgentText(records, file, page, "Agent place words");
  records = setMediaPlaceAgentText(records, file, "about/index.html", "Edited away");
  records = setMediaPlaceAgentText(records, file, "gone/index.html", "No page");
  records = setMediaDescription(records, "images/removed.png", "Not listed", true);
  const sources = {
    [page]: '<img src="/images/a.png" alt="Agent place words"><img src="/images/a.png" alt="Checked words">',
    "about/index.html": '<img src="/images/a.png" alt="Lex changed this">',
  };
  assert.deepEqual(mediaToCheck(records, ["images/b.png", file], sources), [
    { file, page, text: "Agent place words" },
    { file: "images/b.png", text: "Agent words for b" },
  ]);
  // OK clears each mark and the row goes; the words stay.
  const checked = confirmMediaDescription(confirmMediaDescription(records, "images/b.png"), file, page);
  assert.deepEqual(mediaToCheck(checked, ["images/b.png", file], sources), []);
  assert.equal(checked.files["images/b.png"].description?.text, "Agent words for b");
  // The mark survives saving (serialize and parse).
  assert.equal(mediaToCheck(parseMediaRecords(serializeMediaRecords(records)), ["images/b.png", file], sources).length, 2);
  // Details read the file's mark.
  assert.equal(mediaMetadataView(records)["images/b.png"].byAgent, true);
  assert.equal(mediaMetadataView(checked)["images/b.png"].byAgent, undefined);
});

test("Lex's words for a place replace only the agent's on that file's images", () => {
  const source = '<img src="/images/a.png" alt="Agent &amp; words"><img src="/images/a.png" alt="Other"><img src="/images/b.png" alt="Agent &amp; words">';
  assert.equal(placeWordsEdits(source, file, page, "Agent & words", 'Mine "now"'),
    '<img src="/images/a.png" alt="Mine &quot;now&quot;"><img src="/images/a.png" alt="Other"><img src="/images/b.png" alt="Agent &amp; words">');
});

const other = "images/b-photo_2.png";
const swapped = `<img src="/images/b-photo_2.png" alt="">`;

test("swapping a place's picture moves its Decorative mark to the new file and keeps the place empty", () => {
  const records = setMediaPlaceDecorative(described(), file, page, true);
  const result = swapPlaceImage(records, page, file, other, "", swapped);
  // The empty alt stays as written; a place without one gets alt="".
  assert.equal(result.alt, undefined);
  assert.equal(swapPlaceImage(records, page, file, other, undefined, swapped).alt, "");
  assert.equal(result.records.files[other]?.places?.[page]?.decorative, true);
  // The old file left the page, so its mark for this page goes with it.
  assert.equal(result.records.files[file]?.places?.[page], undefined);
  assert.equal(placeDescriptionState(result.records, other, page, "").state, "decorative");
  // The old file still shows elsewhere on the page: its mark there stays.
  const still = swapPlaceImage(records, page, file, other, "", `${swapped}<img src="../images/a.png" alt="">`);
  assert.equal(still.records.files[file]?.places?.[page]?.decorative, true);
  assert.equal(still.records.files[other]?.places?.[page]?.decorative, true);
  // Own words written after marking stay as written; the mark still moves.
  const words = swapPlaceImage(records, page, file, other, "Kept words", swapped);
  assert.equal(words.alt, undefined);
  assert.equal(words.records.files[other]?.places?.[page]?.decorative, true);
  // Another page's mark is not this place's.
  assert.equal(swapPlaceImage(records, "about.html", file, other, "", swapped).records.files[other], undefined);
});

test("other agent words for one image would strand the unchecked words on another image of the file", () => {
  const source = '<img src="/images/a.png" alt="First"><img src="/images/a.png" alt="Old"><img src="/images/b.png" alt="First">';
  const second = source.indexOf('<img src="/images/a.png" alt="Old"');
  assert.equal(strandsAgentWords(source, file, page, second, "First", "Second"), true);
  // The same words, the marked image itself, no mark, or words no longer shown: nothing is stranded.
  assert.equal(strandsAgentWords(source, file, page, second, "First", "First"), false);
  assert.equal(strandsAgentWords(source, file, page, 0, "First", "Second"), false);
  assert.equal(strandsAgentWords(source, file, page, second, undefined, "Second"), false);
  assert.equal(strandsAgentWords(source, file, page, second, "Gone", "Second"), false);
});

test("swapping a place keeps an agent's own words marked: the mark moves to the new file and stays in To check", () => {
  const records = setMediaPlaceAgentText(described(), file, page, "Agent words");
  const after = '<img src="/images/b-photo_2.png" alt="Agent words">';
  const result = swapPlaceImage(records, page, file, other, "Agent words", after);
  assert.equal(result.alt, undefined);
  assert.equal(result.records.files[other]?.places?.[page]?.agentText, "Agent words");
  // The old file left the page, so its mark for this page goes.
  assert.equal(result.records.files[file]?.places?.[page]?.agentText, undefined);
  assert.deepEqual(mediaToCheck(result.records, [file, other], { [page]: after }), [{ file: other, page, text: "Agent words" }]);
  // The old file still shows its words on the page: its mark there stays too.
  const both = `${after}<img src="/images/a.png" alt="Agent words">`;
  assert.equal(swapPlaceImage(records, page, file, other, "Agent words", both).records.files[file]?.places?.[page]?.agentText, "Agent words");
  // Lex's own words (no agent mark) stay unmarked.
  assert.equal(swapPlaceImage(records, page, file, other, "Lex words", after).records, records);
});

test("the new file's own Decorative mark and description apply where the place followed the old file", () => {
  const decorativeNew = setMediaFileDecorative(described(), other, true);
  assert.equal(swapPlaceImage(decorativeNew, page, file, other, undefined, swapped).alt, "");
  assert.equal(swapPlaceImage(decorativeNew, page, file, other, before.text, swapped).alt, "");
  assert.equal(swapPlaceImage(decorativeNew, page, file, other, "", swapped).alt, undefined);
  // Own words stay, even over a Decorative file (slice 13 keeps own words).
  assert.equal(swapPlaceImage(decorativeNew, page, file, other, "My words", swapped).alt, undefined);
  const describedNew = setMediaDescription(described(), other, "A bright desk");
  assert.equal(swapPlaceImage(describedNew, page, file, other, before.text, swapped).alt, "A bright desk");
  assert.equal(swapPlaceImage(describedNew, page, file, other, undefined, swapped).alt, "A bright desk");
  assert.equal(swapPlaceImage(describedNew, page, file, other, "", swapped).alt, "A bright desk");
  // An undescribed new file: the old description goes; a gap stays a gap.
  assert.equal(swapPlaceImage(described(), page, file, other, before.text, swapped).alt, "");
  assert.equal(swapPlaceImage(described(), page, file, other, "", swapped).alt, undefined);
  assert.equal(swapPlaceImage(empty(), page, undefined, other, undefined, swapped).alt, "");
  // Records change only for a Decorative place.
  const plain = described();
  assert.equal(swapPlaceImage(plain, page, file, other, before.text, swapped).records, plain);
  // Choosing the same file again keeps the place as it is.
  const marked = setMediaPlaceDecorative(plain, file, page, true);
  assert.deepEqual(swapPlaceImage(marked, page, file, file, "", `<img src="/images/a.png" alt="">`), { alt: undefined, records: marked });
});

test("an undescribed placement stays missing and later follows description and file Decorative", () => {
  const placed = swapPlaceImage(empty(), page, undefined, other, undefined, swapped);
  assert.equal(placed.alt, "");
  assert.deepEqual(placeDescriptionState(placed.records, other, page, placed.alt), { state: "missing", own: false, byAgent: false });
  assert.equal(placed.records.files[other], undefined);
  const gap = { text: "", decorative: false };
  assert.equal(descriptionPlaceEdits(placed.records, other, page, swapped, gap, { text: "A desk", decorative: false }),
    '<img src="/images/b-photo_2.png" alt="A desk">');
  const decorative = setMediaFileDecorative(placed.records, other, true);
  assert.equal(descriptionPlaceEdits(placed.records, other, page, swapped, gap, { text: "", decorative: true }), swapped);
  assert.equal(placeDescriptionState(decorative, other, page, "").state, "decorative");
});

for (const alt of [mediaNameAlt(other), "b-photo_2", "b-photo_2.png"]) {
  test(`legacy name alt ${alt} reads missing and follows descriptions, Decorative and swaps`, () => {
    const records = setMediaDescription(empty(), other, "Old description", true);
    const source = `<img src="/images/b-photo_2.png" alt="${alt}">`;
    assert.equal(followsFileName(other, alt), true);
    assert.equal(followsFileName(other, "My words"), false);
    assert.equal(followsFileName(other, undefined), false);
    assert.deepEqual(placeDescriptionState(records, other, page, alt), { state: "missing", own: false, byAgent: false });
    const old = { text: "Old description", decorative: false };
    assert.equal(descriptionPlaceEdits(records, other, page, source, old, { text: "A desk", decorative: false }),
      '<img src="/images/b-photo_2.png" alt="A desk">');
    assert.equal(descriptionPlaceEdits(records, other, page, source, old, { text: "", decorative: true }), swapped);
    assert.equal(descriptionPlaceEdits(records, other, page, source, old, { text: "", decorative: false }), source);
    // A name alt that is the file's description follows it like any shared description (slice 13).
    const named = setMediaDescription(empty(), other, alt);
    assert.deepEqual(placeDescriptionState(named, other, page, alt), { state: "described", own: false, byAgent: false });
    assert.equal(descriptionPlaceEdits(named, other, page, source, { text: alt, decorative: false }, { text: "", decorative: false }),
      '<img src="/images/b-photo_2.png" alt="">');
    assert.equal(swapPlaceImage(records, page, other, file, alt, '<img src="/images/a.png">').alt, "");
    assert.equal(swapPlaceImage(setMediaDescription(records, file, "New description"), page, other, file, alt, "").alt, "New description");
    assert.equal(swapPlaceImage(setMediaFileDecorative(records, file, true), page, other, file, alt, "").alt, "");
  });

  test(`deliberate agent name words ${alt} stay own words`, () => {
    const records = setMediaPlaceAgentText(setMediaDescription(empty(), other, "Old description"), other, page, alt);
    const source = `<img src="/images/b-photo_2.png" alt="${alt}">`;
    assert.deepEqual(placeDescriptionState(records, other, page, alt), { state: "described", own: true, byAgent: true });
    for (const next of [{ text: "New description", decorative: false }, { text: "", decorative: true }, { text: "", decorative: false }])
      assert.equal(descriptionPlaceEdits(records, other, page, source, { text: "Old description", decorative: false }, next), source);
    const swapped = swapPlaceImage(records, page, other, file, alt, `<img src="/images/a.png" alt="${alt}">`);
    assert.equal(swapped.alt, undefined);
    assert.equal(swapped.records.files[file]?.places?.[page]?.agentText, alt);
  });
}

test("a page uses a file through any of its image addresses", () => {
  assert.equal(pageUsesFile(`<img src="../images/a.png?v=2">`, page, file), true);
  assert.equal(pageUsesFile(`<!-- <img src="/images/a.png"> --><source src="/images/a.png">`, page, file), false);
  assert.equal(pageUsesFile(`<img src="/images/b-photo_2.png">`, page, file), false);
});
