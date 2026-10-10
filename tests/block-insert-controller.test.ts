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

const move = (from: number[], name: string, place: { parent: number[]; index: number; where: string; slot?: string }, bytes: string, pressed = bytes) =>
  ({ from, name, place, painted: bytes, pressed });

test("a dragged block moves across containers as one step, selected at its new place", async () => {
  const nested = '<!doctype html><html><head><title>Home</title></head><body><main><section><h2>Work</h2><div class="cards"><card-a></card-a><card-b></card-b></div></section></main></body></html>';
  const { controller, m } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0] }) }, { "index.html": nested });
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0, 1], index: 1, where: "Into Div (grid) › after Card a" }, nested));
  assert.equal(m.steps().length, 1);
  assert.match(m.source("index.html")!, /<div class="cards"><card-a><\/card-a>\s*<h2>Work<\/h2>\s*<card-b>/);
  // The Div moved up one when the Heading left: the Heading is its second child.
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 0, 1] });
  assert.equal(m.announced.at(-1), "Heading moved. Into Div (grid) › after Card a");
  assert.equal(m.flashed.at(-1), "Into Div (grid) › after Card a");
  // A card reorders sideways: the second before the first.
  const source = m.source("index.html")!;
  await controller.move(move([0, 0, 0, 2], "Card b", { parent: [0, 0, 0], index: 0, where: "Into Div (grid) › before Card a" }, source));
  assert.match(m.source("index.html")!, /<div class="cards"><card-b><\/card-b>\s*<card-a>/);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 0, 0] });
});

test("a move measured on older bytes, onto itself or into a component's other parts writes nothing", async () => {
  const nested = '<!doctype html><html><head><title>Home</title></head><body><main><section><h2>Work</h2><card-a><p>x</p></card-a></section></main></body></html>';
  const { controller, m } = setup({}, { "index.html": nested });
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0], index: 2, where: "" }, nested.replace("Work", "Play")));
  assert.deepEqual(m.refusals, ["The page is still updating. Try again in a moment."]);
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0], index: 1, where: "" }, nested));
  assert.equal(m.refusals.length, 1);
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0, 1], index: 0, where: "" }, nested));
  assert.equal(m.refusals[1], "Heading was not moved: Its parts belong to the component: open it to change them.");
  // Pressed on bytes that changed outside the block since: refused, not moved by its old path.
  const outside = nested.replace("<p>x</p>", "<p>y</p>");
  const changed = setup({}, { "index.html": outside });
  await changed.controller.move(move([0, 0, 0], "Heading", { parent: [0, 0], index: 2, where: "" }, outside, nested));
  assert.deepEqual(changed.m.refusals, ["The page is still updating. Try again in a moment."]);
  assert.equal(m.steps().length + changed.m.steps().length, 0);
  assert.deepEqual(m.announced, ["Heading stayed in place"]);
});

test("text typed into the block since the press still moves it (the bar's name commits typing)", async () => {
  const before = '<!doctype html><html><head><title>Home</title></head><body><main><section><p>Lead</p><h2>Work</h2></section></main></body></html>';
  const typed = before.replace("<p>Lead</p>", "<p>Lead, typed</p>");
  const { controller, m } = setup({}, { "index.html": typed });
  await controller.move(move([0, 0, 0], "Paragraph", { parent: [0, 0], index: 2, where: "Into Section › after Heading" }, typed, before));
  assert.deepEqual(m.refusals, []);
  assert.match(m.source("index.html")!, /<h2>Work<\/h2>\s*<p>Lead, typed<\/p>/);
});

test("a block moves into an instance's items slot with the slot's name; the templates join the step's proof", async () => {
  const work = '<!doctype html><html><head><title>Home</title></head><body><main><p>Note</p><section-work><h2 slot="title">Work</h2></section-work></main></body></html>';
  const files = {
    "index.html": work,
    "components/section-work/section-work.html": '<section><slot name="title"><h2>Work</h2></slot><slot name="more"><card-quote></card-quote></slot><slot></slot></section>',
    "components/card-quote/card-quote.html": '<blockquote><slot name="title"><h3>Quote</h3></slot></blockquote>',
  };
  const { controller, m } = setup({}, files);
  await controller.move(move([0, 0], "Paragraph", { parent: [0, 1], index: 1, where: "Into Section work › “more” slot › after Heading", slot: "more" }, work));
  assert.match(m.source("index.html")!, /<main><section-work><h2 slot="title">Work<\/h2>\s*<p slot="more">Note<\/p><\/section-work>/);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1] });
  // The unnamed slot: no attribute. The title slot is not an items slot: refused.
  const again = setup({}, { ...files, "index.html": work });
  await again.controller.move(move([0, 0], "Paragraph", { parent: [0, 1], index: 1, where: "", slot: "" }, work));
  assert.match(again.m.source("index.html")!, /<h2 slot="title">Work<\/h2>\s*<p>Note<\/p><\/section-work>/);
  const title = setup({}, { ...files, "index.html": work });
  await title.controller.move(move([0, 0], "Paragraph", { parent: [0, 1], index: 1, where: "", slot: "title" }, work));
  assert.deepEqual([title.m.steps().length, title.m.refusals], [0, ["Paragraph was not moved: Its parts belong to the component: open it to change them."]]);
});

test("any element moves where HTML allows: a link into another paragraph; a Div into a paragraph refuses with the reason (slice 82)", async () => {
  const text = '<!doctype html><html><head><title>Home</title></head><body><main><section><p>One <a href="/a">link</a>.</p><p>Two</p><div class="flow"></div></section><h2>Loose</h2></main></body></html>';
  const { controller, m } = setup({}, { "index.html": text });
  await controller.move(move([0, 0, 0, 0], "Link", { parent: [0, 0, 1], index: 0, where: "Into Paragraph › at the end" }, text));
  assert.deepEqual(m.refusals, []);
  assert.match(m.source("index.html")!, /<p>One \.<\/p><p>Two <a href="\/a">link<\/a><\/p>/);
  assert.deepEqual(selected(m), { path: "index.html", node: [0, 0, 1, 0] });
  const div = setup({}, { "index.html": text });
  await div.controller.move(move([0, 0, 2], "Div", { parent: [0, 0, 0], index: 0, where: "" }, text));
  assert.deepEqual([div.m.steps().length, div.m.refusals], [0, ["Div was not moved: A <div> can't go inside a <p>."]]);
});

test("in Edit component mode a template's part moves in the template; named slots and the outside refuse (slice 82)", async () => {
  const template = '<article>\n  <slot name="title"><h3>Title</h3></slot>\n  <p class="body">Body</p>\n  <slot></slot>\n</article>';
  const files = () => ({ "index.html": page, "components/card-x/card-x.html": template });
  const target = () => ({ path: "components/card-x/card-x.html", template: "card-x" });
  const { controller, m } = setup({ target }, files());
  // The title slot moves with its heading, after the body paragraph.
  await controller.move({ ...move([0, 0], "Heading", { parent: [0], index: 2, where: "Into Article › after Paragraph" }, template), inside: [0] });
  assert.deepEqual(m.refusals, []);
  // The heading pressed stays selected inside its moved slot.
  assert.deepEqual(selected(m), { path: "components/card-x/card-x.html", node: [0, 1, 0] });
  assert.match(m.source("components/card-x/card-x.html")!, /<p class="body">Body<\/p>\s*<slot name="title"><h3>Title<\/h3><\/slot>\s*<slot><\/slot>/);
  const into = setup({ target }, files());
  await into.controller.move(move([0, 1], "Paragraph", { parent: [0, 0], index: 0, where: "" }, template));
  assert.deepEqual([into.m.steps().length, into.m.refusals], [0, ["Paragraph was not moved: The “title” slot is filled on each page: drop beside it, or into the component's items."]]);
  const out = setup({ target }, files());
  await out.controller.move(move([0, 1], "Paragraph", { parent: [], index: 1, where: "" }, template));
  assert.deepEqual([out.m.steps().length, out.m.refusals], [0, ["Paragraph was not moved: Parts go inside the template's element, not beside it."]]);
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

for (const action of ["click", "drop", "move"] as const) {
  test(`${action} refuses a caller stamp whose route changed`, async () => {
    const { controller, m, edits } = setup();
    const since = edits.stamp();
    m.setRoute("/other/");
    if (action === "click") await controller.click("paragraph", undefined, since);
    else if (action === "drop") await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "After Heading" }, page, undefined, { x: 10, y: 20 }, since);
    else await controller.move(move([0, 0, 0], "Heading", { parent: [0], index: 1, where: "After Section" }, page), undefined, since);
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
