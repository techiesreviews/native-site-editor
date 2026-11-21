import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { build, type Plugin } from "esbuild";
import { chromium } from "@playwright/test";

// TOOLS-185: why a guest's link change was refused shows on the bar's Address button (src/components/edit-bar.ts),
// as other refusals show on their own warning button. On a phone (no title under a mouse) it wraps onto a second
// line and stays on the screen, as theirs does.

// Vite's `?raw` imports (the icons' SVGs) as text.
const raw: Plugin = {
  name: "raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, async (args) => {
      const found = await build.resolve(args.path.replace(/\?raw$/, ""), { kind: args.kind, resolveDir: args.resolveDir });
      return { path: found.path, namespace: "raw" };
    });
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({ contents: await readFile(args.path, "utf8"), loader: "text" }));
  },
};

test("edit bar: a link's refusal on its Address button wraps on a phone and stays on the screen", async () => {
  const bundle = await build({
    stdin: { contents: "import { createEditBar } from './src/components/edit-bar'; globalThis.createEditBar = createEditBar;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", outdir: "out", plugins: [raw], loader: { ".css": "css", ".svg": "dataurl" },
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(5000);
    // The editor's pane: the frame, and under it the docked bar's row (edit-bar.css).
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="margin:0"><div id="pane" style="display:flex; flex-direction:column; height:100vh"><div id="frame" style="flex:1"></div></div></body></html>`);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + js });
    const reason = "The link changed on Lex's page before your change arrived. Try again.";
    const fits = await page.evaluate((why) => {
      const { createEditBar } = globalThis as typeof globalThis & { createEditBar: typeof import("../src/components/edit-bar").createEditBar };
      const bar = createEditBar(document.getElementById("pane")!, document.getElementById("frame")!);
      bar.show({ kind: "Link", controls: [{
        kind: "address", label: "Address", icon: "link", value: "/about/", warning: why, placeholder: "", suggestions: [],
        onInput: () => {}, onClose: () => {},
      }] }, { left: 10, top: 10, width: 100, height: 20, right: 110, bottom: 30 });
      const address = bar.element.querySelector<HTMLElement>(".edit-bar__address")!;
      const words = [...address.querySelectorAll<HTMLElement>("*")].find((part) => part.textContent === why) ?? address;
      const box = address.getBoundingClientRect();
      return {
        side: bar.element.dataset.side,
        text: address.textContent,
        onScreen: box.left >= 0 && box.right <= window.innerWidth,
        whole: words.scrollWidth <= words.clientWidth && words.scrollHeight <= words.clientHeight,
      };
    }, reason);
    assert.deepEqual(fits, { side: "docked", text: reason, onScreen: true, whole: true });
  } finally { await browser.close(); }
});
