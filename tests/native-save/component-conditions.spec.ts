import { storedDrafts } from "./drafts";
import { test, expect, type Page } from "@playwright/test";
const path = "components/project-card/project-card.html";
async function code(page: Page) {
  await page.locator('#content [role="textbox"]').first().focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const value = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return value;
}
test("template conditions use native Monaco transaction, undo/redo and keep stale input", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30000 });
  const before = await code(page);
  await page.getByRole("button", { name: "Visibility conditions" }).click();
  const dialog = page.getByRole("dialog", { name: "Template visibility conditions" });
  await expect(dialog.getByLabel("Source target")).toBeFocused();
  await dialog.getByLabel("Source target").selectOption({ label: "Slot: title" });
  await dialog.getByLabel("Link", { exact: true }).check();
  await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
  const after = await code(page);
  expect(after).toBe(before.replace('<slot name="title">', '<slot data-if="link" name="title">'));
  expect((await storedDrafts(page)).map(({ path: file, content }) => ({ path: file, content }))).toEqual([{ path, content: after }]);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => code(page)).toBe(before);
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect.poll(() => code(page)).toBe(after);
  await page.getByRole("button", { name: "Visibility conditions" }).click();
  await dialog.getByLabel("Body", { exact: true }).check();
  // External draft changes must not overwrite the captured template.
  await page.evaluate(() => { location.hash = '#repo=501&branch=main&file=index.html'; });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed");
  await expect(dialog.getByLabel("Body", { exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});


test("authored condition hides all instances and assigned content reveals only its instance", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30000 });
  await page.getByRole("button", { name: "Visibility conditions" }).click();
  const dialog = page.getByRole("dialog", { name: "Template visibility conditions" });
  await dialog.getByLabel("Link", { exact: true }).check();
  await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  const cards = page.frameLocator(".native-preview-frame").locator("project-card");
  const hidden = (index: number) => cards.nth(index).evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('slot[name="title"]')!).display);
  for (const index of [0, 1, 2]) await expect.poll(() => hidden(index)).toBe("none");
  const original = await code(page);
  const filled = original.replace('<span slot="title">Reusable cards</span>', '<span slot="title">Reusable cards</span><a slot="link" href="/about/">Provided link</a>');
  await page.evaluate((value) => navigator.clipboard.writeText(value), filled);
  await page.locator('#content [role="textbox"]').first().focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => hidden(0)).not.toBe("none");
  for (const index of [1, 2]) await expect.poll(() => hidden(index)).toBe("none");
});


test("source and repository changes reject captured condition edits", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30000 });
  const before = await code(page);
  await page.getByRole("button", { name: "Visibility conditions" }).click();
  const dialog = page.getByRole("dialog", { name: "Template visibility conditions" });
  await dialog.getByLabel("Link", { exact: true }).check();
  await page.evaluate(async ({ path, before }) => {
    const modulePath = "/src/components/code-editor.ts";
    const editor = await import(/* @vite-ignore */ modulePath);
    editor.replaceActiveRanges([{ path, start: 0, end: before.length, expected: before, text: before + "\n<!-- concurrent edit -->" }]);
  }, { path, before });
  await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed");
  await expect(dialog.getByLabel("Link", { exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  expect(await code(page)).toBe(before + "\n<!-- concurrent edit -->");
  await page.getByRole("button", { name: "Visibility conditions" }).click();
  await page.evaluate(() => { location.hash = '#repo=531&branch=main&file=index.html'; });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed");
});


test("selection changes retain choices and reject the captured target", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30000 });
  await expect(page.frameLocator(".native-preview-frame").locator("project-card").first()).toBeAttached();
  await page.getByRole("button", { name: "Visibility conditions" }).click();
  const dialog = page.getByRole("dialog", { name: "Template visibility conditions" });
  await dialog.getByLabel("Link", { exact: true }).check();
  await page.frameLocator(".native-preview-frame").locator("project-card").first().evaluate((el) => (el.shadowRoot!.querySelector("h3") as HTMLElement).click());
  await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed");
  await expect(dialog.getByLabel("Link", { exact: true })).toBeChecked();
});

for (const fixture of [
  { label: "empty wrapper", source: '<slot name="a"></slot><div data-if="">Keep</div>', target: 1, warning: "Unsupported empty wrapper" },
  { label: "unknown requirement", source: '<slot name="a"></slot><div data-if="a missing">Keep</div>', target: 1, warning: "Unknown slot" },
  { label: "exact whitespace slot name", source: '<slot name=" a "></slot><slot name="a"></slot>', target: 1, warning: "Unsupported slot name" },
]) {
  test(`${fixture.label} refuses Save, preserves choices and permits explicit removal`, async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30000 });
    await page.evaluate(async ({ path, source }) => {
      const modulePath = "/src/components/code-editor.ts";
      const editor = await import(/* @vite-ignore */ modulePath);
      const before = editor.getMountedSource(path);
      editor.replaceActiveRanges([{ path, start: 0, end: before.length, expected: before, text: source }]);
    }, { path, source: fixture.source });
    await page.getByRole("button", { name: "Visibility conditions" }).click();
    const dialog = page.getByRole("dialog", { name: "Template visibility conditions" });
    await dialog.getByLabel("Source target").selectOption({ index: fixture.target });
    await expect(dialog.getByRole("alert")).toContainText(fixture.warning);
    await expect(dialog).not.toContainText("Always visible");
    const choice = dialog.getByRole("checkbox").last();
    await choice.check();
    await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(fixture.warning);
    await expect(choice).toBeChecked();
    const unchanged = await page.evaluate(async (path) => {
      const modulePath = "/src/components/code-editor.ts";
      return (await import(/* @vite-ignore */ modulePath)).getMountedSource(path);
    }, path);
    expect(unchanged).toBe(fixture.source);
    await dialog.getByRole("button", { name: "Remove condition", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(await code(page)).toBe(fixture.source.replace(/data-if="[^"]*"/, ""));
  });
}

test("stray slash and valid Unicode conditions preserve source and actual DOM names", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30000 });
  const source = '<slot name="a"></slot><slot name="b"></slot><div / data-if="a" keep=raw>Keep</div>';
  await page.evaluate(async ({ path, source }) => {
    const editorPath = "/src/components/code-editor.ts";
    const editor = await import(/* @vite-ignore */ editorPath);
    const before = editor.getMountedSource(path);
    editor.replaceActiveRanges([{ path, start: 0, end: before.length, expected: before, text: source }]);
    const modelPath = "/src/page-builder/component-conditions.ts";
    const model = await import(/* @vite-ignore */ modelPath);
    const unicode = '<!-- İstanbul --><slot name="a"></slot><X-İ data-if="a" title="Exact">İstanbul</X-İ>';
    const target = model.readSlotConditions(unicode).targets[1];
    const plan = model.planSlotCondition(unicode, target.node, undefined);
    const updated = unicode.slice(0, plan.start) + plan.text + unicode.slice(plan.end);
    const parsed = document.createElement('template'); parsed.innerHTML = updated;
    const custom = parsed.content.children[1];
    if (custom.localName !== 'x-İ' || custom.textContent !== 'İstanbul' || custom.getAttribute('title') !== 'Exact' || custom.hasAttribute('data-if')) throw new Error('Unicode conditions disagree with actual DOM');
    if (plan.start !== unicode.indexOf('<X-İ') || plan.expected !== '<X-İ data-if="a" title="Exact">' || updated !== unicode.replace(' data-if="a"', ' ')) throw new Error('Unicode condition source offsets changed adjacent bytes');
  }, { path, source });
  await page.getByRole("button", { name: "Visibility conditions" }).click();
  const dialog = page.getByRole("dialog", { name: "Template visibility conditions" });
  await dialog.getByLabel("Source target").selectOption({ index: 2 });
  await dialog.getByLabel("B", { exact: true }).check();
  await dialog.getByRole("button", { name: "Save condition", exact: true }).click();
  expect(await code(page)).toBe(source.replace('data-if="a"', 'data-if="a b"'));
});
