import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { editorMounted, effectiveSource, storedDraft } from "./drafts";

// Default native-save fixture group. Both routes begin with the same plain page bands.
const source = readFileSync("tests/fixtures/native-make-component-bands.html", "utf8");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");

async function open(page: Page, baseURL: string | undefined, position: "sticky" | "fixed" = "sticky") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  const css = await (await page.request.get(`${baseURL}/__demo/file?path=styles/site.css`)).text();
  for (const [path, content] of [
    ["index.html", source], ["about/index.html", source],
    ["styles/site.css", `${css}\nbody { margin: 0; } body > header.page-header.page-header { position: ${position} !important; top: 0; z-index: 20; }
      .page-header { padding: 16px; background: white; } .page-header h2 { margin: 0; }
      main { min-block-size: 2200px; } .page-footer { padding: 16px; }`],
  ]) {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).ok()).toBe(true);
  }
  await page.reload();
  await editorMounted(page);
  await expect(frame(page).getByRole("banner")).toBeVisible();
}

async function make(page: Page, band: "header" | "footer", entry: "edit bar" | "Structure") {
  const row = page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: new RegExp(`^${band === "header" ? "Header" : "Footer"}\\b`) }).first();
  if (entry === "edit bar") {
    await row.locator(".page-structure__label").first().click();
    await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Make component", exact: true }).click();
  } else {
    await row.hover();
    await row.getByRole("button", { name: /^Actions for / }).click();
    await page.getByRole("menuitem", { name: "Make component", exact: true }).click();
  }
  await expect(page.locator(".edit-mode__title")).toHaveText(`Editing<block-page-${band}>`);
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
}

for (const entry of ["edit bar", "Structure"] as const) {
  for (const position of ["sticky", "fixed"] as const) {
    test(`${entry} makes the page's ${position} header on this page only; one Undo restores it`, async ({ page, baseURL }) => {
      await open(page, baseURL, position);
      const before = await effectiveSource(page, baseURL, "index.html");
      const top = () => frame(page).locator("header").evaluate(el => el.getBoundingClientRect().top);
      const height = await frame(page).locator("header").evaluate(el => el.getBoundingClientRect().height);
      await make(page, "header", entry);
      const host = frame(page).locator("block-page-header");
      await expect(host).toHaveCount(1);
      await expect(host).toHaveCSS("position", position);
      await expect(host).toHaveCSS("z-index", "20");
      expect(await host.evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(height, 0);
      await expect(frame(page).getByRole("banner")).toHaveCount(1);
      await expect(frame(page).getByRole("contentinfo")).toHaveCount(1);
      await expect.poll(async () => (await storedDraft(page, "components/block-page-header/block-page-header.html"))?.content).toContain("<header");
      expect(await effectiveSource(page, baseURL, "about/index.html")).toBe(source);
      expect(await storedDraft(page, "about/index.html")).toBeUndefined();
      await frame(page).locator("body").evaluate(() => window.scrollTo(0, 700));
      await expect.poll(() => frame(page).locator("body").evaluate(() => window.scrollY)).toBeGreaterThan(600);
      await expect.poll(top).toBeCloseTo(0, 0);
      await page.locator(".code-editor__undo").first().click();
      await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
      for (const extension of ["html", "css"]) await expect.poll(() => storedDraft(page, `components/block-page-header/block-page-header.${extension}`)).toBeUndefined();
      await expect(frame(page).locator("block-page-header")).toHaveCount(0);
    });
  }

  test(`${entry} makes the page's footer and preserves its contentinfo landmark; one Undo restores it`, async ({ page, baseURL }) => {
    await open(page, baseURL);
    const before = await effectiveSource(page, baseURL, "index.html");
    await make(page, "footer", entry);
    await expect(frame(page).locator("block-page-footer")).toHaveCount(1);
    await expect(frame(page).getByRole("contentinfo")).toHaveCount(1);
    await expect(frame(page).getByRole("banner")).toHaveCount(1);
    expect(await effectiveSource(page, baseURL, "about/index.html")).toBe(source);
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
    for (const extension of ["html", "css"]) await expect.poll(() => storedDraft(page, `components/block-page-footer/block-page-footer.${extension}`)).toBeUndefined();
  });
}
