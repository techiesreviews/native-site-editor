import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { startTags } from "../shared/html-source.ts";
import { contractCases, repairedPages } from "./fakes/source-tree-contract.ts";

// The SourceTree contract in Chromium on both adapters: the page adapter
// (`readPage`, the browser's parser, as the preview reads a page) and the
// source adapter (`readSource(page, { page: true })`). Then parity: every
// element of every fixture page reads the same through both, and the
// markup the browser repairs reads differently (so a new repair shows up).
// Bundled as tests/cards-controller.test.ts bundles the cards, no server.

declare global {
  var sourceTreeContract: {
    readPage: typeof import("../src/native-source-location.ts").readPage;
    readSource: typeof import("../src/page-builder/source-tree.ts").readSource;
    contractCases: typeof contractCases;
    dump: typeof import("./fakes/source-tree-contract.ts").dump;
  };
}

const FIXTURES = ["fixtures/native-starter", "fixtures/native-cards", "fixtures/actual-starter"];

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith(".html") ? [path] : [];
  }).sort();
}

/** Every attribute name written on a start tag in `source`, lower case. */
function attributeNames(source: string): string[] {
  const names = new Set<string>();
  for (const tag of startTags(source))
    for (const match of source.slice(tag.nameEnd, tag.end).matchAll(/([^\t\n\f\r "'>/=]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"[^"]*"|'[^']*'|[^\t\n\f\r >]+))?/g))
      names.add(match[1].toLowerCase());
  return [...names].sort();
}

test("the source tree contract and fixture parity in Chromium", async (t) => {
  const { build } = await import("esbuild");
  const { chromium } = await import("@playwright/test");
  const bundle = await build({
    stdin: { contents: `
      import { readPage } from './src/native-source-location';
      import { readSource } from './src/page-builder/source-tree';
      import { contractCases, dump } from './tests/fakes/source-tree-contract';
      globalThis.sourceTreeContract = { readPage, readSource, contractCases, dump };
    `, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    const results = await page.evaluate(() => {
      const { readPage, readSource, contractCases } = sourceTreeContract;
      return contractCases.map((contract) => ({
        page: contract.read(readPage(contract.source)),
        // A second read of the same bytes is the cached tree.
        cached: readPage(contract.source) === readPage(contract.source),
        source: contract.read(readSource(contract.source, { page: true })),
      }));
    });
    for (const [index, contract] of contractCases.entries()) {
      await t.test(contract.name, () => {
        const result = results[index];
        assert.deepEqual(result.page, contract.page ?? contract.expected, "page adapter");
        assert.deepEqual(result.source, contract.expected, "source adapter");
        assert.equal(result.cached, true);
      });
    }

    await t.test("every element of every fixture page reads the same through both adapters", async () => {
      const files = FIXTURES.flatMap(htmlFiles);
      assert.ok(files.length >= 25, `fixture pages: ${files.length}`);
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        const { page: viaPage, source: viaSource, exact } = await page.evaluate(({ source, names }) => {
          const { readPage, readSource, dump } = sourceTreeContract;
          const tree = readSource(source, { page: true });
          return { page: dump(readPage(source), names), source: dump(tree, names), exact: tree.exact };
        }, { source, names: attributeNames(source) });
        const name = relative(process.cwd(), file);
        assert.ok(viaPage.elements.length > 0 || !source.includes("<"), `${name}: no elements read`);
        assert.equal(exact, true, `${name}: not balanced as written`);
        assert.deepEqual(viaSource, viaPage, name);
      }
    });

    await t.test("markup the browser repairs reads differently, as listed", async () => {
      const differs = await page.evaluate((pages) => {
        const { readPage, readSource, dump } = sourceTreeContract;
        return pages.map((source) => JSON.stringify(dump(readPage(source), [])) !== JSON.stringify(dump(readSource(source, { page: true }), [])));
      }, repairedPages);
      assert.deepEqual(differs, repairedPages.map(() => true));
    });
  } finally {
    await browser.close();
  }
});
