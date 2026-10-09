import { expect, test, type Page } from "@playwright/test";

// Default fixture group: native-variants (541), with isolated page tone rules.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("tones.html")!);
async function selectParent(page: Page, heading: string, kind: string) {
  const target = frame(page).getByRole("heading", { name: heading, exact: true });
  await target.click({ position: { x: 5, y: 5 } });
  await target.press("Escape");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText(kind);
}
async function undo(page: Page) {
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "tones.html"))).toBe(true);
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=541&branch=main&file=tones.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "tones.html", { timeout: 30_000 });
  await expect(frame(page).getByRole("heading", { name: "Plain band", exact: true })).toBeVisible();
  await expect(page.locator("#content [role=textbox]").first()).toBeAttached();
});

test("Brand writes Tone, Light removes it, each pick undoes once; cards inside bands have no Tone", { tag: "@smoke" }, async ({ page }) => {
  await selectParent(page, "Plain band", "Section");
  const tone = bar(page).getByRole("combobox", { name: "Tone", exact: true });
  await expect(tone.locator("option")).toHaveText(["Light (default)", "Dark", "Brand", "Accent"]);
  const before = await source(page);
  const brand = before.replace('<section id="plain-band">', '<section id="plain-band" data-tone="brand">');
  await tone.selectOption({ label: "Brand" });
  await expect.poll(() => source(page)).toBe(brand);
  await expect(frame(page).locator("#plain-band")).toHaveAttribute("data-tone", "brand");
  await tone.selectOption({ label: "Light (default)" });
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("#plain-band")).not.toHaveAttribute("data-tone", /.*/);
  await undo(page);
  await expect.poll(() => source(page)).toBe(brand);
  await undo(page);
  await expect.poll(() => source(page)).toBe(before);

  for (const heading of ["Plain band card", "Component band card"]) {
    await selectParent(page, heading, "Card tip");
    // Wait for the lazy fields to render before asserting absence.
    await expect(bar(page).getByRole("button", { name: "Variants", exact: true })).toBeVisible();
    await bar(page).getByRole("button", { name: "Variants", exact: true }).click();
    const fields = page.getByRole("dialog", { name: "Variants" });
    await expect(fields.getByRole("combobox", { name: "Size", exact: true })).toBeVisible();
    await expect(fields.getByRole("combobox", { name: "Tone", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

test("page header/footer and section instances offer Tone; nested sections do not", async ({ page }) => {
  for (const [heading, kind] of [["Page header", "Header"], ["Page footer", "Footer"], ["Component band", "Section split"]]) {
    await selectParent(page, heading, kind);
    await expect(bar(page).getByRole("combobox", { name: "Tone", exact: true })).toBeVisible();
  }
  await selectParent(page, "Nested section", "Section");
  await expect(bar(page).getByRole("combobox", { name: "Tone", exact: true })).toHaveCount(0);
});
