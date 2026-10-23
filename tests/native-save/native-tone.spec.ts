import { expect, test, type Page } from "@playwright/test";
import { selectText } from "./click-text";

// Default fixture group: native-variants (541), with isolated page tone rules.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
// Variant fields sit behind the edit bar's Variants button; open it once and act in its popover.
async function variants(page: Page) {
  const fields = page.getByRole("dialog", { name: "Variants" });
  if (!(await fields.isVisible())) await bar(page).getByRole("button", { name: "Variants", exact: true }).click();
  await expect(fields).toBeVisible();
  return fields;
}
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("tones.html")!);
async function selectParent(page: Page, heading: string, kind: string) {
  const target = frame(page).getByRole("heading", { name: heading, exact: true });
  await selectText(target);
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

test("Brand and Light write Tone, No tone removes it, each pick undoes once; cards inside bands have no Tone", { tag: "@smoke" }, async ({ page }) => {
  await selectParent(page, "Plain band", "Section");
  const tone = (await variants(page)).getByRole("combobox", { name: "Tone", exact: true });
  await expect(tone.locator("option")).toHaveText(["No tone (follows the page)", "Light", "Dark", "Brand", "Accent"]);
  const before = await source(page);
  const brand = before.replace('<section id="plain-band">', '<section id="plain-band" data-tone="brand">');
  await tone.selectOption({ label: "Brand" });
  await expect.poll(() => source(page)).toBe(brand);
  await expect(frame(page).locator("#plain-band")).toHaveAttribute("data-tone", "brand");
  await tone.selectOption({ label: "No tone (follows the page)" });
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("#plain-band")).not.toHaveAttribute("data-tone", /.*/);
  await undo(page);
  await expect.poll(() => source(page)).toBe(brand);
  await undo(page);
  await expect.poll(() => source(page)).toBe(before);

  const light = before.replace('<section id="plain-band">', '<section id="plain-band" data-tone="light">');
  await tone.selectOption({ label: "Light" });
  await expect.poll(() => source(page)).toBe(light);
  await expect(frame(page).locator("#plain-band")).toHaveAttribute("data-tone", "light");
  await undo(page);
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("#plain-band")).not.toHaveAttribute("data-tone", /.*/);

  for (const heading of ["Plain band card", "Component band card"]) {
    await selectParent(page, heading, "Card tip");
    // Wait for the lazy fields to render before asserting absence.
    await expect(bar(page).getByRole("button", { name: "Variants", exact: true })).toBeVisible();
    const fields = await variants(page);
    await expect(fields.getByRole("combobox", { name: "Size", exact: true })).toBeVisible();
    await expect(fields.getByRole("combobox", { name: "Tone", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

test("page header/footer and section instances offer Tone; nested sections do not", async ({ page }) => {
  for (const [heading, kind] of [["Page header", "Header"], ["Page footer", "Footer"], ["Component band", "Section split"]]) {
    await selectParent(page, heading, kind);
    await expect((await variants(page)).getByRole("combobox", { name: "Tone", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await selectParent(page, "Nested section", "Section");
  await expect(bar(page).getByRole("button", { name: "Variants", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Tone", exact: true })).toHaveCount(0);
});
