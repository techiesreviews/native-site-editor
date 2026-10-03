import { expect, test, type Page } from "@playwright/test";
const style = (page: Page) => page.getByRole("complementary", { name: "Style panel" });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("styles/site.css"));
async function append(page: Page, text: string) {
  await page.evaluate(async text => {
    const editor = await import("/src/components/code-editor.ts"), source = editor.getMountedSource("styles/site.css");
    if (source === undefined) throw new Error("Missing CSS model");
    editor.replaceActiveRange({ path: "styles/site.css", start: source.length, end: source.length, expected: "", text });
  }, text);
}
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const lead = page.frameLocator(".native-preview-frame").locator(".lead");
  await expect(lead).toBeVisible(); await lead.click();
  await style(page).getByRole("button", { name: "Open Style panel" }).click();
  await expect.poll(() => source(page)).toBeDefined();
}
test("native focused Undo retries the prior value and original Show in code follows current source", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const field = style(page).getByRole("textbox", { name: "Padding top", exact: true });
  await field.fill("19"); await field.press("Enter");
  await expect.poll(() => source(page)).toContain("padding-top: 19px");
  await field.press("ControlOrMeta+Z");
  await expect.poll(() => source(page)).not.toContain("padding-top: 19px");
  await expect(field).toBeFocused(); await field.press("Enter");
  await expect.poll(() => source(page)).toContain("padding-top: 19px");
  await field.press("ControlOrMeta+Z");
  await expect.poll(() => source(page)).not.toContain("padding-top: 19px");
  await style(page).getByRole("button", { name: "Show in code" }).click();
  await expect(page.locator("#content-secondary .view-lines")).toContainText(".lead");
  await expect(page.locator("#notice")).not.toContainText("style target changed");
  await field.focus(); await append(page, "\n.agent { color: blue; }\n");
  await expect(field).toBeFocused();
  await style(page).getByRole("button", { name: "Show in code" }).click();
  await expect(page.locator("#notice")).not.toContainText("style target changed");
});
for (const breakpoint of ["all", "tablet"] as const) {
  test(`focal refuses competing important position at ${breakpoint} without source or preview changes`, async ({ page, baseURL }) => {
    await open(page, baseURL);
    await append(page, '\n.lead { background-image: url("../images/studio-desk.svg"); background-position: 20% 30% !important; }\n.hero .lead { background-position: 10% 15% !important; }\n');
    await style(page).getByRole("combobox", { name: "Style breakpoint" }).selectOption(breakpoint);
    await style(page).getByRole("searchbox").fill("image focus");
    const x = style(page).getByLabel("X (%)", { exact: true }); await expect(x).toBeEnabled();
    const before = await source(page);
    await x.fill("42"); await x.press("Enter");
    await expect(page.locator("#notice")).toContainText("Another matching CSS rule has an important image position");
    expect(await source(page)).toBe(before);
    await expect(page.frameLocator(".native-preview-frame").locator(".lead")).toHaveCSS("background-position", "10% 15%");
  });
}

test("print and unrelated selectors do not block a native focal edit", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await append(page, '\n.lead { background-image: url("../images/studio-desk.svg"); background-position: 20% 30%; }\n.other { background-position: center !important; }\n@media print { *, *::before, *::after { background: #fff !important; } }\n.lead:hover { background-position: 5% 5% !important; }\n');
  await style(page).getByRole("searchbox").fill("image focus");
  const x = style(page).getByLabel("X (%)", { exact: true }); await expect(x).toBeEnabled();
  await x.fill("42"); await x.press("Enter");
  await expect.poll(() => source(page)).toContain("background-position: 42% 30%");
  await expect(page.frameLocator(".native-preview-frame").locator(".lead")).toHaveCSS("background-position", "42% 30%");
  await expect(page.locator("#notice")).not.toContainText("important image position");
});
