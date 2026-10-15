import assert from "node:assert/strict";
import test from "node:test";
import { gridAt, gridOfItem, itemAround, instanceLabel, pageGrids, mainRange, linkRoute } from "../src/page-builder/card-source.ts";
import { readSource } from "../src/page-builder/source-tree.ts";

const context = { prefix: "", route: "/work/", routes: { "/": "index.html", "/work/": "work/index.html", "/work/a/": "work/a/index.html" }, isSection: () => false };

test("a card's link is a route of the site, relative links resolved against the page", () => {
  assert.equal(linkRoute("a/", context), "/work/a/");
  assert.equal(linkRoute("/work/new/", context), "/work/new/");
  assert.equal(linkRoute("b/", context), "/work/b/");
});

test("review: links never give a path outside the site's folders", () => {
  assert.equal(linkRoute("/work/../../bad/a/", context), "/bad/a/");
  assert.equal(linkRoute("/work/%2e%2e/x/", context), "/x/");
  assert.equal(linkRoute("/work/_parts/", context), undefined);
  assert.equal(linkRoute("https://example.com/work/a/", context), undefined);
  assert.equal(linkRoute("//example.com/a/", context), undefined);
  assert.equal(linkRoute("/work/a.html", context), undefined);
});

const tree = (source: string) => readSource(source, { page: true });
const document = (body: string) => `<!doctype html><html><head><title>Home</title></head><body>${body}</body></html>`;
const cards = '<article class="wide card"><h3><a href="a/">A</a></h3></article><article class="card wide"><h3><a href="b/">B</a></h3></article>';

test("grids share item kinds, exact ranges, routes and positions through the tree", () => {
  const source = document(`<main><section><h2>Work</h2><div>${cards}</div></section></main>`);
  const page = tree(source);
  const grid = gridAt(page, [0, 0, 1], context)!;
  assert.equal(grid.kind, "article.card.wide");
  assert.equal(grid.noun, "card");
  assert.equal(grid.label, "Work");
  assert.equal(grid.collection, "/work/");
  assert.deepEqual(grid.items.map(item => [item.index, item.route]), [[0, "/work/a/"], [1, "/work/b/"]]);
  for (const item of grid.items) {
    assert.deepEqual(item.range, page.range(page.at([...grid.parent, item.index])!));
    assert.match(source.slice(item.range.start, item.range.end), /^<article.*<\/article>$/);
  }
  assert.deepEqual(gridOfItem(page, [0, 0, 1, 1], context), { grid, position: 1 });
  assert.equal(gridOfItem(page, [0], context), undefined);
  assert.equal(gridOfItem(page, [0, 0, 1, 9], context), undefined);
  assert.equal(gridAt(page, [0, 9], context), undefined);
  assert.equal(gridAt(page, [], context), undefined);
});

test("item routes include the item itself and skip links outside subpages", () => {
  const page = tree('<section><a href="a/">A</a><a href="/work/new/">New</a></section>');
  assert.deepEqual(gridAt(page, [0], context)?.items.map(item => item.route), ["/work/a/", "/work/new/"]);
  const mixed = tree('<section><article><a href="/">Home</a><a href="https://example.com/x/">Off</a><a href="a/">A</a><a href="b/">B</a></article><article><a href="/work/">Work</a></article></section>');
  assert.deepEqual(gridAt(mixed, [0], context)?.items.map(item => item.route), ["/work/a/", undefined]);
  assert.equal(gridAt(mixed, [0], context)?.collection, undefined);
});

test("itemAround finds the nearest enclosing item and excludes the selection itself", () => {
  const page = tree(`<main><section><div>${cards}</div></section></main>`);
  assert.deepEqual(itemAround(page, [0, 0, 0, 1, 0, 0], context)?.node, [0, 0, 0, 1]);
  assert.equal(itemAround(page, [0, 0, 0, 1], context), undefined);
  assert.equal(itemAround(page, [0], context), undefined);
});

test("labels prefer preceding headings, including headings inside preceding siblings", () => {
  for (const before of ['<h2> Recent\nwork &amp; news </h2>', '<header><h2> Recent\nwork &amp; news </h2></header>']) {
    const page = tree(`<main><section aria-label="Other">${before}<p>Intro</p><div>${cards}</div></section></main>`);
    assert.equal(gridAt(page, [0, 0, 2], context)?.label, "Recent work & news");
  }
});

test("labels use the surrounding heading outside the grid, then aria-label or id", () => {
  const page = tree(`<main><section><div>${cards}</div><h2> Around &eacute; </h2></section></main>`);
  assert.equal(gridAt(page, [0, 0, 0], context)?.label, "Around é");
  for (const attribute of ['aria-label=" Named &amp; grid " id="Ignored"', 'id=" Named &amp; grid "']) {
    assert.equal(gridAt(tree(`<main><section ${attribute}><div>${cards}</div></section></main>`), [0, 0, 0], context)?.label, "Named & grid");
  }
});

test("labels stop at NOT_GRIDS and fall back to the item noun", () => {
  assert.equal(gridAt(tree(`<main><h1>Not the grid name</h1><section><div>${cards}</div></section></main>`), [0, 1, 0], context)?.label, "Cards");
  assert.equal(gridAt(tree('<section><ul><li>A</li><li>B</li></ul></section>'), [0, 0], context)?.label, "Items");
  assert.equal(gridAt(tree('<section><nav><a>A</a><a>B</a></nav></section>'), [0, 0], context)?.label, "Links");
});

test("instance labels read their own first heading or use the component label", () => {
  assert.equal(instanceLabel(tree('<section-work><div><h2> Caf&eacute;\nwork </h2></div></section-work>'), [0]), "Café work");
  assert.equal(instanceLabel(tree('<section-work></section-work>'), [0]), "Section work");
  assert.equal(instanceLabel(tree('<section-work></section-work>'), [9]), undefined);
});

test("pageGrids returns nested collections outermost first and excludes page containers and sections as items", () => {
  const item = (name: string) => `<article><a href="/work/${name}/">${name}</a><ul><li>One</li><li>Two</li></ul></article>`;
  const page = tree(`<main><section><div>${item("a")}${item("b")}</div></section></main>`);
  const grids = pageGrids(page, context);
  assert.deepEqual(grids.map(grid => grid.parent), [[0, 0, 0], [0, 0, 0, 0, 1], [0, 0, 0, 1, 1]]);
  assert.equal(grids[0].collection, "/work/");
  assert.equal(gridAt(tree(`<main>${cards}</main>`), [0], context), undefined);
  assert.equal(gridAt(tree('<div><section-work></section-work><section-work></section-work></div>'), [0], { ...context, isSection: tag => tag === "section-work" }), undefined);
  assert.equal(gridAt(tree('<div><section></section><section></section></div>'), [0], context), undefined);
});

test("mainRange requires an explicit main with a close tag and returns only its content", () => {
  const source = document('<main><h1>Title</h1><p>Body</p></main>');
  const range = mainRange(tree(source))!;
  assert.equal(source.slice(range.start, range.end), '<h1>Title</h1><p>Body</p>');
  assert.equal(mainRange(tree(document('<section>Body</section>'))), undefined);
  assert.equal(mainRange(tree('<main><h1>Title</h1>')), undefined);
  assert.equal(mainRange(tree('<template><main>Hidden</main></template>')), undefined);
});

test("grids drop scripts and refuse an item without an exact range", () => {
  const page = tree('<section><article><a href="a/">A</a></article><script>ignored()</script><article><a href="b/">B</a></article></section>');
  assert.deepEqual(gridAt(page, [0], context)?.items.map(item => item.index), [0, 1]);
  assert.equal(gridAt(tree('<section><article>A</article><article>B</section>'), [0], context), undefined);
});

test("prefixed card links keep unprefixed route identities, including missing pages", () => {
  const site = { ...context, prefix: "/my-site", routes: { ...context.routes, "/about/": "about/index.html" } };
  for (const href of ["/about/", "/my-site/about/"]) assert.equal(linkRoute(href, site), "/about/");
  for (const href of ["/work/new/", "/my-site/work/new/"]) assert.equal(linkRoute(href, site), "/work/new/");
  const grid = gridAt(tree(document('<main><div><article><a href="/my-site/work/a/">A</a></article><article><a href="/work/b/">B</a></article></div></main>')), [0, 0], site)!;
  assert.deepEqual(grid.items.map(item => item.route), ["/work/a/", "/work/b/"]);
  assert.equal(grid.collection, "/work/");
});
