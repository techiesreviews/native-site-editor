import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

// The card popover's folders for a collection kept in .editor/page-builder.json
// (src/page-builder/cards.ts with the editor's JSON host). Runs on a copy of
// the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");

const SIDECAR = ".editor/page-builder.json";
const pageErrors: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path = "index.html") => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const inspector = (page: Page) => page.getByRole("region", { name: "Collection settings", exact: true });
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const popover = (page: Page) => page.getByRole("dialog", { name: "New card with its own page" });
const title = (page: Page) => popover(page).getByRole("textbox", { name: "Page title" });
const folder = (page: Page) => popover(page).locator(".card-add__path");
const folders = (page: Page) => page.getByRole("listbox", { name: "Folder for the new page" });
const message = (page: Page) => popover(page).locator(".card-add__message");
const cards = (page: Page) => frame(page).locator(".cards card-project");
const shots = ".scratch/inline-paths/json";

async function load(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

/** The home grid made a JSON collection of /work/ and saved, then the editor opened afresh: the sidecar is on the branch only. */
async function savedJsonCollection(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  await load(page, baseURL);
  await cards(page).first().click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  await expect(inspector(page).getByRole("checkbox", { name: "/work/", exact: true })).toBeChecked();
  await inspector(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain('"pagePath": "index.html"');
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  const sidecar = await file(page, baseURL, SIDECAR);
  expect(sidecar).toContain('"/work/"');
  expect(await file(page, baseURL, "index.html")).not.toMatch(/data-each|<template/);
  await page.goto(`${baseURL}/`);
  await load(page, baseURL);
  expect(await storedDrafts(page)).toEqual([]);
  return sidecar;
}

async function openPopover(page: Page) {
  await cards(page).last().scrollIntoViewIfNeeded();
  await cards(page).last().hover();
  await page.locator(".card-ghost__add").click();
  await expect(title(page)).toBeFocused();
}

test("a saved JSON collection is read, not left Checking: a page in a new folder bakes its card, and one Undo restores both files exactly", async ({ page, baseURL }) => {
  const sidecar = await savedJsonCollection(page, baseURL);
  const before = await mounted(page);
  await expect(cards(page)).toHaveCount(3);
  await openPopover(page);
  await title(page).fill("Oak");
  await expect(message(page)).toBeHidden();
  await expect(popover(page).locator(".card-add__url")).toHaveText("URL /work/oak/");
  await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeEnabled();
  // Only folders the collection covers are offered.
  await folder(page).click();
  await expect(folders(page).getByRole("option").first()).toHaveText("/work/");
  await expect(folders(page).getByRole("option", { name: "/about/", exact: true })).toHaveCount(0);
  await expect(folders(page).getByRole("option", { name: "/", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/json-folders-light.png` });
  await folders(page).getByRole("option", { name: "New folder in /work/" }).click();
  await popover(page).getByRole("textbox", { name: "New folder's name" }).fill("chairs");
  await page.getByRole("button", { name: "Create page and card" }).click();
  await expect(popover(page)).toBeHidden();
  await expect(page.locator("#status")).toContainText("Created the page Oak at /work/chairs/oak/");
  // The host bakes the card from the JSON recipe in the same operation.
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).filter({ hasText: "Oak" })).toHaveCount(1);
  expect((await storedDraft(page, "work/chairs/oak/index.html"))?.content).toContain("Oak");
  expect((await storedDraft(page, "index.html"))?.content).toContain("/work/chairs/oak/");
  // One Undo: no drafts, the page and JSON as saved.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  await expect(cards(page)).toHaveCount(3);
  expect(await mounted(page)).toBe(before);
  expect(await file(page, baseURL, SIDECAR)).toBe(sidecar);
});

test("an existing subfolder of the collection takes the page and its baked card; an uncovered new folder is impossible to reach", async ({ page, baseURL }) => {
  await savedJsonCollection(page, baseURL);
  await openPopover(page);
  await title(page).fill("Kiln notes");
  await folder(page).click();
  await folders(page).getByRole("option", { name: "/work/harbour-lane-pottery/", exact: true }).click();
  await expect(popover(page).locator(".card-add__url")).toHaveText("URL /work/harbour-lane-pottery/kiln-notes/");
  await title(page).press("Enter");
  await expect(page.locator("#status")).toContainText("Created the page Kiln notes at /work/harbour-lane-pottery/kiln-notes/");
  await expect(cards(page)).toHaveCount(4);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
});

test("after a fresh load the JSON file on the branch is read: the popover shows no Checking and offers the page", async ({ page, baseURL }) => {
  await savedJsonCollection(page, baseURL);
  await openPopover(page);
  await title(page).fill("Oak");
  await expect(message(page)).toBeHidden();
  await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeEnabled();
});
