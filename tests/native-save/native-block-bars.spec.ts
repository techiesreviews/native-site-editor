import { expect, test, type Page } from "@playwright/test";

// Default fixture group: native-variants (541), on its separate blocks page.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("blocks.html")!);
async function undo(page: Page) {
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "blocks.html"))).toBe(true);
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=541&branch=main&file=blocks.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "blocks.html", { timeout: 30_000 });
  await expect(frame(page).getByRole("heading", { name: "Block edit bars" })).toBeVisible();
  await expect(page.locator("#content [role=textbox]").first()).toBeAttached();
});

test("Div Layout swaps classes and back, preserves selection, one undo per pick", async ({ page }) => {
  await frame(page).getByText("Layout content", { exact: true }).click();
  await frame(page).getByText("Layout content", { exact: true }).press("Escape");
  const layout = bar(page).getByRole("combobox", { name: "Layout", exact: true });
  await expect(layout).toHaveValue("flow");
  const before = await source(page);
  const grid = before.replace('class="before flow after"', 'class="before cards after"');
  await layout.selectOption({ label: "Grid" });
  await expect.poll(() => source(page)).toBe(grid);
  await expect(frame(page).locator("#layout")).toHaveClass("before cards after");
  await expect(page.locator("#status")).toHaveText("Layout: Grid");
  await expect(layout).toHaveValue("cards");
  await layout.selectOption({ label: "Stack" });
  await expect.poll(() => source(page)).toBe(before);
  await expect(layout).toHaveValue("flow");
  await undo(page);
  await expect.poll(() => source(page)).toBe(grid);
  await undo(page);
  await expect.poll(() => source(page)).toBe(before);

  await frame(page).getByText("Plain container", { exact: true }).click();
  await frame(page).getByText("Plain container", { exact: true }).press("Escape");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Block");
  await expect(layout).toHaveCount(0);
});

test("Button offers site Variant and Size, retains Address, Default removes attributes, one undo each", async ({ page }) => {
  await frame(page).getByRole("link", { name: "Button", exact: true }).click();
  const variant = bar(page).getByRole("combobox", { name: "Variant", exact: true });
  const size = bar(page).getByRole("combobox", { name: "Size", exact: true });
  await expect(variant.locator("option")).toHaveText(["Default", "Secondary", "Ghost"]);
  await expect(size.locator("option")).toHaveText(["Default", "Small", "Large"]);
  await expect(bar(page).getByRole("button", { name: "Address", exact: true })).toBeVisible();
  await expect(bar(page).getByRole("combobox", { name: "Color scheme", exact: true })).toHaveCount(0);
  const before = await source(page);
  await variant.selectOption({ label: "Secondary" });
  const secondary = before.replace('<a class="btn" href="#">', '<a class="btn" href="#" data-variant="secondary">');
  await expect.poll(() => source(page)).toBe(secondary);
  await size.selectOption({ label: "Large" });
  const large = secondary.replace('data-variant="secondary">', 'data-variant="secondary" data-size="large">');
  await expect.poll(() => source(page)).toBe(large);
  await variant.selectOption({ label: "Default" });
  const defaultVariant = large.replace(' data-variant="secondary"', "");
  await expect.poll(() => source(page)).toBe(defaultVariant);
  await size.selectOption({ label: "Default" });
  await expect.poll(() => source(page)).toBe(before);
  for (const step of [defaultVariant, large, secondary, before]) {
    await undo(page);
    await expect.poll(() => source(page)).toBe(step);
  }
});

test("placeholder Choose image replaces its source and dimensions, keeps the site asset; Alt text works", async ({ page }) => {
  const before = await source(page);
  await frame(page).locator("img").click();
  await expect(bar(page).getByRole("combobox", { name: "Variant", exact: true })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Choose image…", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose image", exact: true });
  await chooser.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await chooser.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Image replaced");
  await expect.poll(() => source(page)).toContain('src="/images/studio-desk.svg"');
  const replaced = await source(page);
  expect(replaced).toContain('width="320" height="180"');
  expect(replaced).not.toContain('src="/images/placeholder.svg"');
  await undo(page);
  await expect.poll(() => source(page)).toBe(before);
  // The original asset remains available after replacement and undo.
  await bar(page).getByRole("button", { name: "Choose image…", exact: true }).click();
  await expect(chooser.getByRole("button", { name: "Details for images/placeholder.svg", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Alt text", exact: true }).click();
  await page.getByRole("textbox", { name: "Alt text", exact: true }).fill("Neutral image placeholder");
  await page.keyboard.press("Enter");
  await expect.poll(() => source(page)).toBe(before.replace('alt=""', 'alt="Neutral image placeholder"'));
  await undo(page);
  await expect.poll(() => source(page)).toBe(before);
});

test("Heading, Paragraph, Section and ordinary links have no variant controls", async ({ page }) => {
  for (const target of [frame(page).getByRole("heading", { name: "Block edit bars" }), frame(page).getByText("Layout content", { exact: true }), frame(page).getByRole("link", { name: "Plain link", exact: true })]) {
    await target.click();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page).getByRole("combobox", { name: "Variant", exact: true })).toHaveCount(0);
    await expect(bar(page).getByRole("combobox", { name: "Color scheme", exact: true })).toHaveCount(0);
    await expect(bar(page).getByRole("button", { name: "Variants", exact: true })).toHaveCount(0);
  }
  await frame(page).getByRole("heading", { name: "Block edit bars" }).click();
  await frame(page).getByRole("heading", { name: "Block edit bars" }).press("Escape");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("combobox", { name: "Tone", exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("combobox", { name: "Layout", exact: true })).toHaveCount(0);
});


test("Button without matching stylesheet rules shows no variant fields", async ({ page }) => {
  await page.evaluate(async () => {
    const editor = await import("/src/components/source-editor.ts");
    const html = editor.getMountedSource("blocks.html")!;
    const link = '<link rel="stylesheet" href="/styles/site.css">';
    const start = html.indexOf(link);
    editor.replaceActiveRanges([{ path: "blocks.html", start, end: start + link.length, text: "", expected: link }]);
  });
  await expect.poll(() => source(page)).not.toContain('rel="stylesheet"');
  await frame(page).getByRole("link", { name: "Button", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Address", exact: true })).toBeVisible();
  await expect(bar(page).getByRole("combobox", { name: "Variant", exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("combobox", { name: "Size", exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Variants", exact: true })).toHaveCount(0);
});
