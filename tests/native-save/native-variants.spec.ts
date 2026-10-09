import { expect, test, type Page } from "@playwright/test";

// Default fixture group. Variants in the edit bar (tickets 07 §5 and 71):
// a dropdown per variant and a checkbox per yes/no variant on a selected
// instance, read from its component's CSS and the site's (shared/variants.ts);
// past two, behind one Variants button. The fixture `native-variants`
// (id 541, fixtures/native-variants): a section-split with Layout (its
// content-left only on wide screens) and the global Color scheme; two
// card-tips with Size, Emphasis (tag-named site CSS), Featured (wide screens only), Pinned and
// Color scheme, the first written with a size no rule knows. The site script
// owns Open, so the edit bar excludes it; Pinned must be written as "true".
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
async function undo(page: Page) {
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=541&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(frame(page).getByRole("heading", { name: "Two columns" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role=textbox]").first()).toBeAttached();
});

// The instance around a slotted heading: click the heading, Escape selects its parent.
async function selectInstance(page: Page, heading: string, kind: string) {
  await frame(page).getByRole("heading", { name: heading }).click({ position: { x: 5, y: 5 } });
  await frame(page).getByRole("heading", { name: heading }).press("Escape");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText(kind);
}

test("picking a variant writes its attribute and the default removes it, one undo step each", { tag: "@smoke" }, async ({ page }) => {
  await selectInstance(page, "Two columns", "Section split");
  const layout = bar(page).getByRole("combobox", { name: "Layout", exact: true });
  await expect(layout).toHaveValue("");
  const before = await source(page);
  expect(before).toContain("<section-split>");

  await layout.selectOption({ label: "Centered" });
  await expect.poll(() => source(page)).toBe(before.replace("<section-split>", '<section-split data-layout="centered">'));
  await expect(frame(page).locator("section-split")).toHaveAttribute("data-layout", "centered");
  await expect(bar(page).getByRole("combobox", { name: "Layout", exact: true })).toHaveValue("=centered");
  const centered = await source(page);

  await bar(page).getByRole("combobox", { name: "Layout", exact: true }).selectOption({ label: "Default" });
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("section-split")).not.toHaveAttribute("data-layout", /.*/);

  await undo(page);
  await expect.poll(() => source(page)).toBe(centered);
  await undo(page);
  await expect.poll(() => source(page)).toBe(before);
});

test("two variants sit in the bar; a value styled only on wide screens says so", async ({ page }) => {
  await selectInstance(page, "Two columns", "Section split");
  await expect(bar(page).getByRole("button", { name: "Variants" })).toHaveCount(0);
  const layout = bar(page).getByRole("combobox", { name: "Layout", exact: true });
  await expect(layout.locator("option")).toHaveText(["Default", "Content left (wide screens only)", "Centered"]);
  // The global attribute from the site's CSS is offered on every component.
  await expect(bar(page).getByRole("combobox", { name: "Color scheme", exact: true }).locator("option")).toHaveText(["Default", "Dark"]);
});

test("past two variants they sit behind Variants: Custom kept, a yes/no checkbox, wide screens only", async ({ page }) => {
  await selectInstance(page, "Water early", "Card tip");
  const before = await source(page);
  const open = bar(page).getByRole("button", { name: "Variants", exact: true });
  await open.click();
  const fields = page.getByRole("dialog", { name: "Variants" });
  await expect(fields).toBeVisible();
  // A size no rule knows shows as Custom and is never dropped.
  const size = fields.getByRole("combobox", { name: "Size", exact: true });
  await expect(size.locator("option")).toHaveText(["Default", "Small", "Custom"]);
  await expect(size).toHaveValue("=huge");
  await expect(fields.getByRole("combobox", { name: "Emphasis", exact: true }).locator("option")).toHaveText(["Default", "Accent"]);
  await expect(fields.getByRole("combobox", { name: "Color scheme", exact: true })).toBeVisible();

  await expect(fields.getByRole("checkbox", { name: "Pinned", exact: true })).toBeVisible();
  await expect(fields.getByRole("checkbox", { name: "Open", exact: true })).toHaveCount(0);

  // The yes/no variant: a checkbox, written bare; the popover stays open on it.
  const featured = fields.getByRole("checkbox", { name: "Featured (wide screens only)" });
  await expect(fields.getByText("wide screens only")).toBeVisible();
  await featured.check();
  const on = before.replace('<card-tip data-size="huge">', '<card-tip data-size="huge" data-featured>');
  await expect.poll(() => source(page)).toBe(on);
  await expect(fields).toBeVisible();
  await expect(fields.getByRole("checkbox", { name: "Featured (wide screens only)" })).toBeChecked();
  await expect(fields.getByRole("checkbox", { name: "Featured (wide screens only)" })).toBeFocused();

  // Picking a known size replaces the custom one, which then leaves the list.
  await fields.getByRole("combobox", { name: "Size", exact: true }).selectOption({ label: "Small" });
  const small = on.replace('data-size="huge"', 'data-size="small"');
  await expect.poll(() => source(page)).toBe(small);
  await expect(fields.getByRole("combobox", { name: "Size", exact: true }).locator("option")).toHaveText(["Default", "Small"]);

  // Off removes the bare attribute; the default removes the size; the popover stays open throughout.
  await fields.getByRole("checkbox", { name: "Featured (wide screens only)" }).uncheck();
  const off = small.replace(" data-featured", "");
  await expect.poll(() => source(page)).toBe(off);
  await expect(fields.getByRole("checkbox", { name: "Featured (wide screens only)" })).toBeFocused();
  await fields.getByRole("combobox", { name: "Size", exact: true }).selectOption({ label: "Default" });
  await expect.poll(() => source(page)).toBe(off.replace('<card-tip data-size="small">', "<card-tip>"));
  await expect(fields).toBeVisible();

  for (const step of [off, small, on, before]) {
    await undo(page);
    await expect.poll(() => source(page)).toBe(step);
  }
});

test("script-set Open is excluded and Pinned writes true then removes the attribute", async ({ page }) => {
  await selectInstance(page, "Water early", "Card tip");
  await bar(page).getByRole("button", { name: "Variants", exact: true }).click();
  const fields = page.getByRole("dialog", { name: "Variants" });
  await expect(fields).toBeVisible();
  await expect(fields.getByRole("checkbox", { name: "Open", exact: true })).toHaveCount(0);
  const pinned = fields.getByRole("checkbox", { name: "Pinned", exact: true });
  await expect(pinned).not.toBeChecked();
  const before = await source(page);
  await pinned.check();
  const on = before.replace('<card-tip data-size="huge">', '<card-tip data-size="huge" data-pinned="true">');
  await expect.poll(() => source(page)).toBe(on);
  await expect(frame(page).locator("card-tip").first()).toHaveAttribute("data-pinned", "true");
  await expect(pinned).toBeChecked();
  await pinned.uncheck();
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("card-tip").first()).not.toHaveAttribute("data-pinned", /.*/);
  await expect(pinned).not.toBeChecked();
});
