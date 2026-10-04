import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { showStylePanel } from "./style-panel-controls";
const panel = (page: Page) => page.getByRole("complementary", { name: "Style panel" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
async function open(page: Page, baseURL: string | undefined, repo = 501) {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible();
}
async function select(page: Page, selector = ".lead") {
  await frame(page).locator(selector).click();
  await showStylePanel(page);
  await expect(panel(page).getByText("Spacing", { exact: true })).toBeVisible();
}
async function fill(page: Page, label: string, value: string) {
  await panel(page).getByRole("textbox", { name: label, exact: true }).fill(value);
  await panel(page).getByRole("textbox", { name: label, exact: true }).press("Enter");
}
const css = async (page: Page, path = "styles/site.css") => (await storedDraft(page, path))?.content ?? "";

test("search filters existing controls without losing focus and restores section folds", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  const search = panel(page).getByRole("searchbox", { name: "Search styles" });
  const spacing = panel(page).locator("details").filter({ has: page.locator("summary", { hasText: /^Spacing$/ }) });
  await expect(spacing).toHaveAttribute("open", "");
  for (const [query, label] of [["margin-top", "Margin top"], ["padding left", "Padding left"]]) {
    await search.fill(query); await expect(search).toBeFocused();
    await expect(panel(page).getByRole("textbox", { name: label, exact: true })).toBeVisible();
  }
  await search.fill("round corners"); await expect(search).toBeFocused();
  await expect(panel(page).getByRole("textbox", { name: "top left radius", exact: true })).toBeVisible();
  await expect(spacing).toBeHidden();
  await search.fill("no-such-property"); await expect(panel(page).getByRole("status").filter({ hasText: "No matching styles." })).toHaveText("No matching styles.");
  await panel(page).getByRole("button", { name: "Clear style search" }).click();
  await expect(search).toBeFocused(); await expect(spacing).toHaveAttribute("open", "");
  await expect(panel(page).locator("details").filter({ has: page.locator("summary", { hasText: /^Border$/ }) })).not.toHaveAttribute("open", "");
});

test("new catalogue fields write native CSS, keep unitless values and support Undo", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  const search = panel(page).getByRole("searchbox", { name: "Search styles" });
  await search.fill("grow"); await fill(page, "Grow", "2");
  await expect.poll(() => css(page)).toContain("flex-grow: 2;");
  expect(await css(page)).not.toContain("flex-grow: 2px");
  await search.fill("top"); await fill(page, "Top", "12");
  await expect.poll(() => css(page)).toContain("top: 12px;");
  await panel(page).getByRole("textbox", { name: "Top", exact: true }).press("ControlOrMeta+Z");
  await expect.poll(() => css(page)).not.toContain("top: 12px;");
  await search.fill("grid rows"); await fill(page, "Rows", "80px auto");
  await expect.poll(() => css(page)).toContain("grid-template-rows: 80px auto;");
  await search.fill("object position"); await fill(page, "Object position", "25% 75%");
  await expect.poll(() => css(page)).toContain("object-position: 25% 75%;");
});

test("code-authored grid exposes computed auto tracks and writes live native grid CSS", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator("section.cards").evaluate(element => (element as HTMLElement).click());
  await showStylePanel(page);
  await expect(panel(page).locator(".style-panel__selector")).toHaveText(".cards");
  const search = panel(page).getByRole("searchbox", { name: "Search styles" });
  await search.fill("auto rows");
  const rows = panel(page).getByRole("textbox", { name: "Auto rows", exact: true });
  await expect(rows).toHaveAttribute("placeholder", "auto");
  await fill(page, "Auto rows", "67px");
  await expect.poll(() => css(page)).toContain("grid-auto-rows: 67px;");
  await expect.poll(() => frame(page).locator(".cards").evaluate(element => getComputedStyle(element).gridAutoRows)).toBe("67px");
});
