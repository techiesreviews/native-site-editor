import assert from "node:assert/strict";
import test from "node:test";
import { readPageFields } from "../src/page-builder/collection-fields.ts";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document.ts";
import { NativePageFieldError, planLegacyPageFieldMigration, planPageFieldJsonWrite, readEditorFieldMetas } from "../src/page-builder/native-page-fields.ts";

const page = [
  "<!doctype html>",
  "<html><head>",
  "  <title>A &amp; B | Site</title>",
  "  <meta name=\"description\" content=\"Desc\">",
  "  <meta property=\"og:image\" content=\"/a.png\">",
  "  <link rel=\"canonical\" href=\"https://x.test/a/\">",
  "  <meta name=\"date\" content=\"2026-01-02\">",
  "  <meta name=\"field:note\" content=\"Say &quot;hi&quot; &amp; 'bye'\">",
  "  <meta name=\"generator\" content=\"Hand\">",
  "  <script type=\"application/ld+json\">{\"@type\":\"Article\"}</script>",
  "  <meta name='field:tag' content='x \"y\"'>",
  "  <link rel=\"stylesheet\" href=\"/s.css\">",
  "</head><body><time datetime=\"2026-01-02\">Jan</time><h1>A</h1></body></html>",
].join("\n");
const withJson = ["b/index.html", "a/index.html", EDITOR_PAGE_BUILDER_PATH];
const sidecar = JSON.stringify({ version: 1, pages: { "a/index.html": { fields: { other: "keep" }, custom: 7 } }, collections: {}, future: { keep: true } }, null, 2) + "\n";

function code(fn: () => unknown, expected: string) {
  assert.throws(fn, (error: unknown) => error instanceof NativePageFieldError && error.code === expected);
}

test("reads field metas with quotes and entities", () => {
  assert.deepEqual(readEditorFieldMetas(page).map(({ field, value }) => [field, value]), [["note", "Say \"hi\" & 'bye'"], ["tag", "x \"y\""]]);
});

test("migration removes only field metas and preserves every other byte and unknown JSON", () => {
  const before = page, beforeSidecar = sidecar;
  const plan = planLegacyPageFieldMigration({ files: withJson, pagePath: "a/index.html", source: page, sidecarText: sidecar });
  assert.equal(page, before); assert.equal(sidecar, beforeSidecar);
  assert.ok(!plan.noop);
  const html = plan.edits.get("a/index.html")!;
  const expected = page.split("\n").filter((line) => !line.includes("field:")).join("\n");
  assert.equal(html, expected);
  const json = JSON.parse(plan.edits.get(EDITOR_PAGE_BUILDER_PATH)!);
  assert.deepEqual(json.pages["a/index.html"], { custom: 7, fields: { other: "keep", note: "Say \"hi\" & 'bye'", tag: "x \"y\"" } });
  assert.deepEqual(json.future, { keep: true });
  assert.equal(json.version, 1);
  assert.equal(plan.expectedSources.get("a/index.html"), page);
  assert.equal(plan.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), sidecar);
  assert.deepEqual(plan.expectedFiles, [EDITOR_PAGE_BUILDER_PATH, "a/index.html", "b/index.html"].sort());
});

test("inline meta removal keeps surrounding bytes", () => {
  const source = "<html><head><title>T</title><meta name=\"field:x\" content=\"1\"><meta name=\"keep\"></head></html>";
  const plan = planLegacyPageFieldMigration({ files: ["index.html"], pagePath: "index.html", source });
  assert.ok(!plan.noop);
  assert.equal(plan.edits.get("index.html"), "<html><head><title>T</title><meta name=\"keep\"></head></html>");
  assert.equal(plan.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), undefined);
});

test("no field metas and same JSON value are noops", () => {
  assert.deepEqual(planLegacyPageFieldMigration({ files: ["index.html"], pagePath: "index.html", source: "<html><head><title>T</title></head></html>" }), { noop: true });
  assert.deepEqual(planPageFieldJsonWrite(withJson, sidecar, "a/index.html", "other", "keep"), { noop: true });
});

test("JSON-only write preserves unknown keys and guards the sidecar", () => {
  const plan = planPageFieldJsonWrite(withJson, sidecar, "a/index.html", "other", "new");
  assert.ok(!plan.noop);
  const json = JSON.parse(plan.edits.get(EDITOR_PAGE_BUILDER_PATH)!);
  assert.equal(json.pages["a/index.html"].fields.other, "new");
  assert.equal(json.pages["a/index.html"].custom, 7);
  assert.deepEqual(json.future, { keep: true });
  assert.equal(plan.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), sidecar);
  const fresh = planPageFieldJsonWrite(["b/index.html"], undefined, "b/index.html", "note", "v");
  assert.ok(!fresh.noop);
  assert.equal(fresh.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), undefined);
});

test("conflict refuses the whole migration unless an explicit override is given", () => {
  const json = JSON.stringify({ version: 1, pages: { "a/index.html": { fields: { tag: "different" } } }, collections: {} });
  code(() => planLegacyPageFieldMigration({ files: withJson, pagePath: "a/index.html", source: page, sidecarText: json }), "native-page-fields/conflict");
  code(() => planLegacyPageFieldMigration({ files: withJson, pagePath: "a/index.html", source: page, sidecarText: json, expectedOverrides: { tag: "guess" } }), "native-page-fields/conflict");
  const takeHtml = planLegacyPageFieldMigration({ files: withJson, pagePath: "a/index.html", source: page, sidecarText: json, expectedOverrides: { tag: "x \"y\"" } });
  assert.ok(!takeHtml.noop);
  assert.equal(JSON.parse(takeHtml.edits.get(EDITOR_PAGE_BUILDER_PATH)!).pages["a/index.html"].fields.tag, "x \"y\"");
  const keepJson = planLegacyPageFieldMigration({ files: withJson, pagePath: "a/index.html", source: page, sidecarText: json, expectedOverrides: { tag: "different" } });
  assert.ok(!keepJson.noop);
  assert.equal(JSON.parse(keepJson.edits.get(EDITOR_PAGE_BUILDER_PATH)!).pages["a/index.html"].fields.tag, "different");
  assert.ok(!keepJson.edits.get("a/index.html")!.includes("field:tag"));
});

test("refuses ambiguous or malformed sources with namespaced codes", () => {
  code(() => readEditorFieldMetas("<html><head></head><head></head></html>"), "native-page-fields/multiple-head");
  code(() => readEditorFieldMetas("<html><head><title>x</title>"), "native-page-fields/malformed-source");
  code(() => readEditorFieldMetas("<head><meta name=\"field:a\" content=\"1\"><meta name=\"field:a\" content=\"2\"></head>"), "native-page-fields/duplicate-meta");
  code(() => readEditorFieldMetas("<head><meta name=\"field:a\" name=\"field:b\"></head>"), "native-page-fields/duplicate-meta");
  code(() => readEditorFieldMetas("<head><meta name=\"field:title\" content=\"x\"></head>"), "native-page-fields/reserved-field");
  code(() => readEditorFieldMetas("<head><meta name=\"field:constructor\" content=\"x\"></head>"), "native-page-fields/unsafe-key");
  code(() => readEditorFieldMetas("<head><meta name=\"field:Bad Name\"></head>"), "native-page-fields/invalid-field");
  code(() => planPageFieldJsonWrite(withJson, "{", "a/index.html", "x", "y"), "native-page-fields/invalid-sidecar");
});

test("fake attributes inside quoted values are not fields", () => {
  const source = "<head><meta name=\"generator\" content='name=\"field:x\"'></head>";
  assert.deepEqual(readEditorFieldMetas(source), []);
  assert.deepEqual(planLegacyPageFieldMigration({ files: ["index.html"], pagePath: "index.html", source }), { noop: true });
});

test("rejects built-in and prototype names for JSON writes", () => {
  for (const name of ["title", "url", "description", "image", "date"]) code(() => planPageFieldJsonWrite(["index.html"], undefined, "index.html", name, "x"), "native-page-fields/reserved-field");
  for (const name of ["__proto__", "constructor", "prototype"]) code(() => planPageFieldJsonWrite(["index.html"], undefined, "index.html", name, "x"), "native-page-fields/unsafe-key");
  code(() => planPageFieldJsonWrite(["__proto__"], undefined, "__proto__", "note", "x"), "native-page-fields/invalid-path");
  assert.equal(({} as Record<string, unknown>).note, undefined);
});

test("decodes named and legacy entities like readPageFields", () => {
  const source = "<html><head><meta name=\"field:a\" content=\"caf&eacute; &copy 2026 &hellip;\"></head></html>";
  assert.deepEqual(readEditorFieldMetas(source).map((meta) => meta.value), [readPageFields(source, "/", { name: "" }).a]);
  assert.equal(readEditorFieldMetas(source)[0].value, "café © 2026 …");
  const plan = planLegacyPageFieldMigration({ files: ["index.html"], pagePath: "index.html", source });
  assert.ok(!plan.noop);
  assert.equal(JSON.parse(plan.edits.get(EDITOR_PAGE_BUILDER_PATH)!).pages["index.html"].fields.a, "café © 2026 …");
});

test("refuses an unloaded sidecar and a page outside the file graph", () => {
  const source = "<html><head><meta name=\"field:a\" content=\"1\"></head></html>";
  code(() => planLegacyPageFieldMigration({ files: ["index.html", EDITOR_PAGE_BUILDER_PATH], pagePath: "index.html", source }), "native-page-fields/file-graph");
  code(() => planPageFieldJsonWrite(["index.html", EDITOR_PAGE_BUILDER_PATH], undefined, "index.html", "a", "1"), "native-page-fields/file-graph");
  code(() => planLegacyPageFieldMigration({ files: [], pagePath: "index.html", source }), "native-page-fields/file-graph");
  code(() => planLegacyPageFieldMigration({ files: ["index.html"], pagePath: "index.html", source, sidecarText: sidecar }), "native-page-fields/file-graph");
});

test("overrides must name a current conflict exactly", () => {
  const source = "<html><head><meta name=\"field:a\" content=\"html\"></head></html>";
  const files = ["index.html", EDITOR_PAGE_BUILDER_PATH];
  const empty = JSON.stringify({ version: 1, pages: {}, collections: {} });
  code(() => planLegacyPageFieldMigration({ files, pagePath: "index.html", source, sidecarText: empty, expectedOverrides: { a: "json" } }), "native-page-fields/conflict");
  code(() => planLegacyPageFieldMigration({ files, pagePath: "index.html", source, sidecarText: empty, expectedOverrides: { zz: "x" } }), "native-page-fields/conflict");
  code(() => planLegacyPageFieldMigration({ files: ["x.html"], pagePath: "x.html", source: "<html><head></head></html>", expectedOverrides: { a: "x" } }), "native-page-fields/conflict");
});

test("refuses tags across </head> and field metas outside the head", () => {
  code(() => readEditorFieldMetas("<html><head><meta name=field:a content=x\"y><title>t</title></head><body></body></html>"), "native-page-fields/malformed-source");
  code(() => readEditorFieldMetas("<html><head><template><meta name=\"field:a\" content=\"1\"></template></head></html>"), "native-page-fields/outside-head");
  code(() => readEditorFieldMetas("<html><head><noscript><meta name=\"field:a\" content=\"1\"></noscript></head></html>"), "native-page-fields/outside-head");
  code(() => readEditorFieldMetas("<html><head></head><body><meta name=\"field:a\" content=\"1\"></body></html>"), "native-page-fields/outside-head");
});

test("bad page paths use the path code", () => {
  for (const path of ["../x.html", "/x.html", "a/../x.html", "x.txt"]) code(() => planPageFieldJsonWrite([path], undefined, path, "a", "1"), "native-page-fields/invalid-path");
});

test("CRLF lines are removed whole, other bytes kept", () => {
  const source = "<html><head>\r\n  <title>T</title>\r\n  <meta name=\"field:a\" content=\"1\">\r\n  <meta name=\"keep\">\r\n</head></html>";
  const plan = planLegacyPageFieldMigration({ files: ["index.html"], pagePath: "index.html", source });
  assert.ok(!plan.noop);
  assert.equal(plan.edits.get("index.html"), "<html><head>\r\n  <title>T</title>\r\n  <meta name=\"keep\">\r\n</head></html>");
});

test("refuses field metas whose attributes do not parse exactly", () => {
  code(() => readEditorFieldMetas("<html><head><meta name=\"field:a\"content=\"x\"></head></html>"), "native-page-fields/malformed-source");
  code(() => readEditorFieldMetas("<html><head><meta name=field:a content=a=b></head></html>"), "native-page-fields/malformed-source");
  assert.deepEqual(readEditorFieldMetas("<html><head><meta name=\"field:a\" content=\"x\" /></head></html>").map((meta) => meta.value), ["x"]);
});

test("refuses property=field: metas instead of skipping them", () => {
  code(() => readEditorFieldMetas("<html><head><meta property=\"field:a\" content=\"1\"></head></html>"), "native-page-fields/invalid-field");
});

test("glued entity-encoded field names are refused, not skipped", () => {
  code(() => readEditorFieldMetas("<html><head><meta content=\"x\"name=\"field&#58;a\"></head></html>"), "native-page-fields/malformed-source");
  code(() => readEditorFieldMetas("<html><head><meta content=\"x\"name=\"&#102;ield:a\"></head></html>"), "native-page-fields/malformed-source");
});

test("a malformed non-field meta mentioning field: fails closed", () => {
  code(() => readEditorFieldMetas("<html><head><meta name=\"note\"content=\"see field:x\"></head></html>"), "native-page-fields/malformed-source");
  assert.deepEqual(readEditorFieldMetas("<html><head><meta name=\"note\" content=\"see field:x\"></head></html>"), []);
});

test("property and name field: together are ambiguous", () => {
  code(() => readEditorFieldMetas("<html><head><meta property=\"field:a\" name=\"field:a\" content=\"1\"></head></html>"), "native-page-fields/duplicate-meta");
});
