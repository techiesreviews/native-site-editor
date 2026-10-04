import assert from "node:assert/strict";
import test from "node:test";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document.ts";
import { DEFAULT_STATIC_SECTIONS, listDefaultSectionChoices, planDefaultStaticSectionInsert, previewDefaultStaticSection } from "../src/page-builder/static-section-defaults.ts";
import { listSectionChoices, readStaticSectionRecords, type StaticSectionInsertInput } from "../src/page-builder/static-sections.ts";

const page = '<!doctype html><html><head><title>Site</title></head><body><main><p>Keep</p></main></body></html>';
const css = "styles/sections.css";
function input(extra: Partial<StaticSectionInsertInput> = {}): StaticSectionInsertInput {
  return { documentText: undefined, sectionId: "static-section:intro", pagePath: "index.html", pageSource: page, parent: [0], index: 1, stylesheetSources: { [css]: undefined }, files: ["index.html"], ...extra };
}
function good(value: StaticSectionInsertInput) { const before = structuredClone(value); const r = planDefaultStaticSectionInsert(value); if ("error" in r) assert.fail(r.error); assert.deepEqual(value, before); return r; }
function bad(value: StaticSectionInsertInput, reason: string) { const before = structuredClone(value); assert.deepEqual(planDefaultStaticSectionInsert(value), { error: reason }); assert.deepEqual(value, before); }
const existing = JSON.stringify({ version: 1, pages: { "index.html": { fields: { tagline: "Hi" } } }, collections: {}, future: { kept: true }, reusableSections: { version: 1, future: [1], records: { other: { id: "other", label: "Other", rootClass: "other-box", stylesheetPath: css, html: '<section class="other-box"></section>', css: ".other-box { margin: 0; }" } } } });

test("every default is plain, valid and insertable", () => {
  assert.deepEqual((listDefaultSectionChoices(undefined) as { id: string }[]).map((c) => c.id), ["static-section:intro", "static-section:features", "static-section:split", "static-section:contact"]);
  assert.ok(Object.isFrozen(DEFAULT_STATIC_SECTIONS) && Object.isFrozen(DEFAULT_STATIC_SECTIONS[0]));
  for (const section of DEFAULT_STATIC_SECTIONS) {
    assert.deepEqual(previewDefaultStaticSection(undefined, "static-section:" + section.id), { html: section.html, css: section.css, rootClass: section.rootClass });
    assert.doesNotMatch(section.html, /<script|<template|<slot|<style|\sid=|data-|<[a-z]+-[a-z]/i);
    assert.doesNotMatch(section.html, /src=|href="(?!mailto:)/);
    const plan = good(input({ sectionId: "static-section:" + section.id }));
    assert.ok(plan.operation.edits.get("index.html")!.includes(section.html));
  }
  assert.deepEqual(previewDefaultStaticSection(undefined, "nope"), { error: "Choose a default static section." });
  bad(input({ sectionId: "nope" }), "Choose a default static section.");
});

test("absent JSON and CSS: one operation creates both and inserts the literal section", () => {
  const plan = good(input()), op = plan.operation, intro = DEFAULT_STATIC_SECTIONS[0];
  assert.deepEqual([...op.edits.keys()], ["index.html"]);
  assert.deepEqual(op.creates!.map((c) => c.path), [css, EDITOR_PAGE_BUILDER_PATH]);
  assert.equal(op.creates![0].content, intro.css);
  assert.deepEqual(readStaticSectionRecords(op.creates![1].content), { intro: { ...intro } });
  assert.deepEqual(Object.fromEntries(op.expectedSources), { "index.html": page, [css]: undefined, [EDITOR_PAGE_BUILDER_PATH]: undefined });
  assert.ok(op.expectedSources.has(EDITOR_PAGE_BUILDER_PATH) && op.expectedSources.has(css));
  assert.equal(op.edits.get("index.html"), page.replace("<p>Keep</p>", "<p>Keep</p>\n" + intro.html).replace("</head>", '\n  <link rel="stylesheet" href="styles/sections.css">\n</head>'));
  assert.deepEqual(plan.selection, { path: "index.html", node: [0, 1] });
  assert.deepEqual(plan.expectedFiles, ["index.html"]);
  assert.equal(op.open, "index.html");
  assert.doesNotMatch(op.edits.get("index.html")!, /<script|data-editor|reusableSections/);
});

test("existing JSON is edited in place, pinned to original bytes, keeping everything else", () => {
  const files = ["index.html", EDITOR_PAGE_BUILDER_PATH, css];
  const plan = good(input({ documentText: existing, files, sectionId: "static-section:features", index: 0, stylesheetSources: { [css]: "body { margin: 0; }\n" } }));
  const op = plan.operation;
  assert.equal(op.creates, undefined);
  assert.deepEqual([...op.edits.keys()].sort(), [EDITOR_PAGE_BUILDER_PATH, "index.html", css].sort());
  assert.equal(op.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), existing);
  assert.equal(op.expectedSources.get(css), "body { margin: 0; }\n");
  assert.equal(op.edits.get(css), "body { margin: 0; }\n" + DEFAULT_STATIC_SECTIONS[1].css);
  const after = JSON.parse(op.edits.get(EDITOR_PAGE_BUILDER_PATH)!), before = JSON.parse(existing);
  assert.deepEqual(after.pages, before.pages); assert.deepEqual(after.future, before.future); assert.deepEqual(after.reusableSections.future, [1]);
  assert.deepEqual(Object.keys(after.reusableSections.records).sort(), ["features", "other"]);
  assert.deepEqual(plan.selection, { path: "index.html", node: [0, 0] });
  assert.deepEqual(plan.expectedFiles, [...files].sort());
});

test("a saved record with the default id wins and JSON is untouched", () => {
  const custom = { ...DEFAULT_STATIC_SECTIONS[0], html: '<section class="section-intro"><h2>My own</h2></section>' };
  const text = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { intro: custom } } });
  const plan = good(input({ documentText: text, files: ["index.html", EDITOR_PAGE_BUILDER_PATH] }));
  assert.ok(plan.operation.edits.get("index.html")!.includes(custom.html));
  assert.equal(plan.operation.edits.has(EDITOR_PAGE_BUILDER_PATH), false);
  assert.equal(plan.operation.creates!.some((c) => c.path === EDITOR_PAGE_BUILDER_PATH), false);
  assert.equal(plan.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), text);
});

test("refusals: bad version, unloaded JSON, rootClass and stylesheet conflicts, unsafe snapshots", () => {
  bad(input({ documentText: JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 2, records: {} } }), files: ["index.html", EDITOR_PAGE_BUILDER_PATH] }), "Unsupported reusable sections version.");
  bad(input({ files: ["index.html", EDITOR_PAGE_BUILDER_PATH] }), `Load ${EDITOR_PAGE_BUILDER_PATH} before saving a section.`);
  bad(input({ files: undefined }), `A complete file graph must prove ${EDITOR_PAGE_BUILDER_PATH} is absent.`);
  const clash = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { mine: { id: "mine", label: "Mine", rootClass: "section-intro", stylesheetPath: css, html: '<section class="section-intro"></section>', css: ".section-intro { margin: 0; }" } } } });
  bad(input({ documentText: clash, files: ["index.html", EDITOR_PAGE_BUILDER_PATH] }), "Another static section already uses this rootClass.");
  bad(input({ stylesheetSources: { [css]: ".section-intro { color: red; }" }, files: ["index.html", css] }), "Existing stylesheet rules conflict with this section's rootClass; no CSS was overwritten.");
  bad(input({ stylesheetSources: {} }), `Load ${css} or explicitly prove it is absent.`);
  bad(input({ files: ["index.html", css] }), "A complete file graph must prove the new stylesheet is absent.");
  bad(input({ documentText: "{", files: ["index.html", EDITOR_PAGE_BUILDER_PATH] }), (planDefaultStaticSectionInsert(input({ documentText: "{", files: ["index.html", EDITOR_PAGE_BUILDER_PATH] })) as { error: string }).error);
});

test("saved record is authoritative for list, preview and insert; stale plain ids never fall back", () => {
  const custom = { ...DEFAULT_STATIC_SECTIONS[0], label: "My intro", html: '<section class="section-intro"><h2>Custom heading</h2></section>', css: ".section-intro { color: teal; }" };
  const text = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { intro: custom } } });
  const files = ["index.html", EDITOR_PAGE_BUILDER_PATH];
  const union = [...listSectionChoices(text), ...(listDefaultSectionChoices(text) as { id: string }[])];
  assert.equal(union.filter((c) => c.rootClass === "section-intro").length, 1);
  assert.deepEqual(union.map((c) => c.id), ["intro", "static-section:features", "static-section:split", "static-section:contact"]);
  const preview = previewDefaultStaticSection(text, "static-section:intro");
  assert.deepEqual(preview, { html: custom.html, css: custom.css, rootClass: custom.rootClass });
  const plan = good(input({ documentText: text, files }));
  assert.ok(plan.operation.edits.get("index.html")!.includes((preview as { html: string }).html));
  assert.equal(plan.operation.creates!.find((c) => c.path === css)!.content, (preview as { css: string }).css);
  bad(input({ documentText: text, files, sectionId: "intro" }), "Choose a default static section.");
  assert.deepEqual(previewDefaultStaticSection(undefined, "intro"), { error: "Choose a default static section." });
});

test("invalid JSON or version never falls back to default list or preview", () => {
  for (const text of ["{", JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 2, records: {} } })]) {
    assert.ok("error" in (listDefaultSectionChoices(text) as object));
    assert.ok("error" in previewDefaultStaticSection(text, "static-section:intro"));
  }
});

test("subpage composition: relative stylesheet link with JSON create in the same operation", () => {
  const plan = good(input({ pagePath: "work/a/index.html", files: ["work/a/index.html"] }));
  assert.ok(plan.operation.edits.get("work/a/index.html")!.includes('href="../../styles/sections.css"'));
  assert.deepEqual(plan.operation.creates!.map((c) => c.path), [css, EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual(plan.selection, { path: "work/a/index.html", node: [0, 1] });
});
