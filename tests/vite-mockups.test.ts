import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { build, loadConfigFromFile } from "vite";
import { unstable_startWorker } from "wrangler";
import { MOCKUPS_HEADERS, mockupFiles, mockupIndex, mockups, mockupTitle, referencedFiles } from "../vite-mockups.ts";

const repoRoot = new URL("..", import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), "ase-mockups-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A repo with two maps of mock-ups (one using an image beside it, with an unused one too) and one map without any. */
function repo() {
  const root = mkdtempSync(join(scratch, "repo-"));
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("docs/wayfinder/site-structure/prototypes/08-site-map.html", "<title>PROTOTYPE (throwaway) · 08 Site map</title>");
  write("docs/wayfinder/agents/prototypes/14-share.html", '<title>PROTOTYPE (throwaway) · 14 Share & <edit></title><img src="12-reference.png" alt=""><img src="11-shared.png" alt="">');
  write("docs/wayfinder/agents/prototypes/12-reference.png", "png");
  write("docs/wayfinder/agents/prototypes/13-unused-screenshot.png", "unused");
  write("docs/wayfinder/site-structure/prototypes/11-shared.png", "another map's");
  write("docs/wayfinder/agents/prototypes/05-untitled.html", "<p>no title</p>");
  write("docs/wayfinder/agents/prototypes/.DS_Store", "");
  write("docs/wayfinder/agents/prototypes/notes.md", "# not published");
  write("docs/wayfinder/agents/map.md", "# map");
  write("docs/wayfinder/kit/map.md", "# map");
  return root;
}

test("every HTML mock-up in each map's prototypes folder is found with the images they use, maps and files in name order", () => {
  const root = repo();
  assert.deepEqual(mockupFiles(root).map(({ map, file }) => `${map}/${file}`),
    ["agents/05-untitled.html", "agents/12-reference.png", "agents/14-share.html", "site-structure/08-site-map.html"]);
});

test("an image counts as used when a mock-up in its folder points at it by file name", () => {
  const html = `<img src="a.png"><img src='./b%20b.png?v=2#x'><img src=c.png>
<picture><source srcset="d.webp 1x, ./e.webp 2x"></picture><link rel="icon" href="f.svg">
<div style="background: url('g.jpg')"></div><style>i { background: url(h.gif) }</style>
<script>image.src = "i.avif";</script><img src="images/j.png"><img src="../other/k.png"><a href="#l">`;
  assert.deepEqual([...referencedFiles(html)].sort(), ["a.png", "b b.png", "c.png", "d.webp", "e.webp", "f.svg", "g.jpg", "h.gif", "i.avif"]);
});

test("a build copies only the images a mock-up in the same map uses", async () => {
  const root = repo();
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  const outDir = join(root, "dist");
  await build({ root, configFile: false, logLevel: "silent", plugins: [mockups(root)], build: { outDir } });
  const images = readdirSync(join(outDir, "mockups"), { recursive: true }).map(String).filter(file => file.endsWith(".png")).sort();
  assert.deepEqual(images, ["agents/12-reference.png"]);
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
    const headers = async (path: string) => {
      const response = await worker.fetch(`http://localhost${path}`);
      assert.equal(response.status, 200, path);
      return response.headers;
    };
    const csp = async (path: string) => (await headers(path)).get("Content-Security-Policy")!;
    const editor = await csp("/");
    assert.equal((await headers("/")).get("X-Robots-Tag"), null);
    assert.match(editor, /script-src 'self' 'wasm-unsafe-eval';/);
    assert.doesNotMatch(editor, /sandbox|script-src[^;]*unsafe-inline/);
    const mockup = await csp("/mockups/agents/14-share.html");
    assert.equal(mockup.match(/default-src/g)?.length, 1, "one policy, not the editor's merged in");
    assert.doesNotMatch(mockup, /wasm-unsafe-eval/);
    assert.match(mockup, /script-src 'self' 'unsafe-inline' https:\/\/esm\.sh;/);
    assert.match(mockup, /; sandbox allow-scripts allow-forms allow-popups$/);
    assert.doesNotMatch(mockup, /allow-same-origin/);
    const index = await headers("/mockups/");
    assert.equal(index.get("Content-Security-Policy"), mockup);
    assert.equal(index.get("X-Robots-Tag"), "noindex");
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

test("only the preview Worker builds with the mock-ups", () => {
  const commands = Object.fromEntries(["wrangler.jsonc", "wrangler.preview.jsonc", "wrangler.techies.jsonc"].map(file => {
    const config = readFileSync(join(repoRoot, file), "utf8");
    return [file, /"build"\s*:\s*\{\s*"command"\s*:\s*"([^"]+)"/.exec(config)?.[1]];
  }));
  assert.deepEqual(commands, { "wrangler.jsonc": "npm run build:ui", "wrangler.preview.jsonc": "npm run build:preview", "wrangler.techies.jsonc": "npm run build:ui" });
  const scripts = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  assert.match(scripts["build:preview"], /^MOCKUPS=1 vite build\b/);
  assert.doesNotMatch(scripts["build:ui"], /MOCKUPS/);
});

test("index links are URL-encoded and a rebuild adds the header rule once", async () => {
  assert.match(mockupIndex([{ map: "m", file: "a #1?.html", path: "x" }], () => ""), /href="m\/a%20%231%3F\.html"/);
  const root = repo();
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  const outDir = join(root, "dist");
  const plugin = mockups(root);
  await build({ root, configFile: false, logLevel: "silent", plugins: [plugin], build: { outDir } });
  await build({ root, configFile: false, logLevel: "silent", plugins: [plugin], build: { outDir, emptyOutDir: false } });
  assert.equal(readFileSync(join(outDir, "_headers"), "utf8"), MOCKUPS_HEADERS);
});

/** esm.sh stand-ins, so the browser check needs no network: like the real Yjs build, the first module
 * imports a second esm.sh path (lib0), and the CSP decides before the route answers. */
/** A 1×1 transparent PNG. */
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const esmStub: Record<string, string> = {
  "/yjs@13": 'export * from "/lib0@0.2/stub.mjs";',
  "/lib0@0.2/stub.mjs": "globalThis.esmLoaded = true; export class Doc {}",
};

test("every real mock-up runs in a browser under the sandboxed policy", async () => {
  const { chromium } = await import("@playwright/test");
  const root = mkdtempSync(join(scratch, "real-"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/_headers"), readFileSync(join(repoRoot, "public/_headers"), "utf8"));
  // No real mock-up uses an image yet; this one stands in to prove the sandboxed policy lets same-site images load.
  writeFileSync(join(root, "public/probe.png"), Buffer.from(onePixelPng, "base64"));
  await build({ root, configFile: false, logLevel: "silent", plugins: [mockups(repoRoot)], build: { outDir: join(root, "dist") } });
  writeFileSync(join(root, "wrangler.jsonc"), JSON.stringify({ name: "mockups-browser-test", compatibility_date: "2026-09-17", assets: { directory: "./dist" } }));
  const worker = await unstable_startWorker({ config: join(root, "wrangler.jsonc"), dev: { server: { port: 0 }, inspector: false, watch: false, logLevel: "none" } });
  const browser = await chromium.launch({ headless: true });
  try {
    const base = await worker.url;
    const page = await browser.newPage();
    await page.route("https://esm.sh/**", route => {
      const body = esmStub[new URL(route.request().url()).pathname];
      return body === undefined ? route.abort() : route.fulfill({ body, contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
    });
    const violations: string[] = [];
    page.on("console", message => { if (/Content Security Policy/i.test(message.text())) violations.push(`${page.url()}: ${message.text()}`); });
    await page.addInitScript(() => document.addEventListener("securitypolicyviolation", event => console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`)));
    // A mock-up that crashes in the sandbox (say, unguarded localStorage) fails here. Only 08 Typing
    // together may throw: the esm.sh stand-in has no Yjs past `Doc`.
    const typingTogether = "agents-and-multiplayer/08-typing-together.html";
    const errors: string[] = [];
    let current = "";
    page.on("pageerror", error => { if (current !== typingTogether) errors.push(`${current}: ${error.message}`); });
    const missingImages: string[] = [];
    page.on("response", response => { if (response.request().resourceType() === "image" && !response.ok()) missingImages.push(`${current}: ${response.url()}`); });
    page.on("requestfailed", request => { if (request.resourceType() === "image") missingImages.push(`${current}: ${request.url()}`); });
    const pages = mockupFiles(repoRoot).filter(mockup => mockup.file.endsWith(".html"));
    assert.ok(pages.length > 0);
    for (const { map, file } of [{ map: "", file: "index.html" }, ...pages]) {
      current = map ? `${map}/${file}` : file;
      const response = await page.goto(new URL(`mockups/${current}`, base).href, { waitUntil: "load" });
      assert.equal(response?.status(), 200, current);
    }
    assert.deepEqual(violations, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(missingImages, []);

    current = typingTogether;
    await page.goto(new URL(`mockups/${typingTogether}`, base).href, { waitUntil: "load" });
    await page.waitForFunction(() => (globalThis as { esmLoaded?: boolean }).esmLoaded === true);
    const sandbox = await page.evaluate(async () => {
      const [imageLoaded, unusedReferenceLoaded] = await Promise.all(["/probe.png", "12-caret-circle-reference.png"].map(src => {
        const image = new Image();
        image.src = src;
        return image.decode().then(() => true, () => false);
      }));
      let storage = "open";
      try { void localStorage.length; } catch { storage = "blocked"; }
      return { origin: String(globalThis.origin), cookie: (() => { try { return document.cookie; } catch { return "blocked"; } })(), storage, imageLoaded, unusedReferenceLoaded };
    });
    assert.deepEqual(sandbox, { origin: "null", cookie: "blocked", storage: "blocked", imageLoaded: true, unusedReferenceLoaded: false });
    const unused = await page.request.get(new URL("mockups/styling/03-unblockwp-panel-reference.png", base).href);
    assert.equal(unused.status(), 404);
    assert.deepEqual(violations, []);
  } finally {
    await browser.close();
    await worker.dispose();
  }
});
