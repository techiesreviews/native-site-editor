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
  const { controller, log } = setup({ target: () => ({ path: "index.html", node: [0, 0, 0], painted: page.replace("Work", "Old") }) });
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
  await stale.controller.drop("paragraph", { parent: [0, 0], index: 0, where: "" }, page.replace("Work", "Play"));
  await stale.controller.drop("paragraph", { parent: [0, 0], index: 0, where: "" }, undefined);
  assert.equal(stale.log.ops.length, 0);
  assert.deepEqual(stale.log.refusals, ["The page is still updating. Try again in a moment.", "The page is still updating. Try again in a moment."]);
});
