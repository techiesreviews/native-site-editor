import assert from "node:assert/strict";
import test from "node:test";
import { applyCollectionEdits, bindCollectionTemplate, planBake, planCollectionChange } from "../src/page-builder/collection-bake.ts";
import { collectionSpec, makeGridCollection } from "../src/page-builder/collection-model.ts";
import { readPageFields } from "../src/page-builder/collection-fields.ts";
import { withPageField } from "../src/page-builder/site-head.ts";
const identity = { name: "Studio" };
const page = (title: string, extras = "", body = "") => `<!doctype html><html><head><title>${title} | Studio</title>${extras}</head><body>${body}</body></html>`;
const listing = `<main><p data-if="outside">Keep outside</p><div class="cards" data-each="/work/" data-sort="-date" data-limit="2"><template><article><a href="{url}">{title}</a><img src="{image}" data-if="image"><p>{description}</p></article></template><b>Old baked card</b></div></main>`;
const sources = {
  "index.html": page("Home", "", listing),
  "work/index.html": page("Work"),
  "work/first/index.html": page("First", `<meta name="date" content="2024-01-02"><meta name="field:category" content="Pottery">`),
  "work/second/index.html": page("Second", `<meta name="date" content="2025-02-03"><meta property="og:image" content="/second.jpg"><meta name="description" content="Clay &amp; glaze"><meta name="field:category" content="Wood">`),
  "work/deep/third/index.html": page("Third", `<meta name="date" content="2025-02-03"><meta name="field:category" content="Pottery">`),
  "workshop/other/index.html": page("Unrelated"),
};
const routes = { "/": "index.html", "/work/": "work/index.html", "/work/first/": "work/first/index.html", "/work/second/": "work/second/index.html", "/work/deep/third/": "work/deep/third/index.html", "/workshop/other/": "workshop/other/index.html" };
function good(plan: ReturnType<typeof planBake>) { if ("error" in plan) assert.fail(plan.error); return plan; }
test("fields use page metadata, named/numeric entities, site suffix and time fallback", () => {
  const fields = readPageFields(page("Caf&eacute; &#x26; kiln", `<meta name="description" content="A &quot;quote&quot;"><meta name="field:price" content="30">`, `<h1>Other</h1><time datetime="2026-10-03">Today</time>`), "/work/kiln/", identity);
  assert.deepEqual(fields, { title: "Café & kiln", description: 'A "quote"', image: "", date: "2026-10-03", url: "/work/kiln/", price: "30" });
  assert.equal(readPageFields(`<html><head></head><body><h1>Hello <em>world</em></h1></body></html>`, "/", identity).title, "Hello world");
});
test("bakes strict descendants, stable newest sort and limit, excludes folder index and unrelated folder", () => {
  const plan = good(planBake(sources, routes, identity));
  assert.deepEqual(plan.collections[0].records.map((record) => record.fields.title), ["Second", "Third"]);
  const output = applyCollectionEdits(sources["index.html"], plan.edits["index.html"]);
  assert.ok(output.includes('<img src="/second.jpg" data-if="image">'));
  assert.ok(output.includes("Clay &amp; glaze"));
  assert.ok(!output.includes("Old baked card"));
  assert.ok(output.includes('<p data-if="outside">Keep outside</p>'));
  assert.equal((output.match(/<template>/g) ?? []).length, 1);
  assert.equal((output.match(/<img/g) ?? []).length, 2); // one in retained template, one in baked output
  assert.equal(planBake({ ...sources, "index.html": output }, routes, identity) && Object.keys(good(planBake({ ...sources, "index.html": output }, routes, identity)).edits).length, 0);
});
test("exact filters and missing conditional fields remove their whole wrapper", () => {
  const filtered = sources["index.html"].replace('data-limit="2"', 'data-filter="category=Pottery"');
  const plan = good(planBake({ ...sources, "index.html": filtered }, routes, identity));
  assert.deepEqual(plan.collections[0].records.map((record) => record.fields.title), ["Third", "First"]);
  assert.ok(!plan.collections[0].output.includes("<img"));
  assert.equal(bindCollectionTemplate(`<figure data-if="image"><p>Fallback</p><img src="{image}"></figure><p>After</p>`, { image: "" }), "<p>After</p>");
});
test("text and quoted/unquoted attributes escape independently; comments and surrounding whitespace survive", () => {
  const out = bindCollectionTemplate(`<!-- {not_a_binding} -->\r\n<a href={url} title='{title}'> {title} </a>`, { url: "/work/a/?x=1&y=2", title: `A <b> " & ' é` });
  assert.equal(out, `<!-- {not_a_binding} -->\r\n<a href="/work/a/?x=1&amp;y=2" title="A &lt;b&gt; &quot; &amp; ' é"> A &lt;b&gt; " &amp; ' é </a>`);
});
for (const value of ["javascript:alert(1)", "java\nscript:alert(1)", "data:text/html,evil", "//evil.test/a", "/\\evil.test/a", "\\\\evil.test/a", "vbscript:evil"]) test(`rejects unsafe URL ${JSON.stringify(value)}`, () => {
  assert.throws(() => bindCollectionTemplate(`<a href="{image}">Link</a>`, { image: value }), /Unsafe collection URL/);
});
for (const template of [`<p>{unknown}</p>`, `<a href="{url}" href="/other/">Duplicate</a>`, `<p title=no\"quote>{title}</p>`, `<p>{title}</p></aside>`, `<!-- unfinished`, `<p>{title</p>`, `<img src="{url}" data-if="unknown">`, `<div><b>{title}</div>`, `<div data-each="/work/"><template><p>{title}</p></template></div>`, `<script>const a="{title}"</script>`, `<a onclick="{title}">A</a>`, `<a {title}="x">A</a>`]) test(`fails complete plan for bad template ${template}`, () => {
  const bad = sources["index.html"].replace(/<template>[\s\S]*?<\/template>/, `<template>${template}</template>`);
  assert.ok("error" in planBake({ ...sources, "index.html": bad }, routes, identity));
});
test("missing sources fail rather than silently omit a record; invalid settings fail", () => {
  const partial = { ...sources }; delete (partial as Record<string, string>)["work/first/index.html"];
  assert.ok("error" in planBake(partial, routes, identity));
  for (const input of [{ folder: "/work" }, { folder: "/../" }, { folder: "/%2e/" }, { folder: "/_private/" }, { folder: "/work/", limit: "501" }, { folder: "/work/", limit: "0" }, { folder: "/work/", filter: "category" }, { folder: "/work/", sort: "title desc" }]) assert.throws(() => collectionSpec(input));
});
test("page field changes include dependent listings and capture original sources", () => {
  const after = { ...sources, "work/second/index.html": withPageField(sources["work/second/index.html"], "title", "Changed") };
  const plan = good(planCollectionChange(sources, after, routes, identity));
  assert.deepEqual(Object.keys(plan.edits).sort(), ["index.html", "work/second/index.html"]);
  assert.equal(plan.expectedSources["work/second/index.html"], sources["work/second/index.html"]);
  assert.ok(plan.edits["index.html"][0].text.includes(">Changed</a>"));
});
test("make grid keeps its design template and source outside the selected grid", () => {
  const source = `<main><h1>Work</h1><div class="grid"><article><a href="old">Old</a></article></div><footer>End</footer></main>`;
  const converted = makeGridCollection(source, source.indexOf('<div'), { folder: "/work/", sort: "-date", filter: "", limit: "3", template: `<article><a href="{url}">{title}</a></article>` });
  assert.ok(converted.startsWith(`<main><h1>Work</h1><div class="grid" data-each="/work/"`));
  assert.ok(converted.endsWith(`</div><footer>End</footer></main>`));
  assert.ok(converted.includes(`<template><article><a href="{url}">{title}</a></article></template>`));
});

test("root collections exclude root 404 and hidden routes but include legal nested 404 pages", () => {
  const allSources = { ...sources, "index.html": sources["index.html"].replace('data-each="/work/" data-sort="-date" data-limit="2"', 'data-each="/"'), "404.html": page("Missing"), "work/404.html": page("Legal 404"), "work/_private/index.html": page("Private"), "work/.draft/index.html": page("Draft") };
  const allRoutes = { ...routes, "/404.html": "404.html", "/work/404.html": "work/404.html", "/work/_private/": "work/_private/index.html", "/work/%2Edraft/": "work/.draft/index.html" };
  const plan = good(planBake(allSources, allRoutes, identity));
  const titles = plan.collections[0].records.map((record) => record.fields.title);
  assert.ok(titles.includes("Legal 404"));
  for (const title of ["Home", "Missing", "Private", "Draft"]) assert.ok(!titles.includes(title));
});
test("quoted attributes cannot escape into event handlers and existing static attributes remain", () => {
  const result = bindCollectionTemplate(`<a class='card' href='{url}' aria-label="{title}" data-key="original">{title}</a>`, { url: "/work/a/", title: `" onmouseover="alert(1)` });
  assert.ok(result.includes(`class='card'`));
  assert.ok(result.includes(`aria-label="&quot; onmouseover=&quot;alert(1)"`));
  assert.ok(result.includes(`data-key="original"`));
  assert.throws(() => bindCollectionTemplate(`<{title}>x</{title}>`, { title: "script" }));
});
for (const tag of ["script", "style", "textarea", "title"]) test(`rejects binding inside raw ${tag} context`, () => {
  assert.throws(() => bindCollectionTemplate(`<${tag}>{title}</${tag}>`, { title: "bad" }), /Bindings are not supported/);
});
test("one invalid collection prevents valid listing edits anywhere in the plan", () => {
  const bad = { ...sources, "work/index.html": page("Work", "", `<div data-each="/work/"><template><p>{typo}</p></template><p>Existing</p></div>`) };
  const result = planBake(bad, routes, identity);
  assert.deepEqual(Object.keys(result), ["error"]);
  assert.equal(bad["index.html"], sources["index.html"]);
});
test("a CRLF template and page preserve line endings and surrounding source", () => {
  const crlf = sources["index.html"].replaceAll("><", ">\r\n<");
  const result = good(planBake({ ...sources, "index.html": crlf }, routes, identity));
  const output = applyCollectionEdits(crlf, result.edits["index.html"]);
  assert.equal(output.replaceAll("\r\n", "").includes("\n"), false);
  assert.ok(output.startsWith(crlf.slice(0, crlf.indexOf('<div'))));
});

test("a valid custom sort with an empty exact filter returns an empty collection", () => {
  const source = sources["index.html"].replace('data-sort="-date"', 'data-sort="category" data-filter="category=No match"');
  const plan = good(planBake({ ...sources, "index.html": source }, routes, identity));
  assert.equal(plan.collections[0].records.length, 0);
});

test("script source bindings fail even for empty collections", () => {
  assert.throws(() => bindCollectionTemplate(`<script src="{image}"></script>`, { image: "https://example.com/a.js" }), /script/);
  const source = sources["index.html"].replace(/<template>[\s\S]*?<\/template>/, `<template><script src="{image}"></script></template>`).replace('data-each="/work/"', 'data-each="/empty/"');
  assert.ok("error" in planBake({ ...sources, "index.html": source }, routes, identity));
});
test("object data bindings validate URL semantics", () => {
  assert.throws(() => bindCollectionTemplate(`<object data="{image}"></object>`, { image: "data:text/html,<script>alert(1)</script>" }), /Unsafe collection URL/);
});
test("missing constructor fields bind empty and work in conditions, sorting and filtering", () => {
  assert.equal(bindCollectionTemplate(`<p>{constructor}</p><div data-if="constructor">Yes</div>`, {}, ["constructor"]), "<p></p>");
  const after = { ...sources, "work/first/index.html": sources["work/first/index.html"].replace("</head>", '<meta name="field:constructor" content="Clay"></head>'), "index.html": sources["index.html"].replace('data-sort="-date"', 'data-sort="constructor"').replace(/<template>[\s\S]*?<\/template>/, `<template><p>{constructor}</p></template>`) };
  assert.ok(!("error" in planBake(after, routes, identity)));
  after["index.html"] = after["index.html"].replace('data-sort="constructor"', 'data-filter="constructor=Clay"');
  assert.equal(good(planBake(after, routes, identity)).collections[0].records.length, 1);
});
test("malformed authoring template closing tags reject full plans including empty lists", () => {
  for (const folder of ["/work/", "/empty/"]) {
    const source = sources["index.html"].replace('</template>', '</template extra>').replace('data-each="/work/"', `data-each="${folder}"`);
    assert.ok("error" in planBake({ ...sources, "index.html": source }, routes, identity));
  }
});
test("date fallback finds the first time carrying datetime", () => {
  assert.equal(readPageFields(page("Time", "", `<time>Today</time><time datetime="2026-10-03">Dated</time>`), "/", identity).date, "2026-10-03");
});

test("a datetime name inside another attribute does not hide the first dated time", () => {
  const html = page("Time", "", `<time title="no datetime here">Today</time><time datetime="2026-10-03">Dated</time>`);
  assert.equal(readPageFields(html, "/", identity).date, "2026-10-03");
});

const mixedFolders = ["/work/", "/services/", "/portfolio/", "/articles/", "/videos/"];
function mixedFixture(settings = "") {
  const sources: Record<string, string> = { "index.html": page("Home", "", `<div data-each="${mixedFolders.join(" ")}" ${settings}><template><article><a href="{url}" title="{title}">{title}</a><p data-if="description">{description}</p><p data-if="constructor">{constructor}</p></article></template></div>`) };
  const routes: Record<string, string> = { "/": "index.html" };
  mixedFolders.forEach((folder, index) => {
    const root = folder.slice(1);
    sources[`${root}index.html`] = page("Folder index"); routes[folder] = `${root}index.html`;
    const path = `${root}item/index.html`;
    sources[path] = page(`Page ${index}`, `<meta name="date" content="${index < 2 ? '2026' : '2025'}"><meta name="field:category" content="Yes">${index === 1 ? '<meta name="field:secondary" content="Only"><meta name="field:constructor" content="Own">' : ''}`);
    routes[`${folder}item/`] = path;
  });
  return { sources, routes };
}
test("five sources produce one card per page with global stable sort, filter and limit", () => {
  const fixture = mixedFixture('data-sort="-date" data-filter="category=Yes" data-limit="3"');
  const collection = good(planBake(fixture.sources, fixture.routes, identity)).collections[0];
  assert.deepEqual(collection.folders, mixedFolders);
  assert.deepEqual(collection.records.map((record) => record.fields.title), ["Page 0", "Page 1", "Page 2"]);
  assert.equal((collection.output.match(/<article>/g) ?? []).length, 3);
  const all = mixedFixture();
  assert.equal(good(planBake(all.sources, all.routes, identity)).collections[0].records.length, 5);
});
test("root and nested overlaps deduplicate and exclude every selected folder index", () => {
  const fixture = mixedFixture();
  fixture.sources["work/deep/index.html"] = page("Nested index");
  fixture.sources["work/deep/item/index.html"] = page("Nested item");
  fixture.routes["/work/deep/"] = "work/deep/index.html";
  fixture.routes["/work/deep/item/"] = "work/deep/item/index.html";
  fixture.routes["/alias/"] = "work/item/index.html"; // Noncanonical aliases never add another card.
  fixture.sources["index.html"] = fixture.sources["index.html"].replace(mixedFolders.join(" "), "/ /work/ /work/deep/ /work/");
  const collection = good(planBake(fixture.sources, fixture.routes, identity)).collections[0];
  assert.deepEqual(collection.folders, ["/", "/work/", "/work/deep/"]);
  assert.equal(collection.records.filter((record) => record.path === "work/item/index.html").length, 1);
  assert.ok(!collection.records.some((record) => ["index.html", "work/index.html", "work/deep/index.html"].includes(record.path)));
  assert.ok(collection.records.some((record) => record.path === "work/deep/item/index.html"));
});
test("fields known only in secondary sources validate across the union, including own constructor", () => {
  const fixture = mixedFixture('data-sort="secondary" data-filter="secondary=Only"');
  const collection = good(planBake(fixture.sources, fixture.routes, identity)).collections[0];
  assert.deepEqual(collection.records.map((record) => record.path), ["services/item/index.html"]);
  assert.ok(collection.output.includes("<p data-if=\"constructor\">Own</p>"));
  assert.ok(!good(planBake(mixedFixture().sources, mixedFixture().routes, identity)).collections[0].output.includes("[object"));
});
test("folder tokenization uses only HTML ASCII whitespace and preserves first occurrence order", () => {
  assert.deepEqual(collectionSpec({ folder: " \t/work/\n/services/\f/work/\r " }).folders, ["/work/", "/services/"]);
  assert.equal(collectionSpec({ folders: ["/videos/", "/work/", "/videos/"] }).folder, "/videos/ /work/");
  for (const folder of ["", " \t\n", "/work/ /bad", "/work/\u00a0/services/", "/work/\v/services/", "/work/ //bad/", "/work/ /../", "/work/ /_hidden/", "/work/ /%61/", "/work/ /articles/*", "/work/ {tag}"]) {
    assert.throws(() => collectionSpec({ folder }));
    const fixture = mixedFixture();
    fixture.sources["services/index.html"] = page("Invalid", "", `<div data-each="${folder}"><template><p>{title}</p></template></div>`);
    assert.deepEqual(Object.keys(planBake(fixture.sources, fixture.routes, identity)), ["error"]);
  }
  assert.throws(() => collectionSpec({ folders: [] }));
  assert.throws(() => collectionSpec({ folders: ["/work/", ""] }));
});
test("multi-source conversion serializes native tokens safely and existing collection can be updated", () => {
  const source = '<div class="grid"><p>Old</p></div>';
  const input = { folders: mixedFolders, sort: "", filter: 'category=A & "B"', limit: "", template: '<a href="{url}">{title}</a>' };
  const converted = makeGridCollection(source, 0, input);
  assert.ok(converted.includes(`data-each="${mixedFolders.join(" ")}"`));
  assert.ok(converted.includes('data-filter="category=A &amp; &quot;B&quot;"'));
  const updated = makeGridCollection(converted, 0, { ...input, folders: ["/work/"] });
  assert.equal((updated.match(/data-each=/g) ?? []).length, 1);
  assert.ok(updated.includes('data-each="/work/"'));
  assert.equal(makeGridCollection(source, 0, { folder: "/work/", sort: "", filter: "", limit: "", template: "<p>{title}</p>" }), '<div class="grid" data-each="/work/"><template><p>{title}</p></template></div>');
});
test("secondary-source unsafe URLs abort the entire mixed plan; text remains escaped", () => {
  const fixture = mixedFixture();
  fixture.sources["services/item/index.html"] = page('A &lt;b&gt; &quot;quoted&quot;', '<meta property="og:image" content="javascript:bad"><meta name="field:constructor" content="Own">');
  const collection = good(planBake(fixture.sources, fixture.routes, identity)).collections[0];
  assert.ok(collection.output.includes('title="A &lt;b&gt; &quot;quoted&quot;"'));
  assert.ok(collection.output.includes('>A &lt;b&gt; "quoted"</a>'));
  fixture.sources["index.html"] = fixture.sources["index.html"].replace('</article>', '<img src="{image}" data-if="image"></article>');
  assert.deepEqual(Object.keys(planBake(fixture.sources, fixture.routes, identity)), ["error"]);
});

test("reapplying a collection preserves authoring template attributes and exact CRLF bytes", () => {
  const template = '<template id="cards" data-note="a > b" class=authoring>\r\n  <p>{title}</p>\r\n</template>';
  const source = `<!-- before --><div class="grid" data-each="/work/">${template}<p>Old</p></div><!-- after -->`;
  const updated = makeGridCollection(source, source.indexOf("<div"), { folders: ["/work/"], template: '\r\n  <p>{title}</p>\r\n' });
  assert.ok(updated.includes(template));
  const plan = planCollectionChange({ ...sources, "index.html": source }, { ...sources, "index.html": updated }, routes, identity);
  assert.ok(!("error" in plan));
  if ("error" in plan) return;
  const baked = applyCollectionEdits(source, plan.edits["index.html"] ?? []);
  assert.ok(baked.includes(template));
  assert.ok(baked.startsWith("<!-- before -->"));
  assert.ok(baked.endsWith("</div><!-- after -->"));
});
