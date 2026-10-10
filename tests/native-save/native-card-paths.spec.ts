import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Default native-cards fixture: addresses typed in Link to a page keep their
// folder and slug; one new folder level is allowed. Creation and fill undo together.
const pageErrors: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => expect(pageErrors).toEqual([]));
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const input = (page: Page) => page.getByRole("combobox", { name: "Link to a page" });
const create = (page: Page) => page.getByRole("option", { name: /Create page/ });

async function openPicker(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await frame(page).locator("card-project").last().scrollIntoViewIfNeeded();
  await frame(page).locator("card-project").last().hover();
  await page.locator(".card-ghost__add").click();
  await expect(input(page)).toBeFocused();
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  return (await storedDraft(page, "index.html"))!.content;
}

for (const route of ["/work/fern-and-kettle/oak-ash/", "/work/chairs/oak-chair/"]) {
  test(`typed address ${route} creates the page and fills the card; Undo restores bytes`, async ({ page, baseURL }) => {
    const blank = await openPicker(page, baseURL);
    await input(page).fill(route.replace(/\/$/, ""));
    await expect(create(page)).toContainText(`+ Create page ${route}`);
    await expect(create(page)).toHaveAttribute("aria-selected", "true");
    await input(page).press("Enter");
    const file = `${route.slice(1)}index.html`;
    await expect.poll(async () => (await storedDraft(page, file))?.content).toContain("<h2>The brief</h2>");
    await expect(frame(page).locator("card-project").last().locator("a")).toHaveAttribute("href", route);
    await page.locator(".code-editor__undo").click();
    await expect.poll(() => storedDraft(page, file)).toBeUndefined();
    await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(blank);
    await expect(frame(page).locator("card-project")).toHaveCount(3);
    await page.locator(".code-editor__undo").click();
    await expect(frame(page).locator("card-project")).toHaveCount(2);
    await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  });
}

test("two new levels and invalid folders show disabled reasons and cannot be picked", async ({ page, baseURL }) => {
  const blank = await openPicker(page, baseURL);
  for (const route of ["/work/chairs/tall/oak/", "/work/../oak/", "/work//oak/"]) {
    await input(page).fill(route);
    await expect(create(page)).toHaveAttribute("aria-disabled", "true");
    await expect(create(page).locator(".card-link__sub")).not.toBeEmpty();
    await input(page).press("Enter");
    await create(page).dispatchEvent("click");
    expect((await storedDraft(page, "index.html"))?.content).toBe(blank);
  }
  await input(page).fill("/work/chairs/tall/oak/");
  await expect(create(page)).toContainText("Choose an existing folder or add one folder inside it.");
  expect(await storedDraft(page, "work/chairs/tall/oak/index.html")).toBeUndefined();
});

test("a taken address or existing title offers the page, greyed In this grid, without Create page", async ({ page, baseURL }) => {
  await openPicker(page, baseURL);
  for (const query of ["/work/harbour-lane-pottery", "Harbour Lane Pottery"]) {
    await input(page).fill(query);
    await expect(create(page)).toHaveCount(0);
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("option")).toContainText("In this grid");
  }
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("tap creates a page at the typed address", async ({ page, baseURL }) => {
    await openPicker(page, baseURL);
    await input(page).fill("/work/chairs/oak");
    await create(page).tap();
    await expect.poll(() => storedDraft(page, "work/chairs/oak/index.html")).toBeTruthy();
    await expect(frame(page).locator("card-project").last().locator("a")).toHaveAttribute("href", "/work/chairs/oak/");
  });
});

test("a narrow pane keeps the combobox in view; Tab folds the list and Esc leaves the card", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 820, height: 640 });
  const blank = await openPicker(page, baseURL);
  await input(page).fill("Oak");
  await expect(create(page)).toBeInViewport();
  await input(page).press("Tab");
  await expect(page.getByRole("listbox", { name: "Pages", exact: true })).toBeHidden();
  await input(page).focus();
  await input(page).press("Escape");
  await expect(input(page)).toHaveCount(0);
  expect((await storedDraft(page, "index.html"))?.content).toBe(blank);
});
