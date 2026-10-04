import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

// Exercise the browser parser directly, without a preview server or app state.
test("private locator cache preserves source ranges and isolates mutable parses", async () => {
  const bundle = await build({
    stdin: { contents: `import * as locator from './src/native-source-location'; globalThis.locator = locator;`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const errors = await page.evaluate(`(() => {
      const { parseMarked, markedRange, locateNativeElement, locateNativeElementRange, elementPathAt, wrapperAround, MARK } = globalThis.locator;
      const errors = [];
      const equal = (actual, expected, label) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(label);
      };
      const sources = [
        '', '<!-- <b> -->', '<p>a<div>b</div><p>c', '<ul><li>one<li>two</ul>',
        '<table><tr><td>cell</td></tr></table>', '<template><b>nested</b></template><br>',
        '<html><head><title>title</title></head><body><script>bad()</script><meta http-equiv="refresh" content="0"><h1>Hi</h1></body></html>',
        '<main><!-- <i> -->😀 &amp; <em title="a>b">é &#128512;</em><p>tail</p></main>',
        '<h1>x</h1>', '<h2>x</h2>', '<p>&amp;</p><b>end</b>', '<p>&#38;</p><b>end</b>',
      ];
      function check(html) {
        const { tags, root, end } = parseMarked(html);
        function visit(parent, path, ancestor) {
          [...parent.children].forEach((el, index) => {
            const next = [...path, index];
            const tag = el.hasAttribute(MARK) ? tags[Number(el.getAttribute(MARK))] : undefined;
            equal(locateNativeElement(html, next), tag ?? ancestor, 'tag ' + next + ' ' + html.slice(0, 60));
            equal(locateNativeElementRange(html, next), markedRange(html, tags, root, el, end), 'range ' + next);
            if (tag) equal(elementPathAt(html, tag.start), next, 'inverse ' + next);
            visit(el, next, tag ?? ancestor);
          });
        }
        visit(root, [], undefined);
        equal(locateNativeElementRange(html, []), undefined, 'empty path');
        equal(locateNativeElementRange(html, [99]), undefined, 'invalid path');
        equal(elementPathAt(html, -1), undefined, 'invalid offset');
      }
      // Every source is revisited after more than two other versions, and warm.
      for (let round = 0; round < 3; round++) for (const html of sources) { check(html); check(html); }
      const html = '<main><em>hello</em></main>';
      const range = locateNativeElementRange(html, [0, 0]);
      for (const [object, key] of [[range, 'start'], [range.tag, 'start'], [range.close, 'start']]) {
        if (!Object.isFrozen(object) || Reflect.set(object, key, 999)) errors.push('mutable offset ' + key);
      }
      const tag = locateNativeElement(html, [0]);
      if (!Object.isFrozen(tag) || Reflect.set(tag, 'start', 999)) errors.push('mutable tag');
      equal(locateNativeElementRange(html, [0, 0]).start, 6, 'mutation poisoned cache');
      const path = elementPathAt(html, 6); path[0] = 99;
      equal(elementPathAt(html, 6), [0, 0], 'mutable path poisoned cache');
      const first = parseMarked(html), second = parseMarked(html);
      first.root.replaceChildren(); first.tags[0].start = 999;
      if (second.root.children.length !== 1 || second.tags[0].start !== 0) errors.push('parseMarked shared');
      equal(locateNativeElement(html, [0]).start, 0, 'fresh parse poisoned cache');
      const wrapper = wrapperAround('Hi <em>😀 &amp; text</em>', 4, ['em']);
      if (!Object.isFrozen(wrapper) || !Object.isFrozen(wrapper.tag)) errors.push('mutable wrapper');
      // Both ASCII and multibyte inputs exceed the one-MiB byte limit.
      for (const fill of ['x'.repeat(1024 * 1024), '😀'.repeat(300000)]) {
        const large = '<p>' + fill + '</p><b>end</b>';
        check(large); check(large);
      }
      return errors;
    })()`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
