import { expect, test } from "@playwright/test";

// The node a master preview needs comes from the editor's own locator, which parses as the
// browser does. With an implied </p> before a <section>, the browser makes the section <main>'s
// second child: [0, 1] from <body>. This proves the locator a host would pass as `locateCopy`
// (native-section-master-controller) gives that node and maps back to the exact source range.
test("the editor's locator gives the browser's node for a section after an implied </p>, and maps back exactly", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const result = await page.evaluate(async () => {
    const { elementPathAt, locateNativeElementRange } = await import("/src/native-source-location.ts");
    const section = `<section class="intro" id="a"><h2>Hello</h2></section>`;
    const html = `<!doctype html><html><head><title>T</title></head><body><main><p>lead${section}</main></body></html>`;
    const start = html.indexOf(section);
    const node = elementPathAt(html, start);
    const range = node && locateNativeElementRange(html, node);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const path: number[] = [];
    for (let at: Element = doc.querySelector("section#a")!; at !== doc.body; at = at.parentElement!) path.unshift([...at.parentElement!.children].indexOf(at));
    return { node, range: range && [range.start, range.end], expected: [start, start + section.length], browser: path };
  });
  expect(result.browser).toEqual([0, 1]);
  expect(result.node).toEqual([0, 1]);
  expect(result.range).toEqual(result.expected);
});
