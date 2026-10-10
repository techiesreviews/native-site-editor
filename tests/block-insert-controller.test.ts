import { test } from "node:test";
import assert from "node:assert/strict";
import { createBlockInsertController, type BlockInsertPorts } from "../src/controllers/block-insert-controller.ts";
import { PLACEHOLDER_IMAGE_PATH, placeholderImageSvg } from "../src/page-builder/native-elements.ts";

const page = '<!doctype html><html><head><title>Home</title></head><body><main><section class="flow"><h2>Work</h2></section></main></body></html>';
type Op = Parameters<BlockInsertPorts["apply"]>[0];

function setup(overrides: Partial<BlockInsertPorts> = {}, files: Record<string, string> = { "index.html": page }) {
  const log = { ops: [] as Op[], selects: [] as unknown[], refusals: [] as string[] };
  const ports = {
    target: () => ({ path: "index.html", node: [0, 0, 0] }),
    source: (path: string) => files[path],
    exists: (path: string) => Object.hasOwn(files, path),
    template: (tag: string) => { const path = `components/${tag}/${tag}.html`; return Object.hasOwn(files, path) ? { path, source: files[path] } : undefined; },
    proof: () => () => true,
    open: async () => () => true,
    apply: async (op: Op) => {
      log.ops.push(op);
      for (const file of op.creates ?? []) files[file.path] = file.content;
      for (const [path, text] of op.edits) files[path] = text;
      return undefined;
    },
    select: (request, where) => { log.selects.push(request && { path: request.path, node: request.node, where, rendered: request.source === files[request.path] }); },
    refuse: reason => { log.refusals.push(reason); },
    ...overrides,
  } satisfies BlockInsertPorts;
  return { controller: createBlockInsertController(ports), log, files };
}

test("the first Image writes the placeholder in the same step; later ones reuse it, whatever it holds", async () => {
  const { controller, log, files } = setup();
  await controller.click("image");
  assert.equal(log.ops.length, 1);
  assert.deepEqual(log.ops[0].creates, [{ path: PLACEHOLDER_IMAGE_PATH, content: placeholderImageSvg }]);
  assert.match(log.ops[0].edits.get("index.html")!, /<h2>Work<\/h2>\s*<img src="\/images\/placeholder.svg" alt="" width="640" height="400">/);
  assert.deepEqual(log.ops[0].selection, { before: { path: "index.html", node: [0, 0, 0] }, after: { path: "index.html", node: [0, 0, 1] } });
  files[PLACEHOLDER_IMAGE_PATH] = "<svg>mine</svg>";
  await controller.click("image");
  assert.equal(log.ops.length, 2);
  assert.equal(log.ops[1].creates, undefined);
  assert.equal(files[PLACEHOLDER_IMAGE_PATH], "<svg>mine</svg>");
  // Selected once the page renders the step's own bytes.
  assert.deepEqual(log.selects.at(-1), { path: "index.html", node: [0, 0, 1], where: "Into Section “Work” › after Heading", rendered: false });
  assert.deepEqual(log.refusals, []);
});

test("other blocks write the page only, with the Heading level from the place", async () => {
  const { controller, log } = setup({ target: () => ({ path: "index.html", node: [0, 0] }) });
  await controller.click("heading");
  assert.equal(log.ops[0].creates, undefined);
  assert.match(log.ops[0].edits.get("index.html")!, /<h2>Work<\/h2>\s*<h2>Heading<\/h2>/);
  assert.equal(log.ops[0].done, "Heading added. Into Section “Work” › after Heading");
});

test("a refusal inserts nothing and flashes the reason", async () => {
  const component = '<!doctype html><html><head><title>Home</title></head><body><main><card-project></card-project></main></body></html>';
  const { controller, log } = setup({ target: () => ({ path: "index.html", node: [0, 0] }) }, { "index.html": component });
  await controller.click("paragraph");
  assert.equal(log.ops.length, 0);
  assert.match(log.refusals[0], /Card project is a component/);
  const none = setup({ target: () => undefined });
  await none.controller.click("paragraph");
  assert.deepEqual(none.log.refusals, ["Open a page to add blocks to it."]);
});

test("a page changed while it opened, or a stale proof, writes nothing", async () => {
  const files = { "index.html": page };
  const changed = setup({ open: async () => { files["index.html"] = page.replace("Work", "Play"); return () => true; } }, files);
  await changed.controller.click("paragraph");
  assert.equal(changed.log.ops.length, 0);
  assert.deepEqual(changed.log.refusals, ["The page changed meanwhile. Try again."]);
  const stale = setup({ proof: () => () => false });
  await stale.controller.click("paragraph");
  assert.equal(stale.log.ops.length, 0);
  assert.equal((await setup({ open: async () => undefined }).controller.insert({ path: "index.html", parent: [0, 0], index: 1, kind: "paragraph" })), "The page changed meanwhile. Try again.");
  // Another file opened during the operation's reads: the operation's own proof fails.
  let open = true;
  const moved = setup({ open: async () => () => open, apply: async op => { open = false; return op.current() ? undefined : "stale"; } });
  assert.equal(await moved.controller.insert({ path: "index.html", parent: [0, 0], index: 1, kind: "paragraph" }), "stale");
});

test("a failed operation cancels the selection it asked for and flashes the error", async () => {
  const { controller, log } = setup({ apply: async () => "The repository or source changed meanwhile." });
  await controller.click("button");
  assert.deepEqual(log.selects.at(-1), undefined);
  assert.deepEqual(log.refusals, ["The repository or source changed meanwhile."]);
});

test("a selection painted from other bytes is refused; the click's own target is used", async () => {
  const { controller, log } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0], painted: page.replace("<title>Home", "<title>Old") }) });
  await controller.click("paragraph");
  assert.equal(log.ops.length, 0);
  assert.deepEqual(log.refusals, ["The page is still updating. Try again in a moment."]);
  await controller.click("paragraph", { path: "index.html", node: [0, 0], painted: page });
  assert.equal(log.ops.length, 1);
  assert.deepEqual(log.ops[0].selection.after, { path: "index.html", node: [0, 0, 1] });
});

test("a drop inserts at its place, one step; a page changed since it was measured refuses", async () => {
  const { controller, log } = setup();
  await controller.drop("paragraph", { parent: [0, 0], index: 0, where: "Into Section › before Heading" }, page);
  assert.equal(log.ops.length, 1);
  assert.match(log.ops[0].edits.get("index.html")!, /<section class="flow">\s*<p>Text<\/p>\s*<h2>Work<\/h2>/);
  assert.deepEqual(log.ops[0].selection, { before: { path: "index.html", node: [0, 0, 0] }, after: { path: "index.html", node: [0, 0, 0] } });
  assert.equal(log.ops[0].done, "Paragraph added. Into Section › before Heading");
  const stale = setup();
  await stale.controller.drop("paragraph", { parent: [0, 0], index: 0, where: "" }, page.replace("<title>Home", "<title>Play"));
  await stale.controller.drop("paragraph", { parent: [0, 0], index: 0, where: "" }, undefined);
  assert.equal(stale.log.ops.length, 0);
  assert.deepEqual(stale.log.refusals, ["The page is still updating. Try again in a moment.", "The page is still updating. Try again in a moment."]);
});

test("click and drop accept text typed inside the selection, but refuse changes outside it", async () => {
  const before = page.replace("<h2>Work</h2>", "<p>Lead</p><p>Other</p>");
  const typed = before.replace("<p>Lead</p>", "<p>Lead typed</p>");
  for (const action of ["click", "drop"] as const) {
    for (const outside of [false, true]) {
      const source = outside ? typed.replace("<p>Other</p>", "<p>Changed</p>") : typed;
      const { controller, log, files } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0], painted: before }) }, { "index.html": source });
      if (action === "click") await controller.click("paragraph");
      else await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "After Paragraph" }, before);
      assert.equal(log.ops.length, outside ? 0 : 1);
      assert.deepEqual(log.refusals, outside ? ["The page is still updating. Try again in a moment."] : []);
      if (!outside) assert.match(files["index.html"], /<p>Lead typed<\/p>\s*<p>Text<\/p>\s*<p>Other<\/p>/);
    }
  }
});

test("a drop measured inside the selection refuses once anything changed in it", async () => {
  const before = page.replace("<h2>Work</h2>", "<div><p>A</p><p>B</p></div>");
  const swapped = before.replace("<p>A</p><p>B</p>", "<p>B</p><p>A</p>");
  const { controller, log } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0], painted: before }) }, { "index.html": swapped });
  await controller.drop("paragraph", { parent: [0, 0, 0], index: 1, where: "Into Div › after Paragraph" }, before);
  assert.equal(log.ops.length, 0);
  assert.deepEqual(log.refusals, ["The page is still updating. Try again in a moment."]);
});

test("drops and clicks into an instance's items slot write its light DOM with the slot; other slots refuse", async () => {
  const work = '<!doctype html><html><head><title>Home</title></head><body><main><section-work><h2 slot="title">Work</h2></section-work></main></body></html>';
  const files = {
    "index.html": work,
    "components/section-work/section-work.html": '<section><slot name="title"><h2>Work</h2></slot><slot name="more"><card-quote></card-quote></slot></section>',
    "components/card-quote/card-quote.html": '<blockquote><slot name="title"><h3>Quote</h3></slot></blockquote>',
  };
  const { controller, log } = setup({ target: () => ({ path: "index.html", node: [0, 0] }) }, files);
  await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "Into Section work › “more” slot › empty", slot: "more" }, work);
  assert.match(log.ops[0].edits.get("index.html")!, /<h2 slot="title">Work<\/h2>\s*<p slot="more">Text<\/p>\s*<\/section-work>/);
  assert.deepEqual(log.ops[0].selection.after, { path: "index.html", node: [0, 0, 1] });
  // The templates that opened the seal are part of the step's proof.
  assert.deepEqual([...log.ops[0].expectedSources.keys()].sort(), ["components/card-quote/card-quote.html", "components/section-work/section-work.html", "index.html"]);
  // The title slot is not an items slot: nothing is written.
  await controller.drop("paragraph", { parent: [0, 0], index: 1, where: "", slot: "title" }, files["index.html"]);
  assert.equal(log.ops.length, 1);
  assert.match(log.refusals[0], /could not be read exactly/);
  // A click with the instance selected: its items slot, after its last child there.
  await controller.click("heading");
  assert.match(log.ops[1].edits.get("index.html")!, /<p slot="more">Text<\/p>\s*<h3 slot="more">Heading<\/h3>/);
  assert.equal(log.ops[1].done, "Heading added. Into Section work › “more” slot › after Paragraph");
});

const move = (from: number[], name: string, place: { parent: number[]; index: number; where: string; slot?: string }, bytes: string, pressed = bytes) =>
  ({ from, name, place, painted: bytes, pressed });

test("a dragged block moves across containers as one step, selected at its new place", async () => {
  const nested = '<!doctype html><html><head><title>Home</title></head><body><main><section><h2>Work</h2><div class="cards"><card-a></card-a><card-b></card-b></div></section></main></body></html>';
  const { controller, log, files } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0] }) }, { "index.html": nested });
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0, 1], index: 1, where: "Into Div (grid) › after Card a" }, nested));
  assert.equal(log.ops.length, 1);
  assert.match(files["index.html"], /<div class="cards"><card-a><\/card-a>\s*<h2>Work<\/h2>\s*<card-b>/);
  // The Div moved up one when the Heading left: the Heading is its second child.
  assert.deepEqual(log.ops[0].selection, { before: { path: "index.html", node: [0, 0, 0] }, after: { path: "index.html", node: [0, 0, 0, 1] } });
  assert.equal(log.ops[0].done, "Heading moved. Into Div (grid) › after Card a");
  assert.equal(log.ops[0].undone, "Undid moving the Heading.");
  assert.deepEqual(log.selects.at(-1), { path: "index.html", node: [0, 0, 0, 1], where: "Into Div (grid) › after Card a", rendered: false });
  // A card reorders sideways: the second before the first.
  const source = files["index.html"];
  await controller.move(move([0, 0, 0, 2], "Card b", { parent: [0, 0, 0], index: 0, where: "Into Div (grid) › before Card a" }, source));
  assert.match(files["index.html"], /<div class="cards"><card-b><\/card-b>\s*<card-a>/);
  assert.deepEqual(log.ops[1].selection.after, { path: "index.html", node: [0, 0, 0, 0] });
});

test("a move measured on older bytes, onto itself or into a component's other parts writes nothing", async () => {
  const nested = '<!doctype html><html><head><title>Home</title></head><body><main><section><h2>Work</h2><card-a><p>x</p></card-a></section></main></body></html>';
  const { controller, log } = setup({}, { "index.html": nested });
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0], index: 2, where: "" }, nested.replace("Work", "Play")));
  assert.deepEqual(log.refusals, ["The page is still updating. Try again in a moment."]);
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0], index: 1, where: "" }, nested));
  assert.equal(log.refusals.length, 1);
  await controller.move(move([0, 0, 0], "Heading", { parent: [0, 0, 1], index: 0, where: "" }, nested));
  assert.equal(log.refusals[1], "Heading was not moved: Its parts belong to the component: open it to change them.");
  // Pressed on bytes that changed outside the block since: refused, not moved by its old path.
  const outside = nested.replace("<p>x</p>", "<p>y</p>");
  const changed = setup({}, { "index.html": outside });
  await changed.controller.move(move([0, 0, 0], "Heading", { parent: [0, 0], index: 2, where: "" }, outside, nested));
  assert.deepEqual(changed.log.refusals, ["The page is still updating. Try again in a moment."]);
  // The drag's own proof (its page on show) failing after the page opened: nothing is written.
  const gone = setup({}, { "index.html": nested });
  await gone.controller.move({ ...move([0, 0, 0], "Heading", { parent: [0, 0], index: 2, where: "" }, nested), current: () => false });
  assert.deepEqual(gone.log.refusals, ["The page changed meanwhile. Try again."]);
  assert.equal(log.ops.length + changed.log.ops.length + gone.log.ops.length, 0);
});

test("text typed into the block since the press still moves it (the bar's name commits typing)", async () => {
  const before = '<!doctype html><html><head><title>Home</title></head><body><main><section><p>Lead</p><h2>Work</h2></section></main></body></html>';
  const typed = before.replace("<p>Lead</p>", "<p>Lead, typed</p>");
  const { controller, log, files } = setup({}, { "index.html": typed });
  await controller.move(move([0, 0, 0], "Paragraph", { parent: [0, 0], index: 2, where: "Into Section › after Heading" }, typed, before));
  assert.deepEqual(log.refusals, []);
  assert.match(files["index.html"], /<h2>Work<\/h2>\s*<p>Lead, typed<\/p>/);
});

test("a block moves into an instance's items slot with the slot's name; the templates join the step's proof", async () => {
  const work = '<!doctype html><html><head><title>Home</title></head><body><main><p>Note</p><section-work><h2 slot="title">Work</h2></section-work></main></body></html>';
  const files = {
    "index.html": work,
    "components/section-work/section-work.html": '<section><slot name="title"><h2>Work</h2></slot><slot name="more"><card-quote></card-quote></slot><slot></slot></section>',
    "components/card-quote/card-quote.html": '<blockquote><slot name="title"><h3>Quote</h3></slot></blockquote>',
  };
  const { controller, log } = setup({}, files);
  await controller.move(move([0, 0], "Paragraph", { parent: [0, 1], index: 1, where: "Into Section work › “more” slot › after Heading", slot: "more" }, work));
  assert.match(log.ops[0].edits.get("index.html")!, /<main><section-work><h2 slot="title">Work<\/h2>\s*<p slot="more">Note<\/p><\/section-work>/);
  assert.deepEqual(log.ops[0].selection.after, { path: "index.html", node: [0, 0, 1] });
  assert.deepEqual([...log.ops[0].expectedSources.keys()].sort(), ["components/card-quote/card-quote.html", "components/section-work/section-work.html", "index.html"]);
  // The unnamed slot: no attribute. The title slot is not an items slot: refused.
  const again = setup({}, { ...files, "index.html": work });
  await again.controller.move(move([0, 0], "Paragraph", { parent: [0, 1], index: 1, where: "", slot: "" }, work));
  assert.match(again.log.ops[0].edits.get("index.html")!, /<h2 slot="title">Work<\/h2>\s*<p>Note<\/p><\/section-work>/);
  const title = setup({}, { ...files, "index.html": work });
  await title.controller.move(move([0, 0], "Paragraph", { parent: [0, 1], index: 1, where: "", slot: "title" }, work));
  assert.deepEqual([title.log.ops.length, title.log.refusals], [0, ["Paragraph was not moved: Its parts belong to the component: open it to change them."]]);
});

test("any element moves where HTML allows: a link into another paragraph; a Div into a paragraph refuses with the reason (slice 82)", async () => {
  const text = '<!doctype html><html><head><title>Home</title></head><body><main><section><p>One <a href="/a">link</a>.</p><p>Two</p><div class="flow"></div></section><h2>Loose</h2></main></body></html>';
  const { controller, log, files } = setup({}, { "index.html": text });
  await controller.move(move([0, 0, 0, 0], "Link", { parent: [0, 0, 1], index: 0, where: "Into Paragraph › at the end" }, text));
  assert.deepEqual(log.refusals, []);
  assert.match(files["index.html"], /<p>One \.<\/p><p>Two <a href="\/a">link<\/a><\/p>/);
  assert.deepEqual(log.ops[0].selection.after, { path: "index.html", node: [0, 0, 1, 0] });
  const div = setup({}, { "index.html": text });
  await div.controller.move(move([0, 0, 2], "Div", { parent: [0, 0, 0], index: 0, where: "" }, text));
  assert.deepEqual([div.log.ops.length, div.log.refusals], [0, ["Div was not moved: A <div> can't go inside a <p>."]]);
});

test("in Edit component mode a template's part moves in the template; named slots and the outside refuse (slice 82)", async () => {
  const template = '<article>\n  <slot name="title"><h3>Title</h3></slot>\n  <p class="body">Body</p>\n  <slot></slot>\n</article>';
  const files = () => ({ "index.html": page, "components/card-x/card-x.html": template });
  const target = () => ({ path: "components/card-x/card-x.html", template: "card-x" });
  const { controller, log } = setup({ target }, files());
  // The title slot moves with its heading, after the body paragraph.
  await controller.move({ ...move([0, 0], "Heading", { parent: [0], index: 2, where: "Into Article › after Paragraph" }, template), inside: [0] });
  assert.deepEqual(log.refusals, []);
  // Selected, and selected again by Undo, is the heading pressed, inside its slot.
  assert.deepEqual(log.ops[0].selection, { before: { path: "components/card-x/card-x.html", node: [0, 0, 0] }, after: { path: "components/card-x/card-x.html", node: [0, 1, 0] } });
  assert.match(log.ops[0].edits.get("components/card-x/card-x.html")!, /<p class="body">Body<\/p>\s*<slot name="title"><h3>Title<\/h3><\/slot>\s*<slot><\/slot>/);
  const into = setup({ target }, files());
  await into.controller.move(move([0, 1], "Paragraph", { parent: [0, 0], index: 0, where: "" }, template));
  assert.deepEqual([into.log.ops.length, into.log.refusals], [0, ["Paragraph was not moved: The “title” slot is filled on each page: drop beside it, or into the component's items."]]);
  const out = setup({ target }, files());
  await out.controller.move(move([0, 1], "Paragraph", { parent: [], index: 1, where: "" }, template));
  assert.deepEqual([out.log.ops.length, out.log.refusals], [0, ["Paragraph was not moved: Parts go inside the template's element, not beside it."]]);
});
