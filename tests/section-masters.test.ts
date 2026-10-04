import assert from "node:assert/strict";
import { test } from "node:test";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document";
import {
  listSectionChoices, planMakeSectionMaster, planStaticSectionInsert, planStaticSectionSave, previewStaticSection,
  readSectionCatalog, readStaticSectionRecords, resolveStaticSection, sectionMasterPath, type StaticSectionRecord,
} from "../src/page-builder/static-sections";
import { planNativeSectionCopiesUpdate, planNativeSectionLink, readNativeSectionLinks } from "../src/page-builder/native-section-links";
import { planSelectedStaticSectionSave } from "../src/page-builder/native-section-save";

// Saved sections with a master file: `.editor/sections/<id>.html` is the only authority for the
// section's HTML; the editor JSON holds `htmlPath` and never the HTML; pages stay plain HTML.
const intro: StaticSectionRecord = { id: "intro", label: "Intro", rootClass: "intro", stylesheetPath: "styles/sections.css", html: `<section class="intro"><h2>Hello</h2></section>`, css: ".intro { margin: 0; }\n", future: { kept: true } };
const outro: StaticSectionRecord = { id: "outro", label: "Outro", rootClass: "outro", stylesheetPath: "styles/sections.css", html: `<section class="outro"><p>Bye</p></section>`, css: "" };
const v1 = JSON.stringify({ version: 1, pages: { "index.html": { title: "kept" } }, collections: {}, future: { x: 1 }, reusableSections: { version: 1, records: { intro, outro }, extra: ["kept"] } }, null, 2) + "\n";
const masterPath = sectionMasterPath("intro");
const files = ["index.html", "about/index.html", EDITOR_PAGE_BUILDER_PATH, "styles/sections.css"];
const page = (body: string) => `<!doctype html><html><head><title>T</title></head><body><main>${body}</main></body></html>`;
const range = (source: string, html: string) => { const start = source.indexOf(html); assert.ok(start >= 0); return { start, end: start + html.length }; };

function made() {
  const plan = planMakeSectionMaster({ documentText: v1, files, id: "intro" });
  if ("error" in plan) assert.fail(plan.error);
  return { plan, json: plan.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!, master: plan.operation.creates![0].content };
}

test("a v1-only catalogue reads as before", () => {
  assert.deepEqual(readSectionCatalog(v1), { intro, outro });
  assert.deepEqual(readStaticSectionRecords(v1), { intro, outro });
  assert.deepEqual(listSectionChoices(v1).map((choice) => choice.id), ["intro", "outro"]);
});

test("Make master creates the file and stores only htmlPath, in one pinned operation", () => {
  const { plan, json, master } = made();
  assert.equal(plan.htmlPath, ".editor/sections/intro.html");
  assert.equal(master, intro.html);
  assert.deepEqual(plan.operation.creates, [{ path: masterPath, content: intro.html }]);
  assert.deepEqual([...plan.operation.expectedSources], [[EDITOR_PAGE_BUILDER_PATH, v1], [masterPath, undefined]]);
  assert.deepEqual(plan.expectedFiles, [...files].sort());
  // As text: the master's HTML is not in the JSON; the other v1 record keeps its html.
  assert.ok(!json.includes("<h2>Hello</h2>"));
  const raw = JSON.parse(json);
  assert.equal(raw.reusableSections.version, 2);
  assert.deepEqual(raw.reusableSections.extra, ["kept"]);
  assert.deepEqual(raw.future, { x: 1 });
  assert.equal(raw.pages["index.html"].title, "kept");
  assert.equal(Object.hasOwn(raw.reusableSections.records.intro, "html"), false);
  assert.equal(raw.reusableSections.records.intro.htmlPath, masterPath);
  assert.deepEqual(raw.reusableSections.records.intro.future, { kept: true });
  assert.equal(raw.reusableSections.records.outro.html, outro.html);
  // Refusals: no graph, a taken path in any case, already a master, unknown or unsafe id.
  assert.ok("error" in planMakeSectionMaster({ documentText: v1, files: [], id: "intro" }));
  assert.match((planMakeSectionMaster({ documentText: v1, files: [...files, ".editor/sections/INTRO.html"], id: "intro" }) as { error: string }).error, /already exists/);
  assert.match((planMakeSectionMaster({ documentText: json, files: [...files, masterPath], id: "intro" }) as { error: string }).error, /already has a master/);
  assert.ok("error" in planMakeSectionMaster({ documentText: v1, files, id: "missing" }));
  assert.ok("error" in planMakeSectionMaster({ documentText: v1, files, id: "__proto__" }));
});

test("a master resolves from its loaded source only; missing graph, file or load refuse", () => {
  const { json } = made();
  const withMaster = [...files, masterPath];
  const draft = `\n  <section class="intro"><h2>Draft</h2></section>\n`;
  assert.throws(() => readStaticSectionRecords(json), /master file; load it first/);
  assert.throws(() => readStaticSectionRecords(json, { sources: { [masterPath]: draft } }), /complete file graph/);
  assert.throws(() => readStaticSectionRecords(json, { sources: { [masterPath]: draft }, files }), /is missing/);
  assert.throws(() => readStaticSectionRecords(json, { sources: {}, files: withMaster }), /Load \.editor\/sections\/intro\.html/);
  assert.throws(() => readStaticSectionRecords(json, { sources: { [masterPath]: "<div></div>" }, files: withMaster }));
  const records = readStaticSectionRecords(json, { sources: { [masterPath]: draft }, files: withMaster });
  assert.equal(records.intro.html, draft);
  assert.equal(records.outro.html, outro.html);
  const catalog = readSectionCatalog(json);
  assert.equal(resolveStaticSection(catalog.outro), catalog.outro);
  // Listing needs no master.
  assert.deepEqual(listSectionChoices(json).map((choice) => choice.id), ["intro", "outro"]);
  const preview = previewStaticSection(json, "intro", undefined, { sources: { [masterPath]: draft }, files: withMaster });
  assert.ok(!("error" in preview));
  assert.equal(preview.html, draft);
  assert.ok("error" in previewStaticSection(json, "intro"));
});

test("a resolved record or a hand-written entry with both html and htmlPath is never written or read", () => {
  const { json } = made();
  const resolved = readStaticSectionRecords(json, { sources: { [masterPath]: intro.html }, files: [...files, masterPath] }).intro;
  assert.match((planStaticSectionSave({ documentText: json, files: [...files, masterPath], record: resolved, overwrite: { expected: resolved } }) as { error: string }).error, /never both/);
  const both = JSON.parse(json);
  both.reusableSections.records.intro.html = intro.html;
  assert.throws(() => readSectionCatalog(JSON.stringify(both)), /never both/);
  const wrongPath = JSON.parse(json);
  wrongPath.reusableSections.records.intro.htmlPath = "sections/intro.html";
  assert.throws(() => readSectionCatalog(JSON.stringify(wrongPath)), /master must be/);
  const v1WithPath = JSON.parse(json);
  v1WithPath.reusableSections.version = 1;
  assert.throws(() => readSectionCatalog(JSON.stringify(v1WithPath)), /version 2/);
  // A v1 record in a v2 catalogue still saves as before; the master's id refuses that path.
  const other = { ...outro, html: `<section class="outro"><p>Later</p></section>` };
  const ok = planStaticSectionSave({ documentText: json, files: [...files, masterPath], record: other, overwrite: { expected: outro } });
  assert.ok(!("error" in ok), "error" in ok ? ok.error : "");
  assert.equal(JSON.parse(ok.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!).reusableSections.version, 2);
  assert.match((planStaticSectionSave({ documentText: json, files: [...files, masterPath], record: { ...intro }, overwrite: { expected: intro } }) as { error: string }).error, /never both|master file/);
});

test("Add from a master inserts its literal bytes, comments and padding included, and pins the master", () => {
  const { json } = made();
  const master = `<!-- intro master -->\n<section class="intro"><h2>Hello</h2></section>\n`;
  const pageSource = page("<p>Keep</p>");
  const plan = planStaticSectionInsert({ documentText: json, sectionId: "intro", pagePath: "index.html", pageSource, parent: [0], index: 1, stylesheetSources: { "styles/sections.css": ".intro { margin: 0; }\n" }, files: [...files, masterPath], masters: { [masterPath]: master }, cssPolicy: "reuse-current" });
  if ("error" in plan) assert.fail(plan.error);
  const after = plan.operation.edits.get("index.html")!;
  assert.ok(after.includes(master), after);
  assert.ok(!/data-native|<script/.test(after));
  assert.equal(plan.operation.expectedSources.get(masterPath), master);
  assert.equal(plan.operation.edits.has(EDITOR_PAGE_BUILDER_PATH), false);
  assert.ok("error" in planStaticSectionInsert({ documentText: json, sectionId: "intro", pagePath: "index.html", pageSource, parent: [0], index: 1, stylesheetSources: { "styles/sections.css": "" }, files: [...files, masterPath] }));
});

test("Save from a page into the master replaces only its section and moves the origin copy's basis", () => {
  const { json } = made();
  const master = `<!-- intro master -->\n<section class="intro"><h2>Hello</h2></section>\n`;
  const copy = intro.html;
  const home = page(copy);
  const linkPlan = planNativeSectionLink({ documentText: json, pagePath: "index.html", pageSource: home, range: range(home, copy), record: { ...intro, html: master } });
  if ("error" in linkPlan) assert.fail(linkPlan.error);
  const linked = linkPlan.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const edited = `<section class="intro"><h2>Hello &amp; welcome</h2></section>`;
  const editedPage = page(edited);
  const plan = planSelectedStaticSectionSave({ pagePath: "index.html", pageSource: editedPage, range: range(editedPage, edited), documentText: linked, files: [...files, masterPath], master });
  if ("error" in plan) assert.fail(plan.error);
  assert.equal(plan.noop, false);
  if (plan.noop) return;
  assert.equal(plan.operation.edits.get(masterPath), `<!-- intro master -->\n${edited}\n`);
  assert.equal(plan.operation.edits.has("index.html"), false);
  assert.deepEqual(Object.fromEntries(plan.operation.expectedSources), { [EDITOR_PAGE_BUILDER_PATH]: linked, "index.html": editedPage, [masterPath]: master });
  const newJson = plan.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  assert.equal(readNativeSectionLinks(newJson)["index.html"]["intro-1"].basis, edited);
  assert.deepEqual(JSON.parse(newJson).future, { x: 1 });
  assert.ok(!newJson.includes("welcome") || newJson.includes('"basis"'));
  assert.equal(Object.hasOwn(JSON.parse(newJson).reusableSections.records.intro, "html"), false);
  // The same bytes again: nothing to do. No master loaded: refused.
  const again = planSelectedStaticSectionSave({ pagePath: "index.html", pageSource: editedPage, range: range(editedPage, edited), documentText: newJson, files: [...files, masterPath], master: `<!-- intro master -->\n${edited}\n` });
  assert.deepEqual(again, { noop: true, recordId: "intro" });
  assert.ok("error" in planSelectedStaticSectionSave({ pagePath: "index.html", pageSource: editedPage, range: range(editedPage, edited), documentText: linked, files: [...files, masterPath] }));
});

test("Update from a master syncs copies made from different versions, keeps a customised one, and pins the master", () => {
  const { json } = made();
  const v0 = intro.html;
  const v1Html = `<section class="intro"><h2>Hello again</h2></section>`;
  const home = page(v0), about = page(v1Html);
  let text = (planNativeSectionLink({ documentText: json, pagePath: "index.html", pageSource: home, range: range(home, v0), record: { ...intro, html: v0 } }) as { operation: { edits: Map<string, string> } }).operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  text = (planNativeSectionLink({ documentText: text, pagePath: "about/index.html", pageSource: about, range: range(about, v1Html), record: { ...intro, html: v1Html } }) as { operation: { edits: Map<string, string> } }).operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const newMaster = `\n<section class="intro"><h2>Newest</h2></section>\n`;
  const resolved = readStaticSectionRecords(text, { sources: { [masterPath]: newMaster }, files: [...files, masterPath] }).intro;
  const sources = { "index.html": home, "about/index.html": about };
  const plan = planNativeSectionCopiesUpdate({ documentText: text, files: [...files, masterPath], sources, record: resolved, master: { path: masterPath, source: newMaster } });
  if ("error" in plan) assert.fail(plan.error);
  assert.deepEqual(plan.updated.map((entry) => entry.page).sort(), ["about/index.html", "index.html"]);
  assert.equal(plan.operation!.edits.get("index.html"), page(`<section class="intro"><h2>Newest</h2></section>`));
  assert.equal(plan.operation!.expectedSources.get(masterPath), newMaster);
  const after = plan.operation!.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  assert.equal(Object.hasOwn(JSON.parse(after).reusableSections.records.intro, "html"), false);
  // A customised copy is reported and left alone.
  const custom = page(`<section class="intro"><h2>Mine</h2></section>`);
  const partial = planNativeSectionCopiesUpdate({ documentText: text, files: [...files, masterPath], sources: { ...sources, "about/index.html": custom }, record: resolved, master: { path: masterPath, source: newMaster } });
  if ("error" in partial) assert.fail(partial.error);
  assert.deepEqual(partial.diverged, [{ page: "about/index.html", key: "intro-1" }]);
  assert.equal(partial.operation!.edits.has("about/index.html"), false);
  // A pin that doesn't match the record, or a master outside the graph, refuses.
  assert.ok("error" in planNativeSectionCopiesUpdate({ documentText: text, files: [...files, masterPath], sources, record: resolved, master: { path: masterPath, source: "other" } }));
  assert.ok("error" in planNativeSectionCopiesUpdate({ documentText: text, files, sources, record: resolved, master: { path: masterPath, source: newMaster } }));
});

// Saving a copy into one record's master must never bless another record's link on the same
// copy: that customised copy would otherwise be overwritten by the other record's next Update.
test("Save into a master moves only that record's link basis; another record's link stays", () => {
  const { json } = made();
  // The copy has an authored id, so its outro link still finds it after the class changes.
  const outroS1 = { ...outro, html: `<section id="s1" class="outro"><p>Bye</p></section>` };
  const home = page(outroS1.html);
  const linkPlan = planNativeSectionLink({ documentText: json, pagePath: "index.html", pageSource: home, range: range(home, outroS1.html), record: outroS1 });
  if ("error" in linkPlan) assert.fail(linkPlan.error);
  const linked = linkPlan.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  // The user rewrites the copy as an intro in their own words and saves it into the intro master.
  const mine = `<section id="s1" class="intro"><p>My own words</p></section>`;
  const edited = page(mine);
  const save = planSelectedStaticSectionSave({ pagePath: "index.html", pageSource: edited, range: range(edited, mine), documentText: linked, files: [...files, masterPath], master: `${intro.html}\n`, recordId: "intro" });
  if ("error" in save) assert.fail(save.error);
  const after = save.noop ? linked : save.operation.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? linked;
  assert.equal(readNativeSectionLinks(after)["index.html"]["outro-1"].basis, outroS1.html);
  // The outro's next Update leaves the user's words alone.
  const update = planNativeSectionCopiesUpdate({ documentText: after, files: [...files, masterPath], sources: { "index.html": edited }, record: { ...outroS1, html: `<section id="s1" class="outro"><p>Later</p></section>` } });
  if ("error" in update) assert.fail(update.error);
  assert.deepEqual(update.diverged, [{ page: "index.html", key: "outro-1" }]);
  assert.equal(update.operation, undefined);
});

// A version 2 catalogue stays usable when its last master is removed (all inline) or empty.
test("a version 2 catalogue with no master left still reads, inserts and saves", () => {
  const inline = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 2, records: { outro } } });
  assert.deepEqual(readStaticSectionRecords(inline), { outro });
  const insert = planStaticSectionInsert({ documentText: inline, sectionId: "outro", pagePath: "index.html", pageSource: page("<p>Keep</p>"), parent: [0], index: 1, stylesheetSources: { "styles/sections.css": "" }, files, cssPolicy: "reuse-current" });
  assert.ok(!("error" in insert), "error" in insert ? insert.error : "");
  const saved = planStaticSectionSave({ documentText: inline, files, record: { ...outro, html: `<section class="outro"><p>Later</p></section>` }, overwrite: { expected: outro } });
  assert.ok(!("error" in saved), "error" in saved ? saved.error : "");
  const empty = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 2, records: {} } });
  assert.deepEqual(readStaticSectionRecords(empty), {});
  assert.ok(!("error" in planStaticSectionSave({ documentText: empty, files, record: outro })));
  // A future version still refuses.
  assert.throws(() => readSectionCatalog(JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 3, records: {} } })), /Unsupported/);
});

test("Update of a master record needs its master pinned at its own path; Save into a master needs it in the graph", () => {
  const { json } = made();
  const home = page(intro.html);
  const linked = (planNativeSectionLink({ documentText: json, pagePath: "index.html", pageSource: home, range: range(home, intro.html), record: intro }) as { operation: { edits: Map<string, string> } }).operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const newMaster = `<section class="intro"><h2>Newest</h2></section>`;
  const resolved = readStaticSectionRecords(linked, { sources: { [masterPath]: newMaster }, files: [...files, masterPath] }).intro;
  assert.match((planNativeSectionCopiesUpdate({ documentText: linked, files: [...files, masterPath], sources: { "index.html": home }, record: resolved }) as { error: string }).error, /master/i);
  assert.ok("error" in planNativeSectionCopiesUpdate({ documentText: linked, files: [...files, masterPath, ".editor/sections/other.html"], sources: { "index.html": home }, record: resolved, master: { path: ".editor/sections/other.html", source: newMaster } }));
  const edited = page(newMaster);
  assert.ok("error" in planSelectedStaticSectionSave({ pagePath: "index.html", pageSource: edited, range: range(edited, newMaster), documentText: linked, master: intro.html }));
  assert.ok("error" in planSelectedStaticSectionSave({ pagePath: "index.html", pageSource: edited, range: range(edited, newMaster), documentText: linked, files, master: intro.html }));
});
