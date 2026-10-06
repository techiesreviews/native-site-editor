import assert from "node:assert/strict";
import test from "node:test";
import { applyCollectionEdits } from "../src/page-builder/collection-bake.ts";
import { EDITOR_PAGE_BUILDER_PATH, locateCollections, planLegacyCollectionImport, readPageBuilderDocument, writePageBuilderDocument } from "../src/page-builder/page-builder-document.ts";
import { locateSectionTarget, makeSectionTarget } from "../src/page-builder/source-target.ts";

interface LegacyFixture { original: Record<string, string>; sources: Record<string, string>; routes: Record<string, string> }
// Frozen real legacy output from planManualConversion, token gabc12, captured once.
// d150832b35d041ada56513f041cb2dfc2a0d4aed and 40c12efa6bc16be326089957b5d0d492ced6f420
// share converter blob 72d077f72b3b10e6795ff9deb82c59dfad8aa58c (also this branch's legacy base).
// Complete fixture JSON SHA-256: ec989f5953e0cea5f396c933bf2e2f68a45509f92e58b22436812e5e521e858b.
// Do not regenerate with the current converter: these fixtures exercise importing old HTML recipes.
const legacyFixtures: Record<"note" | "fallback", LegacyFixture> = {
  "note": {
    "original": {
      "index.html": "<html><head><title>Home · Site</title></head><body><div class=\"cards\"><card-project><h3 slot=\"title\">A</h3><p slot=\"note\">Alpha note</p><a slot=\"link\" href=\"/work/a/\">Read about A</a></card-project><card-project><h3 slot=\"title\">B</h3><p slot=\"note\">Beta note</p><a slot=\"link\" href=\"/work/b/\">Read about B</a></card-project></div></body></html>",
      "work/a/index.html": "<html><head><title>A · Site</title><meta name=\"description\" content=\"SEO A\"></head><body><h1>A</h1></body></html>",
      "work/b/index.html": "<html><head><title>B · Site</title><meta name=\"description\" content=\"SEO B\"></head><body><h1>B</h1></body></html>"
    },
    "sources": {
      "index.html": "<html><head><title>Home · Site</title></head><body><div class=\"cards\" data-each=\"/work/\" data-collection-id=\"gabc12\" data-fields=\"gabc12-note\"><template><card-project><h3 slot=\"title\">{title}</h3><p slot=\"note\" data-if=\"gabc12-note\">{gabc12-note}</p><a slot=\"link\" href=\"{url}\">Read about {title}</a></card-project></template><card-project><h3 slot=\"title\">A</h3><p slot=\"note\" data-if=\"gabc12-note\">Alpha note</p><a slot=\"link\" href=\"/work/a/\">Read about A</a></card-project>\n<card-project><h3 slot=\"title\">B</h3><p slot=\"note\" data-if=\"gabc12-note\">Beta note</p><a slot=\"link\" href=\"/work/b/\">Read about B</a></card-project></div></body></html>",
      "work/a/index.html": "<html><head><title>A · Site</title><meta name=\"description\" content=\"SEO A\">  <meta name=\"field:gabc12-note\" content=\"Alpha note\">\n</head><body><h1>A</h1></body></html>",
      "work/b/index.html": "<html><head><title>B · Site</title><meta name=\"description\" content=\"SEO B\">  <meta name=\"field:gabc12-note\" content=\"Beta note\">\n</head><body><h1>B</h1></body></html>"
    },
    "routes": {
      "/": "index.html",
      "/work/a/": "work/a/index.html",
      "/work/b/": "work/b/index.html"
    }
  },
  "fallback": {
    "original": {
      "index.html": "<html><head><title>Home · Site</title></head><body><div class=\"cards\"><card-project><h3 slot=\"title\">Custom A</h3><a slot=\"link\" href=\"/work/a/\">Explore A</a></card-project><card-project><h3 slot=\"title\">B</h3><a slot=\"link\" href=\"/work/b/\">Read about B</a></card-project></div></body></html>",
      "work/a/index.html": "<html><head><title>A · Site</title><meta name=\"description\" content=\"SEO A\"></head><body><h1>A</h1></body></html>",
      "work/b/index.html": "<html><head><title>B · Site</title><meta name=\"description\" content=\"SEO B\"></head><body><h1>B</h1></body></html>"
    },
    "sources": {
      "index.html": "<html><head><title>Home · Site</title></head><body><div class=\"cards\" data-each=\"/work/\" data-collection-id=\"gabc12\" data-fields=\"gabc12-title gabc12-link\"><template><card-project><h3 slot=\"title\" data-if=\"gabc12-title\">{gabc12-title}</h3><h3 slot=\"title\" data-if=\"!gabc12-title\">{title}</h3><a slot=\"link\" href=\"{url}\" data-if=\"gabc12-link\">{gabc12-link}</a><a slot=\"link\" href=\"{url}\" data-if=\"!gabc12-link\">Read about {title}</a></card-project></template><card-project><h3 slot=\"title\" data-if=\"gabc12-title\">Custom A</h3><a slot=\"link\" href=\"/work/a/\" data-if=\"gabc12-link\">Explore A</a></card-project>\n<card-project><h3 slot=\"title\" data-if=\"!gabc12-title\">B</h3><a slot=\"link\" href=\"/work/b/\" data-if=\"!gabc12-link\">Read about B</a></card-project></div></body></html>",
      "work/a/index.html": "<html><head><title>A · Site</title><meta name=\"description\" content=\"SEO A\">  <meta name=\"field:gabc12-title\" content=\"Custom A\">\n  <meta name=\"field:gabc12-link\" content=\"Explore A\">\n</head><body><h1>A</h1></body></html>",
      "work/b/index.html": "<html><head><title>B · Site</title><meta name=\"description\" content=\"SEO B\"></head><body><h1>B</h1></body></html>"
    },
    "routes": {
      "/": "index.html",
      "/work/a/": "work/a/index.html",
      "/work/b/": "work/b/index.html"
    }
  }
};

const identity = { name: "Site" };
function imported(sources: Record<string, string>, routes: Record<string, string> = {}) {
  const result = planLegacyCollectionImport({ sources, routes, identity });
  if ("error" in result) assert.fail(result.error);
  return result;
}
function output(source: string, result: ReturnType<typeof imported>, path: string) { return applyCollectionEdits(source, result.edits[path] ?? []); }

test("document preserves unknown JSON and unchanged source bytes", () => {
  assert.deepEqual(readPageBuilderDocument(undefined), { version: 1, pages: {}, collections: {} });
  const text = '{ "version": 1, "pages": {"index.html":{"fields":{"release-date":"2026-10-04"},"sections":{"hero":{"folded":true}},"future":[null,4]}}, "collections":{}, "future":{"x":true} }';
  const document = readPageBuilderDocument(text);
  assert.equal(writePageBuilderDocument(document, text), text);
  document.pages["index.html"].fields!["release-date"] = "2026-10-05";
  const written = writePageBuilderDocument(document, text);
  assert.ok(written.endsWith("\n"));
  assert.match(written, /\n  "collections":/);
  assert.deepEqual(readPageBuilderDocument(written).future, { x: true });
  assert.deepEqual(readPageBuilderDocument(written).pages["index.html"].sections, { hero: { folded: true } });
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

test("fingerprints normalize only a proven recipe, then match clean source", () => {
  const source = '<div id="grid" data-each="/work/" data-sort="title" class="cards" data-other="&gt;"><template><p>{title}</p></template><p>Native</p></div>';
  const target = makeSectionTarget(source, 0);
  assert.equal(target.openingTagFingerprint, '<div id="grid" class="cards" data-other="&gt;">');
  const ordinary = '<div data-sort="title" class="cards"></div>';
  assert.equal(makeSectionTarget(ordinary, 0).openingTagFingerprint, '<div data-sort="title" class="cards">');
  assert.throws(() => makeSectionTarget('<div data-each="/work/"></div>', 0), /template/);
});

test("multiple recipes remove only recipe bytes, keeping cards, SEO and ordinary templates", () => {
  const grid = '<div id="one" class="cards" data-other="x > y" data-each="/work/" data-limit="2"><template><p data-if="title">{title}</p></template>\n<card-x slot="main"><h3>A</h3></card-x>\n</div>';
  const second = '<section id="two" data-each="/work/" data-fields="note"><template><b>{note}</b></template><b data-if="visible">Baked</b></section>';
  const head = '<html><head><title>Home SEO</title><meta name="description" content="Keep"></head><body>';
  const tail = '<template id="ordinary"><em>Normal template</em></template></body></html>';
  const source = head + grid + second + tail;
  const result = imported({ "index.html": source });
  const clean = output(source, result, "index.html");
  assert.equal(clean, head + '<div id="one" class="cards" data-other="x > y">\n<card-x slot="main"><h3>A</h3></card-x>\n</div><section id="two"><b data-if="visible">Baked</b></section>' + tail);
  assert.equal(result.expectedSources[EDITOR_PAGE_BUILDER_PATH], undefined);
  assert.ok(Object.hasOwn(result.expectedSources, EDITOR_PAGE_BUILDER_PATH));
  assert.equal(Object.keys(result.document.collections).length, 2);
  for (const record of Object.values(result.document.collections)) assert.ok(!("error" in locateSectionTarget(clean, record.target)));
  assert.equal(Object.values(result.document.collections)[0].template, '<p data-if="title">{title}</p>');
  assert.ok(!clean.includes('{title}'));
  assert.equal(imported({ "index.html": clean }).edits[EDITOR_PAGE_BUILDER_PATH], undefined);
});

test("invalid or nested second collection refuses the entire atomic plan", () => {
  const good = '<div data-each="/work/"><template><p>{title}</p></template><p>Keep</p></div>';
  for (const bad of ['<div data-each="/work/" data-limit="0"><template><p>{title}</p></template></div>', '<div data-each="/work/"><template><p>{title}</p></template><div data-each="/work/"><template><p>{title}</p></template></div></div>', '<div data-each="/work/" data-each="/other/"><template><p>{title}</p></template></div>']) {
    const result = planLegacyCollectionImport({ sources: { "index.html": good, "other.html": bad }, routes: {}, identity });
    assert.deepEqual(Object.keys(result), ["error"]);
  }
});

test("conversion import relocates proven private overrides without changing SEO or baked cards", () => {
  const { original, sources, routes } = structuredClone(legacyFixtures.note);
  const result = imported(sources, routes);
  const record = result.document.collections.gabc12;
  assert.deepEqual(record.overrides, { "work/a/index.html": { "gabc12-note": "Alpha note" }, "work/b/index.html": { "gabc12-note": "Beta note" } });
  const clean = output(sources["index.html"], result, "index.html");
  const beforeCards = sources["index.html"].slice(sources["index.html"].indexOf('</template>') + '</template>'.length, sources["index.html"].indexOf('</div>'));
  assert.equal(clean.slice(clean.indexOf('<div class="cards">') + '<div class="cards">'.length, clean.indexOf('</div>')), beforeCards);
  for (const path of ['work/a/index.html', 'work/b/index.html']) {
    const cleaned = output(sources[path], result, path);
    assert.equal(cleaned, original[path]);
    assert.ok(!cleaned.includes('field:gabc12-note'));
    assert.ok(cleaned.includes('name="description"'));
  }
  assert.ok(record.template.includes('data-if="gabc12-note"'));
});

test("arbitrary private-looking metadata stays; unproven registered metadata refuses", () => {
  const arbitrary = '<meta name="field:meta" content="Keep"><meta name="field:gabc12-other" content="Also keep">';
  const source = `<html><head>${arbitrary}</head><body><div data-each="/work/" data-collection-id="gabc12"><template><p>{title}</p></template><p>A</p></div></body></html>`;
  assert.ok(output(source, imported({ "index.html": source }), "index.html").includes(arbitrary));
  const unsafe = source.replace('data-collection-id="gabc12"', 'data-collection-id="gabc12" data-fields="gabc12-other"');
  assert.ok("error" in planLegacyCollectionImport({ sources: { "index.html": unsafe }, routes: {}, identity }));
});

test("sidecar no-op has no edits; duplicate ids and targets refuse", () => {
  const document = imported({ "index.html": '<div id="grid" data-each="/work/"><template><p>{title}</p></template></div>' }).document;
  const text = writePageBuilderDocument(document);
  const result = planLegacyCollectionImport({ sources: { "index.html": '<div id="grid"></div>' }, routes: {}, identity, sidecar: text });
  assert.ok(!("error" in result));
  if (!("error" in result)) { assert.deepEqual(result.edits, {}); assert.equal(result.sidecarText, text); }
  const record = Object.values(document.collections)[0];
  document.collections.duplicate = structuredClone(record);
  assert.throws(() => writePageBuilderDocument(document), /Duplicate collection target/);
  const same = '<div data-collection-id="same" data-each="/work/"><template><p>{title}</p></template></div>';
  assert.deepEqual(planLegacyCollectionImport({ sources: { "index.html": same.replace('<div ', '<div id="one" ') + same.replace('<div ', '<div id="two" ') }, routes: {}, identity }), { error: 'Duplicate collection id: same.' });
});

test("ambiguous clean grids and authored recipe-template attributes refuse without edits", () => {
  const grid = '<div data-each="/work/"><template><p>{title}</p></template><p>A</p></div>';
  for (const source of [grid + grid, grid.replace('<template>', '<template id="preserve-me">'), grid.replace('data-each="/work/"', 'data-each="/work/" data-fields="title"')]) {
    assert.deepEqual(Object.keys(planLegacyCollectionImport({ sources: { "index.html": source }, routes: {}, identity })), ['error']);
  }
});

test("registered overrides require string values and reserved fields remain native", () => {
  const document = imported({ "index.html": '<div id="grid" data-each="/work/" data-fields="note"><template><p>{note}</p></template></div>' }).document;
  const record = Object.values(document.collections)[0];
  record.overrides['work/a/index.html'] = { unknown: 'Value' };
  assert.throws(() => writePageBuilderDocument(document), /registered string field/);
  record.overrides = {};
  record.fields = ['title'];
  assert.throws(() => writePageBuilderDocument(document), /template or fields/);
});

test("duplicate JSON keys refuse before parsing can discard data", () => {
  assert.throws(() => readPageBuilderDocument('{"version":1,"pages":{},"collections":{},"version":1}'), /Duplicate JSON key/);
  assert.throws(() => readPageBuilderDocument('{"version":1,"pages":{"index.html":{"future":1,"future":2}},"collections":{}}'), /Duplicate JSON key/);
  const text = '{"version":1,"pages":{},"collections":{},"future":[{"x":1},{"x":2}],"quoted":"a \\\"key\\\": 3"}';
  assert.equal(writePageBuilderDocument(readPageBuilderDocument(text), text), text);
});

test("unknown collection keys preserve; malformed target and specification refuse", () => {
  const document = imported({ "index.html": '<div id="grid" data-each="/work/"><template><p>{title}</p></template></div>' }).document;
  const record = Object.values(document.collections)[0];
  record.future = { kind: 'custom', values: [1, true] };
  record.target.future = 'locator extension';
  const parsed = readPageBuilderDocument(writePageBuilderDocument(document));
  assert.deepEqual(Object.values(parsed.collections)[0].future, record.future);
  assert.equal(Object.values(parsed.collections)[0].target.future, 'locator extension');
  for (const mutate of [() => { record.limit = 0; }, () => { record.folders = ['/work/', '/work/']; }, () => { record.target.authoredId = 'another'; }, () => { record.template = '<div data-each="/work/"><template><b>{title}</b></template></div>'; }]) {
    const copy = structuredClone(document);
    mutate();
    assert.throws(() => writePageBuilderDocument(document));
    Object.assign(record, Object.values(copy.collections)[0]);
  }
});

test("private metadata with additional author attributes refuses rather than dropping them", () => {
  const template = '<card-project><p slot="note" data-if="gabc12-note">{gabc12-note}</p><a slot="link" href="{url}">Read about {title}</a></card-project>';
  const grid = `<div id="grid" data-each="/work/" data-collection-id="gabc12" data-fields="gabc12-note"><template>${template}</template><p>Native card</p></div>`;
  const meta = '<meta name="field:gabc12-note" content="Custom note" data-author="keep">';
  const sources = { 'index.html': `<html><head>${meta}</head><body>${grid}</body></html>` };
  const result = planLegacyCollectionImport({ sources, routes: {}, identity });
  assert.ok('error' in result);
  if ('error' in result) assert.match(result.error, /Cannot safely remove private metadata/);
  assert.ok(sources['index.html'].includes(meta));
});

test("resolver identity refuses an idless duplicate even when its stored path differs", () => {
  const document = imported({ 'index.html': '<div class="cards" data-each="/work/"><template><p>{title}</p></template></div>' }).document;
  const record = structuredClone(Object.values(document.collections)[0]);
  record.target.path = [9];
  document.collections.another = record;
  assert.throws(() => writePageBuilderDocument(document), { message: 'Duplicate collection target.' });
});

test("whole-page resolution refuses actual nested targets after rebinding and permits stale sibling paths", () => {
  const nested = '<section id="outer"><div id="inner"></div></section>';
  const base = Object.values(imported({ 'index.html': '<div id="grid" data-each="/work/"><template><p>{title}</p></template></div>' }).document.collections)[0];
  const outer = { ...structuredClone(base), target: makeSectionTarget(nested, 0) };
  const inner = { ...structuredClone(base), target: makeSectionTarget(nested, nested.indexOf('<div')) };
  outer.target.path = [8]; inner.target.path = [3];
  assert.deepEqual(locateCollections(nested, { outer, inner }), { error: 'Collection targets outer and inner overlap.' });
  const siblings = '<section id="outer"></section><div id="inner"></div>';
  inner.target.path = [8, 0];
  const located = locateCollections(siblings, { outer, inner });
  assert.ok(!('error' in located));
  if (!('error' in located)) { assert.deepEqual(located.collections.outer.target.path, [0]); assert.deepEqual(located.collections.inner.target.path, [1]); }
});

function fallbackConversion(): LegacyFixture {
  return structuredClone(legacyFixtures.fallback);
}

test("generated custom title and link overrides retain exact native fallbacks and native output", () => {
  const { original, sources, routes } = fallbackConversion();
  const result = imported(sources, routes);
  const record = result.document.collections.gabc12;
  assert.deepEqual(record.overrides, { 'work/a/index.html': { 'gabc12-title': 'Custom A', 'gabc12-link': 'Explore A' } });
  assert.ok(record.template.includes('<h3 slot="title" data-if="!gabc12-title">{title}</h3>'));
  assert.ok(record.template.includes('<a slot="link" href="{url}" data-if="!gabc12-link">Read about {title}</a>'));
  assert.equal(output(sources['work/a/index.html'], result, 'work/a/index.html'), original['work/a/index.html']);
  const baked = sources['index.html'].slice(sources['index.html'].indexOf('</template>') + 11, sources['index.html'].indexOf('</div>'));
  const cleaned = output(sources['index.html'], result, 'index.html');
  assert.equal(cleaned.slice(cleaned.indexOf('<div class="cards">') + '<div class="cards">'.length, cleaned.indexOf('</div>')), baked);
});

for (const [name, replace] of [
  ['wrong fallback text', (text: string) => text.replace('data-if="!gabc12-link">Read about {title}', 'data-if="!gabc12-link">Wrong {title}')],
  ['non-url link', (text: string) => text.replace('href="{url}" data-if="gabc12-link"', 'href="/other/" data-if="gabc12-link"').replace('href="{url}" data-if="!gabc12-link"', 'href="/other/" data-if="!gabc12-link"')],
  ['extra fallback attributes', (text: string) => text.replace('data-if="!gabc12-link"', 'data-if="!gabc12-link" class="extra"')],
  ['nonadjacent text', (text: string) => text.replace('<a slot="link" href="{url}" data-if="!gabc12-link"', 'Between<a slot="link" href="{url}" data-if="!gabc12-link"')],
  ['nonadjacent fallback', (text: string) => text.replace('<a slot="link" href="{url}" data-if="!gabc12-link"', '<i>Between</i><a slot="link" href="{url}" data-if="!gabc12-link"')],
] as const) test(`private link proof refuses ${name} atomically`, () => {
  const { sources, routes } = fallbackConversion();
  sources['index.html'] = replace(sources['index.html']);
  const before = structuredClone(sources);
  assert.deepEqual(planLegacyCollectionImport({ sources, routes, identity }), { error: 'Cannot prove fallback for private field gabc12-link.' });
  assert.deepEqual(sources, before);
});

test("legacy merge validates existing targets, refuses a duplicate resolver and guards missing source", () => {
  const saved = imported({ 'index.html': '<div id="saved" data-each="/work/"><template><p>{title}</p></template></div>' }).document;
  const source = '<p>Before</p><div id="saved"></div><section id="new" data-each="/work/"><template><p>{title}</p></template><p>Native</p></section>';
  const merged = planLegacyCollectionImport({ sources: { 'index.html': source }, routes: {}, identity, sidecar: writePageBuilderDocument(saved) });
  assert.ok(!('error' in merged));
  if (!('error' in merged)) {
    assert.equal(Object.keys(merged.document.collections).length, 2);
    assert.deepEqual(Object.values(merged.document.collections).find((record) => record.target.authoredId === "saved")!.target.path, [1]);
    assert.ok(!('error' in locateCollections(output(source, merged, 'index.html'), merged.document.collections)));
  }
  const legacy = '<div class="cards" data-each="/work/"><template><p>{title}</p></template></div>';
  const collision = imported({ 'index.html': legacy }).document;
  const record = Object.values(collision.collections)[0];
  collision.collections = { saved: record }; record.target.path = [9];
  assert.deepEqual(planLegacyCollectionImport({ sources: { 'index.html': legacy }, routes: {}, identity, sidecar: writePageBuilderDocument(collision) }), { error: 'Duplicate collection target.' });
  assert.deepEqual(planLegacyCollectionImport({ sources: {}, routes: {}, identity, sidecar: writePageBuilderDocument(saved) }), { error: 'Load index.html before locating its collections.' });
});

test("head metadata removal shifts target offsets while preserving exact generated whitespace", () => {
  const { sources, routes } = fallbackConversion();
  const meta = sources['work/a/index.html'].match(/  <meta name="field:gabc12-title"[^>]+>\n/)![0];
  sources['index.html'] = sources['index.html'].replace('</head>', meta + '</head>');
  const result = imported(sources, routes);
  const cleaned = output(sources['index.html'], result, 'index.html');
  const record = result.document.collections.gabc12;
  const location = locateSectionTarget(cleaned, record.target);
  assert.ok(!('error' in location));
  if (!('error' in location)) assert.equal(location.element.start, cleaned.indexOf('<div class="cards">'));
  assert.ok(cleaned.includes('<title>Home · Site</title></head>'));
  assert.equal(record.overrides['index.html']['gabc12-title'], 'Custom A');
});

test("native metadata paths, custom field strings, empty ids and inert templates validate explicitly", () => {
  const document = imported({ 'index.html': '<div id="" class="cards" data-each="/work/"><template><p>{title}</p></template></div>' }).document;
  const record = Object.values(document.collections)[0];
  assert.equal(record.target.authoredId, undefined);
  assert.ok(!('error' in locateSectionTarget('<div id="" class="cards"></div>', record.target)));
  const text = writePageBuilderDocument(document);
  for (const path of ['.git/config', '.editor/page-builder.json', 'components/card/card.html', 'notes.txt']) {
    const copy = readPageBuilderDocument(text); Object.values(copy.collections)[0].pagePath = path;
    assert.throws(() => writePageBuilderDocument(copy), { message: 'Collection metadata must refer to a native HTML page.' });
    const override = readPageBuilderDocument(text); Object.values(override.collections)[0].overrides[path] = {};
    assert.throws(() => writePageBuilderDocument(override), { message: 'Collection metadata must refer to a native HTML page.' });
  }
  for (const fields of [{ title: 'Native title' }, { 'Bad name': 'Text' }, { note: 3 }]) {
    const malformed = JSON.parse(text); malformed.pages['index.html'] = { fields };
    assert.throws(() => readPageBuilderDocument(JSON.stringify(malformed)), { message: 'Page fields must use custom field names and string values.' });
  }
  assert.throws(() => readPageBuilderDocument('{"version":"1","pages":{},"collections":{}}'), { message: 'Unsupported page builder document version.' });
  assert.throws(() => makeSectionTarget('<template><div id="inside"></div></template>', 10), { message: 'Collection target must be a complete authored element.' });
  const target = makeSectionTarget('<div id="inside"></div>', 0);
  assert.deepEqual(locateSectionTarget('<template><div id="inside"></div></template>', target), { error: 'Collection target is missing or ambiguous.' });
});

test("an existing outer collection and new nested recipe refuse after actual binding", () => {
  const document = imported({ 'index.html': '<section id="outer" data-each="/work/"><template><p>{title}</p></template></section>' }).document;
  const record = Object.values(document.collections)[0];
  document.collections = { outer: record }; record.target.path = [8];
  const source = '<section id="outer"><div id="inner" data-collection-id="new" data-each="/work/"><template><p>{title}</p></template><p>Native</p></div></section>';
  const sources = { 'index.html': source };
  assert.deepEqual(planLegacyCollectionImport({ sources, routes: {}, identity, sidecar: writePageBuilderDocument(document) }), { error: 'Collection targets outer and new overlap.' });
  assert.equal(sources['index.html'], source);
});

test("unknown metadata preserves except globally reserved prototype names", () => {
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    const text = `{"version":1,"pages":{},"collections":{},"future":{"${name}":"value"}}`;
    assert.throws(() => readPageBuilderDocument(text), { message: `Unsafe JSON key: ${name}.` });
  }
});
