import assert from "node:assert/strict";
import test from "node:test";
import { readPageBuilderDocument, writePageBuilderDocument } from "../src/page-builder/page-builder-document.ts";
import { locateSectionTarget, makeSectionTarget } from "../src/page-builder/source-target.ts";

test("writes strip legacy page fields, and collections, preserving all other data without changing the read document", () => {
  const text = JSON.stringify({ version: 1, pages: {
    "index.html": { fields: { note: "old" }, sections: { hero: { folded: true } }, pageParts: { note: "part" }, future: [null, 4] },
    "about.html": { fields: "obsolete", date: "2026-10-04" },
  }, collections: { obsolete: { arbitrary: true } }, reusableSections: { saved: { html: "<section>Keep</section>" } }, future: { x: true } });
  const document = readPageBuilderDocument(text);
  const before = structuredClone(document);
  const written = writePageBuilderDocument(document, text);
  assert.notEqual(written, text);
  assert.deepEqual(document, before);
  const expected = structuredClone(before);
  for (const page of Object.values(expected.pages)) delete page.fields;
  delete expected.collections;
  assert.equal(Object.hasOwn(JSON.parse(written), "collections"), false);
  assert.deepEqual(readPageBuilderDocument(written), expected);
  assert.equal(writePageBuilderDocument(document, written), written);
  assert.equal(writePageBuilderDocument(readPageBuilderDocument(written), written), written);
});


test("malformed versions, unsafe objects and paths refuse", () => {
  for (const text of ['{', '{"version":2,"pages":{},"collections":{}}', '{"version":1,"pages":[],"collections":{}}', '{"version":1,"pages":{"../index.html":{}},"collections":{}}', '{"version":1,"pages":{},"collections":{},"__proto__":{}}']) assert.throws(() => readPageBuilderDocument(text));
  const document = readPageBuilderDocument(undefined);
  document.pages["index.html"] = Object.create({ polluted: true });
  assert.throws(() => writePageBuilderDocument(document), /plain object/);
});


test("locators rebind unique signatures, refuse identical siblings and changed kinds", () => {
  const source = '<html><body><div class="cards"></div></body></html>';
  const target = makeSectionTarget(source, source.indexOf('<div'));
  const moved = locateSectionTarget(source.replace('<body>', '<body><p>Before</p>'), target);
  assert.ok(!("error" in moved) && moved.rebound);
  assert.deepEqual(!("error" in moved) && moved.target.path, [0, 0, 1]);
  assert.ok("error" in locateSectionTarget(source.replace('</body>', '<div class="cards"></div></body>'), target));
  assert.ok("error" in locateSectionTarget(source.replace(/div/g, 'section'), target));
  const named = '<section id="grid" class="cards"></section>';
  const namedTarget = makeSectionTarget(named, 0);
  assert.ok(!("error" in locateSectionTarget(named.replace('cards', 'new'), namedTarget)));
  assert.ok("error" in locateSectionTarget(named + named, namedTarget));
  assert.ok("error" in locateSectionTarget(named.replace(/section/g, 'article'), namedTarget));
  assert.ok("error" in locateSectionTarget('<section id="different"></section>', namedTarget));
});


test("duplicate JSON keys refuse before parsing can discard data", () => {
  assert.throws(() => readPageBuilderDocument('{"version":1,"pages":{},"collections":{},"version":1}'), /Duplicate JSON key/);
  assert.throws(() => readPageBuilderDocument('{"version":1,"pages":{"index.html":{"future":1,"future":2}},"collections":{}}'), /Duplicate JSON key/);
  const text = '{"version":1,"pages":{},"future":[{"x":1},{"x":2}],"quoted":"a \\\"key\\\": 3"}';
  assert.equal(writePageBuilderDocument(readPageBuilderDocument(text), text), text);
});


test("unknown metadata preserves except globally reserved prototype names", () => {
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    const text = `{"version":1,"pages":{},"collections":{},"future":{"${name}":"value"}}`;
    assert.throws(() => readPageBuilderDocument(text), { message: `Unsafe JSON key: ${name}.` });
  }
});


test("section fingerprints retain every authored attribute", () => {
  const source = '<div data-each="/work/" data-sort="title" class="cards"><template><p>{title}</p></template></div>';
  const target = makeSectionTarget(source, 0);
  assert.equal(target.openingTagFingerprint, '<div data-each="/work/" data-sort="title" class="cards">');
  assert.ok("error" in locateSectionTarget(source.replace(' data-sort="title"', ''), target));
});
