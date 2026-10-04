import { expect, test, type Frame, type Page } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Browser proof of the editor-only native master bridge: the real preview host
// and runtime, standalone. Port 5347 (ASE_MASTER_PREVIEW_PORT overrides).
const port = Number(process.env.ASE_MASTER_PREVIEW_PORT ?? 5347);
const root = fileURLToPath(new URL("../../", import.meta.url));
let server: Server;

const copy = `<section class="intro"><h2>Hello</h2><p>Copy text</p></section>`;
const page = `<!doctype html><html><head><title>T</title><link rel="stylesheet" href="styles/site.css"></head><body>\n<!-- shell -->\n<header><p class="top">Top</p></header>\n<main class="page">\n  <p class="before">Before</p>\n  ${copy}\n  <!-- after -->\n</main>\n</body></html>\n`;
const css = `.intro h2 { color: rgb(200, 0, 0); }\n`;
const master = (h2: string, extra = "") => `<!-- intro master -->\n<section class="intro"><h2>${h2}</h2><p>Master text${extra}</p></section>\n`;
const masterPath = ".editor/sections/intro.html";
const sources = { "components/x-note.html": `<p>Note</p>`, "index.html": page, "about/index.html": page.replace("Before", "About"), "styles/site.css": css };
const site = { routes: { "/": "index.html", "/about/": "about/index.html" }, components: { "x-note": "components/x-note.html" } };
const input = (masterSource: string, session = "s1") => ({ session, pagePath: "index.html", pageSource: page, node: [1, 1], basis: copy, masterPath, masterSource });

test.beforeAll(async () => {
  const bundle = await build({ entryPoints: [`${root}tests/native-master-preview/harness.ts`], bundle: true, write: false, format: "esm", loader: { ".css": "empty", ".svg": "text" }, logLevel: "silent" });
  const js = bundle.outputFiles[0].text;
  const runtime = readFileSync(`${root}public/native-preview-runtime.js`, "utf8");
  server = createServer((request, response) => {
    if (request.url === "/native-preview-runtime.js") return response.writeHead(200, { "content-type": "text/javascript" }).end(runtime);
    if (request.url === "/harness.js") return response.writeHead(200, { "content-type": "text/javascript" }).end(js);
    response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><body><div id="host" style="height:900px"></div><script type="module" src="/harness.js"></script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
});
test.afterAll(async () => { await new Promise((resolve) => server?.close(resolve)); });

async function open(page: Page) {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => "start" in window);
  await page.evaluate(([site, sources]) => (window as any).start(site, sources), [site, sources] as const);
  const frame = page.frameLocator("iframe.native-preview-frame");
  await expect(frame.locator("p.before")).toHaveText("Before");
  return { frame, inner: page.frames().find((f) => f !== page.mainFrame()) as Frame };
}
const events = (page: Page, type: string) => page.evaluate((type) => (window as any).events.filter((e: any) => e.type === type), type);
const clearEvents = (page: Page) => page.evaluate(() => { (window as any).events.length = 0; });
const pageHtml = (inner: Frame) => inner.evaluate(() => document.getElementById("page")!.innerHTML);

test("master session renders in place, maps selection, typing and Code edits to the master, and Done restores the copy", async ({ page }) => {
  const { frame, inner } = await open(page);
  const before = await pageHtml(inner);
  await clearEvents(page);
  const status = await page.evaluate(([i]) => (window as any).setMaster(i), [input(master("Master"))] as const);
  expect(status).toEqual({ active: true, session: "s1", pagePath: "index.html", masterPath });
  await expect(frame.locator("section.intro h2")).toHaveText("Master");
  // Everything outside the section is the page's own render.
  const during = await pageHtml(inner);
  const masterHtml = `<section class="intro"><h2>Master</h2><p>Master text</p></section>`;
  expect(during).toBe(before.replace(copy, masterHtml));
  expect(during).toContain("<!-- shell -->");
  // Public CSS still styles the master section.
  await expect(frame.locator("section.intro h2")).toHaveCSS("color", "rgb(200, 0, 0)");

  // The page structure stops at the master's section, at its page place.
  await expect.poll(async () => (await events(page, "structure")).length).toBeGreaterThan(0);
  const items = (await events(page, "structure")).at(-1).structure.items;
  expect(items[1].tag).toBe("main");
  expect(items[1].children[1]).toMatchObject({ tag: "section", node: [1, 1], children: [] });

  // A click on the master's heading selects it as the master file, from its root.
  await clearEvents(page);
  await frame.locator("section.intro h2").click();
  await expect.poll(async () => (await events(page, "select")).at(-1)).toMatchObject({ path: masterPath, node: [0, 0], tag: "h2", reason: "click", paintedSource: master("Master"), masterSession: "s1" });

  // Real typing emits a master text edit for this session.
  await frame.locator("section.intro h2").click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await events(page, "text-edit")).at(-1)).toEqual({ type: "text-edit", path: masterPath, node: [0, 0], before: "Master", after: "Master!", masterSession: "s1" });

  // A page element outside the master is selectable but takes no typing.
  await clearEvents(page);
  await frame.locator("p.before").click();
  await expect.poll(async () => (await events(page, "select")).at(-1)).toMatchObject({ path: "index.html", node: [1, 0] });
  expect(await inner.evaluate(() => document.querySelector("p.before")!.hasAttribute("contenteditable"))).toBe(false);
  await page.keyboard.type("zz");
  await page.keyboard.press("Enter");
  expect(await events(page, "text-edit")).toEqual([]);

  // Code: a new master source renders live, and the Code cursor selects by master path.
  await page.evaluate(([i]) => (window as any).setMaster(i), [input(master("Live"))] as const);
  await expect(frame.locator("section.intro h2")).toHaveText("Live");
  await clearEvents(page);
  await page.evaluate(() => (window as any).preview.selectNode({ path: ".editor/sections/intro.html", node: [0, 1] }));
  await expect.poll(async () => (await events(page, "select")).at(-1)).toMatchObject({ path: masterPath, node: [0, 1], tag: "p", paintedSource: master("Live") });

  // Done: the copy comes back byte for byte.
  const done = await page.evaluate(() => (window as any).setMaster(undefined));
  expect(done).toEqual({ active: false });
  await expect(frame.locator("section.intro h2")).toHaveText("Hello");
  expect(await pageHtml(inner)).toBe(before);
});

test("stale, forged and wrong-session messages are refused; route change ends the session", async ({ page }) => {
  const { frame, inner } = await open(page);
  await page.evaluate(([i]) => (window as any).setMaster(i), [input(master("Master"))] as const);
  await expect(frame.locator("section.intro h2")).toHaveText("Master");
  await clearEvents(page);
  // Forged runtime messages: wrong session token, page path while a master is on show, a forged master node.
  await inner.evaluate(() => {
    const send = (extra: object) => parent.postMessage({ source: "astro-native-preview", type: "text-edit", before: "a", after: "b", ...extra }, "*");
    send({ path: ".editor/sections/intro.html", node: [0, 0], session: "9:s1" });
    send({ path: ".editor/sections/intro.html", node: [0, 0], session: "s1" });
    send({ path: ".editor/sections/intro.html", node: [0, 0] });
    send({ path: "index.html", node: [1, 0] });
    send({ path: ".editor/sections/other.html", node: [0, 0] });
  });
  await page.waitForTimeout(200);
  expect(await events(page, "text-edit")).toEqual([]);

  // Typing begun in one session and committed after a new session is dropped.
  await frame.locator("section.intro h2").click();
  await page.keyboard.press("End");
  await page.keyboard.type("?");
  await page.evaluate(([i]) => (window as any).setMaster(i), [input(master("Other"), "s2")] as const);
  await expect(frame.locator("section.intro h2")).toHaveText("Other");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  expect(await events(page, "text-edit")).toEqual([]);

  // A route change ends the session: its page comes back, nothing is editable as master.
  await page.evaluate(() => (window as any).preview.follow("/about/"));
  await expect(frame.locator("p.before")).toHaveText("About");
  const status = await page.evaluate(() => (window as any).preview.masterEditStatus());
  expect(status.active).toBe(false);
  expect(status.error).toMatch(/not the page on show/);
  await expect(frame.locator("section.intro h2")).toHaveText("Hello");
});

test("invalid sessions are refused without rendering a wrong DOM; scripts and handlers stay stripped", async ({ page }) => {
  const { frame, inner } = await open(page);
  const before = await pageHtml(inner);
  for (const bad of [
    { ...input(master("X")), masterPath: "index.html" },
    { ...input(master("X")), masterPath: ".editor/page-builder.json" },
    { ...input(master("X")), node: [1, 0] },
    { ...input(master("X")), basis: copy.replace("Hello", "Nope") },
    { ...input(master("X")), pageSource: page + " " },
    { ...input("<div>not a section</div>") },
  ]) {
    const status = await page.evaluate(([i]) => (window as any).setMaster(i), [bad] as const);
    expect(status.active).toBe(false);
    expect(status.error).toBeTruthy();
  }
  await page.waitForTimeout(100);
  expect(await pageHtml(inner)).toBe(before);

  const hostile = `<section class="intro" onclick="window.pwned=1"><h2>Safe<script>window.pwned=1</script></h2><p><a href="javascript:window.pwned=1">x</a></p></section>`;
  await page.evaluate(([i]) => (window as any).setMaster(i), [input(hostile)] as const);
  await expect(frame.locator("section.intro h2")).toHaveText("Safe");
  const markup = await inner.evaluate(() => document.querySelector("section.intro")!.outerHTML);
  expect(markup).not.toMatch(/script|onclick|javascript:/i);
  await frame.locator("section.intro a").click();
  expect(await inner.evaluate(() => (window as any).pwned)).toBeUndefined();
});

const option = (page: Page) => page.locator(".pb-add-panel .pb-add-item__option").filter({ hasText: "Note" });
async function openAdd(page: Page) {
  if (!(await option(page).isVisible())) await page.locator("#add").click();
}
async function chooseNote(page: Page) {
  await openAdd(page);
  await expect(option(page)).toBeVisible();
  await option(page).focus();
  await page.keyboard.press("Enter");
}

test("Add inserts on the page without a master; a master session disables and closes it, and Done restores it", async ({ page }) => {
  const { frame } = await open(page);
  // Control: the real Add button and choice insert into the page.
  await frame.locator("p.before").click();
  await chooseNote(page);
  await expect.poll(() => events(page, "insert")).toEqual([{ type: "insert", point: { path: "index.html", parent: [1], index: 2 }, tag: "x-note" }]);
  await clearEvents(page);

  // A panel left open when a session starts closes, and its stale option inserts nothing.
  await openAdd(page);
  await expect(option(page)).toBeVisible();
  const stale = await option(page).elementHandle();
  await page.evaluate(([i]) => (window as any).setMaster(i), [input(master("Master"))] as const);
  await expect(frame.locator("section.intro h2")).toHaveText("Master");
  await expect(page.locator(".pb-add-panel:visible")).toHaveCount(0);
  await expect(page.locator("#add")).toBeDisabled();
  await stale!.evaluate((el: HTMLElement) => el.click());
  await stale!.evaluate((el: HTMLElement) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  // The button stays inert while the session lasts.
  await frame.locator("p.before").click();
  await page.locator("#add").click({ force: true });
  await expect(page.locator(".pb-add-panel:visible")).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(await events(page, "insert")).toEqual([]);

  // Done: Add is back and inserts again.
  await page.evaluate(() => (window as any).setMaster(undefined));
  await expect(frame.locator("section.intro h2")).toHaveText("Hello");
  await expect(page.locator("#add")).toBeEnabled();
  await chooseNote(page);
  await expect.poll(async () => (await events(page, "insert")).length).toBe(1);
});

test("a route change restores Add; History keeps it off after a session ends", async ({ page }) => {
  const { frame } = await open(page);
  await page.evaluate(([i]) => (window as any).setMaster(i), [input(master("Master"))] as const);
  await expect(page.locator("#add")).toBeDisabled();
  await page.evaluate(() => (window as any).preview.follow("/about/"));
  await expect(frame.locator("p.before")).toHaveText("About");
  await expect(page.locator("#add")).toBeEnabled();

  // History on show, then a session starts and ends: Add stays off until History closes.
  await page.evaluate(() => (window as any).preview.follow("/"));
  await expect(frame.locator("p.before")).toHaveText("Before");
  await page.evaluate(() => (window as any).preview.setViewing(document.createElement("div")));
  await expect(page.locator("#add")).toBeDisabled();
  await page.evaluate(([i]) => (window as any).setMaster(i), [input(master("Master"))] as const);
  await page.evaluate(() => (window as any).setMaster(undefined));
  await expect(page.locator("#add")).toBeDisabled();
  await page.evaluate(() => (window as any).preview.setViewing(undefined));
  await expect(page.locator("#add")).toBeEnabled();
});
