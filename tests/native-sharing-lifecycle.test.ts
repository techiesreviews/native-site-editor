import assert from "node:assert/strict";
import { test } from "node:test";
import { planNativeSharingLifecycle, type NativeSharingLifecycleInput, type NativeSharingLifecyclePlan } from "../src/page-builder/native-sharing-lifecycle";
import { EDITOR_PAGE_BUILDER_PATH as JSON_PATH } from "../src/page-builder/page-builder-document";
import { prepareNativeTextHistory } from "../src/page-builder/native-operation-history";
import type { SavedDraft } from "../src/drafts";
const target = (tag: string) => ({ path: [0, 1, 0], tag, openingTagFingerprint: `<${tag} class="shared-${tag}">`, futureTarget: ["kept"] });
const link = (tag: string) => ({ kind: tag === "section" ? "native-section" : "native-page-part", recordId: tag, target: target(tag), basis: `<${tag} class="shared-${tag}">Original</${tag}>`, custom: { future: [false, 2] } });
function fixture() {
  const document = { version: 1, futureTop: { keep: true }, pages: {
    "work/a/index.html": { fields: { mood: "customised" }, customPage: [1], sections: { intro: link("section"), opaque: { kind: "foreign", data: ["keep"] } }, pageParts: { top: link("header"), bottom: link("footer"), other: 17 } },
    "work/b/index.html": { sections: { intro: link("section") }, pageParts: { top: link("header") } },
    "projects/a/index.html": { fields: { destination: "keep" }, pageParts: { unrelated: { kind: "foreign" } } },
    "about/index.html": { pageParts: ["opaque future namespace"] },
  }, collections: { real: { pagePath: "work/a/index.html", target: target("ul"), folders: ["/work/"], sort: "title", filter: "", limit: 12, template: "<li>literal</li>", fields: [], overrides: {}, futureCollection: true } },
  reusableSections: { version: 1, records: { section: { id: "section", label: "Intro", rootClass: "shared-section", html: link("section").basis, css: "", stylesheetPath: "styles/site.css" } } },
  reusablePageParts: { version: 1, futureCatalog: true, records: Object.fromEntries(["header", "footer"].map(tag => [tag, { id: tag, label: tag, rootTag: tag, rootClass: `shared-${tag}`, htmlPath: `.editor/page-parts/${tag}.html`, stylesheetPath: "styles/site.css", futureRecord: { keep: 1 } }])) },
  };
  const documentText = JSON.stringify(document, null, 4) + "\n";
  const sources: Record<string, string | undefined> = { [JSON_PATH]: documentText, "work/a/index.html": '<!doctype html><html><body><header class="shared-header">Custom header</header><main><section class="shared-section">Custom section</section></main><footer class="shared-footer">Custom footer</footer></body></html>', "work/b/index.html": "<!doctype html><html><body>Second complete page</body></html>", "about/index.html": "<!doctype html><html><body>Unlinked</body></html>", "styles/site.css": ".shared-header { color: blue; }" };
  const files = [...Object.keys(sources), ".editor/page-parts/header.html", ".editor/page-parts/footer.html", "images/photo.png"];
  return { document, documentText, files, sources };
}
const ok = (value: ReturnType<typeof planNativeSharingLifecycle>): NativeSharingLifecyclePlan => { assert.ok(!("error" in value), "error" in value ? value.error : ""); return value; };
const error = (input: NativeSharingLifecycleInput, pattern: RegExp) => { const value = planNativeSharingLifecycle(input); assert.ok("error" in value); assert.match(value.error, pattern); };
const changed = (plan: NativeSharingLifecyclePlan) => JSON.parse(plan.operation!.edits.get(JSON_PATH)!);

test("explicit folder page mappings move section/header/footer links only, preserving customised copies and all unrelated metadata", () => {
  const f = fixture(), beforeSources = structuredClone(f.sources);
  const plan = ok(planNativeSharingLifecycle({ ...f, moves: [{ from: "work/a/index.html", to: "projects/a/index.html" }, { from: "work/b/index.html", to: "projects/b/index.html" }] }));
  assert.equal(plan.movedLinks, 5); assert.equal(plan.deletedLinks, 0);
  assert.deepEqual([...plan.operation!.edits.keys()], [JSON_PATH]); assert.deepEqual(plan.operation!.creates, []);
  const after = changed(plan);
  assert.deepEqual(after.pages["projects/a/index.html"].sections.intro, f.document.pages["work/a/index.html"].sections.intro);
  assert.deepEqual(after.pages["projects/a/index.html"].pageParts.top, link("header"));
  assert.deepEqual(after.pages["projects/a/index.html"].pageParts.bottom, link("footer"));
  assert.deepEqual(after.pages["projects/a/index.html"].fields, { destination: "keep" });
  assert.deepEqual(after.pages["work/a/index.html"], { fields: { mood: "customised" }, customPage: [1], sections: { opaque: { kind: "foreign", data: ["keep"] } }, pageParts: { other: 17 } });
  assert.equal(after.pages["work/b/index.html"], undefined);
  for (const key of ["collections", "reusableSections", "reusablePageParts", "futureTop"]) assert.deepEqual(after[key], f.document[key as keyof typeof f.document]);
  assert.deepEqual(after.pages["about/index.html"], f.document.pages["about/index.html"]);
  assert.deepEqual(f.sources, beforeSources, "public HTML, CSS and original JSON are not mutated");
  assert.deepEqual(plan.expectedFiles, [...f.files].sort());
  assert.equal(plan.expectedSources.get("work/a/index.html"), f.sources["work/a/index.html"]);
  assert.ok(plan.expectedSources.has("projects/a/index.html")); assert.equal(plan.expectedSources.get("projects/a/index.html"), undefined);
  assert.equal(plan.expectedSources.get(JSON_PATH), f.documentText);
});

test("moving an unlinked page alongside linked pages keeps its empty metadata entry", () => {
  const f = fixture(), document = { ...f.document, pages: { ...f.document.pages, "plain.html": {} } };
  const documentText = JSON.stringify(document), sources = { ...f.sources, [JSON_PATH]: documentText, "plain.html": "Complete unlinked page" };
  const plan = ok(planNativeSharingLifecycle({ ...f, documentText, sources, files: [...f.files, "plain.html"], moves: [{ from: "work/a/index.html", to: "projects/a/index.html" }, { from: "plain.html", to: "plain-copy.html" }] }));
  assert.deepEqual(changed(plan).pages["plain.html"], {});
  assert.equal(changed(plan).pages["plain-copy.html"], undefined);
});

test("delete removes only recognised links, keeping page custom fields, opaque entries, other pages and reusable records", () => {
  const f = fixture(), plan = ok(planNativeSharingLifecycle({ ...f, deletes: ["work/a/index.html", "work/b/index.html"] })), after = changed(plan);
  assert.equal(plan.deletedLinks, 5);
  assert.deepEqual(after.pages["work/a/index.html"], { fields: { mood: "customised" }, customPage: [1], sections: { opaque: { kind: "foreign", data: ["keep"] } }, pageParts: { other: 17 } });
  assert.deepEqual(after.collections, f.document.collections); assert.deepEqual(after.reusablePageParts, f.document.reusablePageParts);
  assert.deepEqual(after.pages["projects/a/index.html"], f.document.pages["projects/a/index.html"]);
});

for (const namespace of ["sections", "pageParts"] as const) test(`a move refuses a colliding ${namespace} key, including an opaque destination entry`, () => {
  const f = fixture(), document: any = structuredClone(f.document);
  document.pages["projects/a/index.html"][namespace] = namespace === "sections" ? { intro: { kind: "foreign" } } : { top: false };
  const documentText = JSON.stringify(document);
  error({ ...f, documentText, sources: { ...f.sources, [JSON_PATH]: documentText }, moves: [{ from: "work/a/index.html", to: "projects/a/index.html" }] }, /already has/);
});

test("ambiguous mappings, occupied destinations and missing/unloaded sources refuse before any operation", () => {
  const f = fixture(), move = { from: "work/a/index.html", to: "projects/a/index.html" };
  error({ ...f, moves: [move, move] }, /More than one/);
  error({ ...f, moves: [move], deletes: [move.from] }, /More than one/);
  error({ ...f, moves: [move, { from: "work/b/index.html", to: move.to }] }, /Ambiguous/);
  error({ ...f, moves: [{ from: move.from, to: "work/b/index.html" }] }, /must be absent/);
  error({ ...f, moves: [move], sources: { ...f.sources, [move.from]: undefined } }, /Load the existing/);
  error({ ...f, moves: [move], files: f.files.filter(path => path !== move.from) }, /Load the existing/);
  error({ ...f, moves: [move], sources: { ...f.sources, [move.to]: "foreign new page" } }, /must be absent/);
  error({ ...f, deletes: [".editor/page-parts/header.html"] }, /Not a native HTML page/);
});

test("malformed recognised records/targets, duplicate JSON keys and unloaded JSON fail closed", () => {
  const f = fixture(), document: any = structuredClone(f.document);
  delete document.reusableSections.records.section;
  const text = JSON.stringify(document);
  error({ ...f, documentText: text, sources: { ...f.sources, [JSON_PATH]: text } }, /names no saved section/);
  document.reusableSections = f.document.reusableSections;
  document.pages["work/a/index.html"].pageParts.top.target.path = [-1];
  const invalid = JSON.stringify(document);
  error({ ...f, documentText: invalid, sources: { ...f.sources, [JSON_PATH]: invalid } }, /valid explicit/);
  error({ ...f, documentText: '{"version":1,"version":1,"pages":{},"collections":{}}', sources: {} }, /Duplicate JSON key/);
  error({ ...f, documentText: undefined }, /Load the current editor JSON/);
  error({ ...f, sources: { ...f.sources, [JSON_PATH]: "foreign JSON" } }, /does not match/);
});

test("no recognised links means no JSON operation or creation; opaque metadata and independent duplicates stay untouched", () => {
  const f = fixture(), documentText = JSON.stringify({ version: 1, pages: { "about/index.html": { pageParts: ["future"], sections: { unknown: { kind: "foreign" } } } }, collections: {}, reusablePageParts: { futureVersion: 3 } });
  const plan = ok(planNativeSharingLifecycle({ ...f, documentText, sources: { ...f.sources, [JSON_PATH]: documentText }, moves: [{ from: "about/index.html", to: "team/index.html" }] }));
  assert.equal(plan.operation, undefined); assert.equal(plan.movedLinks, 0);
  const absent = ok(planNativeSharingLifecycle({ documentText: undefined, files: ["index.html"], sources: { "index.html": "Complete public HTML" }, moves: [{ from: "index.html", to: "copy.html" }] }));
  assert.equal(absent.operation, undefined);
  assert.equal(ok(planNativeSharingLifecycle(f)).operation, undefined, "a duplicate has no move mapping and inherits no links");
});

test("the planner pins concurrent source/graph changes and its JSON edit uses the existing guarded one-step Undo/Redo receipt", () => {
  const f = fixture(), plan = ok(planNativeSharingLifecycle({ ...f, deletes: ["work/a/index.html"] }));
  const current = (files: string[], sources: Record<string, string | undefined>) => JSON.stringify([...files].sort()) === JSON.stringify(plan.expectedFiles) && [...plan.expectedSources].every(([path, text]) => sources[path] === text);
  assert.equal(current(f.files, f.sources), true);
  assert.equal(current([...f.files, "new.html"], f.sources), false);
  assert.equal(current(f.files, { ...f.sources, "work/a/index.html": "foreign edit" }), false);
  assert.equal(current(f.files, { ...f.sources, [JSON_PATH]: "foreign JSON" }), false);
  const scope = { account: "test", repoId: 1, repo: "test/site", branch: "main" }, records = new Map<string, SavedDraft>();
  const next = plan.operation!.edits.get(JSON_PATH)!;
  const record: SavedDraft = { ...scope, version: 1, path: JSON_PATH, baseSha: "original-json", original: f.documentText, content: next, updatedAt: 1 };
  const receipt = prepareNativeTextHistory({ scope, store: { error: null, get: (_scope, path) => records.get(path), save: draft => { records.set(draft.path, draft); return true; }, remove: (_scope, path) => { records.delete(path); return true; } }, isLive: () => true,
    source: path => records.get(path)?.content ?? f.sources[path], mounted: () => false, modelState: () => ({ isCurrent: () => true }), evictModel: (_path, proof) => proof,
    prepareSources: edits => { assert.deepEqual(edits, []); return { isCurrent: () => true, apply: () => true, undo: () => true, redo: () => true }; },
  }, { before: new Map([[JSON_PATH, undefined]]), after: new Map([[JSON_PATH, record]]), beforeSources: plan.expectedSources, afterSources: new Map([...plan.expectedSources, [JSON_PATH, next]]) });
  assert.ok(receipt); assert.equal(receipt.apply(), true); assert.equal(records.get(JSON_PATH)?.content, next);
  assert.equal(receipt.undo(), true); assert.equal(records.has(JSON_PATH), false); assert.equal(f.sources[JSON_PATH], f.documentText);
  assert.equal(receipt.redo(), true); assert.equal(records.get(JSON_PATH), record);
  records.set(JSON_PATH, { ...record, content: "newer foreign JSON" });
  assert.equal(receipt.undo(), false); assert.equal(records.get(JSON_PATH)?.content, "newer foreign JSON");
});
