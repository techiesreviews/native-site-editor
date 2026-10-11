import { test } from "node:test";
import assert from "node:assert/strict";
import { createBlockInsertController, type BlockInsertPorts } from "../src/controllers/block-insert-controller.ts";
import { createGuardedEdits, STALE_MESSAGE } from "../src/guarded-edit.ts";
import { createMemoryWorkspace } from "./fakes/memory-workspace.ts";
import { PLACEHOLDER_IMAGE_PATH, placeholderImageSvg } from "../src/page-builder/native-elements.ts";

const page = '<!doctype html><html><head><title>Home</title></head><body><main><section class="flow"><h2>Work</h2></section></main></body></html>';
function setup(overrides: Partial<Pick<BlockInsertPorts, "target">> = {}, files: Record<string, string> = { "index.html": page }) {
  const components = Object.fromEntries(Object.keys(files).filter(path => path.startsWith("components/")).map(path => [path.split("/").at(-1)!.replace(/\.html$/, ""), path]));
  const m = createMemoryWorkspace({ branch: files, open: "index.html", site: { routes: { "/": "index.html" }, components } });
  const edits = createGuardedEdits(m.workspace);
  const ports = {
    target: () => ({ path: "index.html", node: [0, 0, 0] }),
    edits,
    refuse: (reason: string) => { m.refusals.push(reason); },
    ...overrides,
  } satisfies BlockInsertPorts;
  return { controller: createBlockInsertController(ports), m, edits };
}
const selected = (m: ReturnType<typeof createMemoryWorkspace>) => {
  const request = m.selected.at(-1);
  return request && { path: request.path, node: request.node };
};

test("the first Image writes the placeholder in the same step; later ones reuse it, whatever it holds", async () => {
  const { controller, m } = setup();
  await controller.click("image");
  assert.equal(m.steps().length, 1);
  assert.equal(m.source(PLACEHOLDER_IMAGE_PATH), placeholderImageSvg);
  assert.match(m.source("index.html")!, /<h2>Work<\/h2>\s*<img src="\/images\/placeholder.svg" alt="" width="640" height="400">/);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1] });
  assert.equal(m.undo(), true);
  assert.equal(m.source("index.html"), page);
  assert.equal(m.source(PLACEHOLDER_IMAGE_PATH), undefined);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 0] });
  assert.equal(m.announced.at(-1), "Undid adding the Image.");
  assert.equal(m.redo(), true);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1] });
  m.writeDraft(PLACEHOLDER_IMAGE_PATH, "<svg>mine</svg>");
  await controller.click("image");
  assert.equal(m.steps().length, 2);
  assert.equal(m.files().length, 2);
  assert.equal(m.source(PLACEHOLDER_IMAGE_PATH), "<svg>mine</svg>");
  // Selected once the page renders the step's own bytes.
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1] });
  assert.equal(m.flashed.at(-1), "Into Section “Work” › after Heading");
  assert.deepEqual(m.refusals, []);
});

test("other blocks write the page only, with the Heading level from the place", async () => {
  const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0] }) });
  await controller.click("heading");
  assert.deepEqual(m.files(), ["index.html"]);
  assert.match(m.source("index.html")!, /<h2>Work<\/h2>\s*<h2>Heading<\/h2>/);
  assert.equal(m.announced.at(-1), "Heading added. Into Section “Work” › after Heading");
});

test("a refusal inserts nothing and flashes the reason", async () => {
  const component = '<!doctype html><html><head><title>Home</title></head><body><main><card-project></card-project></main></body></html>';
  const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0] }) }, { "index.html": component });
  await controller.click("paragraph");
  assert.equal(m.steps().length, 0);
  assert.match(m.refusals[0], /Card project is a component/);
  const none = setup({ target: () => undefined });
  await none.controller.click("paragraph");
  assert.deepEqual(none.m.refusals, ["Open a page to add blocks to it."]);
});

test("a selection painted from other bytes is refused; the click's own target is used", async () => {
  const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0], painted: page.replace("<title>Home", "<title>Old") }) });
  await controller.click("paragraph");
  assert.equal(m.steps().length, 0);
  assert.deepEqual(m.refusals, ["The page is still updating. Try again in a moment."]);
  await controller.click("paragraph", { path: "index.html", node: [0, 0], painted: page });
  assert.equal(m.steps().length, 1);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1] });
});

test("a drop inserts at its place, one step; a page changed since it was measured refuses", async () => {
  const { controller, m } = setup();
  await controller.drop("paragraph", { parent: [0, 0], index: 0, where: "Into Section › before Heading" }, page);
  assert.equal(m.steps().length, 1);
  assert.match(m.source("index.html")!, /<section class="flow">\s*<p>Text<\/p>\s*<h2>Work<\/h2>/);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 0] });
  assert.equal(m.announced.at(-1), "Paragraph added. Into Section › before Heading");
  const stale = setup();
  await stale.controller.drop("paragraph", { parent: [0, 0], index: 0, where: "" }, page.replace("<title>Home", "<title>Play"));
  await stale.controller.drop("paragraph", { parent: [0, 0], index: 0, where: "" }, undefined);
  assert.equal(stale.m.steps().length, 0);
  assert.deepEqual(stale.m.refusals, ["The page is still updating. Try again in a moment.", "The page is still updating. Try again in a moment."]);
});

test("click and drop accept text typed inside the selection, but refuse changes outside it", async () => {
  const before = page.replace("<h2>Work</h2>", "<p>Lead</p><p>Other</p>");
  const typed = before.replace("<p>Lead</p>", "<p>Lead typed</p>");
  for (const action of ["click", "drop"] as const) {
    for (const outside of [false, true]) {
      const source = outside ? typed.replace("<p>Other</p>", "<p>Changed</p>") : typed;
      const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0], painted: before }) }, { "index.html": source });
      if (action === "click") await controller.click("paragraph");
      else await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "After Paragraph" }, before);
      assert.equal(m.steps().length, outside ? 0 : 1);
      assert.deepEqual(m.refusals, outside ? ["The page is still updating. Try again in a moment."] : []);
      if (!outside) assert.match(m.source("index.html")!, /<p>Lead typed<\/p>\s*<p>Text<\/p>\s*<p>Other<\/p>/);
    }
  }
});

test("a drop measured inside the selection refuses once anything changed in it", async () => {
  const before = page.replace("<h2>Work</h2>", "<div><p>A</p><p>B</p></div>");
  const swapped = before.replace("<p>A</p><p>B</p>", "<p>B</p><p>A</p>");
  const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0], painted: before }) }, { "index.html": swapped });
  await controller.drop("paragraph", { parent: [0, 0, 0], index: 1, where: "Into Div › after Paragraph" }, before);
  assert.equal(m.steps().length, 0);
  assert.deepEqual(m.refusals, ["The page is still updating. Try again in a moment."]);
});

test("drops and clicks into an instance's items slot write its light DOM with the slot; other slots refuse", async () => {
  const work = '<!doctype html><html><head><title>Home</title></head><body><main><section-work><h2 slot="title">Work</h2></section-work></main></body></html>';
  const files = {
    "index.html": work,
    "components/section-work/section-work.html": '<section><slot name="title"><h2>Work</h2></slot><slot name="more"><card-quote></card-quote></slot></section>',
    "components/card-quote/card-quote.html": '<blockquote><slot name="title"><h3>Quote</h3></slot></blockquote>',
  };
  const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0] }) }, files);
  await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "Into Section work › “more” slot › empty", slot: "more" }, work);
  assert.match(m.source("index.html")!, /<h2 slot="title">Work<\/h2>\s*<p slot="more">Text<\/p>\s*<\/section-work>/);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1] });
  // The title slot is not an items slot: nothing is written.
  await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "", slot: "title" }, m.source("index.html")!);
  assert.equal(m.steps().length, 1);
  assert.match(m.refusals[0], /could not be read exactly/);
  // A click with the instance selected: its items slot, after its last child there.
  await controller.click("heading");
  assert.match(m.source("index.html")!, /<p slot="more">Text<\/p>\s*<h3 slot="more">Heading<\/h3>/);
  assert.equal(m.announced.at(-1), "Heading added. Into Section work › “more” slot › after Paragraph");
});

test("a template the click read (its items slot), edited before the insert writes, refuses: nothing written", async () => {
  const path = "components/card-project/card-project.html";
  const source = page.replace('<section class="flow"><h2>Work</h2></section>', '<card-project></card-project>');
  const template = '<article><slot name="title"><h2>Title</h2></slot><slot name="more"><card-quote></card-quote></slot></article>';
  const { controller, m, edits } = setup({ target: () => ({ path: "index.html", node: [0, 0] }) }, { "index.html": source, [path]: template, "components/card-quote/card-quote.html": '<blockquote><slot name="title"><h3>Quote</h3></slot></blockquote>' });
  const since = edits.stamp();
  const hold = m.holdBranchRead();
  // Image creates the placeholder, forcing commit's branch read after
  // clickTarget chose the component's items slot through its template.
  const pending = controller.click("image", undefined, since);
  await hold.reached;
  m.writeDraft(path, template.replace("Title", "Changed"));
  hold.release();
  await pending;
  assert.deepEqual(m.refusals, [STALE_MESSAGE]);
  assert.equal(m.source("index.html"), source);
  assert.equal(m.source(path), template.replace("Title", "Changed"));
  assert.equal(m.source(PLACEHOLDER_IMAGE_PATH), undefined);
  assert.deepEqual(m.steps(), []);
  assert.deepEqual(m.announced, []);
  assert.equal(selected(m), undefined);
});

test("a click with no painted bytes refuses when the page changes while it opens", async () => {
  const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0] }) });
  m.close();
  const hold = m.holdOpen();
  const pending = controller.click("paragraph");
  await hold.reached;
  m.writeDraft("index.html", page.replace("<h2>Work</h2>", "<div>Replacement</div>"));
  hold.release();
  await pending;
  assert.deepEqual(m.refusals, [STALE_MESSAGE]);
  assert.deepEqual(m.steps(), []);
  assert.equal(m.source("index.html"), page.replace("<h2>Work</h2>", "<div>Replacement</div>"));
});

for (const action of ["click", "drop"] as const) {
  test(`${action} refuses a caller stamp whose route changed`, async () => {
    const { controller, m, edits } = setup();
    const since = edits.stamp();
    m.setRoute("/other/");
    if (action === "click") await controller.click("paragraph", undefined, since);
    else await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "After Heading" }, page, undefined, { x: 10, y: 20 }, since);
    assert.deepEqual(m.refusals, [STALE_MESSAGE]);
    assert.equal(m.source("index.html"), page);
    assert.deepEqual(m.steps(), []);
    assert.deepEqual(m.selected, []);
  });
}

test("direct insert plans one step, while an unreadable place refuses", async () => {
  const { controller, m } = setup();
  assert.equal(await controller.insert({ path: "index.html", parent: [0, 0], index: 1, kind: "button", where: "After Heading", before: { path: "index.html", node: [0, 0, 0] } }), undefined);
  assert.match(m.source("index.html")!, /<a [^>]*>Button<\/a>/);
  assert.equal(m.steps().length, 1);
  assert.equal(m.flashed.at(-1), "After Heading");
  assert.equal(await controller.insert({ path: "index.html", parent: [99], index: 0, kind: "button" }), "Button was not added: the HTML around that spot could not be read exactly.");
});

test("a recorded image insert with a failed refresh shows its message and keeps the step and selection", async () => {
  const { controller, m } = setup();
  m.failRefresh();
  await controller.click("image");
  assert.equal(m.steps().length, 1);
  assert.match(m.source("index.html")!, /<img /);
  assert.equal(m.source(PLACEHOLDER_IMAGE_PATH), placeholderImageSvg);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1] });
  assert.deepEqual(m.refusals, ["The files changed, but the editor changed while opening them. Review the current drafts."]);
});
