import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { applyCollectionEdits, planBake } from "../src/page-builder/collection-bake.ts";
import { MAX_COLLECTION_ITEMS } from "../src/page-builder/collection-model.ts";
import { planSidecarRecipe } from "../src/page-builder/collection-origins.ts";
import { bakePageData } from "../src/page-builder/document-collections.ts";
import { findInlineEditorData, planEditorDataMigration } from "../src/page-builder/editor-data-migration.ts";
import { planNativeCollectionOperation, type NativeCollectionOrigin } from "../src/page-builder/native-collection-host.ts";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument } from "../src/page-builder/page-builder-document.ts";
import { deriveNativeRoutes } from "../shared/native-routes.ts";

const starter = "fixtures/actual-starter";
const identity = { name: "Larkspur Studio" };
const FERN = "work/fern-and-kettle/index.html", POTTERY = "work/harbour-lane-pottery/index.html", MEADOW = "work/meadow-row-allotments/index.html";

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => statSync(`${dir}/${name}`).isDirectory() ? walk(`${dir}/${name}`, `${prefix}${name}/`) : [prefix + name]);
}
function load(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json|css|js)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  return sources;
}
const snapshot = (sources: Record<string, string>) => {
  const files = Object.keys(sources).sort();
  return { sources, files, routes: deriveNativeRoutes(files), revision: "r", identity };
};
function apply(sources: Record<string, string>, origin: NativeCollectionOrigin) {
  const planned = planNativeCollectionOperation({ ...snapshot(sources), origin });
  if ("error" in planned) throw new Error(planned.error);
  const next = { ...sources };
  for (const file of planned.operation.creates ?? []) next[file.path] = file.content;
  for (const [path, text] of planned.operation.edits ?? []) next[path] = text;
  return { next, planned };
}
function bakeLegacy(sources: Record<string, string>) {
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity, bakePageData(sources, Object.keys(sources)));
  if ("error" in baked) throw new Error(baked.error);
  const next = { ...sources };
  for (const [path, edits] of Object.entries(baked.edits)) next[path] = applyCollectionEdits(next[path], edits);
  return next;
}
const meta = (field: string, value: string) => `  <meta name="field:${field}" content="${value}">\n`;
const withMeta = (source: string, lines: string) => source.replace("</head>", `${lines}</head>`);
const homeRecipe = ' data-each="/work/" data-sort="client"', homeTemplate = '<template><li><a href="{url}">{title}</a> for {client}</li></template>';
const homeList = `<ul class="legacy-list"${homeRecipe}>${homeTemplate}</ul>`;
const aboutRecipe = ' data-each="/work/" data-limit="2"', aboutTemplate = '<template><li class="recent">{title}</li></template>';
const aboutList = `<ol class="recent-work" id="recent"${aboutRecipe}>${aboutTemplate}</ol>`;

/** An old-style site: field tags on three work pages and two inline listings (Home, About), baked. */
function legacySite() {
  const sources = load();
  sources[FERN] = withMeta(sources[FERN], meta("client", "Fern Co"));
  sources[POTTERY] = withMeta(sources[POTTERY], meta("client", "Harbour Ltd") + meta("year", "2024"));
  sources[MEADOW] = withMeta(sources[MEADOW], meta("client", "Meadow Trust"));
  sources["index.html"] = sources["index.html"].replace("</main>", `${homeList}\n</main>`);
  sources["about/index.html"] = sources["about/index.html"].replace("</main>", `${aboutList}\n</main>`);
  return bakeLegacy(sources);
}
const refused = (message: RegExp) => (error: unknown) => error instanceof Error && message.test(error.message);
const deepCopy =(sources: Record<string, string>) => JSON.parse(JSON.stringify(sources)) as Record<string, string>;

test("a site with no inline editor data offers nothing", () => {
  const sources = load();
  // Words that only look like editor data are not editor data.
  sources["404.html"] = sources["404.html"].replace("</main>", "<p>The field: data-each word is just text.</p></main>");
  assert.deepEqual(findInlineEditorData(sources), { pages: [], listings: 0, fields: 0 });
  assert.equal(planEditorDataMigration(snapshot(sources)), undefined);
});

test("every page's recipes and field tags move in one operation; pages keep everything else byte for byte", () => {
  const before = legacySite();
  assert.deepEqual(findInlineEditorData(before), { pages: ["about/index.html", "index.html", FERN, POTTERY, MEADOW].sort(), listings: 2, fields: 4 });
  const input = deepCopy(before);
  const plan = planEditorDataMigration(snapshot(input))!;
  assert.deepEqual(input, before, "planning writes nothing");
  assert.deepEqual(plan.pages, ["about/index.html", "index.html", FERN, POTTERY, MEADOW].sort());
  assert.equal(plan.listings, 2); assert.equal(plan.fields, 4);
  // Created JSON plus five page edits, every page and the JSON's absence pinned.
  assert.deepEqual(plan.origin.creates.map((file) => file.path), [EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual([...plan.origin.edits.keys()].sort(), plan.pages);
  assert.ok(plan.origin.expectedSources.has(EDITOR_PAGE_BUILDER_PATH) && plan.origin.expectedSources.get(EDITOR_PAGE_BUILDER_PATH) === undefined);
  for (const path of Object.keys(before).filter((path) => path.endsWith(".html") && !path.startsWith("components/"))) assert.equal(plan.origin.expectedSources.get(path), before[path], path);

  const { next, planned } = apply(before, plan.origin);
  // The host's own bake adds nothing to the pages: only the editor data is removed.
  assert.equal(next["index.html"], before["index.html"].replace(homeRecipe, "").replace(homeTemplate, ""));
  assert.equal(next["about/index.html"], before["about/index.html"].replace(aboutRecipe, "").replace(aboutTemplate, ""));
  assert.equal(next[FERN], before[FERN].replace(meta("client", "Fern Co"), ""));
  assert.equal(next[POTTERY], before[POTTERY].replace(meta("client", "Harbour Ltd") + meta("year", "2024"), ""));
  assert.equal(next[MEADOW], before[MEADOW].replace(meta("client", "Meadow Trust"), ""));
  assert.match(next["index.html"], /Fern &amp; Kettle<\/a> for Fern Co<\/li>/);
  assert.deepEqual([...planned.operation.edits!.keys()].sort(), plan.pages);
  for (const [path, text] of Object.entries(next)) if (path.endsWith(".html")) assert.doesNotMatch(text, /data-each|data-sort|data-limit|<template>|name="field:/, path);

  const document = readPageBuilderDocument(next[EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual(Object.values(document.collections).map((item) => [item.pagePath, item.folders, item.sort, item.limit, item.template]).sort(), [
    ["about/index.html", ["/work/"], "", 2, '<li class="recent">{title}</li>'],
    ["index.html", ["/work/"], "client", MAX_COLLECTION_ITEMS,'<li><a href="{url}">{title}</a> for {client}</li>'],
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  assert.deepEqual({ ...document.pages[POTTERY].fields }, { client: "Harbour Ltd", year: "2024" });
  assert.deepEqual({ ...document.pages[MEADOW].fields }, { client: "Meadow Trust" });
  // Nothing is left to move, and the JSON listings bake to the same cards.
  assert.deepEqual(findInlineEditorData(next), { pages: [], listings: 0, fields: 0 });
  assert.equal(planEditorDataMigration(snapshot(next)), undefined);
  const again = apply(next, { edits: new Map([[FERN, next[FERN] + "\n"]]), done: "", undone: "" }).next;
  assert.equal(again["index.html"], next["index.html"]);
  assert.equal(again["about/index.html"], next["about/index.html"]);
});

test("mixed: a JSON recipe and migrated fields stay, unknown JSON data is kept, legacy data joins them", () => {
  let sources = load();
  sources[FERN] = withMeta(sources[FERN], meta("client", "Fern Co"));
  sources[POTTERY] = withMeta(sources[POTTERY], meta("client", "Harbour Ltd"));
  // Meadow's fields were already moved; the JSON carries data the editor does not know.
  sources[EDITOR_PAGE_BUILDER_PATH] = JSON.stringify({ version: 1, pages: { [MEADOW]: { fields: { client: "Meadow Trust" }, note: "kept" } }, collections: {}, future: { keep: [1, 2] } }, null, 2) + "\n";
  sources["about/index.html"] = sources["about/index.html"].replace("</main>", '<div class="json-grid"></div>\n</main>');
  const origin = planSidecarRecipe({ sources, routes: deriveNativeRoutes(Object.keys(sources)), identity }, "about/index.html", sources["about/index.html"].indexOf('<div class="json-grid">'),
    { folders: ["/work/"], sort: "-client", filter: "", limit: 6, template: "<p>{title}: {client}</p>", fields: ["client"] });
  sources = apply(sources, { ...origin, done: "", undone: "" }).next;
  assert.match(sources["about/index.html"], /Meadow Row Allotments: Meadow Trust/);
  sources["index.html"] = sources["index.html"].replace("</main>", `${homeList}\n</main>`);
  const before = bakeLegacy(sources);
  const jsonCards = before["about/index.html"];
  const plan = planEditorDataMigration(snapshot(before))!;
  assert.deepEqual(plan.pages, ["index.html", FERN, POTTERY].sort());
  assert.deepEqual(plan.origin.creates, []);
  assert.equal(plan.origin.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), before[EDITOR_PAGE_BUILDER_PATH]);
  const { next } = apply(before, plan.origin);
  assert.equal(next["about/index.html"], jsonCards);
  assert.equal(next[MEADOW], before[MEADOW]);
  assert.equal(next["index.html"], before["index.html"].replace(homeRecipe, "").replace(homeTemplate, ""));
  const raw = JSON.parse(next[EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual(raw.future, { keep: [1, 2] });
  assert.deepEqual(raw.pages[MEADOW], { fields: { client: "Meadow Trust" }, note: "kept" });
  assert.deepEqual(raw.pages[FERN], { fields: { client: "Fern Co" } });
  assert.equal(Object.keys(raw.collections).length, 2);
  assert.equal(planEditorDataMigration(snapshot(next)), undefined);
  // A JSON listing whose recipe changed since its cards were built would be rebuilt: that refuses too.
  const stale = deepCopy(before);
  stale[EDITOR_PAGE_BUILDER_PATH] = stale[EDITOR_PAGE_BUILDER_PATH].replace('"sort": "-client"', '"sort": "client"');
  assert.throws(() => planEditorDataMigration(snapshot(stale)), refused(/^The cards in about\/index\.html would change, not only lose their recipe\..* Nothing was changed\.$/));
});

test("malformed inline data anywhere refuses the whole move, naming the page, with nothing planned", () => {
  const good = legacySite();
  const cases: [string, (sources: Record<string, string>) => void, RegExp][] = [
    ["listing without its template", (s) => { s["about/index.html"] = s["about/index.html"].replace(aboutTemplate, ""); }, /^about\/index\.html: A collection needs one complete direct-child template\..* Nothing was changed\.$/],
    ["field tag in the body", (s) => { s[MEADOW] = s[MEADOW].replace("</main>", '<meta name="field:client" content="x"></main>'); }, /^work\/meadow-row-allotments\/index\.html: .*outside the page <head>.* Nothing was changed\.$/],
    ["field tag repeated", (s) => { s[FERN] = withMeta(s[FERN], meta("client", "Again")); }, /^work\/fern-and-kettle\/index\.html: Field client appears more than once\. Nothing was changed\.$/],
    ["field differing from the JSON", (s) => { s[EDITOR_PAGE_BUILDER_PATH] = JSON.stringify({ version: 1, pages: { [FERN]: { fields: { client: "Other" } } }, collections: {} }) + "\n"; }, /^work\/fern-and-kettle\/index\.html: Field client differs .*Page settings › Fields.* Nothing was changed\.$/],
    ["unreadable JSON", (s) => { s[EDITOR_PAGE_BUILDER_PATH] = "{ not json"; }, /Nothing was changed\.$/],
  ];
  for (const [name, change, message] of cases) {
    const sources = deepCopy(good);
    change(sources);
    const frozen = deepCopy(sources);
    assert.ok(findInlineEditorData(sources).pages.length >= 5, `${name}: still offered`);
    assert.throws(() => planEditorDataMigration(snapshot(sources)), refused(message), name);
    assert.deepEqual(sources, frozen, `${name}: sources untouched`);
  }
});

test("cards edited by hand refuse instead of being rebuilt, and an unloaded page refuses", () => {
  const edited = legacySite();
  edited["index.html"] = edited["index.html"].replace("for Fern Co</li>", "for Fern Company</li>");
  assert.throws(() => planEditorDataMigration(snapshot(edited)), /index\.html were edited by hand.* Nothing was changed\.$/);
  const partial = legacySite();
  const { [MEADOW]: _unloaded, ...loaded } = partial;
  assert.throws(() => planEditorDataMigration({ ...snapshot(loaded), files: Object.keys(partial).sort(), routes: deriveNativeRoutes(Object.keys(partial)) }), /meadow-row-allotments\/index\.html is not loaded yet\. Nothing was changed\./);
});
