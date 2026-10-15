import { expect, test, type Page } from "@playwright/test";
import { filterTo } from "./media-filter";

// The explorer's size (media fix slice 104, audit C1): one box for Pages, Media and Files that runs
// from under the top bar to 16 px above the window's bottom, a sticky One bar, and action rows that
// stay in view. Default fixture group (the frozen native starter).
test.beforeEach(({ page }) => page.setDefaultTimeout(15_000));

const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const explorer = (page: Page) => page.locator("#explorer");
const svg = (i: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#${(i * 1234567 % 0xffffff).toString(16).padStart(6, "0")}"/></svg>`;

/** Thirty pictures nothing uses, so the grid scrolls and Clean up has many files to list. */
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (let i = 1; i <= 30; i++)
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: `images/spare-${i}.svg`, content: svg(i) } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
}
async function box(page: Page) {
  return explorer(page).evaluate(element => {
    const { top, bottom, left, width } = element.getBoundingClientRect();
    return { top: Math.round(top), bottom: Math.round(bottom), left: Math.round(left), width: Math.round(width), viewport: innerHeight };
  });
}
async function tab(page: Page, name: "Pages" | "Media" | "Files") {
  await page.getByRole("tab", { name, exact: true }).click();
  if (name === "Media") await expect(pane(page).getByRole("button", { name: "Details for images/spare-1.svg", exact: true })).toBeVisible();
}

/** The shown list's bottom edge, which fills the box down to its 12px padding. */
const listBottom = (page: Page, selector: string) => page.locator(selector).evaluate(element => element.getBoundingClientRect().bottom);

/** Every tab shows the same box, reaching 16 px above the window's bottom, under the top bar;
 * the Pages and Files lists fill it and scroll inside. */
async function expectOneBox(page: Page) {
  await tab(page, "Pages");
  const pages = await box(page);
  expect(await listBottom(page, ".pages-tree")).toBeGreaterThanOrEqual(pages.bottom - 13);
  expect(pages.bottom).toBe(pages.viewport - 16);
  const bar = await page.locator(".topbar").evaluate(element => element.getBoundingClientRect().bottom);
  expect(pages.top).toBeGreaterThanOrEqual(Math.floor(bar) - 1);
  await tab(page, "Media");
  expect(await box(page)).toEqual(pages);
  await tab(page, "Files");
  expect(await box(page)).toEqual(pages);
  expect(await listBottom(page, "#files")).toBeGreaterThanOrEqual(pages.bottom - 13);
  const files = await page.locator("#files").evaluate(element => ({ overflow: getComputedStyle(element).overflowY, fits: element.getBoundingClientRect().bottom <= innerHeight }));
  expect(files).toEqual({ overflow: "auto", fits: true });
}

/** File details' Save row, Manage collections' New collection, and Clean up's Remove row are inside the window. */
async function expectActionsInView(page: Page) {
  await tab(page, "Media");
  await filterTo(pane(page), "Manage collections…");
  await expect(pane(page).getByRole("button", { name: "New collection", exact: true })).toBeInViewport({ ratio: 1 });
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await pane(page).getByRole("button", { name: "Details for images/spare-1.svg", exact: true }).click();
  // Save details shows once something changed (slice 123).
  await pane(page).getByRole("checkbox", { name: "Always keep", exact: true }).check();
  await expect(pane(page).getByRole("button", { name: "Save details", exact: true })).toBeInViewport({ ratio: 1 });
  await pane(page).getByRole("button", { name: "Back", exact: true }).first().click();
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Clean up/ }).click();
  await pane(page).getByRole("button", { name: /^Nothing uses these/ }).click();
  await pane(page).getByRole("button", { name: "Select all", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Review removal", exact: true })).toBeInViewport({ ratio: 1 });
  await pane(page).getByRole("button", { name: "Review removal", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: /^Remove \d+ files$/ })).toBeInViewport({ ratio: 1 });
  await expect(pane(page).getByRole("button", { name: "Keep files", exact: true })).toBeInViewport({ ratio: 1 });
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("the explorer is one full-height box; the gear sits in the tab row; the One bar and actions stay in view", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expectOneBox(page);
    expect((await box(page)).width).toBe(1040);

    // The gear is at the end of the tab row, with no band above it.
    const gear = page.getByRole("button", { name: "Site settings", exact: true });
    const [tabs, settings] = await Promise.all([page.getByRole("tablist").boundingBox(), gear.boundingBox()]);
    expect(Math.abs((tabs!.y + tabs!.height / 2) - (settings!.y + settings!.height / 2))).toBeLessThan(2);
    expect(settings!.x).toBeGreaterThanOrEqual(tabs!.x + tabs!.width);
    expect(settings!.width).toBe(44);

    // Scrolling the grid keeps search, Collections and More in view.
    await tab(page, "Media");
    await pane(page).evaluate(element => { element.scrollTop = 400; });
    await expect.poll(() => pane(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(pane(page).getByLabel("Search media", { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(pane(page).getByRole("button", { name: "More", exact: true })).toBeInViewport({ ratio: 1 });
    await pane(page).evaluate(element => { element.scrollTop = 0; });

    await expectActionsInView(page);

    // Neither the page button nor the Media tab carries a count (Lex, slice 122); More has Clean up's.
    await expect(page.locator(".media-count")).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("the explorer is one full-height box and the action rows stay in view", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expectOneBox(page);
    await expectActionsInView(page);
  });
});

test.describe("on a tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  test("the top bar stays one row with a Publish count, and the explorer never covers Publish", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await page.evaluate(async () => {
      const editor = await import("/src/components/code-editor.ts");
      const text = editor.getMountedSource("index.html");
      if (text === undefined) throw new Error("Missing source model");
      editor.replaceActiveRange({ path: "index.html", start: text.length, end: text.length, expected: "", text: "\n<!-- an edit to publish -->" });
    });
    const publish = page.locator(".publish-menu");
    await expect(publish).toContainText(/\d/);
    const [toggle, menu] = await Promise.all([page.locator("#explorer-toggle").boundingBox(), publish.boundingBox()]);
    // One row: Publish sits level with the page button.
    expect(Math.abs((toggle!.y + toggle!.height / 2) - (menu!.y + menu!.height / 2))).toBeLessThan(2);
    await tab(page, "Media");
    expect((await box(page)).top).toBeGreaterThanOrEqual(Math.ceil(menu!.y + menu!.height));
  });
});
