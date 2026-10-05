import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env.ASE_SHARED_STRUCTURE_PORT ?? 5338);
let server: Server;
test.beforeAll(async () => {
  const bundle = await build({ entryPoints: [`${root}tests/native-shared-structure/harness.ts`], bundle: true, write: false, format: "esm", loader: { ".css": "empty", ".svg": "text" }, logLevel: "silent" });
  const css = ["src/theme.css", "src/page-builder/components.css", "src/components/page-structure.css", "src/components/row-action-overlay.css", "src/ui/inline-field.css", "src/components/native-shared-authoring.css"].map(path => readFileSync(root + path, "utf8")).join("\n");
  server = createServer((request, response) => {
    if (request.url === "/harness.js") return response.writeHead(200, { "content-type": "text/javascript" }).end(bundle.outputFiles[0].text);
    response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><style>${css} body { font: 13px system-ui; color: var(--text); background: var(--surface); } #host { width: 280px; padding: 20px; background: var(--surface-subtle); }</style><aside id="host"></aside><script type="module" src="/harness.js"></script>`);
  });
  await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
});
test.afterAll(async () => { await new Promise(resolve => server?.close(resolve)); });
test.beforeEach(async ({ page }) => { await page.goto(`http://127.0.0.1:${port}`); await page.waitForFunction(() => "sidebar" in window); });
const row = (page: any, node: string) => page.locator(`[role=treeitem][data-node="${node}"]`);
const events = (page: any) => page.evaluate(() => (window as any).events);

test("ordinary roots offer sharing; children and managed cards stay ordinary instance rows", async ({ page }) => {
  expect(await page.getByRole("button", { name: "Save shared", exact: true }).count()).toBe(3);
  await expect(row(page, "1.1").getByRole("button")).toHaveCount(0);
  await expect(row(page, "1.0.0").getByRole("button")).toHaveCount(0);
  await row(page, "0").click();
  expect((await events(page)).at(-1)).toEqual({ type: "select", path: "index.html", node: [0] });
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await row(page, "1.0").locator(".page-structure__toggle").click();
  await row(page, "1.0.0").click();
  expect((await events(page)).at(-1)).toEqual({ type: "select", path: "index.html", node: [1, 0, 0] });
  await page.evaluate(() => (window as any).disable());
  await expect(page.getByRole("button", { name: "Save shared", exact: true })).toHaveCount(0);
});

test("linked root wears diamond/label, far-right faded actions, while ordinary click selects instance", async ({ page }) => {
  await page.evaluate(() => (window as any).change("linked"));
  const hero = row(page, "1.0");
  await expect(hero.locator(".page-structure__kind")).toHaveText("Section hero");
  await expect(hero.locator(".component-mark")).toHaveCount(1);
  await hero.click();
  expect((await events(page)).at(-1)).toEqual({ type: "select", path: "index.html", node: [1, 0] });
  await hero.hover();
  await hero.getByRole("button", { name: "Edit component", exact: true }).click();
  expect((await events(page)).at(-1)).toEqual({ type: "edit" });
  await hero.getByRole("button", { name: "Disconnect this instance", exact: true }).click();
  expect((await events(page)).at(-1)).toEqual({ type: "disconnect" });
  await expect(hero.getByRole("button")).toHaveCount(2);
  await expect(page.locator(".page-structure__inline")).toHaveCount(0);
  await page.screenshot({ path: ".scratch/native-shared-structure/linked-row.png" });
});

test("sharing opens inline below root, survives unchanged updates, Escape restores row focus", async ({ page }) => {
  const hero = row(page, "1.0");
  await hero.hover();
  await hero.getByRole("button", { name: "Save shared", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toBeFocused();
  await name.fill("Typed name");
  await page.evaluate(() => (window as any).recheck());
  await expect(name).toHaveValue("Typed name");
  await expect(hero).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "1.0.0")).toBeVisible();
  expect(await page.getByRole("dialog").count()).toBe(0);
  await page.screenshot({ path: ".scratch/native-shared-structure/inline-authoring.png" });
  await name.press("Escape");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(hero).toBeFocused();
  expect((await events(page)).at(-1)).toMatchObject({ type: "close", reason: "cancel" });
});

test("source/context changes cancel old pending form; old success cannot close new draft", async ({ page }) => {
  await row(page, "0").hover();
  await row(page, "0").getByRole("button", { name: "Save shared", exact: true }).click();
  await page.locator(".native-shared-authoring").getByRole("button", { name: "Save shared", exact: true }).click();
  await page.evaluate(() => (window as any).change("available"));
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect((await events(page)).at(-1)).toMatchObject({ type: "close", reason: "cancel", key: "1:0" });
  await row(page, "2").hover();
  await row(page, "2").getByRole("button", { name: "Save shared", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("New footer draft");
  await page.evaluate(() => (window as any).finish(0, { success: true }));
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("New footer draft");
  await page.evaluate(() => (window as any).stale());
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save shared", exact: true })).toHaveCount(0);
});
