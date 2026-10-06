import assert from "node:assert/strict";
import test from "node:test";
import { planSelectedStaticSectionSave, type NativeSectionSaveInput } from "../src/page-builder/native-section-save.ts";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument } from "../src/page-builder/page-builder-document.ts";
import { DEFAULT_STATIC_SECTIONS } from "../src/page-builder/static-section-defaults.ts";
import { readStaticSectionRecords } from "../src/page-builder/static-sections.ts";

const intro = DEFAULT_STATIC_SECTIONS.find((s) => s.id === "intro")!;
const contact = DEFAULT_STATIC_SECTIONS.find((s) => s.id === "contact")!;
const doc = JSON.stringify({
  version: 1, pages: { "index.html": { sections: { tagline: "Hi" } } }, future: { kept: true },
  reusableSections: { version: 1, extra: [1], records: { intro: { ...intro, note: "keep" }, contact: { ...contact } } },
}, null, 2);
const edited = `<section class="section-intro wide"><h2>Lex's "new" title</h2>\n<p>Line two <img src="a.png" alt="A &quot;cat&quot;"> <a href="/about">About</a></p></section>`;
const page = (body: string) => `<!doctype html><html><head><title>S</title></head><body><main>${body}</main></body></html>`;
const files = ["index.html", EDITOR_PAGE_BUILDER_PATH, "styles/sections.css", "blog.html"];
/** Stands in for the host's locateNativeElementRange: the exact outer range of `outer` in `source`. */
const rangeOf = (source: string, outer: string) => { const start = source.indexOf(outer); assert.ok(start >= 0); return { start, end: start + outer.length }; };
const editedPage = page(`<p>x</p>${edited}`);
const input = (extra: Partial<NativeSectionSaveInput> = {}): NativeSectionSaveInput => ({ pagePath: "index.html", pageSource: editedPage, range: rangeOf(editedPage, edited), documentText: doc, files, ...extra });
const on = (body: string, outer: string, extra: Partial<NativeSectionSaveInput> = {}) => { const pageSource = page(body); return input({ pageSource, range: rangeOf(pageSource, outer), ...extra }); };
function good(value: NativeSectionSaveInput) { const r = planSelectedStaticSectionSave(value); if ("error" in r) assert.fail(r.error); return r; }
function saved(value: NativeSectionSaveInput) { const r = good(value); assert.equal(r.noop, false); if (r.noop) throw new Error("no-op"); return r; }
function bad(value: NativeSectionSaveInput, pattern: RegExp) { const r = planSelectedStaticSectionSave(value); assert.ok("error" in r, "expected refusal"); assert.match(r.error, pattern); }

test("saves the exact edited section HTML into the matching record only, as a JSON-only operation", () => {
  const r = saved(input());
  assert.equal(r.recordId, "intro");
  assert.deepEqual([...r.operation.edits.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  assert.equal(r.operation.creates, undefined);
  assert.equal(r.operation.open, undefined);
  assert.deepEqual([...r.operation.expectedSources], [[EDITOR_PAGE_BUILDER_PATH, doc], ["index.html", editedPage]]);
  assert.deepEqual(r.expectedFiles, [...files].sort());
  const text = r.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const records = readStaticSectionRecords(text);
  assert.equal(records.intro.html, edited);
  assert.equal(records.intro.css, intro.css);
  assert.equal(records.intro.label, intro.label);
  assert.equal(records.intro.rootClass, intro.rootClass);
  assert.equal(records.intro.stylesheetPath, intro.stylesheetPath);
  assert.equal(records.intro.note, "keep");
  assert.deepEqual(records.contact, { ...contact });
  const before = readPageBuilderDocument(doc), after = readPageBuilderDocument(text);
  assert.deepEqual(after.pages, before.pages);
  assert.deepEqual(after.future, { kept: true });
  assert.deepEqual((after.reusableSections as { extra: unknown }).extra, [1]);
});

test("uses the host range, not source path counting: scripts and meta refresh before the target", () => {
  const target = `<section class="${contact.rootClass}"><h2>Write</h2></section>`;
  const body = `<script>document.write("<section class='section-intro'></section>")</script><meta http-equiv="refresh" content="9"><section class="section-intro"><h2>A</h2></section>${target}`;
  const r = saved(on(body, target));
  assert.equal(r.recordId, "contact");
  assert.equal(readStaticSectionRecords(r.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!).contact.html, target);
});

test("preserves comments, text, multiline single-quoted attributes and sibling bytes exactly", () => {
  const target = `<section\n  class='section-intro'\n  title='A "quoted"\nvalue'><!-- note -->\n  <h2>T</h2> text &amp; more\n</section>`;
  const r = saved(on(`<!-- before -->text<p>a</p>${target}<!-- after -->`, target));
  assert.equal(readStaticSectionRecords(r.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!).intro.html, target);
});

test("an unclosed paragraph before the section: the exact AST range is accepted, a browser-shaped range is refused", () => {
  const target = `<section class="section-intro"><h2>T</h2></section>`;
  const body = `<p>open${target}`;
  saved(on(body, target));
  const pageSource = page(body);
  bad(input({ pageSource, range: { start: pageSource.indexOf("<p>"), end: pageSource.indexOf("<p>") + 7 } }), /no longer matches/);
});

test("explicit record id and range are checked", () => {
  assert.equal(good(input({ recordId: "intro" })).recordId, "intro");
  bad(input({ recordId: "contact" }), new RegExp(`does not carry the class ${contact.rootClass}`));
  bad(input({ recordId: "gone" }), /no longer exists/);
  const both = `<section class="section-intro ${contact.rootClass.toUpperCase()}"><h2>x</h2></section>`;
  bad(on(both, both, { recordId: "intro" }), /another saved section's class/);
  bad(on(both, both), /more than one/);
});

test("missing, malformed or mismatched ranges refuse", () => {
  const { range } = input();
  bad({ ...input(), range: undefined as never }, /Select a section/);
  bad(input({ range: { start: -1, end: 4 } }), /Select a section/);
  bad(input({ range: { start: 4, end: 4 } }), /Select a section/);
  bad(input({ range: { start: 0.5, end: 9 } }), /Select a section/);
  bad(input({ range: { start: range.start, end: editedPage.length + 1 } }), /Select a section/);
  bad(input({ range: { start: range.start, end: range.end - 1 } }), /no longer matches/);
  bad(input({ range: { start: range.start + 1, end: range.end } }), /no longer matches/);
});

test("unchanged HTML is a validated no-op", () => {
  assert.deepEqual(good(on(intro.html, intro.html)), { noop: true, recordId: "intro" });
  bad(on(intro.html, intro.html, { files: ["index.html"] }), /file graph/);
});

test("refuses children, unsupported containers and unsupported markup", () => {
  bad(input({ range: rangeOf(editedPage, `<h2>Lex's "new" title</h2>`) }), /section itself/);
  bad(on(`<p>x</p>`, `<p>x</p>`), /section itself/);
  bad(on('<section class="plain"><p>x</p></section>', '<section class="plain"><p>x</p></section>'), /does not match a saved section/);
  for (const [open, close] of [["<my-box>", "</my-box>"], ["<template>", "</template>"], ["<svg><foreignObject>", "</foreignObject></svg>"], ["<math>", "</math>"]]) {
    const target = '<section class="section-intro"><h2>x</h2></section>';
    bad(on(open + target + close, target), /components or templates/);
  }
  const custom = '<section class="section-intro"><my-card></my-card></section>';
  bad(on(custom, custom), /custom tags/);
  const script = '<section class="section-intro"><script>x()</script></section>';
  bad(on(script, script), /scripts/);
  const editor = '<section class="section-intro" data-native-empty><h2>x</h2></section>';
  bad(on(editor, editor), /Editor-owned/);
});

test("refuses unloaded, absent or malformed editor JSON and wrong pages", () => {
  bad(input({ documentText: undefined }), new RegExp(`Load ${EDITOR_PAGE_BUILDER_PATH.replace(/\./g, "\\.")}`));
  bad(input({ documentText: undefined, files: ["index.html"] }), /no saved section to update/);
  bad(input({ documentText: "{ nope" }), /./);
  bad(input({ documentText: JSON.stringify({ version: 1 }) }), /Pages must be/);
  bad(input({ documentText: JSON.stringify({ version: 1, pages: {} }) }), /does not match a saved section/);
  bad(input({ pagePath: "notes.txt" }), /native HTML page/);
  bad(input({ files: ["other.html", EDITOR_PAGE_BUILDER_PATH] }), /file graph/);
});
