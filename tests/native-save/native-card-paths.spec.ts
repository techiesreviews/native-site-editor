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
const folders = (page: Page) => page.getByRole("listbox", { name: "Folder for the new page" });
const url = (page: Page) => popover(page).locator(".card-add__url");
// The URL as it shows: its visible text, with the new folder's name field's value in its place.
const shownUrl = (page: Page) => url(page).evaluate((row) => {
  const walk = (node: Node): string => node instanceof HTMLInputElement ? node.value
    : node instanceof HTMLElement ? (node.hidden ? "" : [...node.childNodes].map(walk).join("")) : node.textContent ?? "";
  return walk(row).replace(/\s+/g, " ").trim();
});
const shots = ".scratch/inline-paths";

async function openPopover(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await frame(page).locator("card-project").last().scrollIntoViewIfNeeded();
  await frame(page).locator("card-project").last().hover();
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
  const name = popover(page).getByRole("textbox", { name: "New folder's name" });
  await expect(name).toBeFocused();
  await name.fill("chairs");
  await expect.poll(() => shownUrl(page)).toBe("URL /work/chairs/oak-chair/");
  // Create takes the name as it is typed.
  await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeEnabled();
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
  await expect.poll(() => shownUrl(page)).toBe("URL /work/chairs/oak-chair/");
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
    const name = popover(page).getByRole("textbox", { name: "New folder's name" });
    await expect(name).toBeFocused();
    await name.fill("kilns");
    await expect.poll(() => shownUrl(page)).toBe("URL /work/harbour-lane-pottery/kilns/oak/");
    // Tapping the title takes the folder and keeps the popover.
    await popover(page).locator(".card-add__title").tap();
    await expect(folders(page)).toBeHidden();
    await expect.poll(() => shownUrl(page)).toBe("URL /work/harbour-lane-pottery/kilns/oak/");
    await expect(popover(page)).toBeVisible();
  });
});

test("pointing at the folder opens the list without moving the folder; a click at the same spot keeps it open and chooses nothing", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak");
  const before = (await folder(page).boundingBox())!;
  const formBefore = (await popover(page).boundingBox())!;
  const x = before.x + before.width / 2, y = before.y + before.height / 2;
  await page.screenshot({ path: `${shots}/hover-anchor-before-light.png` });
  await page.mouse.move(x - 120, y);
  await page.mouse.move(x, y, { steps: 6 });
  await expect(folders(page)).toBeVisible();
  const after = (await folder(page).boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
  expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
  expect((await popover(page).boundingBox())!).toEqual(formBefore);
  await expect(title(page)).toBeFocused();
  await page.mouse.down();
  await page.mouse.up();
  await expect(folders(page)).toBeVisible();
  await expect(url(page)).toHaveText("URL /work/oak/");
  await expect(folders(page).getByRole("option", { selected: true })).toHaveText("/work/");
  // The list stays off the popover's own Add button.
  const list = (await page.locator(".card-add__folders").boundingBox())!;
  const ghost = (await page.locator(".card-ghost__add").boundingBox())!;
  const overlaps = list.x < ghost.x + ghost.width && ghost.x < list.x + list.width && list.y < ghost.y + ghost.height && ghost.y < list.y + list.height;
  expect(overlaps).toBe(false);
  await page.screenshot({ path: `${shots}/hover-anchor-light.png` });
  console.log(`anchor before ${JSON.stringify(before)} after ${JSON.stringify(after)} popover ${JSON.stringify(formBefore)} list ${JSON.stringify(list)} add ${JSON.stringify(ghost)}`);
});

test("a new folder's empty name is no error yet; Create takes a typed name in one click; focus shows an underline, not a box", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak");
  const style = await title(page).evaluate((input) => { const s = getComputedStyle(input); return { outline: s.outlineStyle, shadow: s.boxShadow, border: s.borderTopWidth }; });
  expect(style.outline).toBe("none");
  expect(style.shadow).toContain("-2px");
  await folder(page).click();
  await folders(page).getByRole("option", { name: "New folder in /work/" }).click();
  const name = popover(page).getByRole("textbox", { name: "New folder's name" });
  await expect(name).toBeFocused();
  await expect(popover(page).locator(".card-add__message")).toBeHidden();
  await expect(title(page)).toHaveAttribute("aria-invalid", "false");
  await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeEnabled();
  await expect(folders(page).getByRole("textbox")).toHaveCount(0);
  await name.fill("chairs");
  await page.getByRole("button", { name: "Create page and card" }).click();
  await expect(page.locator("#status")).toHaveText("Created the page Oak at /work/chairs/oak/ and its card in Recent work");
});

test("Tab from a new folder's name keeps the name and moves on, not back to the title", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await title(page).fill("Oak");
  await folder(page).click();
  await folders(page).getByRole("option", { name: "New folder in /work/" }).click();
  await popover(page).getByRole("textbox", { name: "New folder's name" }).fill("chairs");
  await page.keyboard.press("Tab");
  await expect.poll(() => shownUrl(page)).toBe("URL /work/chairs/oak/");
  await expect(title(page)).not.toBeFocused();
  await expect(title(page)).toHaveValue("Oak");
});

// Where the list is, against its folder and the popover's Add button.
async function menuGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON() as DOMRect;
    const menu = rect(".card-add__folders"), path = rect(".card-add__path"), add = rect(".card-ghost__add");
    const overlaps = menu.left < add.right && add.left < menu.right && menu.top < add.bottom && add.top < menu.bottom;
    return { gapBelow: menu.top - path.bottom, gapAbove: path.top - menu.bottom, overlaps, menu, path, inView: menu.top >= 0 && menu.bottom <= innerHeight && menu.left >= 0 && menu.right <= innerWidth };
  });
}
const attached = (geometry: Awaited<ReturnType<typeof menuGeometry>>) => Math.abs(geometry.gapBelow - 4) < 1 || Math.abs(geometry.gapAbove - 4) < 1;

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("the list is under its folder from the first frame of the popover's opening animation", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await frame(page).locator("card-project").first().hover();
    await page.locator(".card-ghost__add").click();
    // Still inside the popover's 160ms entrance: the list opens at its folder, not where the moving popover carries it.
    await folder(page).focus();
    await page.keyboard.press("ArrowDown");
    const early = await menuGeometry(page);
    expect(attached(early), JSON.stringify(early)).toBe(true);
    await page.waitForTimeout(400);
    const settled = await menuGeometry(page);
    expect(attached(settled), JSON.stringify(settled)).toBe(true);
    expect(settled.overlaps).toBe(false);
  });
});

test("New folder's plus and words start at the row's left, like the folders above", async ({ page, baseURL }) => {
  await openPopover(page, baseURL);
  await folder(page).click();
  const row = await folders(page).getByRole("option", { name: "New folder in /work/" }).evaluate((option) => {
    const box = option.getBoundingClientRect(), icon = option.querySelector("svg")!.getBoundingClientRect(), words = option.querySelector("span")!.getBoundingClientRect();
    const first = option.parentElement!.querySelector("[role=option]")!;
    const text = document.createRange(); text.selectNodeContents(first);
    return { iconLeft: icon.left - box.left, wordsLeft: words.left - box.left, firstLeft: text.getBoundingClientRect().left - box.left };
  });
  expect(row.iconLeft).toBeLessThanOrEqual(row.firstLeft + 1);
  expect(row.wordsLeft).toBeLessThan(row.firstLeft + 24);
});

test("in a narrow, short pane the list stays at its folder, in view, off the Add button, and follows the popover's scroll", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 820, height: 640 });
  await openPopover(page, baseURL);
  await title(page).fill("Oak");
  await folder(page).click();
  const first = await menuGeometry(page);
  expect(attached(first), JSON.stringify(first)).toBe(true);
  expect(first.overlaps).toBe(false);
  expect(first.inView).toBe(true);
  await page.screenshot({ path: `${shots}/folders-narrow-short-light.png` });
  // Scrolling the popover (capped to the pane) carries the list with its folder.
  const scrollable = await popover(page).evaluate((form) => form.scrollHeight > form.clientHeight);
  await popover(page).evaluate((form) => { form.style.maxHeight = "150px"; form.scrollTop = 30; form.dispatchEvent(new Event("scroll")); });
  const scrolled = await menuGeometry(page);
  expect(attached(scrolled), JSON.stringify({ scrollable, scrolled })).toBe(true);
  expect(scrolled.path.top).not.toBe(first.path.top);
});
