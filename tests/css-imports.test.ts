import { strict as assert } from "node:assert";
import { test } from "node:test";
import { expandStyleImports, parseCssImports, resolveImportPath, wrapImported } from "../shared/css-imports.ts";
import { findStyleRulesInSources } from "../src/styles-index.ts";

const expand = (paths: string[], files: Record<string, string>) => expandStyleImports(paths, (path) => files[path]);
const summary = (paths: string[], files: Record<string, string>) =>
  expand(paths, files).sheets.map((sheet) => `${sheet.kind === "layers" ? "layers " : ""}${sheet.path}`);

test("a flat list without imports comes back unchanged, one sheet per entry", () => {
  const files = { "src/styles/a.css": "body { margin: 0; }", "src/styles/b.css": ".x { color: red; }" };
  const result = expand(["src/styles/a.css", "src/styles/b.css"], files);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.imported, []);
  assert.deepEqual(result.sheets, [
    { path: "src/styles/a.css", source: files["src/styles/a.css"], wrappers: [], importer: undefined, kind: "sheet" },
    { path: "src/styles/b.css", source: files["src/styles/b.css"], wrappers: [], importer: undefined, kind: "sheet" },
  ]);
});

test("parses url() and string forms with layer, supports() and media", () => {
  const css = `@charset "utf-8";
/* tokens */
@import url("tokens.css");
@import 'base.css' layer;
@import url(theme.css) layer(theme.dark) supports(display: grid) screen and (min-width: 40em), print;
@import "late.css" supports(not (display: grid));
@layer x, y;
@import "ignored.css";`;
  const { imports, layers } = parseCssImports(css);
  assert.deepEqual(imports.map(({ url, layer, supports, media }) => ({ url, layer, supports, media })), [
    { url: "tokens.css", layer: undefined, supports: undefined, media: undefined },
    { url: "base.css", layer: "", supports: undefined, media: undefined },
    { url: "theme.css", layer: "theme.dark", supports: "display: grid", media: "screen and (min-width: 40em), print" },
    { url: "late.css", layer: undefined, supports: "not (display: grid)", media: undefined },
  ]);
  assert.equal(css.slice(imports[0].start, imports[0].end), `@import url("tokens.css");`);
  assert.equal(css.slice(imports[0].urlStart, imports[0].urlEnd), `url("tokens.css")`);
  assert.equal(css.slice(imports[1].urlStart, imports[1].urlEnd), `'base.css'`);
  // A layer statement after an import ends the imports.
  assert.deepEqual(layers, []);
  const layered = `@layer a, b;\n@import "x.css";\n.y {}\n@import "z.css";`;
  const parsed = parseCssImports(layered);
  assert.deepEqual(parsed.layers.map((layer) => layered.slice(layer.start, layer.end)), ["@layer a, b;"]);
  assert.deepEqual(parsed.imports.map((item) => item.url), ["x.css"]);
});

test("resolves relative and root-relative paths, and leaves external URLs alone", () => {
  assert.equal(resolveImportPath("src/styles/site.css", "tokens.css"), "src/styles/tokens.css");
  assert.equal(resolveImportPath("src/styles/site.css", "./parts/a.css?v=1#x"), "src/styles/parts/a.css");
  assert.equal(resolveImportPath("src/styles/site.css", "../components/card.css"), "src/components/card.css");
  assert.equal(resolveImportPath("src/styles/site.css", "/src/base.css"), "src/base.css");
  assert.equal(resolveImportPath("src/styles/site.css", "../../../x.css"), undefined);
  assert.equal(resolveImportPath("src/styles/site.css", "https://fonts.example/css"), undefined);
  assert.equal(resolveImportPath("src/styles/site.css", "//cdn.example/x.css"), undefined);
  const result = expand(["src/styles/site.css"], { "src/styles/site.css": `@import url("https://fonts.example/css");\nbody {}` });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(summary(["src/styles/site.css"], { "src/styles/site.css": `@import url("https://fonts.example/css");` }), ["src/styles/site.css"]);
});

test("layer(name) wraps the imported source, unchanged, before the importing sheet", () => {
  const files = {
    "src/styles/site.css": `@import url("base.css") layer(base);\n.page { color: red; }`,
    "src/styles/base.css": `.page { color: blue; }\n@layer inner { .x { color: green; } }`,
  };
  const result = expand(["src/styles/site.css"], files);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.imported, ["src/styles/base.css"]);
  const [imported, site] = result.sheets;
  assert.equal(imported.path, "src/styles/base.css");
  assert.equal(imported.importer, "src/styles/site.css");
  assert.deepEqual(imported.wrappers, [{ layer: "base" }]);
  // The browser composes `@layer base { @layer inner {} }` into base.inner.
  assert.equal(imported.source, `@layer base {\n${files["src/styles/base.css"]}\n}`);
  assert.ok(imported.source.includes(files["src/styles/base.css"]));
  assert.equal(site.path, "src/styles/site.css");
  assert.equal(site.source, files["src/styles/site.css"]);
});

test("anonymous layer, supports() and media wrap in that order, outermost conditions first", () => {
  const files = {
    "src/styles/site.css": `@import "a.css" layer;\n@import "b.css" layer(x) supports(display: grid) print, screen;`,
    "src/styles/a.css": ".a {}",
    "src/styles/b.css": ".b {}",
  };
  const [a, b] = expand(["src/styles/site.css"], files).sheets;
  assert.equal(a.source, "@layer {\n.a {}\n}");
  assert.equal(b.source, "@media print, screen {\n@supports (display: grid) {\n@layer x {\n.b {}\n}\n}\n}");
  assert.equal(wrapImported(".c {}", [{ supports: "not (display: grid)" }]), "@supports not (display: grid) {\n.c {}\n}");
});

test("nested imports compose the wrappers of the whole chain", () => {
  const files = {
    "src/styles/site.css": `@import "a.css" layer(a) screen;\nbody {}`,
    "src/styles/a.css": `@import "parts/b.css" layer(b);\n.a {}`,
    "src/styles/parts/b.css": `@import "../c.css";\n.b {}`,
    "src/styles/c.css": ".c {}",
  };
  const result = expand(["src/styles/site.css"], files);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.sheets.map((sheet) => sheet.path), ["src/styles/c.css", "src/styles/parts/b.css", "src/styles/a.css", "src/styles/site.css"]);
  assert.deepEqual(result.sheets[0].wrappers, [{ layer: "a", media: "screen" }, { layer: "b" }]);
  assert.equal(result.sheets[0].source, "@media screen {\n@layer a {\n@layer b {\n.c {}\n}\n}\n}");
  assert.equal(result.sheets[0].importer, "src/styles/parts/b.css");
});

test("layer statements ahead of an import keep the declared layer order", () => {
  const files = {
    "src/styles/site.css": `@layer components, base;\n@import "base.css" layer(base);\n.x {}`,
    "src/styles/base.css": ".b {}",
  };
  const result = expand(["src/styles/site.css"], files);
  assert.deepEqual(result.sheets.map((sheet) => `${sheet.kind} ${sheet.path}`), [
    "layers src/styles/site.css",
    "sheet src/styles/base.css",
    "sheet src/styles/site.css",
  ]);
  assert.equal(result.sheets[0].source, "@layer components, base;\n");
});

test("a file imported twice is expanded twice", () => {
  const files = {
    "src/styles/site.css": `@import "a.css";\n@import "a.css" layer(again);`,
    "src/styles/a.css": ".a {}",
  };
  assert.deepEqual(summary(["src/styles/site.css"], files), ["src/styles/a.css", "src/styles/a.css", "src/styles/site.css"]);
});

test("a circular import is skipped and reported", () => {
  const files = {
    "src/styles/site.css": `@import "a.css";\nbody {}`,
    "src/styles/a.css": `@import "site.css";\n.a {}`,
  };
  const result = expand(["src/styles/site.css"], files);
  assert.deepEqual(result.sheets.map((sheet) => sheet.path), ["src/styles/a.css", "src/styles/site.css"]);
  assert.deepEqual(result.errors, ["src/styles/a.css imports src/styles/site.css, which imports it back; that import is skipped."]);
});

test("a missing file is reported and the rest still applies", () => {
  const files = { "src/styles/site.css": `@import "gone.css";\n@import "a.css";\nbody {}`, "src/styles/a.css": ".a {}" };
  const result = expand(["src/styles/site.css"], files);
  assert.deepEqual(result.sheets.map((sheet) => sheet.path), ["src/styles/a.css", "src/styles/site.css"]);
  assert.deepEqual(result.errors, ["src/styles/site.css imports src/styles/gone.css, which is missing from this branch."]);
  assert.deepEqual(result.imported, ["src/styles/gone.css", "src/styles/a.css"]);
});

test("an import the host could not read as text is skipped without an error", () => {
  const files: Record<string, string> = { "src/styles/site.css": `@import "latin1.css";\n@import "gone.css";\nbody {}` };
  const result = expandStyleImports(["src/styles/site.css"], (path) => files[path], (path) => path === "src/styles/latin1.css");
  assert.deepEqual(result.sheets.map((sheet) => sheet.path), ["src/styles/site.css"]);
  assert.deepEqual(result.errors, ["src/styles/site.css imports src/styles/gone.css, which is missing from this branch."]);
  assert.deepEqual(result.imported, ["src/styles/latin1.css", "src/styles/gone.css"]);
});

test("an imported sheet's rule maps to the imported file's own byte range", () => {
  const base = "/* base */\n.lead { color: blue; }\n.filler { padding: 1px; }\n";
  const files = { "src/styles/site.css": `@import "base.css" layer(base);\n.lead { color: red; }`, "src/styles/base.css": base };
  const rules = findStyleRulesInSources(files, [{ path: "src/styles/base.css", selector: ".filler", ruleIndex: 1 }]);
  assert.equal(rules.length, 1);
  assert.equal(base.slice(rules[0].start, rules[0].end), ".filler { padding: 1px; }");
});

test("import URLs decode CSS escapes: hex, a continued line, and out-of-range code points", () => {
  const urls = parseCssImports(`@import "bg\\20 wide.css";\n@import "ba\\\nse.css";\n@import "x\\110000 y.css";\n@import url(a\\ b.css);`).imports.map((item) => item.url);
  assert.deepEqual(urls, ["bg wide.css", "base.css", "x�y.css", "a b.css"]);
});
