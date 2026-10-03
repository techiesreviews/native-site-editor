import assert from "node:assert/strict";
import test from "node:test";
import { applyCollectionEdits, bindCollectionTemplate, planBake, planCollectionChange } from "../src/page-builder/collection-bake.ts";
import { collectionSpec, makeGridCollection } from "../src/page-builder/collection-model.ts";
import { readPageFields, withCustomPageField, withPageField } from "../src/page-builder/collection-fields.ts";
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
test("fields writer preserves surrounding source, quotes and CRLF", () => {
  const source = page("First", `<meta name='date' content='2020'>`).replaceAll("><", ">\r\n<");
  const changed = withPageField(source, "date", "x' onload='bad", identity);
  assert.ok(changed.includes("content='x&#39; onload=&#39;bad'"));
  assert.ok(changed.includes("\r\n"));
  assert.equal(withPageField(source, "title", "New", identity).includes("<title>New | Studio</title>"), true);
  assert.throws(() => withPageField(source, "url", "/bad/", identity));
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
  const after = { ...sources, "work/second/index.html": withPageField(sources["work/second/index.html"], "title", "Changed", identity) };
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
  const after = { ...sources, "work/first/index.html": withCustomPageField(sources["work/first/index.html"], "constructor", "Clay", identity), "index.html": sources["index.html"].replace('data-sort="-date"', 'data-sort="constructor"').replace(/<template>[\s\S]*?<\/template>/, `<template><p>{constructor}</p></template>`) };
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
test("custom field creation rejects every reserved builtin", () => {
  for (const field of ["title", "description", "image", "date", "url"]) assert.throws(() => withCustomPageField(sources["index.html"], field, "Oops", identity), /built-in/);
});
test("date fallback finds the first time carrying datetime", () => {
  assert.equal(readPageFields(page("Time", "", `<time>Today</time><time datetime="2026-10-03">Dated</time>`), "/", identity).date, "2026-10-03");
});

test("a datetime name inside another attribute does not hide the first dated time", () => {
  const html = page("Time", "", `<time title="no datetime here">Today</time><time datetime="2026-10-03">Dated</time>`);
  assert.equal(readPageFields(html, "/", identity).date, "2026-10-03");
});
