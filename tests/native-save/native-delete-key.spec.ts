import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Default native-starter fixture; nightly selection keys on canvas and Structure.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const focusCanvas = (page: Page) => frame(page).locator("body").evaluate(body => { body.tabIndex = -1; body.focus(); });
async function selected(page: Page, selector: string) {
  const box = await frame(page).locator('[data-native-selection-box="selected"]').boundingBox();
  const element = await frame(page).locator(selector).boundingBox();
  return Boolean(box && element && Math.abs(box.y - element.y) <= 2 && Math.abs(box.height - element.height) <= 2);
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero .lead")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
});

test("Delete removes a selected paragraph, selects the next sibling, and one keyboard undo restores it", async ({ page }) => {
  const original = await source(page);
  await frame(page).locator(".hero .lead").click();
  await expect(bar(page).getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await expect(frame(page).locator(".hero .lead")).not.toHaveAttribute("contenteditable", /.+/);
  await focusCanvas(page);
  await page.keyboard.press("Delete");
  await expect(frame(page).locator(".hero .lead")).toHaveCount(0);
  await expect.poll(() => selected(page, ".hero img")).toBe(true);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => source(page)).toBe(original);
  await expect(frame(page).locator(".hero .lead")).toHaveCount(1);
});

test("Backspace and Delete while typing remove one character each and keep the paragraph", async ({ page }) => {
  const paragraph = frame(page).locator(".hero .lead");
  const text = (await paragraph.textContent())!;
  await paragraph.dblclick();
  await expect(paragraph).toHaveAttribute("contenteditable", /.+/);
  await paragraph.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press("Backspace");
  await expect(paragraph).toHaveText(text.slice(0, -1));
  await paragraph.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(true);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press("Delete");
  await expect(paragraph).toHaveText(text.slice(1, -1));
  await expect(paragraph).toHaveCount(1);
});

test("Structure has no delete icon; focused row Delete removes it and focuses the next selected row", async ({ page }) => {
  await frame(page).locator('[data-key="filler-1"]').click();
  const row = page.getByRole("treeitem", { name: /^Paragraph This section adds/ });
  await expect(row).toBeVisible();
  await expect(page.locator(".page-structure__row").getByRole("button", { name: /^(Remove|Delete)$/ })).toHaveCount(0);
  await row.focus();
  await page.keyboard.press("Delete");
  await expect(frame(page).locator('[data-key="filler-1"]')).toHaveCount(0);
  const next = page.getByRole("treeitem", { name: /^Paragraph Paragraph two/ });
  await expect(next).toHaveAttribute("aria-selected", "true");
  await expect(next).toBeFocused();
  await next.press("Backspace");
  await expect(frame(page).locator('[data-key="filler-2"]')).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: /^Paragraph Paragraph three/ })).toBeFocused();
});

test("Delete protects main, page header/footer, and parts inside instances", async ({ page }) => {
  const original = await source(page);
  for (const name of [/^Main/, /^Site header/, /^Site footer/]) {
    const row = page.getByRole("treeitem", { name }).first();
    await row.focus();
    await row.press("Delete");
    await expect(row).toBeAttached();
    await expect.poll(() => source(page)).toBe(original);
  }
  await frame(page).locator('project-card [slot="body"]').first().click();
  await expect(bar(page).getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await focusCanvas(page);
  await page.keyboard.press("Delete");
  await expect.poll(() => source(page)).toBe(original);
});


test("host Backspace with nothing focused runs the bar's Remove; a sole child selects its parent", async ({ page, baseURL }) => {
  const html = '<!doctype html><html><head><title>Delete fixture</title></head><body><main><section><p>Only paragraph</p></section></main></body></html>';
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: html } })).status()).toBe(204);
  await page.reload();
  await expect(frame(page).locator("p")).toBeVisible();
  await editorMounted(page);
  await frame(page).locator("p").click();
  await expect(bar(page).getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await page.locator("body").evaluate(body => { body.tabIndex = -1; body.focus(); });
  await page.keyboard.press("Backspace");
  await expect(frame(page).locator("p")).toHaveCount(0);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect.poll(() => selected(page, "section")).toBe(true);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => source(page)).toBe(html);
});
