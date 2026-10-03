import { expect, test, type Page } from "@playwright/test";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
async function history(page: Page, direction: "undo" | "redo") {
  expect(await page.evaluate(async direction => (await import("/src/components/code-editor.ts")).runVisualHistory(direction, "index.html"), direction)).toBe(true);
}
test("metadata compound history preserves the earlier visual step through Undo and Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const original = await source(page);
  await frame(page).locator(".hero h1").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("combobox", { name: "Heading level" }).selectOption("h2");
  await expect(frame(page).locator(".hero h2")).toBeVisible();
  const heading = await source(page);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("Guarded history title");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(settings).toBeHidden();
  await expect.poll(() => source(page)).toContain("Guarded history title");
  const applied = await source(page);
  await history(page, "undo"); await expect.poll(() => source(page)).toBe(heading);
  await history(page, "undo"); await expect.poll(() => source(page)).toBe(original);
  await history(page, "redo"); await expect.poll(() => source(page)).toBe(heading);
  await history(page, "redo"); await expect.poll(() => source(page)).toBe(applied);
});
