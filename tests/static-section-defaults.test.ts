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

test("after editing public CSS, re-adding a saved section reuses the live stylesheet without touching it", () => {
  const first = good(input());
  const page1 = first.operation.edits.get("index.html")!;
  const json = first.operation.creates!.find((c) => c.path === EDITOR_PAGE_BUILDER_PATH)!.content;
  const edited = first.operation.creates!.find((c) => c.path === css)!.content.replace("text-align: center;", "text-align: center; color: red;");
  const files = ["index.html", EDITOR_PAGE_BUILDER_PATH, css];
  const live = { stylesheetSources: { [css]: edited }, files };
  // The strict leaf policy still refuses: proves the previous refusal.
  bad(input({ documentText: json, pageSource: page1, files, stylesheetSources: { [css]: edited }, cssPolicy: "ensure-record" }), "Existing stylesheet rules conflict with this section's rootClass; no CSS was overwritten.");
  const plan = good(input({ documentText: json, pageSource: page1, files, stylesheetSources: { [css]: edited }, index: 0 }));
  assert.deepEqual([...plan.operation.edits.keys()], ["index.html"]);
  assert.equal(plan.operation.creates, undefined);
  assert.deepEqual(Object.fromEntries(plan.operation.expectedSources), { [css]: edited, "index.html": page1, [EDITOR_PAGE_BUILDER_PATH]: json });
  assert.equal((plan.operation.edits.get("index.html")!.match(/<section class="section-intro">/g) ?? []).length, 2);
  assert.equal((plan.operation.edits.get("index.html")!.match(/rel="stylesheet"/g) ?? []).length, 1);
  const preview = previewDefaultStaticSection(json, "static-section:intro", live) as { css: string };
  assert.equal(preview.css, edited); assert.match(preview.css, /color: red/);
  assert.equal((previewDefaultStaticSection(json, "static-section:intro") as { css: string }).css, DEFAULT_STATIC_SECTIONS[0].css);

  // A new default appends only its own rules and keeps the Intro edit.
  const features = good(input({ documentText: json, pageSource: page1, files, stylesheetSources: { [css]: edited }, sectionId: "static-section:features" }));
  assert.equal(features.operation.edits.get(css), edited + DEFAULT_STATIC_SECTIONS[1].css);
  assert.equal(features.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), json);
});

test("reuse keeps intentionally empty CSS, seeds once when proven absent, and refuses unloaded or unproven sheets", () => {
  const json = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { intro: { ...DEFAULT_STATIC_SECTIONS[0] } } } });
  const files = ["index.html", EDITOR_PAGE_BUILDER_PATH, css];
  const empty = good(input({ documentText: json, files, stylesheetSources: { [css]: "" } }));
  assert.equal(empty.operation.edits.has(css), false); assert.equal(empty.operation.expectedSources.get(css), "");
  assert.equal((previewDefaultStaticSection(json, "static-section:intro", { stylesheetSources: { [css]: "" }, files }) as { css: string }).css, "");
  const seeded = good(input({ documentText: json, files: ["index.html", EDITOR_PAGE_BUILDER_PATH] }));
  assert.equal(seeded.operation.creates![0].content, DEFAULT_STATIC_SECTIONS[0].css);
  assert.equal((previewDefaultStaticSection(json, "static-section:intro", { stylesheetSources: { [css]: undefined }, files: ["index.html", EDITOR_PAGE_BUILDER_PATH] }) as { css: string }).css, DEFAULT_STATIC_SECTIONS[0].css);
  bad(input({ documentText: json, files, stylesheetSources: {} }), `Load ${css} or explicitly prove it is absent.`);
  bad(input({ documentText: json, files }), "A complete file graph must prove the new stylesheet is absent.");
  assert.deepEqual(previewDefaultStaticSection(json, "static-section:intro", { stylesheetSources: {}, files }), { error: `Load ${css} or explicitly prove it is absent.` });
  assert.deepEqual(previewDefaultStaticSection(json, "static-section:intro", { stylesheetSources: { [css]: undefined }, files }), { error: "A complete file graph must prove the new stylesheet is absent." });
  // Reuse allows ordinary cascade from other loaded sheets; imports must still be loaded.
  const themed = page.replace("</head>", '<link rel="stylesheet" href="theme.css"></head>');
  good(input({ documentText: json, pageSource: themed, files: [...files, "theme.css"], stylesheetSources: { [css]: "", "theme.css": ".section-intro { color: blue; }" } }));
  bad(input({ documentText: json, pageSource: themed, files: [...files, "theme.css"], stylesheetSources: { [css]: "" } }), "Load theme.css before verifying section stylesheet links.");
  bad(input({ documentText: json, pageSource: page.replace("</head>", '<style>@import "x.css";</style></head>'), files, stylesheetSources: { [css]: "" } }), "Load x.css before verifying inline stylesheet imports.");
  // First-time seed keeps the strict unknown-collision refusal.
  bad(input({ files: ["index.html", css], stylesheetSources: { [css]: ".section-intro { color: red; }" } }), "Existing stylesheet rules conflict with this section's rootClass; no CSS was overwritten.");
  bad(input({ documentText: json, files, stylesheetSources: { [css]: "" }, cssPolicy: "bogus" as "reuse-current" }), "Unknown section CSS policy.");
});
