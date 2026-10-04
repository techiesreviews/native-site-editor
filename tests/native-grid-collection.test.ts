import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { applyCollectionEdits, bindCollectionTemplate, planBake } from "../src/page-builder/collection-bake.ts";
import { readPageFields } from "../src/page-builder/collection-fields.ts";
import { manualGridFolders, planManualConversion, readManualGrid } from "../src/page-builder/native-grid-collection.ts";

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

test("conversion keeps every card's text, attributes and link, and leaves SEO alone", () => {
  const { sources, routes } = site();
  const converted = result(sources, routes, ["/work/"]);
  if ("error" in converted) assert.fail(converted.error);
  const final = (path: string) => applyCollectionEdits(converted.plan.expectedSources[path], converted.plan.edits[path] ?? []);
  const home = final("index.html");
  assert.match(home, /<div class="cards" data-each="\/work\/" data-collection-id="gabc12"><template>/);
  for (const text of ["Cafe · Identity and site · 2025", "Fern &amp; Kettle", "A one-page site with a menu.", 'href="/work/fern-and-kettle/"', "Read about Fern &amp; Kettle", "Harbour Lane Pottery", "A quiet portfolio.", 'class="body"'])
    assert.ok(home.split("</template>")[1].includes(text), text);
  // Title matches the page: bare {title}. Body differs on one card: override + fallback.
  assert.ok(converted.template.includes(`<h3 slot="title">{title}</h3>`));
  assert.ok(converted.template.includes(`<p slot="body" class="body" data-if="!gabc12-body">{description}</p>`));
  assert.ok(converted.template.includes(`<a slot="link" href="{url}">Read about {title}</a>`));
  assert.ok(!converted.template.includes(`data-if="!gabc12-note"`));
  const fern = final("work/fern-and-kettle/index.html");
  assert.equal(readPageFields(fern, "/work/fern-and-kettle/", identity).description, "A cafe site with a printable menu.");
  assert.ok(fern.includes(`<title>Fern &amp; Kettle · Larkspur Studio</title>`));
  assert.equal(readPageFields(fern, "/work/fern-and-kettle/", identity)["gabc12-body"], "A one-page site with a menu.");
  assert.equal(readPageFields(final("work/harbour-lane-pottery/index.html"), "/", identity)["gabc12-body"], undefined);
  // Already-baked result rebakes to itself.
  const rebaked = planBake(Object.fromEntries(Object.keys(sources).map((path) => [path, final(path)])), routes, identity);
  if ("error" in rebaked) assert.fail(rebaked.error);
  assert.deepEqual(rebaked.edits, {});
});

test("mixed folders add new records using native fallbacks", () => {
  const { sources, routes } = site();
  const converted = result(sources, routes, ["/work/", "/services/", "/articles/"]);
  if ("error" in converted) assert.fail(converted.error);
  assert.equal(converted.records, 4);
  const home = applyCollectionEdits(sources["index.html"], converted.plan.edits["index.html"]);
  assert.ok(home.includes(`<h3 slot="title">Web builds</h3>`));
  assert.ok(home.includes(`<p slot="body" class="body" data-if="!gabc12-body">Sites you can edit.</p>`));
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
  const final = applyCollectionEdits(home, converted.plan.edits["index.html"]);
  const baked = final.split("</template>")[1];
  for (const text of ["Cafe · Identity and site · 2025", "Read about Meadow Row Allotments", "A small site for forty plot holders: rules, a plot map, seasonal notices, and a way to reach the committee.", 'href="/work/harbour-lane-pottery/"'])
    assert.ok(baked.includes(text), text);
  for (const slug of work) {
    const before = readPageFields(sources[`work/${slug}/index.html`], `/work/${slug}/`, identity);
    const after = readPageFields(applyCollectionEdits(sources[`work/${slug}/index.html`], converted.plan.edits[`work/${slug}/index.html`] ?? []), `/work/${slug}/`, identity);
    assert.equal(after.title, before.title); assert.equal(after.description, before.description);
  }
});
