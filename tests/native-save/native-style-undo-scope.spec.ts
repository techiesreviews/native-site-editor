import { expect, test, type Page } from "@playwright/test";
import { showStylePanel } from "./style-panel-controls";
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
  await showStylePanel(page);
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
  await openPreloadedFocus(page, baseURL, '\n.lead { background-image: url("../images/studio-desk.svg"); background-position: 20% 30%; }\n.other { background-position: center !important; }\n@media print { *, *::before, *::after { background: #fff !important; } }\n.lead:hover { background-position: 5% 5% !important; }\n');
  await style(page).getByRole("searchbox").fill("image focus");
  const x = style(page).getByLabel("X (%)", { exact: true }); await expect(x).toBeEnabled();
  await x.fill("42"); await x.press("Enter");
  await expect.poll(() => source(page)).toContain("background-position: 42% 30%");
  await expect(page.frameLocator(".native-preview-frame").locator(".lead")).toHaveCSS("background-position", "42% 30%");
  await expect(page.locator("#notice")).not.toContainText("important image position");
});

async function openPreloadedFocus(page: Page, baseURL: string | undefined, rules: string) {
  // Seed the real worker's fake GitHub before the editor loads this page.
  await page.request.get(`${baseURL}/`, { headers: { accept: "text/html" } });
  const css = await (await page.request.get(`${baseURL}/__demo/file?path=styles/site.css`)).text();
  const seeded = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "styles/site.css", content: css + rules } });
  expect(seeded.status()).toBe(204);
  await page.addInitScript(() => {
    window.addEventListener("message", event => {
      if (event.data?.source === "astro-native-preview" && event.data.type === "select" && event.data.reason === "click")
        (window as any).clickedStyleRules = event.data.selectors;
    });
  });
  await open(page, baseURL);
  await style(page).getByRole("searchbox").fill("image focus");
  await expect(style(page).getByLabel("X (%)", { exact: true })).toBeEnabled();
}

test("the initial canvas click's current hover does not block a rest-state focal edit", async ({ page, baseURL }) => {
  await openPreloadedFocus(page, baseURL, '\n.lead { background-image: url("../images/studio-desk.svg"); background-position: 20% 30%; }\n.lead:hover { background-position: 5% 5% !important; }\n');
  expect(await page.evaluate(() => (window as any).clickedStyleRules.some((rule: any) => rule.state?.includes(":hover") && rule.current))).toBe(true);
  const x = style(page).getByLabel("X (%)", { exact: true });
  await x.fill("42"); await x.press("Enter");
  await expect.poll(() => source(page)).toContain("background-position: 42% 30%");
  await expect(page.locator("#notice")).not.toContainText("important image position");
  await expect(page.frameLocator(".native-preview-frame").locator(".lead")).toHaveCSS("background-position", "42% 30%");
});

test("explicit hover still refuses an important competing focal rule", async ({ page, baseURL }) => {
  await openPreloadedFocus(page, baseURL, '\n.lead { background-image: url("../images/studio-desk.svg"); background-position: 20% 30%; }\n.hero .lead:hover { background-position: 5% 5% !important; }\n');
  await style(page).getByRole("combobox", { name: "Style state" }).selectOption(":hover");
  const before = await source(page), x = style(page).getByLabel("X (%)", { exact: true });
  await x.fill("42"); await x.press("Enter");
  await expect(page.locator("#notice")).toContainText("Another matching CSS rule has an important image position");
  expect(await source(page)).toBe(before);
});

test("explicit hover preserves important priority in its own focal rule", async ({ page, baseURL }) => {
  await openPreloadedFocus(page, baseURL, '\n.lead { background-image: url("../images/studio-desk.svg"); background-position: 20% 30%; }\n.lead:hover { background-position: 5% 5% !important; }\n');
  await style(page).getByRole("combobox", { name: "Style state" }).selectOption(":hover");
  const x = style(page).getByLabel("X (%)", { exact: true });
  await x.fill("42"); await x.press("Enter");
  await expect.poll(() => source(page)).toMatch(/\.lead:hover \{[^}]*background-position: 42% 5% !important/);
  await expect(page.locator("#notice")).not.toContainText("important image position");
});
