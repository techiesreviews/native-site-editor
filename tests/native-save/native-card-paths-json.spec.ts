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

// A source edit landing while Create waits. The click is a synthetic
// (untrusted) `HTMLElement.click()` on the real Create button: its real
// submit handler runs synchronously into src/page-builder/cards.ts `addPage`,
// which records the page's source and the JSON file and then awaits
// `ensureOpen` (already open here, so only a promise turn: no network is
// held). In the same task, before that continuation, the public editor API
// appends a comment to the end of index.html, outside the generated grid.
const REFUSED = "The page changed meanwhile; check the URL and try again.";
const FOREIGN = "\n<!-- foreign edit -->";

test("a source edit landing while Create waits is refused: nothing else is written, one Undo takes the edit back, and Create then works", async ({ page, baseURL }) => {
  const sidecar = await savedJsonCollection(page, baseURL);
  const before = await mounted(page);
  await openPopover(page);
  await title(page).fill("Oak");
  const create = popover(page).getByRole("button", { name: "Create page and card" });
  await expect(create).toBeEnabled();
  const race = await create.evaluate(async (button, foreign) => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource("index.html")!;
    (button as HTMLButtonElement).click();
    // The handler ran up to its first await; nothing is written yet.
    const untouched = editor.getMountedSource("index.html") === source;
    editor.replaceActiveRange({ path: "index.html", start: source.length, end: source.length, expected: "", text: foreign });
    return { untouched };
  }, FOREIGN);
  expect(race.untouched).toBe(true);
  await expect(popover(page).locator(".card-add__message")).toHaveText(REFUSED);
  await expect(popover(page)).toBeVisible();
  expect(await mounted(page)).toBe(before + FOREIGN);
  // Only the foreign edit is drafted: no page, no card, no JSON draft; the JSON file as saved.
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["index.html"]);
  expect(await storedDraft(page, "work/oak/index.html")).toBeUndefined();
  expect(await storedDraft(page, SIDECAR)).toBeUndefined();
  expect(await file(page, baseURL, SIDECAR)).toBe(sidecar);
  await expect(cards(page)).toHaveCount(3);
  // One Undo takes the foreign edit back.
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  // With no edit in between, the real button creates the page and its baked card, one Undo again.
  await openPopover(page);
  await title(page).fill("Oak");
  await popover(page).getByRole("button", { name: "Create page and card" }).click();
  await expect(page.locator("#status")).toContainText("Created the page Oak at /work/oak/");
  await expect(cards(page)).toHaveCount(4);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  expect(await file(page, baseURL, SIDECAR)).toBe(sidecar);
});

// While the popover is open, an edit to the generated grid's own opening tag
// (through the same public editor API) makes its JSON collection unlocatable:
// the next check, on typing, reads that live and refuses; putting the tag back
// makes Create available again.
test("an open popover rechecks its collection as the title is typed: refused while the grid's tag is changed, offered again once it is back", async ({ page, baseURL }) => {
  await savedJsonCollection(page, baseURL);
  const before = await mounted(page);
  await openPopover(page);
  await title(page).fill("Oak");
  const create = popover(page).getByRole("button", { name: "Create page and card" });
  await expect(create).toBeEnabled();
  const tag = '<div class="cards"';
  const at = before.indexOf(tag) + tag.length;
  expect(before.indexOf(tag)).toBeGreaterThan(0);
  await page.evaluate(async (at) => {
    (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: ' data-moved="1"' });
  }, at);
  if (await popover(page).isHidden()) test.info().annotations.push({ type: "limitation", description: "The source update closed the popover; the live recheck could not be shown." });
  await expect(popover(page)).toBeVisible();
  await title(page).press("End");
  await page.keyboard.type("s");
  await expect(popover(page).locator(".card-add__message")).toContainText("could not be found");
  await expect(create).toBeDisabled();
  await page.evaluate(async (at) => {
    (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at + ' data-moved="1"'.length, expected: ' data-moved="1"', text: "" });
  }, at);
  await page.keyboard.press("Backspace");
  await expect(popover(page).locator(".card-add__message")).toBeHidden();
  await expect(create).toBeEnabled();
  expect(await mounted(page)).toBe(before);
});
