import { expect, test, type Page } from "@playwright/test";

// Choosing a replacement image is refused when the page's source changed
// while the picker was open; nothing is written, and the edit made meanwhile
// is the only change (one Undo returns to the start).
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);

test("a source change while the picker is open refuses the replacement", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  const start = await source(page);
  await frame(page).locator(".hero img").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Choose image…" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose image" });
  await chooser.getByRole("button", { name: "Details for images/studio-desk.svg" }).click();
  // The image's own tag changes under the open picker.
  const changed = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const next = before.replace('data-key="hero-image"', 'data-key="hero-image" title="moved"');
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
    return next;
  });
  await chooser.getByRole("button", { name: "Use image" }).click();
  await expect(page.getByText("This image changed while the picker was open. Select it again.").first()).toBeVisible();
  expect(await source(page)).toBe(changed);
  expect(await source(page)).not.toContain("studio-desk");
  expect(start).not.toBe(changed);
});
