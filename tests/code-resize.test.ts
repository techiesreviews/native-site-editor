import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { mountCodeResize } from "../src/components/code-resize.ts";

// Faster opening 02: the code pane starts closed until the person opens it,
// and only its own key remembers that choice (src/components/code-resize.ts).
type WithResize = typeof globalThis & { mountCodeResize: typeof mountCodeResize };
async function inBrowser(run: (page: import("@playwright/test").Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { mountCodeResize } from './src/components/code-resize'; globalThis.mountCodeResize = mountCodeResize;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    // A real origin, so the page has localStorage.
    await page.route("http://code-resize.test/", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main id=main style='height:600px'><div id=split><div class=code-pane></div></div></main>" }));
    await page.goto("http://code-resize.test/");
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await run(page);
  } finally { await browser.close(); }
}

// Mounts the pane with the given storage and reports its state and every onOpen call.
const mount = (page: import("@playwright/test").Page, stored: Record<string, string>) => page.evaluate((stored) => {
  localStorage.clear();
  for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value);
  const main = document.getElementById("main")!, split = document.getElementById("split")!;
  let opened = 0;
  const pane = (globalThis as WithResize).mountCodeResize(main, split, () => { opened++; });
  const state = { collapsed: pane.collapsed(), opened };
  // The height it would open at, as it saves it.
  if (state.collapsed) pane.toggle();
  split.querySelector(".code-resize")!.remove();
  return { ...state, height: JSON.parse(localStorage.getItem("astro-editor.code-height") ?? "{}").height as number | undefined };
}, stored);

test("no saved choice starts the pane closed, and an old open choice is not used", () => inBrowser(async (page) => {
  assert.deepEqual(await mount(page, {}), { collapsed: true, height: 0.4, opened: 0 });
  // The old key keeps its height, but its open state no longer opens the pane.
  assert.deepEqual(await mount(page, { "astro-editor.code-height": JSON.stringify({ height: 0.35, collapsed: false }) }), { collapsed: true, height: 0.35, opened: 0 });
  // The pane's own key remembers the person's choice; a pane left open does not count as opened.
  assert.deepEqual(await mount(page, { "astro-editor.code-pane": "open" }), { collapsed: false, height: undefined, opened: 0 });
  assert.deepEqual(await mount(page, { "astro-editor.code-pane": "closed" }), { collapsed: true, height: 0.4, opened: 0 });
}));

test("opening the pane tells its owner once per opening and remembers the choice in its own key", () => inBrowser(async (page) => {
  const seen = await page.evaluate(() => {
    localStorage.clear();
    const main = document.getElementById("main")!, split = document.getElementById("split")!;
    let opened = 0;
    const pane = (globalThis as WithResize).mountCodeResize(main, split, () => { opened++; });
    pane.toggle();
    const afterOpen = { opened, shown: localStorage.getItem("astro-editor.code-pane"), height: JSON.parse(localStorage.getItem("astro-editor.code-height")!) };
    pane.toggle();
    const afterClose = { opened, shown: localStorage.getItem("astro-editor.code-pane") };
    pane.toggle();
    split.querySelector(".code-resize")!.remove();
    return { afterOpen, afterClose, reopened: opened };
  });
  assert.deepEqual(seen, {
    afterOpen: { opened: 1, shown: "open", height: { height: 0.4 } },
    afterClose: { opened: 1, shown: "closed" },
    reopened: 2,
  });
}));
