import assert from "node:assert/strict";
import test from "node:test";
import { applyCollectionEdits } from "../src/page-builder/collection-bake.ts";
import { planManualConversion } from "../src/page-builder/native-grid-collection.ts";
import { EDITOR_PAGE_BUILDER_PATH, locateCollectionTarget, makeCollectionTarget, planLegacyCollectionImport, readPageBuilderDocument, writePageBuilderDocument } from "../src/page-builder/page-builder-document.ts";

const identity = { name: "Site" };
const page = (title: string) => `<html><head><title>${title} · Site</title><meta name="description" content="SEO ${title}"></head><body><h1>${title}</h1></body></html>`;
function imported(sources: Record<string, string>, routes: Record<string, string> = {}) {
  const result = planLegacyCollectionImport({ sources, routes, identity });
  if ("error" in result) assert.fail(result.error);
  return result;
}
function output(source: string, result: ReturnType<typeof imported>, path: string) { return applyCollectionEdits(source, result.edits[path] ?? []); }

test("document preserves unknown JSON and unchanged source bytes", () => {
  assert.deepEqual(readPageBuilderDocument(undefined), { version: 1, pages: {}, collections: {} });
  const text = '{ "version": 1, "pages": {"index.html":{"fields":{"date":"2026-10-04"},"sections":{"hero":{"folded":true}},"future":[null,4]}}, "collections":{}, "future":{"x":true} }';
  const document = readPageBuilderDocument(text);
  assert.equal(writePageBuilderDocument(document, text), text);
  document.pages["index.html"].fields!.date = "2026-10-05";
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
  const target = makeCollectionTarget(source, source.indexOf('<div'));
  const moved = locateCollectionTarget(source.replace('<body>', '<body><p>Before</p>'), target);
  assert.ok(!("error" in moved) && moved.rebound);
  assert.deepEqual(!("error" in moved) && moved.target.path, [0, 0, 1]);
  assert.ok("error" in locateCollectionTarget(source.replace('</body>', '<div class="cards"></div></body>'), target));
  assert.ok("error" in locateCollectionTarget(source.replace(/div/g, 'section'), target));
  const named = '<section id="grid" class="cards"></section>';
  const namedTarget = makeCollectionTarget(named, 0);
  assert.ok(!("error" in locateCollectionTarget(named.replace('cards', 'new'), namedTarget)));
  assert.ok("error" in locateCollectionTarget(named + named, namedTarget));
  assert.ok("error" in locateCollectionTarget(named.replace(/section/g, 'article'), namedTarget));
  assert.ok("error" in locateCollectionTarget('<section id="different"></section>', namedTarget));
});

test("fingerprints normalize only a proven recipe, then match clean source", () => {
  const source = '<div id="grid" data-each="/work/" data-sort="title" class="cards" data-other="&gt;"><template><p>{title}</p></template><p>Native</p></div>';
  const target = makeCollectionTarget(source, 0);
  assert.equal(target.openingTagFingerprint, '<div id="grid" class="cards" data-other="&gt;">');
  const ordinary = '<div data-sort="title" class="cards"></div>';
  assert.equal(makeCollectionTarget(ordinary, 0).openingTagFingerprint, '<div data-sort="title" class="cards">');
  assert.throws(() => makeCollectionTarget('<div data-each="/work/"></div>', 0), /template/);
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
  for (const record of Object.values(result.document.collections)) assert.ok(!("error" in locateCollectionTarget(clean, record.target)));
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
  const card = (title: string, note: string, href: string) => `<card-project><h3 slot="title">${title}</h3><p slot="note">${note}</p><a slot="link" href="${href}">Read about ${title}</a></card-project>`;
  const home = `<html><head><title>Home · Site</title></head><body><div class="cards">${card('A', 'Alpha note', '/work/a/')}${card('B', 'Beta note', '/work/b/')}</div></body></html>`;
  const original = { "index.html": home, "work/a/index.html": page('A'), "work/b/index.html": page('B') };
  const routes = { "/": "index.html", "/work/a/": "work/a/index.html", "/work/b/": "work/b/index.html" };
  const conversion = planManualConversion({ sources: original, routes, identity, path: "index.html", start: home.indexOf('<div'), folders: ["/work/"], token: "gabc12" });
  if ("error" in conversion) assert.fail(conversion.error);
  const sources = Object.fromEntries(Object.entries(original).map(([path, source]) => [path, applyCollectionEdits(source, conversion.plan.edits[path] ?? [])]));
  const result = imported(sources, routes);
  const record = result.document.collections.gabc12;
  assert.deepEqual(record.overrides, { "work/a/index.html": { "gabc12-note": "Alpha note" }, "work/b/index.html": { "gabc12-note": "Beta note" } });
  const clean = output(sources["index.html"], result, "index.html");
  const beforeCards = sources["index.html"].slice(sources["index.html"].indexOf('</template>') + '</template>'.length, sources["index.html"].indexOf('</div>'));
  assert.equal(clean.slice(clean.indexOf('<div class="cards">') + '<div class="cards">'.length, clean.indexOf('</div>')), beforeCards);
  for (const path of ['work/a/index.html', 'work/b/index.html']) {
    const cleaned = output(sources[path], result, path);
    assert.equal(cleaned.replace(/\s+<\/head>/, '</head>'), original[path]);
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
  assert.ok("error" in planLegacyCollectionImport({ sources: { "index.html": same + same }, routes: {}, identity }));
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
