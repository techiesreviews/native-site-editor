import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { wholeWrapper } from "../src/whole-wrapper.ts";

// TOOLS-185: the edit bar's "the whole element is bold" (src/whole-wrapper.ts), shared by Lex's bar and a guest's,
// reads the markup in a browser page.
async function inBrowser(run: (page: import("@playwright/test").Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { wholeWrapper } from './src/whole-wrapper'; globalThis.wholeWrapper = wholeWrapper;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await run(page);
  } finally { await browser.close(); }
}

test("whole wrapper: one bold element (whitespace around it, attributes, <b>, inline children) is found; anything more is not", () => inBrowser(async page => {
  const cases = [
    "<strong>Hello</strong>",
    "  <b class=\"x\">Hi there</b>\n",
    "<strong>A <em>b</em> c</strong>",
    "<strong>A</strong> <strong>B</strong>",
    "Hello <strong>you</strong>",
    "<em><strong>A</strong></em>",
    "plain words",
    "<STRONG>Hi</STRONG>",
  ];
  const found = await page.evaluate((all) => {
    const { wholeWrapper: whole } = globalThis as typeof globalThis & { wholeWrapper: typeof wholeWrapper };
    return all.map((inner) => {
      const range = whole(inner, ["strong", "b"]);
      return range && { open: inner.slice(range.open, range.openEnd), close: inner.slice(range.closeAt, range.closeEnd), inside: inner.slice(range.openEnd, range.closeAt) };
    });
  }, cases);
  assert.deepEqual(found, [
    { open: "<strong>", close: "</strong>", inside: "Hello" },
    { open: "<b class=\"x\">", close: "</b>", inside: "Hi there" },
    { open: "<strong>", close: "</strong>", inside: "A <em>b</em> c" },
    undefined,
    undefined,
    undefined,
    undefined,
    // Tag names are any case in HTML.
    { open: "<STRONG>", close: "</STRONG>", inside: "Hi" },
  ]);
}));
