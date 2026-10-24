import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createStructureEditing, StructureEditingHost } from "../src/components/structure-editing.ts";
import type { NativeStructure } from "../src/components/native-preview.ts";
import type { workingPart } from "../src/working-part.ts";

declare global {
  var structureEditingFactory: typeof createStructureEditing;
  var workingPartNow: typeof workingPart;
}

test("typing holds unrelated and structural paints until blur; focus requests select their own row", async () => {
  const bundle = await build({
    stdin: { contents: "import { createStructureEditing } from './src/components/structure-editing'; globalThis.structureEditingFactory = createStructureEditing;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    const result = await page.evaluate(() => {
      const tree = document.createElement("div"); document.body.append(tree);
      let source = "before";
      const editing = structureEditingFactory({
        tree, componentSlots: () => undefined, announce: () => {}, pageSource: () => source,
        path: () => "index.html", rowElement: id => tree.querySelector<HTMLElement>(`[data-edit-node="${id}"]`) ?? undefined,
        rendering: () => false, iconAction: () => document.createElement("button"), isolate: () => {}, ended: () => {}, fieldPrefix: () => "same:",
      } satisfies StructureEditingHost);
      const add = (owner: string, path = "index.html") => {
        const row = document.createElement("div"), label = document.createElement("span");
        row.append(label); tree.append(row);
        editing.editTextRow(row, label, { path, name: "title", label: "Title", field: "Text", text: "Title", breaks: false, prefix: "same:",
          open: () => ({ write: (_part, value) => { source = value; return true; }, close: () => {}, cancel: () => true, stale: () => false, patchable: true, patch: () => true }) }, owner);
        return row.querySelector("textarea")!;
      };
      const first = add("first");
      const field = add("second"); field.focus();
      const previous: NativeStructure = { path: "index.html", paintedSource: "before", items: [] };
      const changed: NativeStructure = { ...previous, paintedSource: "unrelated", items: [{ tag: "h2", node: [0], text: "Other change", heading: "", slot: "", children: [] }] };
      const untyped = editing.holdsPaint(changed, previous);
      field.value = "typed"; field.dispatchEvent(new Event("input"));
      const beforeWrite = editing.holdsPaint(changed, previous);
      const pendingSource = source;
      field.blur(); field.focus();
      const own = editing.holdsPaint({ ...previous, paintedSource: source }, previous);
      const other = editing.holdsPaint(changed, previous);
      const held = editing.held();
      editing.release();
      const released = editing.held();
      field.blur();
      const blurred = editing.holdsPaint(changed, previous);
      const focused = editing.focus({ prefix: "same:", row: "second", caret: 2 });
      const correct = document.activeElement === field;
      const caret = [field.selectionStart, field.selectionEnd];
      // With no row named, the first field with that prefix not hidden takes focus.
      const rowless = editing.focus({ prefix: "same:", row: undefined });
      const firstTaken = document.activeElement === first;
      first.parentElement!.hidden = true;
      editing.focus({ prefix: "same:", row: undefined });
      const visibleTaken = document.activeElement === field;
      first.parentElement!.hidden = false;
      const template = add("template", "components/test-card.html"); template.focus();
      template.value = "Template"; template.dispatchEvent(new Event("input"));
      const templateHeld = editing.holdsPaint(changed, previous);
      const navigation = editing.holdsPaint({ ...changed, path: "about/index.html" }, previous);
      editing.destroy(); tree.remove();
      return { untyped, beforeWrite, pendingSource, own, other, held, released, blurred, focused, correct, caret, rowless, firstTaken, visibleTaken, templateHeld, navigation };
    });
    assert.deepEqual(result, { untyped: false, beforeWrite: true, pendingSource: "before", own: true, other: true, held: true, released: false, blurred: false, focused: true, correct: true, caret: [2, 2], rowless: true, firstTaken: true, visibleTaken: true, templateHeld: true, navigation: false });
  } finally { await browser.close(); }
});

test("typing in a row's field makes its element where the user works; ending the edit leaves it (ticket 52)", async () => {
  const bundle = await build({
    stdin: { contents: "import { createStructureEditing } from './src/components/structure-editing'; import { workingPart } from './src/working-part'; globalThis.structureEditingFactory = createStructureEditing; globalThis.workingPartNow = workingPart;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const working = workingPartNow;
      const tree = document.createElement("div"); document.body.append(tree);
      const editing = structureEditingFactory({
        tree, componentSlots: () => undefined, announce: () => {}, pageSource: () => "", path: () => "index.html", rowElement: () => undefined,
        rendering: () => false, iconAction: () => document.createElement("button"), isolate: () => {}, ended: () => {}, fieldPrefix: () => "row:",
      } satisfies StructureEditingHost);
      const row = document.createElement("div"), label = document.createElement("span");
      row.append(label); tree.append(row);
      editing.editTextRow(row, label, { path: "index.html", node: [1, 0, 0], name: "", label: "Heading", field: "Text", text: "Title", breaks: false, prefix: "row:",
        open: () => ({ write: () => true, close: () => {}, cancel: () => true, stale: () => false, patchable: false, patch: () => false }) }, "owner");
      const field = row.querySelector("textarea")!;
      field.focus();
      const before = working.now();
      field.value = "Titles"; field.dispatchEvent(new Event("input"));
      const typed = working.now();
      editing.finish("commit", false);
      await new Promise(resolve => setTimeout(resolve));
      const finished = working.now();
      editing.destroy(); tree.remove();
      return { before: before ?? null, typed, finished: finished ?? null };
    });
    assert.deepEqual(result, { before: null, typed: { path: "index.html", node: [1, 0, 0] }, finished: null });
  } finally { await browser.close(); }
});
