import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// The new page's folder in the card popover (src/components/card-grid-controls.ts):
// the URL's folder is plain text that opens the site's folders in place,
// the current one first, then "New folder"; the choice reaches the page
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
const folders = (page: Page) => popover(page).getByRole("listbox", { name: "Folder for the new page" });
const url = (page: Page) => popover(page).locator(".card-add__url");
const shots = ".scratch/inline-paths";

async function openPopover(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await frame(page).locator("card-project").first().hover();
  await page.locator(".card-ghost__add").click();
  await expect(title(page)).toBeFocused();
}

test("the folder defaults to the grid's; keyboard picks a subfolder, Escape closes only the list, the title keeps its typing", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak & Ash");
  await expect(url(page)).toHaveText("URL /work/oak-ash/");
  // The title reads as text: no box around it at rest.
  expect(await title(page).evaluate((input) => getComputedStyle(input).borderTopWidth === "0px" || getComputedStyle(input).borderTopColor === "rgba(0, 0, 0, 0)")).toBe(true);
  await page.screenshot({ path: `${shots}/popover-light.png` });

  await folder(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(folders(page)).toBeVisible();
  const options = folders(page).getByRole("option");
  await expect(options.first()).toHaveText("/work/");
  await expect(options.first()).toBeFocused();
  await page.screenshot({ path: `${shots}/folders-open-light.png` });
  await page.keyboard.press("Escape");
  await expect(folders(page)).toBeHidden();
  await expect(popover(page)).toBeVisible();
  await expect(folder(page)).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await folders(page).getByRole("option", { name: "/work/fern-and-kettle/" }).focus();
  await page.keyboard.press("Enter");
  await expect(folders(page)).toBeHidden();
  await expect(url(page)).toHaveText("URL /work/fern-and-kettle/oak-ash/");
  await expect(title(page)).toHaveValue("Oak & Ash");
  await title(page).press("Enter");
  await expect(popover(page)).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Created the page Oak & Ash at /work/fern-and-kettle/oak-ash/ and its card in Recent work");
  expect((await storedDraft(page, "work/fern-and-kettle/oak-ash/index.html"))?.content).toContain("<h1>Oak &amp; Ash</h1>");
  expect((await storedDraft(page, "index.html"))?.content).toContain(`href="/work/fern-and-kettle/oak-ash/"`);
  // One Undo takes both back exactly.
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(2);
  await expect.poll(async () => (await storedDraft(page, "work/fern-and-kettle/oak-ash/index.html"))?.content).toBeUndefined();
});

test("hovering the folder shows the list without taking focus; a new folder is named in place, with the URL following", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak");
  await folder(page).hover();
  await expect(folders(page)).toBeVisible();
  await expect(title(page)).toBeFocused();
  await page.keyboard.type(" Chair");
  await expect(title(page)).toHaveValue("Oak Chair");

  await folders(page).getByRole("option", { name: "New folder in /work/" }).click();
  const name = folders(page).getByRole("textbox", { name: "New folder's name" });
  await expect(name).toBeFocused();
  await name.fill("chairs");
  await expect(url(page)).toHaveText("URL /work/chairs/oak-chair/");
  await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeDisabled();
  await page.screenshot({ path: `${shots}/new-folder-light.png` });
  // Escape drops the new folder only.
  await name.press("Escape");
  await expect(url(page)).toHaveText("URL /work/oak-chair/");
  await expect(popover(page)).toBeVisible();
  await expect(title(page)).toHaveValue("Oak Chair");

  await folder(page).click();
  await folders(page).getByRole("option", { name: "New folder in /work/" }).click();
  await name.fill("fern-and-kettle");
  await expect(popover(page).locator(".card-add__message")).toContainText("taken");
  await name.fill("chairs");
  await name.press("Enter");
  await expect(title(page)).toBeFocused();
  await expect(url(page)).toHaveText("URL /work/chairs/oak-chair/");
  const before = (await storedDraft(page, "index.html"))?.content;
  await page.getByRole("button", { name: "Create page and card" }).click();
  await expect(page.locator("#status")).toHaveText("Created the page Oak Chair at /work/chairs/oak-chair/ and its card in Recent work");
  expect((await storedDraft(page, "work/chairs/oak-chair/index.html"))?.content).toContain("Oak Chair");
  await page.locator(".code-editor__undo").click();
  await expect.poll(async () => (await storedDraft(page, "work/chairs/oak-chair/index.html"))?.content).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(before);
});

test("a taken URL changes nothing; touch opens the list; dark and narrow keep the inline look", async ({ page, baseURL }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openPopover(page, baseURL);
  await title(page).fill("Harbour Lane Pottery");
  await expect(popover(page).locator(".card-add__message")).toContainText("is taken");
  await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeDisabled();
  await title(page).press("Enter");
  await expect(popover(page)).toBeVisible();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  await folder(page).dispatchEvent("click");
  await expect(folders(page)).toBeVisible();
  await page.screenshot({ path: `${shots}/folders-open-dark.png` });
  await page.setViewportSize({ width: 820, height: 760 });
  await page.screenshot({ path: `${shots}/folders-open-dark-narrow.png` });
});

test("after a card's page goes in another folder, the next Add still makes a page, in the grid's folder by default", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak");
  await folder(page).click();
  await folders(page).getByRole("option", { name: "/work/fern-and-kettle/" }).click();
  await title(page).press("Enter");
  await expect(page.locator("#status")).toHaveText("Created the page Oak at /work/fern-and-kettle/oak/ and its card in Recent work");
  await expect(frame(page).locator("card-project")).toHaveCount(3);

  await frame(page).locator("card-project").first().hover();
  await expect(page.locator(".card-ghost__add")).toHaveAccessibleName("Add a card with its own page to Recent work");
  await page.locator(".card-ghost__add").click();
  await expect(title(page)).toBeFocused();
  await title(page).fill("Ash");
  await expect(url(page)).toHaveText("URL /work/ash/");
  await title(page).press("Enter");
  await expect(page.locator("#status")).toHaveText("Created the page Ash at /work/ash/ and its card in Recent work");
  await expect(frame(page).locator("card-project")).toHaveCount(4);
  expect((await storedDraft(page, "work/ash/index.html"))?.content).toContain("Ash");
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("taps open the folder list and choose a folder; nothing depends on hover", async ({ page, baseURL }) => {
    await openPopover(page, baseURL);
    await title(page).fill("Oak");
    await folder(page).tap();
    await expect(folders(page)).toBeVisible();
    await folders(page).getByRole("option", { name: "/work/harbour-lane-pottery/" }).tap();
    await expect(folders(page)).toBeHidden();
    await expect(url(page)).toHaveText("URL /work/harbour-lane-pottery/oak/");
    await folder(page).tap();
    await folders(page).getByRole("option", { name: "New folder in /work/harbour-lane-pottery/" }).tap();
    const name = folders(page).getByRole("textbox", { name: "New folder's name" });
    await expect(name).toBeFocused();
    await name.fill("kilns");
    await expect(url(page)).toHaveText("URL /work/harbour-lane-pottery/kilns/oak/");
    // Tapping the title takes the folder and keeps the popover.
    await title(page).tap();
    await expect(folders(page)).toBeHidden();
    await expect(url(page)).toHaveText("URL /work/harbour-lane-pottery/kilns/oak/");
    await expect(popover(page)).toBeVisible();
  });
});
