import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { build, loadConfigFromFile } from "vite";
import { unstable_startWorker } from "wrangler";
import { MOCKUPS_HEADERS, mockupFiles, mockupIndex, mockups, mockupTitle } from "../vite-mockups.ts";

const repoRoot = new URL("..", import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), "ase-mockups-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A repo with two maps of mock-ups (one with a reference image) and one map without any. */
function repo() {
  const root = mkdtempSync(join(scratch, "repo-"));
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("docs/wayfinder/site-structure/prototypes/08-site-map.html", "<title>PROTOTYPE (throwaway) · 08 Site map</title>");
  write("docs/wayfinder/agents/prototypes/14-share.html", "<title>PROTOTYPE (throwaway) · 14 Share & <edit></title>");
  write("docs/wayfinder/agents/prototypes/12-reference.png", "png");
  write("docs/wayfinder/agents/prototypes/05-untitled.html", "<p>no title</p>");
  write("docs/wayfinder/agents/prototypes/.DS_Store", "");
  write("docs/wayfinder/agents/map.md", "# map");
  write("docs/wayfinder/kit/map.md", "# map");
  return root;
}

test("every file in each map's prototypes folder is found, maps and files in name order", () => {
  const root = repo();
  assert.deepEqual(mockupFiles(root).map(({ map, file }) => `${map}/${file}`),
    ["agents/05-untitled.html", "agents/12-reference.png", "agents/14-share.html", "site-structure/08-site-map.html"]);
});

test("the index lists HTML mock-ups under their map by title, without the prototype prefix", () => {
  const html = mockupIndex(mockupFiles(repo()));
  assert.match(html, /<h2>agents<\/h2>\n<ul>\n<li><a href="agents\/05-untitled.html">05-untitled.html<\/a><\/li>\n<li><a href="agents\/14-share.html">14 Share &amp; &lt;edit&gt;<\/a><\/li>\n<\/ul>/);
  assert.match(html, /<h2>site-structure<\/h2>\n<ul>\n<li><a href="site-structure\/08-site-map.html">08 Site map<\/a><\/li>/);
  assert.doesNotMatch(html, /12-reference\.png|kit/);
  assert.equal(mockupTitle("<title>  </title>", "a.html"), "a.html");
});

test("the index says so when there are no mock-ups", () => {
  assert.match(mockupIndex([]), /<p>No mock-ups yet\.<\/p>/);
});

test("a build with the plugin writes the mock-ups and the index under mockups/", async () => {
  const root = repo();
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  const outDir = join(root, "dist");
  await build({ root, configFile: false, logLevel: "silent", plugins: [mockups(root)], build: { outDir } });
  const built = readdirSync(join(outDir, "mockups"), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(outDir.length + 1)).sort();
  assert.deepEqual(built,
    ["mockups/agents/05-untitled.html", "mockups/agents/12-reference.png", "mockups/agents/14-share.html", "mockups/index.html", "mockups/site-structure/08-site-map.html"]);
  assert.equal(readFileSync(join(outDir, "mockups/agents/12-reference.png"), "utf8"), "png");
  assert.match(readFileSync(join(outDir, "mockups/index.html"), "utf8"), /href="site-structure\/08-site-map.html"/);
});

test("served by Cloudflare's asset handler, mock-ups get one sandboxed policy and the editor keeps its own", async () => {
  const root = repo();
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  const editorHeaders = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/_headers"), editorHeaders);
  await build({ root, configFile: false, logLevel: "silent", plugins: [mockups(root)], build: { outDir: join(root, "dist") } });
  assert.equal(readFileSync(join(root, "dist/_headers"), "utf8"), editorHeaders + MOCKUPS_HEADERS);
  writeFileSync(join(root, "wrangler.jsonc"), JSON.stringify({ name: "mockups-test", compatibility_date: "2026-09-17", assets: { directory: "./dist" } }));
  const worker = await unstable_startWorker({ config: join(root, "wrangler.jsonc"), dev: { server: { port: 0 }, inspector: false, watch: false, logLevel: "none" } });
  try {
    const csp = async (path: string) => {
      const response = await worker.fetch(`http://localhost${path}`);
      assert.equal(response.status, 200, path);
      return response.headers.get("Content-Security-Policy")!;
    };
    const editor = await csp("/");
    assert.match(editor, /script-src 'self' 'wasm-unsafe-eval';/);
    assert.doesNotMatch(editor, /sandbox|script-src[^;]*unsafe-inline/);
    const mockup = await csp("/mockups/agents/14-share.html");
    assert.equal(mockup.match(/default-src/g)?.length, 1, "one policy, not the editor's merged in");
    assert.doesNotMatch(mockup, /wasm-unsafe-eval/);
    assert.match(mockup, /script-src 'self' 'unsafe-inline' https:\/\/esm\.sh;/);
    assert.match(mockup, /; sandbox allow-scripts allow-forms allow-popups$/);
    assert.doesNotMatch(mockup, /allow-same-origin/);
  } finally {
    await worker.dispose();
  }
});

test("vite.config.ts adds the mock-ups only with MOCKUPS=1", async () => {
  const pluginNames = async (value: string | undefined) => {
    const saved = process.env.MOCKUPS;
    if (value === undefined) delete process.env.MOCKUPS;
    else process.env.MOCKUPS = value;
    try {
      const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, join(repoRoot, "vite.config.ts"), repoRoot, "silent", undefined, "runner");
      return (loaded!.config.plugins ?? []).flat(Infinity).flatMap(plugin => plugin && "name" in plugin ? [plugin.name] : []);
    } finally {
      if (saved === undefined) delete process.env.MOCKUPS;
      else process.env.MOCKUPS = saved;
    }
  };
  assert.ok(!(await pluginNames(undefined)).includes("ase-mockups"));
  assert.ok(!(await pluginNames("0")).includes("ase-mockups"));
  assert.ok((await pluginNames("1")).includes("ase-mockups"));
});
