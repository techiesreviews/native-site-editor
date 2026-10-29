import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { build, loadConfigFromFile } from "vite";
import { unstable_startWorker } from "wrangler";
import { buildTickets, MOCKUPS_HEADERS, mockupFiles, mockupIndex, mockups, mockupShipping, mockupTitle, referencedFiles, ticketsOnMain } from "../vite-mockups.ts";

const repoRoot = new URL("..", import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), "ase-mockups-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A repo with two maps of mock-ups (one using an image beside it, another image named only in notes) and one map without any. */
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
  write("docs/wayfinder/agents/prototypes/notes.md", "# not published\n\n![](13-unused-screenshot.png) <img src=\"13-unused-screenshot.png\">");
  write("docs/wayfinder/agents/map.md", "# map\n\n![reference](prototypes/13-unused-screenshot.png)");
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
<script>image.src = "i.avif";</script><img src="images/j.png"><img src="../other/k.png"><a href="#l">
<IMG SRC="m.png"><img data-src="n.png"><div style='background: url(" o o.png ")'></div>
<img src="p&amp;q.png"><img src="r&#38;s.png"><img src="t&#x26;u.png"><img src="v&bogus;w.png">
<!-- <img src="x-commented-out.png"> --><video poster="y.png"></video><script>img.src = \`z.png\`; const open = "<!--";</script>
<link rel="preload" as="image" imagesrcset="aa.webp 1x, ab.webp 2x"><img src="ac.png"><!-- closes the script's "<!--" only if it is read as a comment -->
<div style='background: image-set("ad.png" 1x)'></div>`;
  assert.deepEqual([...referencedFiles(html)].sort(), ["a.png", "aa.webp", "ab.webp", "ac.png", "b b.png", "c.png", "d.webp", "e.webp", "f.svg", "g.jpg",
    "h.gif", "i.avif", "m.png", "n.png", "o o.png", "p&q.png", "r&s.png", "t&u.png", "v&bogus;w.png", "y.png", "z.png"]);
});

test("a build copies only the images a mock-up in the same map uses; notes naming an image don't count", async () => {
  const root = repo();
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  // File names match by exact case, like Cloudflare's asset paths: `Photo.PNG` would 404 there anyway.
  writeFileSync(join(root, "docs/wayfinder/agents/prototypes/15-case.html"), '<img src="Photo.PNG" alt="">');
  writeFileSync(join(root, "docs/wayfinder/agents/prototypes/photo.png"), "png");
  const outDir = join(root, "dist");
  await build({ root, configFile: false, logLevel: "silent", plugins: [mockups(root)], build: { outDir } });
  const images = readdirSync(join(outDir, "mockups"), { recursive: true }).map(String).filter(file => file.endsWith(".png")).sort();
  assert.deepEqual(images, ["agents/12-reference.png"]);
});

test("the index lists HTML mock-ups under their map by title, without the prototype prefix", () => {
  const html = mockupIndex(mockupFiles(repo()));
  const idea = ' <span class="shipping shipping--idea">Idea only</span>';
  assert.match(html, new RegExp(`<h2>agents</h2>\n<ul>\n<li><a href="agents/05-untitled.html">05-untitled.html</a>${idea}</li>\n<li><a href="agents/14-share.html">14 Share &amp; &lt;edit&gt;</a>${idea}</li>\n</ul>`));
  assert.match(html, new RegExp(`<h2>site-structure</h2>\n<ul>\n<li><a href="site-structure/08-site-map.html">08 Site map</a>${idea}</li>`));
  assert.doesNotMatch(html, /12-reference\.png|kit/);
  assert.equal(mockupTitle("<title>  </title>", "a.html"), "a.html");
});

test("the index says so when there are no mock-ups", () => {
  assert.match(mockupIndex([]), /<p>No mock-ups yet\.<\/p>/);
});

/** Runs git in `dir` without the user's identity, signing or hooks. */
const gitIn = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { stdio: "ignore" });

/** A git repo with one mock-up per label and build tickets linking to them; `main` holds tickets 01 and 06
 * closed, `dev` then closes 02 and claims 04. */
function shippingRepo() {
  const root = mkdtempSync(join(scratch, "shipping-"));
  const git = (...args: string[]) => gitIn(root, ...args);
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const ticket = (map: string, file: string, status: string, assignee: string, body: string) =>
    write(`docs/wayfinder/${map}/build/tickets/${file}`, `---\ntitle: "${file}"\nstatus: ${status}\nassignee: ${assignee}\n---\n\n${body}\n`);
  for (const page of ["live", "preview", "live-and-open", "live-and-preview", "claimed", "planned", "idea", "shared"]) write(`docs/wayfinder/agents/prototypes/${page}.html`, `<title>${page}</title>`);
  git("init", "--quiet", "--initial-branch=dev");
  ticket("agents", "01-live.md", "closed", "", "[mock-up](../../prototypes/live.html), ../../prototypes/live-and-open.html, ../../prototypes/live-and-preview.html");
  ticket("agents", "02-preview.md", "open", "", "Mock-ups: [preview](../../prototypes/preview.html) and [the pair](../../prototypes/live-and-preview.html).");
  ticket("agents", "03-open.md", "open", "", "Builds `prototypes/live-and-open.html`; `prototypes/<file>.html` and prototypes/missing.html name none.");
  ticket("agents", "04-claimed.md", "open", "", "[x](../../prototypes/claimed.html)");
  ticket("agents", "05-planned.md", "ready-for-agent", "", "[x](../../prototypes/planned.html)");
  // Another map's ticket, linking across maps: listed with its map's name.
  ticket("styling", "06-shared.md", "closed", "", "From [shared](../../../agents/prototypes/shared.html) and docs/wayfinder/agents/prototypes/shared.html.");
  ticket("agents", "07-shared.md", "open", "", "[x](../../prototypes/shared.html)");
  git("add", "-A");
  git("commit", "--quiet", "-m", "tickets");
  git("branch", "main");
  ticket("agents", "02-preview.md", "closed", "", "Mock-ups: [preview](../../prototypes/preview.html) and [the pair](../../prototypes/live-and-preview.html).");
  ticket("agents", "04-claimed.md", "open", "am-04", "[x](../../prototypes/claimed.html)");
  git("commit", "--quiet", "-am", "close 02, claim 04");
  return { root, git, ticket };
}

/** Each mock-up's label in `root`, with the names of the tickets it came from: `{ "live.html": "live 01" }`. */
function labelsIn(root: string) {
  const files = mockupFiles(root);
  return Object.fromEntries([...mockupShipping(files, buildTickets(root, files), ticketsOnMain(root))]
    .map(([key, { label, tickets }]) => [key.slice("agents/".length), `${label} ${tickets.map(ticket => ticket.name).join(",")}`.trim()]));
}

test("each mock-up's label comes from the build tickets linking to it and whether their closing commits are on main", () => {
  const { root } = shippingRepo();
  const tickets = buildTickets(root, mockupFiles(root));
  assert.deepEqual(tickets.map(({ map, name, closed, claimed, mockups }) => ({ map, name, closed, claimed, mockups })), [
    { map: "agents", name: "01", closed: true, claimed: false, mockups: ["agents/live.html", "agents/live-and-open.html", "agents/live-and-preview.html"] },
    { map: "agents", name: "02", closed: true, claimed: false, mockups: ["agents/preview.html", "agents/live-and-preview.html"] },
    { map: "agents", name: "03", closed: false, claimed: false, mockups: ["agents/live-and-open.html"] },
    { map: "agents", name: "04", closed: false, claimed: true, mockups: ["agents/claimed.html"] },
    { map: "agents", name: "05", closed: false, claimed: false, mockups: ["agents/planned.html"] },
    { map: "agents", name: "07", closed: false, claimed: false, mockups: ["agents/shared.html"] },
    { map: "styling", name: "06", closed: true, claimed: false, mockups: ["agents/shared.html"] },
  ]);
  assert.deepEqual([...ticketsOnMain(root)!].sort(), ["docs/wayfinder/agents/build/tickets/01-live.md", "docs/wayfinder/styling/build/tickets/06-shared.md"]);
  assert.deepEqual(labelsIn(root), {
    "claimed.html": "building 04",
    "idea.html": "idea",
    "live.html": "live 01",
    "live-and-open.html": "building 01,03",
    "live-and-preview.html": "preview 01,02",
    "planned.html": "planned 05",
    "preview.html": "preview 02",
    "shared.html": "building 07,06",
  });
  // Without main (a shallow clone, no git), closed work reads On preview.
  assert.equal(ticketsOnMain(join(scratch, "not-a-repo")), undefined);
  assert.equal(mockupShipping(mockupFiles(root), tickets).get("agents/live.html")?.label, "preview");
});

test("a ticket's newest closing commit counts, a moved ticket keeps it, and origin/main wins over a lagging local main", () => {
  const { root, git, ticket } = shippingRepo();
  git("mv", "docs/wayfinder/styling/build/tickets/06-shared.md", "docs/wayfinder/styling/build/tickets/16-shared.md");
  git("commit", "--quiet", "-m", "rename 06");
  const body = "[mock-up](../../prototypes/live.html), ../../prototypes/live-and-open.html, ../../prototypes/live-and-preview.html";
  ticket("agents", "01-live.md", "open", "", body);
  git("commit", "--quiet", "-am", "reopen 01");
  ticket("agents", "01-live.md", "closed", "", body);
  git("commit", "--quiet", "-am", "close 01 again");
  assert.deepEqual([...ticketsOnMain(root)!], ["docs/wayfinder/styling/build/tickets/16-shared.md"]);
  const labels = labelsIn(root);
  assert.equal(labels["live.html"], "preview 01");
  assert.equal(labels["shared.html"], "building 07,16");
  // Reached through a symlink, the repo reads the same.
  const link = join(scratch, `link-${Date.now()}`);
  symlinkSync(root, link);
  assert.deepEqual(labelsIn(link), labels);

  // A clone whose local main stays where it was while origin/main takes in dev's closes.
  const clone = join(scratch, `clone-${Date.now()}`);
  gitIn(scratch, "clone", "--quiet", root, clone);
  gitIn(clone, "branch", "main", "origin/main");
  git("branch", "--force", "main", "dev");
  gitIn(clone, "fetch", "--quiet", "origin");
  assert.deepEqual(labelsIn(clone), { ...labels, "live.html": "live 01", "preview.html": "live 02", "live-and-preview.html": "live 01,02" });
});

test("a shallow clone, even with main, reads no ticket as on main, so closed work is On preview", () => {
  const { root } = shippingRepo();
  const clone = join(scratch, `shallow-${Date.now()}`);
  gitIn(scratch, "clone", "--quiet", "--depth=1", "--no-single-branch", `file://${root}`, clone);
  gitIn(clone, "rev-parse", "--verify", "origin/main");
  assert.equal(ticketsOnMain(clone), undefined);
  assert.equal(labelsIn(clone)["live.html"], "preview 01");
});

test("a closing commit rewritten onto main by a rebase merge still counts, matched by author time and subject", () => {
  const { root, git } = shippingRepo();
  git("checkout", "--quiet", "main");
  git("cherry-pick", "dev");
  git("checkout", "--quiet", "dev");
  assert.equal(labelsIn(root)["preview.html"], "live 02");
});

test("the index shows each label with the tickets it came from, and a legend saying what each means", () => {
  const { root } = shippingRepo();
  const files = mockupFiles(root);
  const html = mockupIndex(files, { shipping: mockupShipping(files, buildTickets(root, files), ticketsOnMain(root)) });
  const row = (page: string, badge: string) => assert.ok(html.includes(`<li><a href="agents/${page}.html">${page}</a> ${badge}</li>`), page);
  row("live", '<span class="shipping shipping--live">Live</span> <span class="tickets">ticket 01</span>');
  row("live-and-preview", '<span class="shipping shipping--preview">On preview</span> <span class="tickets">tickets 01, 02</span>');
  row("shared", '<span class="shipping shipping--building">Being built</span> <span class="tickets">tickets 07, styling 06</span>');
  row("planned", '<span class="shipping shipping--planned">Planned</span> <span class="tickets">ticket 05</span>');
  row("idea", '<span class="shipping shipping--idea">Idea only</span>');
  for (const [label, meaning] of [["live", "Live</span></dt><dd>Built and released to editor.techies.tools."], ["preview", "On preview</span></dt><dd>Built and on preview"],
    ["building", "Being built</span></dt><dd>"], ["planned", "Planned</span></dt><dd>"], ["idea", "Idea only</span></dt><dd>No build ticket"]]) {
    assert.ok(html.includes(`<dt><span class="shipping shipping--${label}">${meaning}`), label);
  }
  // The editor's own tokens, light and dark, colour the labels.
  assert.match(html, /--success-bg: var\(--semantic-success-surface\);[\s\S]*@media \(prefers-color-scheme: dark\)[\s\S]*\.shipping--live \{ background: var\(--success-bg\)/);
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
  const index = readFileSync(join(outDir, "mockups/index.html"), "utf8");
  assert.match(index, /href="site-structure\/08-site-map.html">08 Site map<\/a> <span class="shipping shipping--idea">Idea only<\/span>/);
  assert.match(index, /--success-bg: var\(--semantic-success-surface\);/);
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
  assert.match(mockupIndex([{ map: "m", file: "a #1?.html", path: "x" }], { read: () => "" }), /href="m\/a%20%231%3F\.html"/);
  const root = repo();
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  const outDir = join(root, "dist");
  const plugin = mockups(root);
  await build({ root, configFile: false, logLevel: "silent", plugins: [plugin], build: { outDir } });
  await build({ root, configFile: false, logLevel: "silent", plugins: [plugin], build: { outDir, emptyOutDir: false } });
  assert.equal(readFileSync(join(outDir, "_headers"), "utf8"), MOCKUPS_HEADERS);
});

/** Builds `root` with the mock-ups from `mockupsRoot` and the editor's real `_headers`, served by Cloudflare's asset handler. */
async function serveBuild(root: string, mockupsRoot: string) {
  writeFileSync(join(root, "index.html"), "<!doctype html><title>editor</title>");
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/_headers"), readFileSync(join(repoRoot, "public/_headers"), "utf8"));
  await build({ root, configFile: false, logLevel: "silent", plugins: [mockups(mockupsRoot)], build: { outDir: join(root, "dist") } });
  writeFileSync(join(root, "wrangler.jsonc"), JSON.stringify({ name: "mockups-browser-test", compatibility_date: "2026-09-17", assets: { directory: "./dist" } }));
  return unstable_startWorker({ config: join(root, "wrangler.jsonc"), dev: { server: { port: 0 }, inspector: false, watch: false, logLevel: "none" } });
}

/** A 1×1 transparent PNG. */
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** esm.sh stand-ins, so the browser check needs no network: like the real Yjs build, the first module
 * imports a second esm.sh path (lib0), and the CSP decides before the route answers. */
const esmStub: Record<string, string> = {
  "/yjs@13": 'export * from "/lib0@0.2/stub.mjs";',
  "/lib0@0.2/stub.mjs": "globalThis.esmLoaded = true; export class Doc {}",
};

test("every real mock-up runs in a browser under the sandboxed policy", async () => {
  const { chromium } = await import("@playwright/test");
  const worker = await serveBuild(mkdtempSync(join(scratch, "real-")), repoRoot);
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
      const image = new Image();
      image.src = "12-caret-circle-reference.png";
      const unusedReferenceLoaded = await image.decode().then(() => true, () => false);
      let storage = "open";
      try { void localStorage.length; } catch { storage = "blocked"; }
      return { origin: String(globalThis.origin), cookie: (() => { try { return document.cookie; } catch { return "blocked"; } })(), storage, unusedReferenceLoaded };
    });
    assert.deepEqual(sandbox, { origin: "null", cookie: "blocked", storage: "blocked", unusedReferenceLoaded: false });
    // On purpose against real content: this fails if a mock-up starts using the third-party screenshot.
    const unused = await page.request.get(new URL("mockups/styling/03-unblockwp-panel-reference.png", base).href);
    assert.equal(unused.status(), 404);
    assert.deepEqual(violations, []);
  } finally {
    await browser.close();
    await worker.dispose();
  }
});

test("a mock-up loads an image the plugin copied beside it, under the sandboxed policy", async () => {
  const { chromium } = await import("@playwright/test");
  const root = repo();
  writeFileSync(join(root, "docs/wayfinder/agents/prototypes/12-reference.png"), Buffer.from(onePixelPng, "base64"));
  const worker = await serveBuild(root, root);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const violations: string[] = [];
    page.on("console", message => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()); });
    await page.addInitScript(() => document.addEventListener("securitypolicyviolation", event => console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`)));
    const images: Record<string, number> = {};
    page.on("response", response => { if (response.request().resourceType() === "image") images[response.url().split("/").pop()!] = response.status(); });
    page.on("requestfailed", request => { if (request.resourceType() === "image") images[request.url().split("/").pop()!] = 0; });
    const response = await page.goto(new URL("mockups/agents/14-share.html", await worker.url).href, { waitUntil: "load" });
    assert.equal(response?.status(), 200);
    assert.equal(await page.evaluate(() => (document.querySelector('img[src="12-reference.png"]') as HTMLImageElement).naturalWidth), 1);
    // 11-shared.png sits in another map's folder, so the build leaves it out of this one.
    assert.deepEqual(images, { "12-reference.png": 200, "11-shared.png": 404 });
    assert.deepEqual(violations, []);
  } finally {
    await browser.close();
    await worker.dispose();
  }
});
