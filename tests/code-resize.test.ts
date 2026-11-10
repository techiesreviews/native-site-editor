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
    await page.route("http://code-resize.test/", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0}.code-resize{height:16px}</style>" +
      "<main id=main class=has-preview style='height:600px;margin-top:300px'><div id=split><div class=code-pane></div></div></main>" }));
    script.set(page, "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text);
    await fresh(page);
    await run(page);
  } finally { await browser.close(); }
}
// Each pane mounts on a fresh document, as the editor mounts it on a fresh workspace.
const script = new WeakMap<import("@playwright/test").Page, string>();
async function fresh(page: import("@playwright/test").Page) {
  await page.goto("http://code-resize.test/");
  await page.addScriptTag({ content: script.get(page)! });
}

// Mounts the pane with the given storage and reports its state and every onOpen call.
const mount = async (page: import("@playwright/test").Page, stored: Record<string, string>) => { await fresh(page); return page.evaluate((stored) => {
  localStorage.clear();
  for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value);
  const main = document.getElementById("main")!, split = document.getElementById("split")!;
  let opened = 0;
  const pane = (globalThis as WithResize).mountCodeResize(main, split, () => { opened++; });
  const state = { collapsed: pane.collapsed(), opened };
  // The height it would open at, as it saves it.
  if (state.collapsed) pane.toggle();
  return { ...state, height: JSON.parse(localStorage.getItem("astro-editor.code-height") ?? "{}").height as number | undefined };
}, stored); };

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
    return { afterOpen, afterClose, reopened: opened };
  });
  assert.deepEqual(seen, {
    afterOpen: { opened: 1, shown: "open", height: { height: 0.4 } },
    afterClose: { opened: 1, shown: "closed" },
    reopened: 2,
  });
}));

// Mounts a pane closed (or open), runs `act` on it in the page, and reports the openings and the saved choice.
async function drive(page: import("@playwright/test").Page, shown: "open" | "closed", act: (page: import("@playwright/test").Page) => Promise<void>) {
  await fresh(page);
  await page.evaluate((shown) => {
    localStorage.clear();
    localStorage.setItem("astro-editor.code-pane", shown);
    const main = document.getElementById("main")!, split = document.getElementById("split")!;
    const seen = { opened: 0 };
    Object.assign(globalThis, { seen });
    (globalThis as WithResize).mountCodeResize(main, split, () => { seen.opened++; });
  }, shown);
  await act(page);
  return page.evaluate(() => ({ opened: (globalThis as typeof globalThis & { seen: { opened: number } }).seen.opened, shown: localStorage.getItem("astro-editor.code-pane") }));
}

test("ArrowUp and a drag upward open a closed pane once; Home on an open pane opens nothing", () => inBrowser(async (page) => {
  assert.deepEqual(await drive(page, "closed", async (page) => {
    await page.locator(".code-resize").focus();
    await page.keyboard.press("ArrowUp");
  }), { opened: 1, shown: "open" });
  assert.deepEqual(await drive(page, "closed", async (page) => {
    const box = (await page.locator(".code-resize").boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y - 200, { steps: 8 });
    await page.mouse.up();
  }), { opened: 1, shown: "open" });
  assert.deepEqual(await drive(page, "open", async (page) => {
    await page.locator(".code-resize").focus();
    await page.keyboard.press("Home");
  }), { opened: 0, shown: "closed" });
}));

test("without a preview (plain files) a closed pane still shows its code, and hides once a preview comes", () => inBrowser(async (page) => {
  const seen = await page.evaluate(async () => {
    localStorage.clear();
    const main = document.getElementById("main")!, split = document.getElementById("split")!, code = split.querySelector<HTMLElement>(".code-pane")!;
    main.classList.remove("has-preview");
    let opened = 0;
    const pane = (globalThis as WithResize).mountCodeResize(main, split, () => { opened++; });
    const plain = { collapsed: pane.collapsed(), inert: code.inert, hiddenClass: main.classList.contains("code-collapsed") };
    main.classList.add("has-preview");
    await new Promise((done) => setTimeout(done, 0));
    const beside = { inert: code.inert, hiddenClass: main.classList.contains("code-collapsed") };
    return { plain, beside, opened };
  });
  assert.deepEqual(seen, {
    plain: { collapsed: true, inert: false, hiddenClass: false },
    beside: { inert: true, hiddenClass: true },
    opened: 0,
  });
}));
