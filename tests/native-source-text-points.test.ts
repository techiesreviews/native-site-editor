import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

// Carets on the page (ticket am-23): a text offset in an element, as the preview reports a caret typed there, maps to
// an offset in the file, and back. The lookups parse with the browser's parser, so they run in Chromium.
test("a caret's text offset maps to the file and back, never into a tag, a comment or an entity", async () => {
  const bundle = await build({
    stdin: { contents: `import * as locator from './src/native-source-location'; globalThis.locator = locator;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(() => {
      const { sourceOffsetOfText, textPointAt, elementText } = (globalThis as typeof globalThis & { locator: typeof import("../src/native-source-location") }).locator;
      const html = `<!doctype html><html><head><title>T</title></head><body><main><h1>Hi &amp; bye</h1><p>One <strong>two</strong> three<!-- c --></p><p></p></main></body></html>`;
      const h1 = html.indexOf("Hi"), strong = html.indexOf("two"), three = html.indexOf(" three"), empty = html.indexOf("<p></p>") + 3;
      return {
        h1Text: elementText(html, [0, 0])?.text,
        // Before "&", after the entity, at the end.
        toSource: [sourceOffsetOfText(html, [0, 0], 3), sourceOffsetOfText(html, [0, 0], 4), sourceOffsetOfText(html, [0, 0], 8)],
        expected: [h1 + 3, h1 + 8, h1 + 12],
        past: sourceOffsetOfText(html, [0, 0], 9),
        fromSource: [textPointAt(html, h1 + 3), textPointAt(html, h1 + 8), textPointAt(html, strong + 1), textPointAt(html, three), textPointAt(html, empty)],
        // Inside the entity, inside a start tag, in the head: none.
        none: [textPointAt(html, h1 + 5), textPointAt(html, html.indexOf("<strong>") + 3), textPointAt(html, html.indexOf("T</title>"))],
        roundTrip: [0, 4, 7, 13].map(at => { const point = textPointAt(html, sourceOffsetOfText(html, [0, 1], at)!); return point && [point.node, point.at]; }),
      };
    });
    assert.equal(result.h1Text, "Hi & bye");
    assert.deepEqual(result.toSource, result.expected);
    assert.equal(result.past, undefined);
    // Just after </strong>: the paragraph's text, after "One two".
    assert.deepEqual(result.fromSource, [
      { node: [0, 0], at: 3 }, { node: [0, 0], at: 4 }, { node: [0, 1, 0], at: 1 }, { node: [0, 1], at: 7 }, { node: [0, 2], at: 0 },
    ]);
    assert.deepEqual(result.none, [undefined, undefined, undefined]);
    // In the paragraph: its start, "two" (inside <strong>), the space after it (after </strong>), the end.
    assert.deepEqual(result.roundTrip, [[[0, 1], 0], [[0, 1, 0], 0], [[0, 1], 7], [[0, 1], 13]]);
  } finally {
    await browser.close();
  }
});
