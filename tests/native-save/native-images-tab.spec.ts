import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
const pane = (page: Page) => page.getByRole("region", { name: "Images", exact: true });
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
test("Images is a real third tab with keyboard navigation and persistent query and detail state", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.locator("#media-library-toggle")).toHaveCount(0);
  await expect(page.locator("dialog.media-library")).toHaveCount(0);
  await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await page.getByRole("tab", { name: "Images", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Pages", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(page.getByRole("tab", { name: "Images", exact: true })).toBeFocused();
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("studio-desk");
  await expect(pane(page).getByLabel("Default alt text", { exact: true })).toBeVisible();
  await page.keyboard.press("Home"); await expect(page.getByRole("tab", { name: "Pages", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight"); await expect(page.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End"); await expect(page.getByRole("tab", { name: "Images", exact: true })).toHaveAttribute("aria-selected", "true");
});
test("metadata Undo and Redo refresh open detail fields while preserving query", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  const before = await pane(page).getByLabel("Default alt text", { exact: true }).inputValue();
  await pane(page).getByLabel("Default alt text", { exact: true }).fill("Host refresh portrait");
  await pane(page).getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Host refresh portrait");
  await page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"); });
  await expect(pane(page).getByLabel("Default alt text", { exact: true })).toHaveValue(before);
  await page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("redo", "index.html"); });
  await expect(pane(page).getByLabel("Default alt text", { exact: true })).toHaveValue("Host refresh portrait");
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("studio-desk");
});
test("scope change disposes old controls and remounts clean image query state", async ({ page, baseURL }) => {
  await open(page, baseURL); await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await pane(page).getByLabel("Default alt text", { exact: true }).fill("Stale scope alt");
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature" } });
  await page.evaluate(() => { (window as any).oldImageSave = [...document.querySelectorAll<HTMLButtonElement>("#explorer-images button")].find(button => button.textContent === "Save metadata"); location.hash = "repo=501&branch=feature&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with feature");
  await page.evaluate(() => (window as any).oldImageSave.click());
  if (!await page.locator("#explorer").evaluate(element => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("");
  expect((await storedDraft(page, ".editor/media.json"))?.content ?? "").not.toContain("Stale scope alt");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Images pane stays within a narrow viewport in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 780 }); await page.emulateMedia({ colorScheme }); await open(page, baseURL);
    await expect.poll(() => pane(page).locator(".media-library__card img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);; expect(width).toBeLessThanOrEqual(390);
    await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
    await expect(pane(page).getByLabel("Default alt text", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test("image slot keeps its chooser modal while manager query survives", async ({ page, baseURL }) => {
  await open(page, baseURL); await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await page.keyboard.press("Escape");
  await expect(page.locator("#explorer")).not.toBeVisible();
  const frame = page.frameLocator(".native-preview-frame"); await frame.locator(".hero-image").click({ timeout: 10000 });
  await page.getByRole("button", { name: "Choose image…", exact: true }).click({ timeout: 10000 });
  const chooser = page.getByRole("dialog", { name: "Choose image", exact: true }); await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click({ timeout: 10000 });
  await chooser.getByRole("button", { name: "Use image", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/images/studio-desk.svg"');
  await expect(chooser).toHaveCount(0);
  await page.locator("#explorer-toggle").click(); await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("studio-desk");
});
