import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { applyCollectionEdits, bindCollectionTemplate, planBake } from "../src/page-builder/collection-bake.ts";
import { readPageFields } from "../src/page-builder/collection-fields.ts";
import { manualGridFolders, planManualConversion, readManualGrid, type ManualConversion } from "../src/page-builder/native-grid-collection.ts";
import { planSidecarRecipe } from "../src/page-builder/collection-origins.ts";
import { planNativeCollectionOperation } from "../src/page-builder/native-collection-host.ts";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument } from "../src/page-builder/page-builder-document.ts";

/** Applies a conversion the way the host does: JSON recipe, then one baked operation. Returns every final text. */
function applied(sources: Record<string, string>, routes: Record<string, string>, converted: ManualConversion, start: number) {
  const origin = planSidecarRecipe({ sources, routes, identity }, "index.html", start, converted.recipe, converted.id);
  const plan = planNativeCollectionOperation({ sources, routes, files: Object.keys(sources), revision: "r", identity, origin: { ...origin, done: "", undone: "" } });
  if ("error" in plan) assert.fail(plan.error);
  const texts: Record<string, string> = { ...sources, ...Object.fromEntries(plan.operation.edits!) };
  for (const create of plan.operation.creates ?? []) texts[create.path] = create.content;
  return texts;
}

const starter = "fixtures/actual-starter";
const identity = { name: "Larkspur Studio" };
const page = (title: string, description: string) => `<!doctype html><html><head><title>${title} · Larkspur Studio</title><meta name="description" content="${description}"></head><body><h1>${title}</h1></body></html>`;
const cards = (extra = "") => `<html><head><title>Home · Larkspur Studio</title></head><body><section><h2>Recent work</h2>
      <div class="cards">
        <card-project>
          <p slot="note">Cafe · Identity and site · 2025</p>
          <h3 slot="title">Fern &amp; Kettle</h3>
          <p slot="body" class="body">A one-page site with a menu.</p>
          <a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>
        </card-project>
        <card-project>
          <p slot="note">Ceramics studio · Portfolio · 2025</p>
          <h3 slot="title">Harbour Lane Pottery</h3>
          <p slot="body" class="body">A quiet portfolio.</p>
          <a slot="link" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>
        </card-project>${extra}
      </div>
    </section></body></html>`;
function site(home = cards()) {
  const sources: Record<string, string> = {
    "index.html": home,
    "work/fern-and-kettle/index.html": page("Fern &amp; Kettle", "A cafe site with a printable menu."),
    "work/harbour-lane-pottery/index.html": page("Harbour Lane Pottery", "A quiet portfolio."),
    "services/web/index.html": page("Web builds", "Sites you can edit."),
    "articles/plain/index.html": page("Plain HTML", "Why plain HTML lasts."),
  };
  const routes: Record<string, string> = { "/": "index.html", "/work/fern-and-kettle/": "work/fern-and-kettle/index.html", "/work/harbour-lane-pottery/": "work/harbour-lane-pottery/index.html", "/services/web/": "services/web/index.html", "/articles/plain/": "articles/plain/index.html" };
  return { sources, routes };
}
const start = (source: string) => source.indexOf('<div class="cards">');
const result = (sources: Record<string, string>, routes: Record<string, string>, folders: string[], token = "gabc12") =>
  planManualConversion({ sources, routes, identity, path: "index.html", start: start(sources["index.html"]), folders, token });

test("data-if negation renders only when the field is empty", () => {
  const template = `<b data-if="x">{x}</b><i data-if="!x">{title}</i>`;
  assert.equal(bindCollectionTemplate(template, { title: "T", x: "X" }), `<b data-if="x">X</b>`);
  assert.equal(bindCollectionTemplate(template, { title: "T", x: "" }), `<i data-if="!x">T</i>`);
  assert.throws(() => bindCollectionTemplate(`<i data-if="!nope">a</i>`, { title: "" }), /Unknown or malformed/);
  assert.throws(() => bindCollectionTemplate(`<i data-if="!!x">a</i>`, { x: "" }), /Unknown or malformed/);
});

test("default folders are the ones the current cards live in", () => {
  const { sources, routes } = site();
  assert.deepEqual(manualGridFolders(sources["index.html"], start(sources["index.html"]), routes), ["/work/"]);
});

test("conversion preserves existing declarations and refuses to overwrite a collection id", () => {
  const original = cards().replace('<div class="cards">', '<div class="cards" data-fields="legacy" data-other="quoted &gt;">');
  const { sources, routes } = site(original);
  const converted = planManualConversion({ sources, routes, identity, path: "index.html", start: original.indexOf('<div class="cards"'), folders: ["/work/"], token: "gabc12" });
  if ("error" in converted) assert.fail(converted.error);
  const texts = applied(sources, routes, converted, original.indexOf('<div class="cards"'));
  assert.ok(texts["index.html"].includes('data-other="quoted &gt;"'));
  assert.deepEqual(readPageBuilderDocument(texts[EDITOR_PAGE_BUILDER_PATH]).collections.gabc12.fields, ["legacy", "gabc12-note", "gabc12-body"]);
  const named = site(cards().replace('<div class="cards">', '<div class="cards" data-collection-id="keepme">'));
  const refused = planManualConversion({ sources: named.sources, routes: named.routes, identity, path: "index.html", start: named.sources["index.html"].indexOf('<div class="cards"'), folders: ["/work/"], token: "gabc12" });
  assert.ok("error" in refused);
  assert.match(refused.error, /will not replace it/);
});

test("conversion keeps every card's text, attributes and link, and leaves SEO alone", () => {
  const { sources, routes } = site();
  const converted = result(sources, routes, ["/work/"]);
  if ("error" in converted) assert.fail(converted.error);
  const texts = applied(sources, routes, converted, start(sources["index.html"]));
  const home = texts["index.html"];
  // Clean HTML: finished cards only; the recipe and per-card text live in the editor's JSON.
  assert.doesNotMatch(home, /<template|data-each|data-collection-id|data-fields|data-if|\{title\}/);
  for (const text of ["Cafe · Identity and site · 2025", "Fern &amp; Kettle", "A one-page site with a menu.", 'href="/work/fern-and-kettle/"', "Read about Fern &amp; Kettle", "Harbour Lane Pottery", "A quiet portfolio.", 'class="body"'])
    assert.ok(home.includes(text), text);
  // Title matches the page: bare {title}. Body differs on one card: override + fallback.
  assert.ok(converted.template.includes(`<h3 slot="title">{title}</h3>`));
  assert.ok(converted.template.includes(`<p slot="body" class="body" data-if="!gabc12-body">{description}</p>`));
  assert.ok(converted.template.includes(`<a slot="link" href="{url}">Read about {title}</a>`));
  assert.ok(!converted.template.includes(`data-if="!gabc12-note"`));
  // Pages are untouched: no private field metadata is written into their heads.
  for (const path of ["work/fern-and-kettle/index.html", "work/harbour-lane-pottery/index.html"]) assert.equal(texts[path], sources[path]);
  const document = readPageBuilderDocument(texts[EDITOR_PAGE_BUILDER_PATH]);
  assert.equal(document.collections.gabc12.overrides["work/fern-and-kettle/index.html"]["gabc12-body"], "A one-page site with a menu.");
  assert.equal(document.collections.gabc12.overrides["work/harbour-lane-pottery/index.html"]?.["gabc12-body"], undefined);
  // Already-baked result rebakes to itself.
  const again = planNativeCollectionOperation({ sources: texts, routes, files: Object.keys(texts), revision: "r", identity, origin: { done: "", undone: "" } });
  if ("error" in again) assert.fail(again.error);
  assert.equal(again.operation.edits!.size, 0);
});

test("mixed folders add new records using native fallbacks", () => {
  const { sources, routes } = site();
  const converted = result(sources, routes, ["/work/", "/services/", "/articles/"]);
  if ("error" in converted) assert.fail(converted.error);
  assert.equal(converted.records, 4);
  const home = applied(sources, routes, converted, start(sources["index.html"]))["index.html"];
  assert.ok(home.includes(`<h3 slot="title">Web builds</h3>`));
  assert.ok(home.includes(`<p slot="body" class="body">Sites you can edit.</p>`));
  assert.ok(home.includes(`href="/services/web/">Read about Web builds</a>`));
  // No note filler: the component's own fallback shows.
  assert.equal(home.split("Web builds")[0].split("<card-project>").pop()!.includes('slot="note"'), false);
});

test("refuses cards whose order differs from page order, even with other pages mixed in", () => {
  const swapped = cards().replace(/(<card-project>[\s\S]*?<\/card-project>)(\s*)(<card-project>[\s\S]*?<\/card-project>)/, "$3$2$1");
  const { sources, routes } = site(swapped);
  assert.ok(swapped.indexOf("Harbour") < swapped.indexOf("Fern"));
  for (const folders of [["/work/"], ["/articles/", "/work/", "/services/"]])
    assert.equal((result(sources, routes, folders) as { error: string }).error, "These cards use a custom order. Choosing pages would reorder them, so nothing was changed.");
  // Same relative order with extra records is allowed.
  assert.ok(!("error" in result(site().sources, site().routes, ["/articles/", "/work/", "/services/"])));
});

test("refuses folders that would drop a current card, without writing", () => {
  const { sources, routes } = site();
  const converted = result(sources, routes, ["/services/"]);
  assert.match((converted as { error: string }).error, /leave out \/work\/fern-and-kettle\//);
});

test("refuses rich parts, external, duplicate and missing links", () => {
  const rich = site(cards().replace(`<p slot="body" class="body">A quiet portfolio.</p>`, `<p slot="body" class="body">A <em>quiet</em> portfolio.</p>`));
  assert.match((result(rich.sources, rich.routes, ["/work/"]) as { error: string }).error, /Only plain text parts/);
  const image = site(cards().replace(`<p slot="note">Cafe`, `<img slot="image" src="/a.jpg"><p slot="note">Cafe`));
  assert.ok("error" in result(image.sources, image.routes, ["/work/"]));
  const external = site(cards().replace(`/work/harbour-lane-pottery/"`, `https://example.com/"`));
  assert.match((result(external.sources, external.routes, ["/work/"]) as { error: string }).error, /not a page of this site/);
  const duplicate = site(cards().replace(`/work/harbour-lane-pottery/"`, `/work/fern-and-kettle/"`));
  assert.match((result(duplicate.sources, duplicate.routes, ["/work/"]) as { error: string }).error, /same page/);
  const attrs = site(cards().replace(`<card-project>\n          <p slot="note">Ceramics`, `<card-project class="wide">\n          <p slot="note">Ceramics`));
  assert.match((result(attrs.sources, attrs.routes, ["/work/"]) as { error: string }).error, /different settings/);
  assert.equal(readManualGrid("<div><p>a</p><p>b</p></div>", 0).hasOwnProperty("error"), true);
});

test("the actual starter Recent work grid converts losslessly", () => {
  const read = (path: string) => readFileSync(`${starter}/${path}`, "utf8");
  const home = read("index.html");
  const work = ["fern-and-kettle", "harbour-lane-pottery", "meadow-row-allotments"];
  const sources: Record<string, string> = { "index.html": home };
  const routes: Record<string, string> = { "/": "index.html" };
  for (const slug of work) { sources[`work/${slug}/index.html`] = read(`work/${slug}/index.html`); routes[`/work/${slug}/`] = `work/${slug}/index.html`; }
  const converted = planManualConversion({ sources, routes, identity, path: "index.html", start: home.indexOf('<div class="cards">'), folders: ["/work/"], token: "gstart" });
  if ("error" in converted) assert.fail(converted.error);
  assert.equal(converted.cards, 3);
  const texts = applied(sources, routes, converted, home.indexOf('<div class="cards">'));
  const baked = texts["index.html"];
  assert.doesNotMatch(baked, /<template|data-each|data-collection-id|\{title\}/);
  for (const text of ["Cafe · Identity and site · 2025", "Read about Meadow Row Allotments", "A small site for forty plot holders: rules, a plot map, seasonal notices, and a way to reach the committee.", 'href="/work/harbour-lane-pottery/"'])
    assert.ok(baked.includes(text), text);
  for (const slug of work) assert.equal(texts[`work/${slug}/index.html`], sources[`work/${slug}/index.html`]);
});
