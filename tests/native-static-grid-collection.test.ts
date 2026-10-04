import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nativePageRoute } from "../shared/native-routes.ts";
import { planStaticCardConversion, readStaticCardGrid, type StaticConversionInput } from "../src/page-builder/native-static-grid-collection.ts";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document.ts";

// The native static starter's grid of project cards, byte for byte, and its
// pages' titles and descriptions; the vendored starter
// (public/native-static-starter/v6a9ca44) is checked to hold them.
const REAL_GRID = "      <div class=\"cards\">\n        <article class=\"card-project\">\n          <p class=\"card-note\">Cafe · Identity and site · 2025</p>\n          <h3>Fern &amp; Kettle</h3>\n          <p class=\"body\">A one-page site with a menu the owners change themselves before opening each morning.</p>\n          <p class=\"actions\"><a href=\"/work/fern-and-kettle/\">Read about Fern &amp; Kettle</a></p>\n        </article>\n        <article class=\"card-project\">\n          <p class=\"card-note\">Ceramics studio · Portfolio · 2025</p>\n          <h3>Harbour Lane Pottery</h3>\n          <p class=\"body\">A quiet portfolio for a working potter, with large photographs and a dates page for kiln openings.</p>\n          <p class=\"actions\"><a href=\"/work/harbour-lane-pottery/\">Read about Harbour Lane Pottery</a></p>\n        </article>\n        <article class=\"card-project\">\n          <p class=\"card-note\">Community group · Notices and rules · 2024</p>\n          <h3>Meadow Row Allotments</h3>\n          <p class=\"body\">A small site for forty plot holders: rules, a plot map, seasonal notices, and a way to reach the committee.</p>\n          <p class=\"actions\"><a href=\"/work/meadow-row-allotments/\">Read about Meadow Row Allotments</a></p>\n        </article>\n      </div>";
const REAL_PAGES: Record<string, string> = {
  "work/fern-and-kettle/index.html": "  <title>Fern &amp; Kettle · Larkspur Studio</title>\n  <meta name=\"description\" content=\"A one-page site for a neighbourhood cafe, with a printable menu the owners update themselves each morning.\">",
  "work/harbour-lane-pottery/index.html": "  <title>Harbour Lane Pottery · Larkspur Studio</title>\n  <meta name=\"description\" content=\"A quiet portfolio for a working potter, with large photographs and a dates page for kiln openings.\">",
  "work/meadow-row-allotments/index.html": "  <title>Meadow Row Allotments · Larkspur Studio</title>\n  <meta name=\"description\" content=\"Rules, a plot map, seasonal notices and a committee contact page for a forty-plot allotment site.\">",
};
const CSS = ".card-project { padding: 1rem; }\n";

const page = (head: string, main = "") => `<!doctype html>\n<html lang="en-GB">\n<head>\n  <meta charset="utf-8">\n${head}\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n  <main>\n${main}  </main>\n</body>\n</html>\n`;
const home = (grid: string) => page("  <title>Home · Larkspur Studio</title>", `    <section id="work">\n${grid}\n    </section>\n`);
const route = (path: string) => "/" + path.replace(/index\.html$/, "");
const articles = (grid: string) => [...grid.matchAll(/<article[\s\S]*?<\/article>/g)].map((match) => match[0]);

function site(grid: string, pages: Record<string, string> = REAL_PAGES, name = "Larkspur Studio"): StaticConversionInput {
  const sources: Record<string, string> = { "index.html": home(grid), "styles/site.css": CSS };
  const routes: Record<string, string> = { "/": "index.html" };
  for (const [path, head] of Object.entries(pages)) {
    sources[path] = page(head, `    <h1>${path}</h1>\n`);
    routes[route(path)] = path;
  }
  const start = sources["index.html"].indexOf('<div class="cards">');
  return { sources, files: Object.keys(sources), routes, identity: { name }, path: "index.html", start, folders: ["/work/"], token: "grid1" };
}
function planned(input: StaticConversionInput) {
  const plan = planStaticCardConversion(input);
  if ("error" in plan) assert.fail(plan.error);
  return plan;
}
/** The published page: every current card is there byte for byte, and nothing the editor uses. */
function assertStatic(text: string, cards: string[]) {
  for (const card of cards) assert.ok(text.includes(card), `card kept exactly:\n${card}`);
  // The starter's own JSON-LD is data, not script; nothing else may run.
  assert.doesNotMatch(text, /data-if|data-each|data-collection|<template|<script(?![^>]*application\/ld\+json)|\{[a-z]/);
}

test("the native starter's three cards convert with every card kept byte for byte", () => {
  const input = site(REAL_GRID);
  const plan = planned(input);
  assert.equal(plan.cards, 3);
  assert.equal(plan.records, 3);
  // Only the page and the editor's page data are written; the stylesheet never.
  assert.deepEqual([...plan.texts.keys()].sort(), [EDITOR_PAGE_BUILDER_PATH, "index.html"]);
  const after = plan.texts.get("index.html")!;
  assertStatic(after, articles(REAL_GRID));
  // Outside the grid the page is unchanged.
  const before = input.sources["index.html"];
  assert.equal(after.slice(0, after.indexOf('<div class="cards">')), before.slice(0, before.indexOf('<div class="cards">')));
  assert.ok(after.endsWith(before.slice(before.indexOf("</div>\n    </section>"))));
  // The editor's bake writes cards one per line, so only the indentation between them changes.
  const inner = (text: string) => text.slice(text.indexOf('<div class="cards">') + 19, text.indexOf("</div>\n    </section>"));
  assert.equal(inner(after), articles(REAL_GRID).join("\n"));
  assert.equal(inner(before).replace(/\n\s*/g, "\n").trim(), inner(after).replace(/\n\s*/g, "\n").trim());
  // Titles and links come from the pages; the notes, and the bodies the pages
  // do not say, are this grid's overrides in the editor's JSON only.
  assert.deepEqual(plan.recipe.fields, ["grid1-card-note", "grid1-description"]);
  assert.deepEqual(plan.recipe.overrides, {
    "work/fern-and-kettle/index.html": { "grid1-card-note": "Cafe · Identity and site · 2025", "grid1-description": "A one-page site with a menu the owners change themselves before opening each morning." },
    "work/harbour-lane-pottery/index.html": { "grid1-card-note": "Ceramics studio · Portfolio · 2025" },
    "work/meadow-row-allotments/index.html": { "grid1-card-note": "Community group · Notices and rules · 2024", "grid1-description": "A small site for forty plot holders: rules, a plot map, seasonal notices, and a way to reach the committee." },
  });
  assert.match(plan.recipe.template, /<h3>\{title\}<\/h3>/);
  assert.match(plan.recipe.template, /<a href="\{url\}">Read about \{title\}<\/a>/);
  const sidecar = JSON.parse(plan.texts.get(EDITOR_PAGE_BUILDER_PATH)!);
  assert.equal(Object.values<{ pagePath: string }>(sidecar.collections)[0].pagePath, "index.html");
  assert.deepEqual(plan.expectedSources.get("index.html"), input.sources["index.html"]);
  assert.equal(plan.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), undefined);
});

const STARTER = "public/native-static-starter/v6a9ca44";
test("the vendored native starter converts as it is: its cards stay byte for byte and the site stays plain", () => {
  const manifest = JSON.parse(readFileSync(`${STARTER}/manifest.json`, "utf8")) as { files: { path: string }[]; inline: { path: string; content: string }[] };
  const sources: Record<string, string> = {};
  const files: string[] = [];
  for (const { path } of manifest.files) {
    files.push(path);
    // Text files are read as the editor would; the social card PNG is listed but has no text.
    if (!path.endsWith(".png")) sources[path] = readFileSync(`${STARTER}/files/${path}.asset`, "utf8");
  }
  for (const { path, content } of manifest.inline) { files.push(path); sources[path] = content; }
  const routes: Record<string, string> = {};
  for (const path of files) { const url = nativePageRoute(path); if (url) routes[url] = path; }
  const home = sources["index.html"];
  assert.ok(home.includes(REAL_GRID));
  for (const [path, head] of Object.entries(REAL_PAGES)) assert.ok(sources[path].includes(head), path);
  assert.match(home, /<link rel="stylesheet" href="\/styles\/site.css">/);
  const name = JSON.parse(sources[".editor/config.json"]).site.name;
  const plan = planned({ sources, files, routes, identity: { name }, path: "index.html", start: home.indexOf('<div class="cards">'), folders: ["/work/"], token: "grid1" });
  assert.equal(plan.cards, 3);
  assert.equal(plan.records, 3);
  assert.deepEqual([...plan.texts.keys()].sort(), [EDITOR_PAGE_BUILDER_PATH, "index.html"]);
  const after = plan.texts.get("index.html")!;
  assertStatic(after, articles(REAL_GRID));
  assert.equal(after.slice(0, after.indexOf('<div class="cards">')), home.slice(0, home.indexOf('<div class="cards">')));
  // From the grid's end tag on, the page is the same (the bake writes cards one per line).
  assert.equal(after.slice(after.indexOf("</article></div>") + "</article>".length), home.slice(home.indexOf(REAL_GRID) + REAL_GRID.length - "</div>".length));
  // Every page the plan read is pinned, with the graph it was planned against.
  for (const path of ["index.html", ...Object.keys(REAL_PAGES), "about/index.html", "404.html"]) assert.equal(plan.expectedSources.get(path), sources[path], path);
  assert.equal(plan.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), undefined);
  assert.ok(plan.expectedSources.has(EDITOR_PAGE_BUILDER_PATH));
  assert.deepEqual(plan.expectedFiles, [...files].sort());
  assert.deepEqual(plan.expectedRoutes, routes);
});

test("the plan pins every page it read, the file graph, the routes and the site name", () => {
  const pages = { "work/alpha/index.html": head("Alpha"), "work/beta/index.html": head("Beta"), "work/gamma/index.html": head("Gamma") };
  const input = site(grid(card("/work/alpha/", "Alpha"), card("/work/beta/", "Beta")), pages);
  const plan = planned(input);
  // Gamma is not a card yet, but its title becomes a new card: its text is pinned.
  assert.equal(plan.records, 3);
  assert.equal(plan.expectedSources.get("work/gamma/index.html"), input.sources["work/gamma/index.html"]);
  const renamed = planned({ ...input, sources: { ...input.sources, "work/gamma/index.html": input.sources["work/gamma/index.html"].replace("Gamma ·", "Delta ·") } });
  assert.notEqual(renamed.texts.get("index.html"), plan.texts.get("index.html"));
  assert.equal(plan.expectedSources.get("index.html"), input.sources["index.html"]);
  assert.ok(plan.expectedSources.has(EDITOR_PAGE_BUILDER_PATH));
  assert.deepEqual(plan.expectedFiles, [...input.files].sort());
  assert.deepEqual(plan.expectedRoutes, input.routes);
  assert.notEqual(plan.expectedRoutes, input.routes);
  assert.deepEqual(plan.expectedIdentity, { name: "Larkspur Studio" });
  // A new page in a chosen folder is a different graph.
  const grown = { ...input.routes, "/work/delta/": "work/delta/index.html" };
  assert.notDeepEqual(plan.expectedRoutes, grown);
});

test("a plan needs the complete file graph, with every page and the page data loaded", () => {
  const pages = { "work/alpha/index.html": head("Alpha"), "work/beta/index.html": head("Beta") };
  const input = site(grid(card("/work/alpha/", "Alpha"), card("/work/beta/", "Beta")), pages);
  const refused = (change: Partial<StaticConversionInput>, pattern: RegExp) => {
    const plan = planStaticCardConversion({ ...input, ...change });
    assert.ok("error" in plan, `refused: ${pattern}`);
    assert.match(plan.error, pattern);
  };
  refused({ files: input.files.filter((path) => path !== "styles/site.css") }, /not in the site's file list/);
  refused({ routes: { ...input.routes, "/about/": "about/index.html" } }, /not in the site's file list/);
  refused({ files: [...input.files, "about/index.html"] }, /Load about\/index.html/);
  refused({ files: [...input.files, EDITOR_PAGE_BUILDER_PATH] }, /Load \.editor\/page-builder\.json/);
});

test("a page title with a brand tail the site name does not match is kept as an override", () => {
  const plan = planned(site(REAL_GRID, REAL_PAGES, "My site"));
  assert.ok(plan.recipe.fields!.includes("grid1-title"));
  assert.equal(plan.recipe.overrides!["work/fern-and-kettle/index.html"]["grid1-title"], "Fern & Kettle");
  assert.equal(plan.recipe.overrides!["work/fern-and-kettle/index.html"]["grid1-link"], "Read about Fern & Kettle");
  assertStatic(plan.texts.get("index.html")!, articles(REAL_GRID));
});

const card = (href: string, title: string, note = "Note") =>
  `        <article class="card-project">\n          <p class="card-note">${note}</p>\n          <h3>${title}</h3>\n          <p class="actions"><a href="${href}">Read about ${title}</a></p>\n        </article>`;
const grid = (...cards: string[]) => `      <div class="cards">\n${cards.join("\n")}\n      </div>`;
const head = (title: string, extra = "") => `  <title>${title} · Larkspur Studio</title>\n  <meta name="description" content="About ${title}.">${extra}`;

test("five folders make one sorted, filtered list; current cards stay and new pages get plain cards", () => {
  const pages = {
    "work/alpha/index.html": head("Alpha", '\n  <meta name="field:kind" content="show">'),
    "services/beta/index.html": head("Beta", '\n  <meta name="field:kind" content="show">'),
    "portfolio/gamma/index.html": head("Gamma", '\n  <meta name="field:kind" content="show">'),
    "articles/delta/index.html": head("Delta", '\n  <meta name="field:kind" content="hide">'),
    "videos/epsilon/index.html": head("Epsilon", '\n  <meta name="field:kind" content="show">'),
  };
  const current = grid(card("/work/alpha/", "Alpha", "One"), card("/portfolio/gamma/", "Gamma", "Three"));
  const input = { ...site(current, pages), folders: ["/work/", "/services/", "/portfolio/", "/articles/", "/videos/", "/work/"], sort: "title", filter: "kind=show" };
  const plan = planned(input);
  assert.deepEqual(plan.recipe.folders, ["/work/", "/services/", "/portfolio/", "/articles/", "/videos/"]);
  assert.equal(plan.cards, 2);
  assert.equal(plan.records, 4);
  const after = plan.texts.get("index.html")!;
  assertStatic(after, articles(current));
  // Delta is filtered out; Beta and Epsilon are new, with no note and the page's own title and link.
  assert.ok(!after.includes("Delta"));
  assert.deepEqual(articles(after).map((item) => /<h3>([^<]*)/.exec(item)![1]), ["Alpha", "Beta", "Epsilon", "Gamma"]);
  assert.equal(articles(after)[1], `<article class="card-project">\n          \n          <h3>Beta</h3>\n          <p class="actions"><a href="/services/beta/">Read about Beta</a></p>\n        </article>`);
  assert.ok(![...plan.texts.keys()].some((path) => path.endsWith(".css")));
});

test("a card image keeps its own src and alt", () => {
  const withImage = (href: string, title: string, src: string) =>
    `        <article class="card">\n          <img src="${src}" alt="${title} photo">\n          <h3>${title}</h3>\n          <a href="${href}">Read about ${title}</a>\n        </article>`;
  const current = grid(withImage("/work/alpha/", "Alpha", "/images/a.jpg"), withImage("/work/beta/", "Beta", "/images/b.jpg"));
  const plan = planned(site(current, { "work/alpha/index.html": head("Alpha"), "work/beta/index.html": head("Beta") }));
  assertStatic(plan.texts.get("index.html")!, articles(current));
  assert.equal(plan.recipe.overrides!["work/beta/index.html"]["grid1-image-src"], "/images/b.jpg");
  const unsafe = grid(withImage("/work/alpha/", "Alpha", "javascript:alert(1)"), withImage("/work/beta/", "Beta", "/images/b.jpg"));
  const read = readStaticCardGrid(home(unsafe), home(unsafe).indexOf('<div class="cards">'));
  assert.ok("error" in read);
  assert.match(read.error, /safe src/);
});

test("anything a collection cannot keep exactly is refused, and nothing is planned", () => {
  const pages = { "work/alpha/index.html": head("Alpha"), "work/beta/index.html": head("Beta") };
  const refuse = (current: string, pattern: RegExp, change: Partial<StaticConversionInput> = {}, override = pages) => {
    const plan = planStaticCardConversion({ ...site(current, override), ...change });
    assert.ok("error" in plan, `refused: ${pattern}`);
    assert.match(plan.error, pattern);
  };
  const ab = grid(card("/work/alpha/", "Alpha"), card("/work/beta/", "Beta"));
  refuse(grid(card("https://example.com/", "Alpha"), card("/work/beta/", "Beta")), /not a page of this site/);
  refuse(grid(card("/work/missing/", "Alpha"), card("/work/beta/", "Beta")), /not a page of this site/);
  refuse(grid(card("/work/alpha/", "Alpha"), card("/work/alpha/", "Alpha"), card("/work/beta/", "Beta")), /same page/);
  refuse(grid(card("/work/beta/", "Beta"), card("/work/alpha/", "Alpha")), /custom order/);
  refuse(grid(card("/work/alpha/", "Alpha"), card("/", "Home")), /this page itself/);
  refuse(ab, /leave out/, { folders: ["/services/"] });
  refuse(ab, /leave out/, { limit: 1 });
  refuse(ab, /Select at least one folder/, { folders: [] });
  refuse(ab, /valid collection id/, { token: "1x" });
  const unloaded = site(ab, pages);
  delete (unloaded.sources as Record<string, string>)["work/beta/index.html"];
  assert.match((planStaticCardConversion(unloaded) as { error: string }).error, /Load work\/beta\/index.html/);
  // Shapes: rich text, a varying class, a second link, comments, braces, scripts, recipe attributes.
  refuse(grid(card("/work/alpha/", "Alpha", "<em>One</em> more"), card("/work/beta/", "Beta")), /mixes text with other markup/);
  refuse(grid(card("/work/alpha/", "Alpha"), card("/work/beta/", "Beta").replace('class="card-note"', 'class="card-note wide"')), /differ in more than/);
  refuse(grid(card("/work/alpha/", "Alpha"), card("/work/beta/", "Beta").replace("<h3>", "<h3>Beta</h3>\n          <h3>")), /differ in more than/);
  refuse(grid(card("/work/alpha/", "Alpha").replace("</article>", '<a href="/work/beta/">More</a></article>'), card("/work/beta/", "Beta")), /exactly one link/);
  refuse(grid(card("/work/alpha/", "Alpha").replace("</article>", "<!-- note --></article>"), card("/work/beta/", "Beta")), /comment/);
  refuse(grid(card("/work/alpha/", "{title}"), card("/work/beta/", "Beta")), /braces/);
  refuse(grid(card("/work/alpha/", "Alpha").replace("</article>", "<script>x()</script></article>"), card("/work/beta/", "Beta")), /<script>/);
  refuse(grid(card("/work/alpha/", "Alpha").replace("<h3>", '<h3 data-if="title">'), card("/work/beta/", "Beta").replace("<h3>", '<h3 data-if="title">')), /editor or script attributes/);
  refuse(`      <div class="cards">\n${card("/work/alpha/", "Alpha")}\n        text\n${card("/work/beta/", "Beta")}\n      </div>`, /between its cards/);
  refuse(`      <div class="cards">\n${card("/work/alpha/", "Alpha")}\n      </div>`, /two or more/);
});
