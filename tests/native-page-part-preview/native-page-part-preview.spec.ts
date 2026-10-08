import { expect, test, type Frame, type Page } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Browser proof of the editor-only native master bridge: the real preview host
// and runtime, standalone. Port 5338 (ASE_PAGE_PART_PREVIEW_PORT overrides).
const port = Number(process.env.ASE_PAGE_PART_PREVIEW_PORT ?? 5338);
const root = fileURLToPath(new URL("../../", import.meta.url));
let server: Server;

const copy = `<section class="intro"><h2>Hello</h2><p>Copy text</p></section>`;
const page = `<!doctype html><html><head><title>T</title><link rel="stylesheet" href="styles/site.css"></head><body>\n<!-- shell -->\n<header><p class="top">Top</p></header>\n<main class="page">\n  <p class="before">Before</p>\n  ${copy}\n  <!-- after -->\n</main>\n</body></html>\n`;
const css = `.intro h2 { color: rgb(200, 0, 0); }\n`;
const sources = { "components/x-note.html": `<p>Note</p>`, "index.html": page, "about/index.html": page.replace("Before", "About"), "styles/site.css": css };
const site = { routes: { "/": "index.html", "/about/": "about/index.html" }, components: { "x-note": "components/x-note.html" } };

test.beforeAll(async () => {
  const bundle = await build({ entryPoints: [`${root}tests/native-page-part-preview/harness.ts`], bundle: true, write: false, format: "esm", loader: { ".css": "empty", ".svg": "text" }, logLevel: "silent" });
  const js = bundle.outputFiles[0].text;
  const runtime = readFileSync(`${root}src/components/native-preview-runtime.js`, "utf8");
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

for (const tag of ["header", "footer"] as const) {
  test(`${tag} bridge preserves root, maps local selection/typing/Code, locks outside and restores copy`, async ({ page }) => {
    const { frame, inner } = await open(page);
    const part = `<${tag} class="site-part"><h2>Copy</h2><p>Copy text</p></${tag}>`;
    const publicPage = `<html><head><title>Parts</title></head><body><div>${part}</div><main><p class="outside">Outside</p></main></body></html>`;
    const path = `.editor/page-parts/site-${tag}.html`;
    const masterSource = `<!-- editor comment -->\n<${tag} class="site-part"><h2>Master</h2><p>Master text</p></${tag}>`;
    const partSources = { "index.html": publicPage, [path]: masterSource };
    const partInput = { kind: "page-part", rootTag: tag, session: `${tag}-session`, pagePath: "index.html", pageSource: publicPage,
      node: [0, 0], basis: part, masterPath: path, masterSource };
    await page.evaluate(([sources, input]) => (window as any).setMaster(input, sources), [partSources, partInput] as const);
    await expect(frame.locator(`${tag}.site-part h2`)).toHaveText("Master");
    expect(await frame.locator("section.site-part").count()).toBe(0);
    await clearEvents(page);
    await frame.locator(`${tag}.site-part h2`).click();
    await expect.poll(async () => (await events(page, "select")).at(-1)).toMatchObject({ path, node: [0, 0], tag: "h2", paintedSource: masterSource, masterSession: `${tag}-session` });
    await frame.locator(`${tag}.site-part h2`).click();
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await events(page, "text-edit")).at(-1)).toMatchObject({ path, node: [0, 0], before: "Master", after: "Master!", masterSession: `${tag}-session` });
    await clearEvents(page);
    await frame.locator("p.outside").click();
    expect(await frame.locator("p.outside").getAttribute("contenteditable")).toBeNull();
    await page.keyboard.type("ignored");
    await page.keyboard.press("Enter");
    expect(await events(page, "text-edit")).toEqual([]);
    const live = masterSource.replace("Master text", "Code text");
    await page.evaluate(([input, sources]) => (window as any).setMaster(input, sources), [{ ...partInput, masterSource: live }, { ...partSources, [path]: live }] as const);
    await expect(frame.locator(`${tag}.site-part p`)).toHaveText("Code text");
    await clearEvents(page);
    await page.evaluate(path => (window as any).preview.selectNode({ path, node: [0, 1] }), path);
    await expect.poll(async () => (await events(page, "select")).at(-1)).toMatchObject({ path, node: [0, 1], tag: "p", paintedSource: live });
    // A stale runtime token cannot write after a replacement host session.
    await inner.evaluate(path => parent.postMessage({ source: "astro-native-preview", type: "text-edit", path, node: [0, 0], before: "Master", after: "Forged", session: "old" }, "*"), path);
    expect(await events(page, "text-edit")).toEqual([]);
    await page.evaluate(() => (window as any).setMaster(undefined));
    await expect(frame.locator(`${tag}.site-part h2`)).toHaveText("Copy");
    expect(await frame.locator(`${tag}.site-part p`).textContent()).toBe("Copy text");
  });
}

test("page-part variant refuses wrong tag and section-folder scope", async ({ page }) => {
  await open(page);
  for (const extra of [{ rootTag: "footer" }, { masterPath: ".editor/sections/header.html" }]) {
    const part = '<header class="top"><p>Part</p></header>';
    const pageSource = `<html><body>${part}</body></html>`;
    const input = { kind: "page-part", rootTag: "header", session: "part", pagePath: "index.html", pageSource, node: [0], basis: part,
      masterPath: ".editor/page-parts/header.html", masterSource: part, ...extra };
    const status = await page.evaluate(([input, sources]) => (window as any).setMaster(input, sources), [input, { "index.html": pageSource }] as const);
    expect(status.active).toBe(false);
    expect(status.error).toBeTruthy();
  }
});

test("banner preserves section baseline and labels explicit header/footer variant", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).banner.show({ label: "Intro", htmlPath: ".editor/sections/intro.html" }));
  await expect(page.getByRole("region", { name: "Saved section master" })).toBeVisible();
  await expect(page.locator(".master-banner__text")).toHaveText("Editing Intro master");
  await expect(page.getByRole("button", { name: "Update copies" })).toHaveAttribute("title", "Update every copy on the site that you haven't changed");
  await page.evaluate(() => (window as any).banner.show({ kind: "page-part", rootTag: "footer", label: "Footer", htmlPath: ".editor/page-parts/footer.html", masterError: "Invalid root" }));
  await expect(page.getByRole("region", { name: "Shared footer master" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update copies" })).toBeDisabled();
  await page.evaluate(() => (window as any).banner.show({ label: "Intro", htmlPath: ".editor/sections/intro.html" }));
  await expect(page.getByRole("region", { name: "Saved section master" })).toBeVisible();
});
