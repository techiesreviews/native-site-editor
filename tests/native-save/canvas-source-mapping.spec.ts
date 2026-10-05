import { expect, test } from "@playwright/test";
import { build } from "esbuild";

// Code-to-canvas mapping (elementPathAtOffset) checked in a real browser parser at every offset of
// sources the HTML parser rewrites. `runs` lists [first offset, path] for each stretch of offsets
// that map to the same element path (null: no element), and holds through the end of the source.
// The expected runs were recorded from the mapping as it was before document order, next-outside
// and start order were derived once per source.
type Run = [number, number[] | null];
const cases: Record<string, { html: string; runs: Run[] }> = {
  // Implied end tags: <p> closed by <p> and </div>, <li> by <li>.
  implied: {
    html: "<!doctype html><html><head><title>x</title></head><body><div><p>One<p>Two</div><ul><li>a<li>b</ul><p>Tail</body></html>",
    runs: [[-1, null], [56, [0]], [61, [0, 0]], [67, [0, 1]], [73, [0]], [79, [1]], [83, [1, 0]], [88, [1, 1]], [93, [1]], [98, [2]], [105, null]],
  },
  // Misnested inline and block tags.
  malformed: {
    html: "<body><div><span>open<div>x</span></div><b><i>mis</b></i><p>end</body>",
    runs: [[-1, null], [6, [0]], [11, [0, 0]], [21, [0, 0, 0]], [27, [0, 0]], [34, [0]], [63, null]],
  },
  // Adoption agency: <b> reopened across <p>, nested <a> split.
  adoption: {
    html: "<body><p><b>bold<p>next</b> tail</p><a href=#>one<a href=#>two</a></a></body>",
    runs: [[-1, null], [6, [0]], [9, [0, 0]], [16, [1]], [36, [2]], [49, [3]], [70, null]],
  },
  // Implied table structure and a nested table.
  table: {
    html: "<body><table><tr><td>a<td>b</tr><tr><td><table><td>inner</table></table><p>after</p></body>",
    runs: [[-1, null], [6, [0]], [13, [0, 0, 0]], [17, [0, 0, 0, 0]], [22, [0, 0, 0, 1]], [27, [0, 0, 0]], [32, [0, 0, 1]], [36, [0, 0, 1, 0]], [40, [0, 0, 1, 0, 0]], [47, [0, 0, 1, 0, 0, 0, 0, 0]], [56, [0, 0, 1, 0, 0]], [64, [0]], [72, [1]], [84, null]],
  },
  // Void elements inside and outside paragraphs.
  void: {
    html: "<body><p>A<br>B<img src=x><input></p><hr><section><h2>S</h2><img alt=y></section></body>",
    runs: [[-1, null], [6, [0]], [10, [0, 0]], [14, [0]], [15, [0, 1]], [26, [0, 2]], [33, [0]], [37, [1]], [41, [2]], [50, [2, 0]], [60, [2, 1]], [71, [2]], [81, null]],
  },
  // Empty elements whose start tags share boundaries with their neighbours.
  ties: {
    html: "<body><p>a</p><p></p><p><span></span></p><div><div><b></b></div></div></body>",
    runs: [[-1, null], [6, [0]], [14, [1]], [21, [2]], [24, [2, 0]], [37, [2]], [41, [3]], [46, [3, 0]], [51, [3, 0, 0]], [58, [3, 0]], [64, [3]], [70, null]],
  },
};

const expand = (html: string, runs: Run[]) => {
  const out: (number[] | null)[] = [];
  for (let offset = -1, at = 0; offset <= html.length + 1; offset++) {
    if (at + 1 < runs.length && runs[at + 1][0] === offset) at++;
    out.push(runs[at][1]);
  }
  return out;
};

let bundle = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: "import { elementPathAtOffset } from './src/page-builder/canvas-source'; (globalThis as any).elementPathAtOffset = elementPathAtOffset;", resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" }, logLevel: "silent",
  });
  bundle = result.outputFiles[0].text;
});

test("canvas source mapping returns the expected element path at every offset", async ({ page }) => {
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: bundle });
  const actual = await page.evaluate((sources) => {
    const at = (globalThis as any).elementPathAtOffset as (html: string, offset: number) => number[] | undefined;
    return Object.fromEntries(Object.entries(sources).map(([name, html]) => {
      const paths: (number[] | null)[] = [];
      for (let offset = -1; offset <= html.length + 1; offset++) paths.push(at(html, offset) ?? null);
      return [name, paths];
    }));
  }, Object.fromEntries(Object.entries(cases).map(([name, { html }]) => [name, html])));
  for (const [name, { html, runs }] of Object.entries(cases)) expect(actual[name], name).toEqual(expand(html, runs));
});

test("a new source replaces the cached parse, and an earlier source is parsed again", async ({ page }) => {
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: bundle });
  // Alternate sources on every query, including a same-length twin of ties whose structure differs.
  const twin = cases.ties.html.replace("<p></p><p><span>", "<p><p></p><span>");
  expect(twin.length).toBe(cases.ties.html.length);
  const names = Object.keys(cases);
  const actual = await page.evaluate(({ sources, twin }) => {
    const at = (globalThis as any).elementPathAtOffset as (html: string, offset: number) => number[] | undefined;
    const list = Object.values(sources);
    const longest = Math.max(...list.map((html) => html.length));
    const paths: (number[] | null)[][] = list.map(() => []);
    const twinPaths: (number[] | null)[] = [];
    for (let offset = -1; offset <= longest + 1; offset++) {
      list.forEach((html, i) => { if (offset <= html.length + 1) paths[i].push(at(html, offset) ?? null); });
      if (offset <= twin.length + 1) twinPaths.push(at(twin, offset) ?? null);
    }
    return { paths, twinPaths };
  }, { sources: Object.fromEntries(names.map((name) => [name, cases[name].html])), twin });
  names.forEach((name, i) => expect(actual.paths[i], name).toEqual(expand(cases[name].html, cases[name].runs)));
  // The twin, asked alone in a fresh page, maps the same as when interleaved, and not like ties.
  await page.reload();
  await page.addScriptTag({ content: bundle });
  const alone = await page.evaluate((twin) => {
    const at = (globalThis as any).elementPathAtOffset as (html: string, offset: number) => number[] | undefined;
    return Array.from({ length: twin.length + 3 }, (_, i) => at(twin, i - 1) ?? null);
  }, twin);
  expect(actual.twinPaths).toEqual(alone);
  expect(alone).not.toEqual(expand(cases.ties.html, cases.ties.runs));
});
