// Element icons and component marks are parsed once and handed out as copies (ticket 38):
// each call is its own node, and changing one leaves the next call as it was.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { elementIcon } from "../src/components/element-icons.ts";
import type { mark } from "../src/page-builder/component-icon.ts";

declare global {
  var cloneElementIcon: typeof elementIcon;
  var cloneMark: typeof mark;
}

test("each icon and mark call is a fresh copy of one parse", async () => {
  const bundle = await build({
    stdin: { contents: `
      import { elementIcon } from './src/components/element-icons';
      import { mark } from './src/page-builder/component-icon';
      globalThis.cloneElementIcon = elementIcon;
      globalThis.cloneMark = mark;
    `, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    const result = await page.evaluate(() => {
      const check = (make: () => SVGSVGElement) => {
        const first = make(), second = make();
        const html = first.outerHTML;
        first.classList.add("changed");
        first.setAttribute("width", "99");
        first.firstElementChild?.remove();
        const third = make();
        return { distinct: first !== second && second !== third && first !== third, unchanged: third.outerHTML === html && second.outerHTML === html,
          svg: third.localName, hidden: third.getAttribute("aria-hidden") };
      };
      return {
        heading: check(() => cloneElementIcon("h2")), heading20: cloneElementIcon("h2", 20).getAttribute("width"),
        component: check(() => cloneMark("component")), component12: cloneMark("component", 12, "component-mark").getAttribute("class"),
      };
    });
    const fresh = { distinct: true, unchanged: true, svg: "svg", hidden: "true" };
    assert.deepEqual(result, { heading: fresh, heading20: "20", component: fresh, component12: "icon component-mark" });
  } finally {
    await browser.close();
  }
});
