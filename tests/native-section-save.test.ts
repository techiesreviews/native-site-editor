import assert from "node:assert/strict";
import test from "node:test";
import { planSelectedStaticSectionSave, type NativeSectionSaveInput } from "../src/page-builder/native-section-save.ts";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document.ts";
import { DEFAULT_STATIC_SECTIONS } from "../src/page-builder/static-section-defaults.ts";
import { readStaticSectionRecords } from "../src/page-builder/static-sections.ts";

const intro = DEFAULT_STATIC_SECTIONS.find((s) => s.id === "intro")!;
const contact = DEFAULT_STATIC_SECTIONS.find((s) => s.id === "contact")!;
const doc = JSON.stringify({
  version: 1, pages: { "index.html": { fields: { tagline: "Hi" } } }, collections: {}, future: { kept: true },
  reusableSections: { version: 1, extra: [1], records: { intro: { ...intro, note: "keep" }, contact: { ...contact } } },
}, null, 2);
const edited = `<section class="section-intro wide"><h2>Lex's "new" title</h2>\n<p>Line two <img src="a.png" alt="A &quot;cat&quot;"> <a href="/about">About</a></p></section>`;
const page = (body: string) => `<!doctype html><html><head><title>S</title></head><body><main>${body}</main></body></html>`;
const files = ["index.html", EDITOR_PAGE_BUILDER_PATH, "styles/sections.css"];
const input = (extra: Partial<NativeSectionSaveInput> = {}): NativeSectionSaveInput => ({ pagePath: "index.html", pageSource: page(`<p>x</p>${edited}`), node: [0, 1], documentText: doc, files, ...extra });
function good(value: NativeSectionSaveInput) { const r = planSelectedStaticSectionSave(value); if ("error" in r) assert.fail(r.error); return r; }
function bad(value: NativeSectionSaveInput, pattern: RegExp) { const r = planSelectedStaticSectionSave(value); assert.ok("error" in r, "expected refusal"); assert.match(r.error, pattern); }

test("saves the exact edited section HTML into the matching record only", () => {
  const r = good(input());
  assert.equal(r.noop, false);
  if (r.noop) return;
  assert.equal(r.recordId, "intro");
  assert.deepEqual([...r.operation.edits.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  assert.equal(r.operation.creates, undefined);
  assert.equal(r.operation.open, undefined);
  assert.deepEqual([...r.operation.expectedSources], [[EDITOR_PAGE_BUILDER_PATH, doc], ["index.html", input().pageSource]]);
  assert.deepEqual(r.expectedFiles, [...files].sort());
  const text = r.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const records = readStaticSectionRecords(text);
  assert.equal(records.intro.html, edited);
  assert.equal(records.intro.css, intro.css);
  assert.equal(records.intro.label, intro.label);
  assert.equal(records.intro.note, "keep");
  assert.deepEqual(records.contact, { ...contact });
  const json = JSON.parse(text);
  assert.deepEqual(json.pages, { "index.html": { fields: { tagline: "Hi" } } });
  assert.deepEqual(json.collections, {});
  assert.deepEqual(json.future, { kept: true });
  assert.deepEqual(json.reusableSections.extra, [1]);
});

test("explicit record id and range are honoured", () => {
  const source = input().pageSource;
  const start = source.indexOf("<section");
  const r = good(input({ recordId: "intro", range: { start, end: start + edited.length } }));
  assert.equal(r.recordId, "intro");
  bad(input({ range: { start, end: start + 3 } }), /no longer matches/);
  bad(input({ recordId: "contact" }), /does not carry the class section-contact/);
  bad(input({ recordId: "gone" }), /no longer exists/);
});

test("unchanged HTML is a validated no-op", () => {
  assert.deepEqual(good(input({ pageSource: page(intro.html), node: [0, 0] })), { noop: true, recordId: "intro" });
  bad(input({ pageSource: page(intro.html), node: [0, 0], files: ["index.html"] }), /file graph/);
});

test("refuses unsafe or ambiguous selections", () => {
  bad(input({ node: [0, 1, 0] }), /section itself/);
  bad(input({ node: [0, 0] }), /section itself/);
  bad(input({ node: [0, 9] }), /no longer on the page/);
  bad(input({ pageSource: page('<section class="plain"><p>x</p></section>'), node: [0, 0] }), /does not match a saved section/);
  bad(input({ pageSource: page('<section class="section-intro section-contact"><h2>x</h2></section>'), node: [0, 0] }), /more than one/);
  bad(input({ pageSource: page('<my-box><section class="section-intro"><h2>x</h2></section></my-box>'), node: [0, 0, 0] }), /components or templates/);
  bad(input({ pageSource: page('<section class="section-intro"><my-card></my-card></section>'), node: [0, 0] }), /custom tags/);
  bad(input({ pageSource: page('<section class="section-intro"><script>x()</script></section>'), node: [0, 0] }), /scripts/);
  bad(input({ pageSource: page('<section class="section-intro" data-native-empty><h2>x</h2></section>'), node: [0, 0] }), /Editor-owned/);
});

test("refuses unloaded, absent or malformed editor JSON and wrong pages", () => {
  bad(input({ documentText: undefined }), new RegExp(`Load ${EDITOR_PAGE_BUILDER_PATH.replace(/\./g, "\\.")}`));
  bad(input({ documentText: undefined, files: ["index.html"] }), /no saved section to update/);
  bad(input({ documentText: "{ nope" }), /./);
  bad(input({ documentText: JSON.stringify({ version: 1 }) }), /Pages must be/);
  bad(input({ documentText: JSON.stringify({ version: 1, pages: {}, collections: {} }) }), /does not match a saved section/);
  bad(input({ pagePath: "notes.txt" }), /native HTML page/);
  bad(input({ files: ["other.html", EDITOR_PAGE_BUILDER_PATH] }), /file graph/);
});
