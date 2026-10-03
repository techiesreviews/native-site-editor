import assert from "node:assert/strict";
import test from "node:test";
import { addCatalog, filterCatalog, groupName, suggestedItems } from "../src/page-builder/add-catalog.ts";
import { defaultInsertPoint, pointAt, positionText } from "../src/page-builder/insert-target.ts";
import { expandComponents, inertHtml, thumbnailDocument, type ThumbnailInputs } from "../src/page-builder/thumbnail-doc.ts";
import type { InsertPoint } from "../src/components/insert-controls.ts";

const choice = (tag: string) => ({ tag, label: tag.charAt(0).toUpperCase() + tag.slice(1).split("-").join(" ") });

test("components sharing a first word make a group, named in the plural, the rest go together", () => {
  const groups = addCatalog(["card-note", "feature-block", "section-contact", "section-hero", "section-split"].map(choice));
  assert.deepEqual(groups.map((group) => group.name), ["Sections", "More sections"]);
  // In page order: a hero first, a call to action last.
  assert.deepEqual(groups[0].items.map((item) => [item.name, item.tag]), [["Hero", "section-hero"], ["Split", "section-split"], ["Contact", "section-contact"]]);
  assert.deepEqual(groups[1].items.map((item) => item.name), ["Feature block", "Card note"]);
  assert.equal(groups[0].items[0].label, "Section hero");
  // No shared word: one group of sections.
  assert.deepEqual(addCatalog([choice("feature-block")]).map((group) => [group.name, group.items[0].name]), [["Sections", "Feature block"]]);
  assert.deepEqual(addCatalog([]), []);
  assert.equal(groupName("box"), "Boxes");
  assert.equal(groupName("gallery"), "Galleries");
  assert.equal(groupName("hero"), "Heros");
});

test("search matches the name, the full name, the tag and the group", () => {
  const groups = addCatalog(["section-hero", "section-split", "feature-block"].map(choice));
  assert.deepEqual(filterCatalog(groups, "hero").flatMap((group) => group.items.map((item) => item.tag)), ["section-hero"]);
  assert.deepEqual(filterCatalog(groups, "SECTION-S").flatMap((group) => group.items.map((item) => item.tag)), ["section-split"]);
  assert.deepEqual(filterCatalog(groups, "more").flatMap((group) => group.items.map((item) => item.tag)), ["feature-block"]);
  assert.deepEqual(filterCatalog(groups, "zzz"), []);
  assert.equal(filterCatalog(groups, "  ").length, 2);
});

test("an empty page suggests the likeliest openers first", () => {
  const groups = addCatalog(["section-contact", "section-feature", "section-hero", "section-intro", "section-split"].map(choice));
  assert.deepEqual(suggestedItems(groups).map((item) => item.tag), ["section-hero", "section-intro", "section-feature"]);
  assert.deepEqual(suggestedItems(addCatalog([choice("feature-block")])).map((item) => item.tag), ["feature-block"]);
});

const point = (parent: number[], index: number, top: number, extra: Partial<InsertPoint> = {}): InsertPoint =>
  ({ path: "index.html", parent, index, top, left: 0, width: 1000, before: "", tag: "main", ...extra });

test("a click inserts after the selected section, or the section around the selection, else at the end of <main>", () => {
  const points = [point([1], 0, 0, { before: "Hero" }), point([1], 1, 400, { before: "Cards" }), point([1], 2, 800)];
  assert.equal(defaultInsertPoint(points, { path: "index.html", node: [1, 0] })?.index, 1);
  // A heading inside the first section: after that section.
  assert.equal(defaultInsertPoint(points, { path: "index.html", node: [1, 0, 2] })?.index, 1);
  // Nothing selected, a selection in a component's template, or the header: the end of <main>.
  assert.equal(defaultInsertPoint(points)?.index, 2);
  assert.equal(defaultInsertPoint(points, { path: "components/x/x.html", node: [0] })?.index, 2);
  assert.equal(defaultInsertPoint(points, { path: "index.html", node: [0] })?.index, 2);
  assert.equal(defaultInsertPoint([]), undefined);
  // Gaps in a <div> and in <main>: <main>'s end wins.
  const nested = [point([1, 0], 0, 0, { tag: "div" }), point([1, 0], 1, 100, { tag: "div" }), point([1], 0, 0), point([1], 1, 300)];
  assert.deepEqual(defaultInsertPoint(nested)?.parent, [1]);
  assert.equal(defaultInsertPoint(nested)?.index, 1);
});

test("a drag goes into the gap nearest the pointer, an empty <main> taking its whole area", () => {
  const points = [point([1], 0, 100), point([1], 1, 500), point([1], 2, 900)];
  assert.equal(pointAt(points, 300, 120)?.index, 0);
  assert.equal(pointAt(points, 300, 680)?.index, 1);
  assert.equal(pointAt(points, 300, 720)?.index, 2);
  assert.equal(pointAt([], 0, 0), undefined);
  // A narrow column's gap wins only when the pointer is over that column.
  const columns = [point([1], 0, 300, { left: 0, width: 400 }), point([2], 0, 320, { left: 600, width: 400 })];
  assert.deepEqual(pointAt(columns, 700, 300)?.parent, [2]);
  assert.deepEqual(pointAt(columns, 100, 320)?.parent, [1]);
  const empty = [point([1], 0, 100, { empty: true, height: 480 })];
  assert.equal(pointAt(empty, 300, 400)?.empty, true);
  assert.equal(positionText(empty[0]), "Goes into the empty page");
  assert.equal(positionText(point([1], 0, 0, { before: "Work" })), "Goes before “Work”");
  assert.equal(positionText(point([1], 3, 0)), "Goes at the end");
});

const inputs = (extra: Partial<ThumbnailInputs> = {}): ThumbnailInputs => ({
  site: {
    routes: { "/": "index.html" },
    components: { "section-hero": "components/section-hero/section-hero.html", "site-button": "components/site-button/site-button.html" },
  },
  sources: {
    "index.html": `<!doctype html><html><head><link rel="stylesheet" href="/styles/site.css"><script src="/x.js"></script></head><body><main class="page" id="main"><section-hero></section-hero></main></body></html>`,
    "styles/site.css": `@import "tokens.css";\nbody { background: url("/images/bg.png"); }`,
    "styles/tokens.css": `:root { --ink: #222; }`,
    "components/section-hero/section-hero.html": `<section><slot name="title"><h1>Hello</h1></slot><site-button>Go</site-button><img src="/images/hero.png" alt=""></section>`,
    "components/section-hero/section-hero.css": `h1 { color: var(--ink); }`,
    "components/site-button/site-button.html": `<a class="button" onclick="steal()" href="javascript:alert(1)"><slot></slot></a><script>alert(1)</script>`,
  },
  componentStyles: { "section-hero": "components/section-hero/section-hero.css" },
  assets: { "images/hero.png": "data:image/png;base64,AAA", "images/bg.png": "data:image/png;base64,BBB" },
  route: "/",
  ...extra,
});

test("a thumbnail document renders the markup with the site's CSS and every component as a declarative shadow root, and nothing that runs", () => {
  const markup = `<section-hero>\n  <h1 slot="title">Hello</h1>\n</section-hero>`;
  const doc = thumbnailDocument(inputs(), markup);
  assert.match(doc, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">/);
  // The page's container, then the instance exactly as it is inserted, its template in a shadow root.
  assert.match(doc, /<body><main class="page" id="main"><section-hero><template shadowrootmode="open">/);
  assert.match(doc, /<\/template>\n  <h1 slot="title">Hello<\/h1>\n<\/section-hero><\/main><\/body>/);
  // The shared sheets (imports first, the @import itself left out) in the document and in each shadow root.
  assert.ok(doc.indexOf(":root { --ink: #222; }") < doc.indexOf("body { background"));
  assert.doesNotMatch(doc, /@import/);
  assert.equal(doc.split(":root { --ink: #222; }").length - 1, 3);
  // The component's own CSS with its ::slotted() twins, images as data URLs.
  assert.match(doc, /h1, ::slotted\(h1\) \{ color: var\(--ink\); \}/);
  assert.match(doc, /url\("data:image\/png;base64,BBB"\)/);
  assert.match(doc, /<img src="data:image\/png;base64,AAA" alt="">/);
  // The nested button is expanded too; its script and handlers are gone.
  assert.match(doc, /<site-button><template shadowrootmode="open">/);
  assert.doesNotMatch(doc, /<script|onclick|javascript:/i);
});

test("expanding components stops at a template that uses itself, and leaves unknown tags alone", () => {
  const loop = inputs({
    sources: { ...inputs().sources, "components/section-hero/section-hero.html": `<section><section-hero></section-hero></section>` },
  });
  const out = expandComponents(`<section-hero></section-hero><other-tag></other-tag>`, loop, []);
  assert.equal(out.split("<template shadowrootmode").length - 1, 1);
  assert.match(out, /<other-tag><\/other-tag>$/);
  assert.equal(inertHtml(`<p onmouseover='x()' title="on">a</p><meta http-equiv="refresh" content="0">`), `<p title="on">a</p>`);
});
