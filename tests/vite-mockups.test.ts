import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { build } from "vite";
import { MOCKUPS_HEADERS, mockupFiles, mockupIndex, mockups, mockupTitle } from "../vite-mockups.ts";
import { staticAssetHeaders } from "./native-save/production-headers.ts";

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

test("the built _headers keeps the editor's policy and lets mock-ups run their inline scripts", async () => {
  const root = repo();
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  const editorHeaders = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/_headers"), editorHeaders);
  const outDir = join(root, "dist");
  await build({ root, configFile: false, logLevel: "silent", plugins: [mockups(root)], build: { outDir } });
  const built = readFileSync(join(outDir, "_headers"), "utf8");
  assert.equal(built, editorHeaders + MOCKUPS_HEADERS);
  const csp = (path: string) => staticAssetHeaders(built, path).get("Content-Security-Policy")!;
  assert.equal(csp("/"), staticAssetHeaders(editorHeaders, "/").get("Content-Security-Policy"));
  assert.doesNotMatch(csp("/"), /script-src[^;]*unsafe-inline/);
  assert.match(csp("/mockups/agents/14-share.html"), /script-src 'self' 'unsafe-inline' https:\/\/esm\.sh;/);
  assert.match(MOCKUPS_HEADERS, /^\/mockups\/\*\n {2}! Content-Security-Policy\n/m);
});
