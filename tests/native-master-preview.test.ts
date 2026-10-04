import assert from "node:assert/strict";
import { test } from "node:test";
import { composeNativeMasterEdit, readNativeMasterEditInput, type NativeMasterEditInput } from "../src/components/native-master-preview";

// The editor-only master composition: one exact native copy on the page on show is swapped for the
// master's <section>; everything else is the page's bytes, and anything unproved is refused.
const copy = `<section class="intro"><h2>Hello</h2><p>Copy text</p></section>`;
const pageSource = `<!doctype html><html><head><title>T</title></head><body>\n<!-- shell -->\n<header>Top</header>\n<main class="page">\n  <p>Before</p>\n  ${copy}\n  <!-- after -->\n</main>\n</body></html>\n`;
const masterSource = `<!-- intro master -->\n<section class="intro"><h2>Master</h2><p>Master text</p></section>\n`;
const masterPath = ".editor/sections/intro.html";
const input: NativeMasterEditInput = { session: "s1", pagePath: "index.html", pageSource, node: [1, 1], basis: copy, masterPath, masterSource };
const current = { sources: { "index.html": pageSource, "styles/site.css": "" }, pagePath: "index.html" };
const error = (value: unknown, pattern: RegExp) => {
  assert.ok(value && typeof value === "object" && "error" in value, `expected an error, got ${JSON.stringify(value)}`);
  assert.match((value as { error: string }).error, pattern);
};

test("composes the page with only the copy replaced by the master's section", () => {
  const result = composeNativeMasterEdit(input, current);
  assert.ok(!("error" in result));
  assert.equal(result.masterSection, `<section class="intro"><h2>Master</h2><p>Master text</p></section>`);
  const body = pageSource.slice(pageSource.indexOf("<body>") + 6, pageSource.indexOf("</body>"));
  assert.equal(result.pageBody, body.replace(copy, result.masterSection));
  // The page shell, comments and other text are untouched; the master's own comment stays out.
  assert.ok(result.pageBody.includes("<!-- shell -->") && result.pageBody.includes("<!-- after -->") && result.pageBody.includes("<p>Before</p>"));
  assert.ok(!result.pageBody.includes("intro master"));
  assert.equal(result.input.node.join(), "1,1");
});

test("a master source in the preview sources must equal the proved master bytes", () => {
  assert.ok(!("error" in composeNativeMasterEdit(input, { ...current, sources: { ...current.sources, [masterPath]: masterSource } })));
  error(composeNativeMasterEdit(input, { ...current, sources: { ...current.sources, [masterPath]: masterSource + " " } }), /master changed/);
});

test("refuses a page that is not on show or not byte-equal", () => {
  error(composeNativeMasterEdit(input, { ...current, pagePath: "about/index.html" }), /not the page on show/);
  error(composeNativeMasterEdit(input, { ...current, pagePath: undefined }), /not the page on show/);
  error(composeNativeMasterEdit(input, { ...current, sources: { "index.html": pageSource + "\n" } }), /page changed/);
  error(composeNativeMasterEdit(input, { ...current, sources: {} }), /page changed/);
});

test("refuses a wrong place, a non-section, or a copy unequal to its basis", () => {
  error(composeNativeMasterEdit({ ...input, node: [0] }, current), /not a section/);
  error(composeNativeMasterEdit({ ...input, node: [1, 0] }, current), /not at that place/);
  error(composeNativeMasterEdit({ ...input, node: [1, 2] }, current), /not at that place/);
  error(composeNativeMasterEdit({ ...input, node: [1, 1, 0] }, current), /not a section/);
  error(composeNativeMasterEdit({ ...input, basis: copy.replace("Hello", "Hi") }, current), /does not match/);
});

test("refuses a copy inside a component, a template or an unclosed ancestor", () => {
  const inComponent = pageSource.replace(`<main class="page">`, `<main class="page"><x-wrap>`).replace("</main>", "</x-wrap></main>");
  error(composeNativeMasterEdit({ ...input, pageSource: inComponent, node: [1, 0, 1] }, { ...current, sources: { "index.html": inComponent } }), /not at that place/);
  const inTemplate = pageSource.replace(`<main class="page">`, `<main class="page"><template>`).replace("</main>", "</template></main>");
  error(composeNativeMasterEdit({ ...input, pageSource: inTemplate, node: [1, 0, 1] }, { ...current, sources: { "index.html": inTemplate } }), /not at that place/);
});

test("refuses a master that is not exactly one section", () => {
  for (const bad of [`<div>x</div>`, `<section>a</section><section>b</section>`, `text <section>a</section>`, `<section>open`]) {
    error(composeNativeMasterEdit({ ...input, masterSource: bad }, current), /section/);
  }
});

test("validates the input shape and paths, editor sections only", () => {
  for (const masterPath of ["index.html", ".editor/page-builder.json", ".editor/sections/../index.html", ".editor/sections/Intro.html", ".editor/sections/a/b.html", ".editor/config.json"]) {
    error(readNativeMasterEditInput({ ...input, masterPath }), /\.editor\/sections/);
  }
  error(readNativeMasterEditInput({ ...input, pagePath: ".editor/sections/intro.html" }), /page/);
  error(readNativeMasterEditInput({ ...input, session: "" }), /id/);
  error(readNativeMasterEditInput({ ...input, node: [] }), /place/);
  error(readNativeMasterEditInput({ ...input, node: [1, -1] }), /place/);
  error(readNativeMasterEditInput({ ...input, basis: "" }), /exact sources/);
  error(readNativeMasterEditInput(undefined), /missing/);
  const read = readNativeMasterEditInput({ ...input, extra: "dropped" });
  assert.ok(!("error" in read) && !("extra" in read) && Object.isFrozen(read));
});
