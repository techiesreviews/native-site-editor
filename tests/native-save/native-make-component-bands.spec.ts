import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { editorMounted, effectiveSource, storedDraft } from "./drafts";

// Default native-save fixture group. Both routes begin with the same plain page bands.
const source = readFileSync("tests/fixtures/native-make-component-bands.html", "utf8");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const row = (page: Page, band: "header" | "footer") => page.getByRole("tree", { name: "Page structure" }).locator(`[data-node="${band === "header" ? 0 : 2}"]`).first();

async function open(page: Page, baseURL: string | undefined, position: "sticky" | "fixed" = "sticky") {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  const css = await (await page.request.get(`${baseURL}/__demo/file?path=styles/site.css`)).text();
  for (const [path, content] of [
    ["index.html", source], ["about/index.html", source],
    ["styles/site.css", `${css}\nbody { margin: 0; } header.page-header.page-header {
      --pin: sticky; position: ${position === "sticky" ? "var(--pin)" : "fixed"} !important; --offset: 0px; top: var(--offset); z-index: 20;
      ${position === "fixed" ? "left: 0; width: 100%;" : ""} }
      header.page-header:hover { --offset: 20px; }
      @media (max-width: 600px) { header.page-header.page-header { width: auto; } }
      [data-tone="dark"] { --band-bg: rgb(17, 17, 17); }
      .page-header { padding: 16px; background: var(--band-bg, white); } .page-header h2 { margin: 0; }
      main { min-block-size: 2200px; } .page-footer { padding: 16px; }`],
  ]) {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).ok()).toBe(true);
  }
  await page.reload();
  await editorMounted(page);
  await expect(frame(page).getByRole("banner")).toBeVisible();
  await expect(frame(page).locator("header")).toHaveCSS("position", position);
}

async function make(page: Page, band: "header" | "footer", entry: "edit bar" | "Structure") {
  if (entry === "edit bar") {
    await row(page, band).locator(".page-structure__label").first().click();
    await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  } else {
    await row(page, band).hover();
    await row(page, band).getByRole("button", { name: /^Actions for / }).click();
    await page.getByRole("menuitem", { name: "Make component", exact: true }).click();
  }
  await expect(page.locator(".edit-mode__title")).toHaveText(`Editing<block-page-${band}>`);
  await expect(frame(page).locator("[data-native-selection-box=edit-frame]")).toBeVisible();
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(frame(page).locator(`block-page-${band}`)).toHaveCSS("display", "contents");
}

async function scrolledOffset(page: Page, hovered: boolean) {
  // Keep the pointer out of the frame when measuring the resting state.
  await page.mouse.move(0, 0);
  await frame(page).locator("body").evaluate(() => window.scrollTo(0, 700));
  await expect.poll(() => frame(page).locator("body").evaluate(() => window.scrollY)).toBeGreaterThan(600);
  const header = frame(page).locator("header");
  if (hovered) await header.hover({ position: { x: 8, y: 35 }, timeout: 15_000 });
  await expect(header).toHaveCSS("top", hovered ? "20px" : "0px");
  await expect.poll(() => header.evaluate(el => el.getBoundingClientRect().top)).toBeCloseTo(hovered ? 20 : 0, 0);
  return header.evaluate(el => el.getBoundingClientRect().top);
}

async function headerWidth(page: Page, narrow: boolean) {
  await page.setViewportSize({ width: narrow ? 880 : 1600, height: 1000 });
  const width = await frame(page).locator("body").evaluate(() => window.innerWidth);
  expect(width > 600).toBe(!narrow);
  return frame(page).locator("header").evaluate(el => el.getBoundingClientRect().width);
}

async function expectOutline(page: Page, band: "header" | "footer", kind = "selected") {
  const outline = frame(page).locator(`[data-native-selection-box=${kind}]`);
  await expect(outline).toBeVisible();
  // Compare inside the frame so both rectangles use the same coordinates.
  await expect.poll(() => outline.evaluate((el, tag) => {
    const host = document.querySelector(`block-page-${tag}`)!;
    const shown = host.shadowRoot!.querySelector(tag)!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return Math.max(Math.abs(box.left - shown.left), Math.abs(box.top - shown.top), Math.abs(box.width - shown.width), Math.abs(box.height - shown.height));
  }, band)).toBeLessThan(1);
  await expect(bar(page)).toBeVisible();
  const box = await bar(page).boundingBox();
  expect(box!.width).toBeGreaterThan(0);
}

for (const entry of ["edit bar", "Structure"] as const) {
  for (const position of ["sticky", "fixed"] as const) {
    test(`${entry} preserves the page's ${position} header states and widths; one Undo restores this page only`, async ({ page, baseURL }) => {
      await open(page, baseURL, position);
      const before = await effectiveSource(page, baseURL, "index.html");
      const resting = await scrolledOffset(page, false);
      const hovered = await scrolledOffset(page, true);
      const wide = await headerWidth(page, false);
      const narrow = await headerWidth(page, true);
      if (position === "fixed") expect(narrow).toBeLessThan(wide / 2);
      await headerWidth(page, false);
      await make(page, "header", entry);
      expect(await scrolledOffset(page, false)).toBeCloseTo(resting, 0);
      expect(await scrolledOffset(page, true)).toBeCloseTo(hovered, 0);
      expect(await headerWidth(page, false)).toBeCloseTo(wide, 0);
      expect(await headerWidth(page, true)).toBeCloseTo(narrow, 0);
      await expect(frame(page).getByRole("banner")).toHaveCount(1);
      await expect(frame(page).getByRole("contentinfo")).toHaveCount(1);
      await expect.poll(async () => (await storedDraft(page, "components/block-page-header/block-page-header.html"))?.content).toContain("<header");
      const css = (await storedDraft(page, "components/block-page-header/block-page-header.css"))!.content;
      expect(css).toContain("display: contents");
      expect(css).not.toContain("position:");
      expect(await effectiveSource(page, baseURL, "about/index.html")).toBe(source);
      expect(await storedDraft(page, "about/index.html")).toBeUndefined();
      await page.locator(".code-editor__undo").first().click();
      await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
      for (const extension of ["html", "css"]) await expect.poll(() => storedDraft(page, `components/block-page-header/block-page-header.${extension}`)).toBeUndefined();
      await expect(frame(page).locator("block-page-header")).toHaveCount(0);
    });
  }

  test(`${entry} makes the footer, preserves contentinfo and selects its boxless instance; one Undo restores it`, async ({ page, baseURL }) => {
    await open(page, baseURL);
    const before = await effectiveSource(page, baseURL, "index.html");
    await make(page, "footer", entry);
    await expect(frame(page).getByRole("contentinfo")).toHaveCount(1);
    await expect(frame(page).getByRole("banner")).toHaveCount(1);
    await row(page, "footer").locator(".page-structure__label").first().click();
    await expectOutline(page, "footer");
    expect(await effectiveSource(page, baseURL, "about/index.html")).toBe(source);
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
    for (const extension of ["html", "css"]) await expect.poll(() => storedDraft(page, `components/block-page-footer/block-page-footer.${extension}`)).toBeUndefined();
  });
}

test("a boxless header selects from canvas and Structure, offers Tone, and keeps the page header's Remove/drag protection", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await make(page, "header", "edit bar");
  const header = frame(page).locator("header");
  await frame(page).locator("main h1").click();
  await header.hover({ position: { x: 8, y: 35 }, timeout: 15_000 });
  await expectOutline(page, "header", "hover");
  await expect(frame(page).locator("[data-native-selection-box=label]")).toHaveText("block-page-header");
  await header.click({ position: { x: 8, y: 35 }, timeout: 15_000 });
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Block page header");
  await expectOutline(page, "header");
  await frame(page).locator("main h1").click();
  await row(page, "header").locator(".page-structure__label").first().click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Block page header");
  await expectOutline(page, "header");
  const tone = bar(page).getByRole("combobox", { name: "Tone", exact: true });
  await tone.selectOption({ label: "Dark" });
  await expect(frame(page).locator("block-page-header")).toHaveAttribute("data-tone", "dark");
  await expect(header).toHaveCSS("background-color", "rgb(17, 17, 17)");
  await expect(bar(page).getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await expect(bar(page).locator('[title*="drag to move"]')).toHaveCount(0);
  // A protected page header does not start a Structure drag, even once it is a component.
  const label = row(page, "header").locator(".page-structure__label").first();
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8, box.y + 48, { steps: 5 });
  await expect(page.locator(".pb-drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  await expect(frame(page).locator("block-page-header")).toHaveCount(1);
});
