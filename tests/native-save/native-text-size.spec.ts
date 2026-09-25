import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Text size offers the site's own sizes (src/native-text-size.ts): size
// classes when its stylesheets define them (fixtures/native-routing's
// site.css: .text-small, .text-large), else size variables on :root
// (fixtures/native-conventions' base.css, imported by site.css: --text-s,
// --text-m, --text-l). The starter fixture, with neither, keeps the inline
// rem scale (native-edit-bar.spec.ts).
const indexPath = "src/pages/index.html";

async function open(page: Page, baseURL: string | undefined, repo: number) {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function editorText(page: Page) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const size = (page: Page) => bar(page).getByRole("combobox", { name: "Text size" });
const options = (page: Page) => size(page).locator("option").allTextContents();

test("a site with size classes gets them in Text size, written as a class", async ({ page, baseURL }) => {
  const source = readFileSync(resolve("fixtures/native-routing", indexPath), "utf8");
  await open(page, baseURL, 530);
  const lead = page.frameLocator(".native-preview-frame").locator("p[data-key=lead]");
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect.poll(() => options(page)).toEqual(["Default", "Small", "Large"]);
  await expect(size(page)).toHaveValue("default");
  await size(page).selectOption("text-large");
  await expect(lead).toHaveCSS("font-size", "23px");
  await expect(page.locator("#status")).toHaveText("Text size Large");
  await expect(size(page)).toHaveValue("text-large");
  await expect.poll(() => editorText(page)).toBe(source.replace(`<p data-key="lead">`, `<p data-key="lead" class="text-large">`));
  await size(page).selectOption("text-small");
  await expect(lead).toHaveCSS("font-size", "13px");
  await expect.poll(() => editorText(page)).toBe(source.replace(`<p data-key="lead">`, `<p data-key="lead" class="text-small">`));
  await size(page).selectOption("default");
  await expect.poll(() => editorText(page)).toBe(source);
});

test("a site with size variables gets them in Text size, written as var() inline", async ({ page, baseURL }) => {
  const source = readFileSync(resolve("fixtures/native-conventions", indexPath), "utf8");
  await open(page, baseURL, 531);
  const frame = page.frameLocator(".native-preview-frame");
  // The imported layer files have loaded.
  await expect(frame.locator("h1")).toHaveCSS("color", "rgb(47, 109, 58)");
  const lead = frame.locator("p[data-key=lead]");
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect.poll(() => options(page)).toEqual(["Default", "S", "M", "L"]);
  await size(page).selectOption("--text-l");
  await expect(lead).toHaveCSS("font-size", "22px");
  await expect(page.locator("#status")).toHaveText("Text size L");
  await expect(size(page)).toHaveValue("--text-l");
  await expect.poll(() => editorText(page)).toBe(source.replace(`<p data-key="lead">`, `<p data-key="lead" style="font-size: var(--text-l)">`));
  await size(page).selectOption("default");
  await expect.poll(() => editorText(page)).toBe(source);
});
