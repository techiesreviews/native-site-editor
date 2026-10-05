import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// The new page's folder in the card popover (src/components/card-grid-controls.ts):
// the URL prefix is editable with bounded folder suggestions; the choice reaches the page
// that is made (src/page-builder/cards.ts). Fixture `native-cards` (id 540).
const pageErrors: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const popover = (page: Page) => page.getByRole("dialog", { name: "New card with its own page" });
const title = (page: Page) => popover(page).getByRole("textbox", { name: "Page title" });
const folder = (page: Page) => popover(page).locator(".card-add__path");
const folders = (page: Page) => page.getByRole("listbox", { name: "Folder for the new page" });
const url = (page: Page) => popover(page).locator(".card-add__url");
// The URL as it shows: its visible text, with the new folder's name field's value in its place.
const shownUrl = (page: Page) => url(page).evaluate((row) => {
  const walk = (node: Node): string => node instanceof HTMLInputElement ? node.value
    : node instanceof HTMLElement ? (node.hidden ? "" : [...node.childNodes].map(walk).join("")) : node.textContent ?? "";
  return walk(row).replace(/\s+/g, " ").trim();
});

async function openPopover(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await frame(page).locator("card-project").last().scrollIntoViewIfNeeded();
  await frame(page).locator("card-project").last().hover();
  await page.locator(".card-ghost__add").click();
  await expect(title(page)).toBeFocused();
}


test("prefix defaults to the section; filtering and keyboard selection keep title and focus", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak & Ash");
  await expect(folder(page)).toHaveValue("/work/");
  await expect.poll(() => shownUrl(page)).toBe("URL /work/oak-ash/");
  await folder(page).focus();
  await folder(page).press("ArrowUp");
  await expect(folders(page).getByRole("option").last()).toHaveAttribute("aria-selected", "true");
  await folder(page).press("Escape");
  await folder(page).fill("/work/fern");
  await expect(folders(page).getByRole("option")).toHaveCount(1);
  await folder(page).press("ArrowDown");
  await expect(folder(page)).toBeFocused();
  await expect(folder(page)).toHaveAttribute("aria-activedescendant", "card-add-folder-0");
  await folder(page).press("Enter");
  await expect(folder(page)).toHaveValue("/work/fern-and-kettle/");
  await expect(folders(page)).toBeHidden();
  await folder(page).click();
  await folder(page).press("Escape");
  await expect(popover(page)).toBeVisible();
  await expect(folders(page)).toBeHidden();
  await expect(title(page)).toHaveValue("Oak & Ash");
  await title(page).press("Enter");
  await expect(page.locator("#status")).toContainText("Created the page Oak & Ash at /work/fern-and-kettle/oak-ash/");
  expect((await storedDraft(page, "work/fern-and-kettle/oak-ash/index.html"))?.content).toContain("Oak &amp; Ash");
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(2);
  await expect.poll(async () => (await storedDraft(page, "work/fern-and-kettle/oak-ash/index.html"))?.content).toBeUndefined();
});

test("clearing prefix persists through title changes; invalid and multiple new levels refuse", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await folder(page).fill("");
  await title(page).fill("Oak");
  await expect(folder(page)).toHaveValue("");
  await expect(popover(page).locator(".card-add__message")).toHaveText("Enter the URL prefix.");
  for (const prefix of ["/work/chairs/tall/", "/work/../", "/work//"]) {
    await folder(page).fill(prefix);
    await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeDisabled();
  }
  expect(await storedDraft(page, "index.html")).toBeUndefined();
});

test("typed new folder creates page and card in one Undo", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak Chair");
  await folder(page).fill("/work/chairs/");
  await expect.poll(() => shownUrl(page)).toBe("URL /work/chairs/oak-chair/");
  await page.getByRole("button", { name: "Create page and card" }).click();
  await expect(page.locator("#status")).toContainText("Created the page Oak Chair at /work/chairs/oak-chair/");
  expect((await storedDraft(page, "index.html"))?.content).toContain('href="/work/chairs/oak-chair/"');
  await page.locator(".code-editor__undo").click();
  await expect.poll(async () => (await storedDraft(page, "work/chairs/oak-chair/index.html"))?.content).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBeUndefined();
});

test("taken URL refuses; click chooses suggestion; outside focus closes list", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Harbour Lane Pottery");
  await expect(popover(page).locator(".card-add__message")).toContainText("is taken");
  await expect(page.getByRole("button", { name: "Create page and card" })).toBeDisabled();
  await folder(page).click();
  await folders(page).getByRole("option", { name: "/work/fern-and-kettle/", exact: true }).click();
  await expect(folder(page)).toHaveValue("/work/fern-and-kettle/");
  await folder(page).click();
  await title(page).click();
  await expect(folders(page)).toBeHidden();
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("tap chooses existing prefix; typing new prefix updates preview", async ({ page, baseURL }) => {
    await openPopover(page, baseURL);
    await title(page).fill("Oak");
    await folder(page).tap();
    await folders(page).getByRole("option", { name: "/work/harbour-lane-pottery/", exact: true }).tap();
    await expect(folder(page)).toHaveValue("/work/harbour-lane-pottery/");
    await folder(page).fill("/work/harbour-lane-pottery/kilns/");
    await expect.poll(() => shownUrl(page)).toBe("URL /work/harbour-lane-pottery/kilns/oak/");
    await title(page).tap();
    await expect(folders(page)).toBeHidden();
  });
});

test("suggestions stay attached in a narrow pane; Tab leaves combobox and closes list", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 820, height: 640 });
  await openPopover(page, baseURL);
  await title(page).fill("Oak");
  await folder(page).focus();
  await folder(page).press("ArrowDown");
  const geometry = await page.evaluate(() => {
    const menu = document.querySelector(".card-add__folders")!.getBoundingClientRect();
    const input = document.querySelector(".card-add__path")!.getBoundingClientRect();
    const add = document.querySelector(".card-ghost__add")!.getBoundingClientRect();
    return { below: menu.top - input.bottom, above: input.top - menu.bottom,
      inView: menu.top >= 0 && menu.bottom <= innerHeight,
      overlaps: menu.left < add.right && add.left < menu.right && menu.top < add.bottom && add.top < menu.bottom };
  });
  expect(Math.abs(geometry.below - 4) < 1 || Math.abs(geometry.above - 4) < 1).toBe(true);
  expect(geometry.inView).toBe(true);
  expect(geometry.overlaps).toBe(false);
  await folder(page).press("Tab");
  await expect(folders(page)).toBeHidden();
  await expect(popover(page).getByRole("button", { name: "Card only" })).toBeFocused();
  await expect(popover(page)).toBeVisible();
});
