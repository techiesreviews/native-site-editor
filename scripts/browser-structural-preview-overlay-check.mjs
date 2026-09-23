import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { overlay } from "../fixtures/astro-starter/.astro-editor/annotate.mjs";
import {
  parseStructuralElements,
  planStructuralTransaction,
} from "../src/browser-structural-preview.ts";

const sourcePath = "src/pages/index.astro";

async function send(page, data) {
  await page.evaluate((message) => {
    window.postMessage({ source: "astro-site-editor", ...message }, "*");
  }, data);
  await page.waitForTimeout(25);
}

async function probe(browser, before, after, expectedText) {
  const page = await browser.newPage();
  await page.setContent(before);
  await page.evaluate(({ items, overlaySource, sourcePath }) => {
    document.querySelectorAll("h1,p,a,button").forEach((element, index) => {
      const item = items[index];
      for (const [name, start, end] of [
        ["data-ase", item.bodyStart, item.bodyEnd],
        ["data-ase-heading-open", item.openStart, item.openEnd],
        ["data-ase-heading-close", item.closeStart, item.closeEnd],
      ]) element.setAttribute(name, `${sourcePath}:${start}:${end}`);
    });
    globalThis.results = [];
    window.addEventListener("message", (event) => {
      if (["structural-preview-result", "select"].includes(event.data.type))
        globalThis.results.push({ type: event.data.type, ok: event.data.ok });
    });
    eval(overlaySource.replace("if (window.parent !== window)", "if (true)"));
  }, { items: parseStructuralElements(sourcePath, before), overlaySource: overlay, sourcePath });

  await send(page, { type: "readonly" });
  await send(page, {
    type: "structural-preview",
    id: "1",
    transaction: planStructuralTransaction(sourcePath, before, after),
  });
  const beforeCommit = await page.evaluate(() => ({
    results: globalThis.results,
    text: document.querySelector("main").textContent,
    locked: document.documentElement.hasAttribute("data-ase-readonly"),
  }));
  assert.deepEqual(beforeCommit, {
    results: [{ type: "structural-preview-result", ok: true }],
    text: expectedText,
    locked: true,
  });

  await send(page, { type: "structural-preview-commit", id: "stale" });
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-ase-readonly")), true);

  await send(page, { type: "structural-preview-commit", id: "1" });
  await page.locator("main :is(h1,p,a,button)").first().click();
  await page.waitForTimeout(25);
  assert.deepEqual(await page.evaluate(() => ({
    locked: document.documentElement.hasAttribute("data-ase-readonly"),
    selections: globalThis.results.filter((result) => result.type === "select").length,
  })), { locked: false, selections: 1 });

  await send(page, { type: "readonly" });
  for (const id of ["1", ""]) {
    await send(page, { type: "structural-preview-commit", id });
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-ase-readonly")), true);
  }
  await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await probe(browser,
    '<main><a href="/">A</a> <a href="/">B</a> <a href="/">C</a></main>',
    '<main><a href="/">A</a><a href="/">C</a></main>',
    "AC",
  );
  await probe(browser,
    "<main><h1>A</h1><p>C</p></main>",
    "<main><h1>A</h1><p>B</p><p>C</p></main>",
    "ABC",
  );
  await probe(browser,
    "<main><h1>A</h1> <p>C</p></main>",
    "<main><h1>A</h1> <button>B</button> <p>C</p></main>",
    "A B C",
  );
  console.log("PASS: whitespace deletion, same-offset insertion, insertion spacing; successful/stale/invalidated/empty commit handshakes.");
} finally {
  await browser.close();
}
