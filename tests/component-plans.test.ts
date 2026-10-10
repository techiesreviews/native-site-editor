// The component tools' guarded plans (src/page-builder/component-plans.ts) run by the
// guarded edit module on the memory workspace: the slot chip, removing a template's
// part and renaming a component, each one undo step over every file it changes, and
// refused when a file it read (an empty one too) or the mode's opening moved meanwhile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuardedEdits, type Reads } from "../src/guarded-edit";
import { componentRenameStep, makeComponentStep, newComponentStep, slotChipPlan, templateRemovalPlan, type PreparedComponentLoader } from "../src/page-builder/component-plans";
import * as rename from "../src/page-builder/component-rename";
import { makeComponentPlan, slotChipState, type MakeComponentPlan } from "../src/page-builder/component-model";
import * as carry from "../src/page-builder/component-css";
import { elementEnd, startTags } from "../shared/html-source";
import type { SlotChipReport } from "../src/page-builder/edit-component-mode";
import { createMemoryWorkspace, deferred, type MemoryWorkspace } from "./fakes/memory-workspace";

const TEMPLATE_PATH = "components/site-card/site-card.html", EMPTY_PATH = "components/site-empty/site-empty.html";
const TEMPLATE = '<article class="card"><h2>Title</h2><p><slot name="body">Body</slot></p></article>';
const PAGE = '<main><site-card><span slot="body">Mine</span></site-card></main>';
const CSS = "site-card { display: block; }";
const site = { routes: { "/": "index.html" }, components: { "site-card": TEMPLATE_PATH, "site-empty": EMPTY_PATH } };

function setup(open = TEMPLATE_PATH) {
  const m = createMemoryWorkspace({
    branch: { "index.html": PAGE, [TEMPLATE_PATH]: TEMPLATE, "components/site-card/site-card.css": CSS, [EMPTY_PATH]: "" },
    open, mounted: [TEMPLATE_PATH], site,
  });
  m.enterEditMode();
  return { m, edits: createGuardedEdits(m.workspace) };
}
const bytes = (m: MemoryWorkspace) => JSON.stringify(m.files().map(path => [path, m.workspace.source(path)]));
const renameBody = (r: Reads) => {
  const node = [0, 1, 0], chip = slotChipState(r.source(TEMPLATE_PATH)!, node)!;
  return slotChipPlan(r, { template: TEMPLATE_PATH, node, chip, action: "rename", name: "text" } satisfies SlotChipReport);
};

test("a slot renamed by its chip renames the page's fills in the same undo step", async () => {
  const { m, edits } = setup();
  const before = bytes(m);
  const outcome = await edits.run(renameBody, { anchor: TEMPLATE_PATH });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.equal(m.workspace.source(TEMPLATE_PATH), TEMPLATE.replace('name="body"', 'name="text"'));
  assert.equal(m.workspace.source("index.html"), PAGE.replace('slot="body"', 'slot="text"'));
  assert.deepEqual(m.steps(), ["operation"]);
  assert.equal(m.announced.at(-1), "Renamed slot “body” to “text”. 1 page using it follows.");
  assert.ok(m.undo());
  assert.equal(bytes(m), before);
});

test("a chip change with no page following is still one receipt step whose Undo selects the part", async () => {
  const { m, edits } = setup();
  const node = [0, 0], chip = slotChipState(TEMPLATE, node)!;
  const outcome = await edits.run(r => slotChipPlan(r, { template: TEMPLATE_PATH, node, chip, action: "toggle" }), { anchor: TEMPLATE_PATH });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.deepEqual(m.steps(), ["operation"]);
  assert.deepEqual(m.selected, []);
  assert.ok(m.undo());
  assert.deepEqual(m.selected.at(-1), { path: TEMPLATE_PATH, node: [0, 0] });
  assert.ok(m.redo());
  assert.deepEqual(m.selected.at(-1), { path: TEMPLATE_PATH, node: [0, 0, 0] });
});

test("an empty template that gains an instance during a slot change refuses the step (it was read too)", async () => {
  const { m, edits } = setup();
  const hold = m.holdBranchRead();
  const pending = edits.run(renameBody, { anchor: TEMPLATE_PATH });
  await hold.reached;
  // Another tab fills the empty template with a <site-card> whose fill the change should have renamed.
  m.writeDraft(EMPTY_PATH, '<site-card><span slot="body">Kept</span></site-card>');
  hold.release();
  const outcome = await pending;
  assert.deepEqual(outcome.ok ? outcome : { reason: outcome.reason, changed: outcome.reason === "stale" && outcome.changed }, { reason: "stale", changed: { file: EMPTY_PATH } });
  assert.equal(m.workspace.source(TEMPLATE_PATH), TEMPLATE);
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.deepEqual(m.steps(), []);
});

test("removing a template's slot part takes its fills off every page in one undo step", async () => {
  const { m, edits } = setup();
  const before = bytes(m);
  const outcome = await edits.run(r => templateRemovalPlan(r, TEMPLATE_PATH, [0, 1], "site-card", "Paragraph") ?? { refuse: "no" }, { anchor: TEMPLATE_PATH });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.equal(m.workspace.source(TEMPLATE_PATH), '<article class="card"><h2>Title</h2></article>');
  assert.equal(m.workspace.source("index.html"), "<main><site-card></site-card></main>");
  assert.equal(m.announced.at(-1), "Paragraph removed; slot “body” removed. 1 page using it follows.");
  assert.deepEqual(m.steps(), ["operation"]);
  assert.ok(m.undo());
  assert.equal(bytes(m), before);
});

test("renaming a component moves its files and renames its instances in one undo step", async () => {
  // The memory workspace moves no mounted file: the page takes the step here (the template in the editor).
  const { m, edits } = setup("index.html");
  m.unmount(TEMPLATE_PATH);
  const before = bytes(m);
  const files = m.files();
  const outcome = await edits.run(r => componentRenameStep(r, rename, { from: "site-card", typed: "tile", files, part: [0] }), { anchor: "index.html" });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.deepEqual(m.files(), ["components/card-tile/card-tile.css", "components/card-tile/card-tile.html", EMPTY_PATH, "index.html"]);
  assert.equal(m.workspace.source("index.html"), PAGE.replace(/site-card/g, "card-tile"));
  assert.equal(m.workspace.source("components/card-tile/card-tile.css"), "card-tile { display: block; }");
  assert.deepEqual(m.steps(), ["operation"]);
  assert.ok(m.undo());
  assert.equal(bytes(m), before);
});

test("a rename typed as the same name is no step", async () => {
  const { m, edits } = setup("index.html");
  const outcome = await edits.run(r => componentRenameStep(r, rename, { from: "site-card", typed: "site-card", files: m.files(), part: [0] }), { anchor: "index.html" });
  assert.deepEqual(outcome, { ok: true, status: "unchanged" });
  assert.deepEqual(m.steps(), []);
});

test("leaving and entering Edit component mode again during an await refuses the step", async () => {
  // Before the plan (rename's lazy load, held by the stamp taken as it began) …
  {
    const { m, edits } = setup();
    const stamp = edits.stamp(), loaded = deferred();
    const waiting = loaded.promise.then(() => edits.run(renameBody, { since: stamp, anchor: TEMPLATE_PATH }));
    m.leaveEditMode(); m.enterEditMode();
    loaded.resolve();
    const outcome = await waiting;
    assert.equal(!outcome.ok && outcome.reason === "stale" && outcome.changed, "edit-mode");
    assert.equal(m.workspace.source(TEMPLATE_PATH), TEMPLATE);
    assert.deepEqual(m.steps(), []);
  }
  // … and inside it.
  {
    const { m, edits } = setup();
    const gate = deferred();
    const pending = edits.run(async r => { const plan = renameBody(r); await gate.promise; return plan; }, { anchor: TEMPLATE_PATH });
    await Promise.resolve();
    m.leaveEditMode(); m.enterEditMode();
    gate.resolve();
    const outcome = await pending;
    assert.equal(!outcome.ok && outcome.reason === "stale" && outcome.changed, "edit-mode");
    assert.deepEqual(m.steps(), []);
  }
});

// ---- Make component and a new component: the files are the page step's creates. ----


const HOME = '<!doctype html><html><head><link rel="stylesheet" href="/styles/site.css"></head><body><main><section class="promo"><h2>Hi</h2><p>Body</p></section></main></body></html>';
const SITE_CSS = ".promo { color: red; }";
function making(loader?: PreparedComponentLoader) {
  const m = createMemoryWorkspace({ branch: { "index.html": HOME, "styles/site.css": SITE_CSS }, open: "index.html", site: { routes: { "/": "index.html" }, components: {} } });
  const tags = startTags(HOME), range = elementEnd(HOME, tags, tags.findIndex(tag => tag.name === "section"), HOME.length)!;
  const bare = makeComponentPlan(HOME, range, "section-promo", {}, []) as MakeComponentPlan;
  const plan = (r: Reads) => makeComponentStep(r, { path: "index.html", source: HOME, range, node: [0, 0], tag: "section-promo", bare, carry, loader: loader && (async () => loader) });
  return { m, edits: createGuardedEdits(m.workspace), plan };
}

test("Make component writes the page and the component's files in one undo step", async () => {
  const { m, edits, plan } = making();
  const before = bytes(m);
  const outcome = await edits.run(plan, { anchor: "index.html" });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.match(m.workspace.source("index.html")!, /<main><section-promo>\s*<h2 slot="title">Hi<\/h2>\s*<p slot="text">Body<\/p>\s*<\/section-promo><\/main>/);
  assert.match(m.workspace.source("components/section-promo/section-promo.html")!, /<h2>/);
  assert.ok(m.workspace.exists("components/section-promo/section-promo.css"));
  assert.deepEqual(m.steps(), ["operation"]);
  assert.equal(m.announced.at(-1), "Made the component <section-promo>: components/section-promo/section-promo.html");
  assert.ok(m.undo());
  assert.equal(bytes(m), before);
  assert.ok(m.redo());
  assert.ok(m.workspace.exists("components/section-promo/section-promo.html"));
});

test("Make component refuses, writing nothing, when the page's stylesheet, a new file's path or the component map changed meanwhile", async () => {
  for (const meanwhile of [
    (m: MemoryWorkspace) => m.writeDraft("styles/site.css", ".promo { color: blue; }"),
    (m: MemoryWorkspace) => m.writeDraft("components/section-promo/section-promo.css", "/* theirs */"),
    // A component of the same name arrives elsewhere (the map is read too).
    (m: MemoryWorkspace) => { m.writeDraft("components/section-promo.html", "<p>theirs</p>"); m.setSite({ routes: { "/": "index.html" }, components: { "section-promo": "components/section-promo.html" } }); },
  ]) {
    const { m, edits, plan } = making();
    const hold = m.holdBranchRead();
    const pending = edits.run(plan, { anchor: "index.html" });
    await hold.reached;
    meanwhile(m);
    hold.release();
    const outcome = await pending;
    assert.equal(outcome.ok, false);
    assert.equal(m.workspace.source("index.html"), HOME);
    assert.equal(m.workspace.exists("components/section-promo/section-promo.html"), false);
    assert.deepEqual(m.steps(), []);
  }
});

test("the component loader a site lacks joins Make component's step", async () => {
  const withScript = HOME.replace("</head>", '<script type="module" src="/components/components.js"></script></head>');
  const loader: PreparedComponentLoader = {
    creates: [{ path: "components/components.js", content: "// loader" }], edits: new Map([["index.html", withScript]]), pages: ["index.html"],
    added: "Added the component loader.", notes: [], expectedSources: new Map([["index.html", HOME]]), current: () => true,
  };
  const { m, edits, plan } = making(loader);
  const outcome = await edits.run(plan, { anchor: "index.html" });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.equal(m.workspace.source("components/components.js"), "// loader");
  assert.match(m.workspace.source("index.html")!, /components\.js/);
  assert.deepEqual(m.steps(), ["operation"]);
  assert.equal(m.announced.at(-1), "Made the component <section-promo>: components/section-promo/section-promo.html. Added the component loader.");
  assert.ok(m.undo());
  assert.equal(m.workspace.exists("components/components.js"), false);
});

test("a new component is the page's insert and the blank component's files, one undo step; a taken name refuses", async () => {
  const m = createMemoryWorkspace({ branch: { "index.html": HOME }, open: "index.html", site: { routes: { "/": "index.html" }, components: { "section-taken": "components/section-taken/section-taken.html" } } });
  const edits = createGuardedEdits(m.workspace);
  const at = HOME.indexOf("</main>");
  const plan = (tag: string) => (r: Reads) => newComponentStep(r, { path: "index.html", source: HOME, node: [0, 1], tag,
    insert: () => ({ start: at, end: at, text: `<${tag}></${tag}>` }) });
  assert.deepEqual(await edits.run(plan("section-taken"), { anchor: "index.html" }), { ok: false, reason: "refused", message: "There is a component <section-taken> already." });
  assert.deepEqual(m.steps(), []);
  const outcome = await edits.run(plan("section-new"), { anchor: "index.html" });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.match(m.workspace.source("index.html")!, /<section-new><\/section-new><\/main>/);
  assert.ok(m.workspace.exists("components/section-new/section-new.html"));
  assert.deepEqual(m.steps(), ["operation"]);
  assert.ok(m.undo());
  assert.equal(m.workspace.source("index.html"), HOME);
  assert.equal(m.workspace.exists("components/section-new/section-new.html"), false);
});
