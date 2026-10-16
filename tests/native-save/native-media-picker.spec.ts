// The Media picker (media-manager build slice 18, ticket 06): the Media pane's search, Collections,
// views and records in a smaller window, with only files that fit the place; a tile chooses its
// file, Use places it, Cancel keeps the placement; full-screen on phones.
// Default fixture: index.html's hero image is images/placeholder.svg (no alt); images/studio-desk.svg is unused.
import { expect, test, type Page } from "@playwright/test";
import { openEditor, pickPicture, openImagePicker } from "../support/scenarios";
import { storedDraft } from "./drafts";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const picker = (page: Page) => page.getByRole("dialog", { name: "Choose image", exact: true });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const records = async (page: Page) => {
  const draft = await storedDraft(page, ".editor/media.json");
  return draft ? JSON.parse(draft.content) as { files?: Record<string, { places?: Record<string, { decorative?: boolean }> }> } : undefined;
};

async function open(page: Page, baseURL: string | undefined) {
  await openEditor(page, baseURL);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
}
async function openPicker(page: Page) {
  // A double-click on the selected image opens the picker (the bar's Image button opens the image popup).
  await openImagePicker(page, ".hero img");
  await expect(picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true })).toBeVisible();
  await expect(picker(page)).not.toHaveAttribute("aria-busy", "true");
}

test("from a double-click on the image: search, choose, Use places the new image; Cancel leaves it unchanged", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const before = await source(page);
  // Cancel: nothing is placed, even with a file chosen.
  await openPicker(page);
  await expect(picker(page).locator(".media-library__place")).toHaveText("Home · Image");
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  expect(await source(page)).toBe(before);
  // Search, choose, Use.
  await openPicker(page);
  // "Use" until a pick, with no "Choose one image" line (slice 113); then "Use image".
  await expect(picker(page).getByRole("button", { name: "Use", exact: true })).toBeDisabled();
  await expect(picker(page).locator(".media-library__chosen-text")).toHaveText("");
  const use = picker(page).getByRole("button", { name: "Use image", exact: true });
  await picker(page).getByLabel("Search media", { exact: true }).fill("studio");
  await expect(picker(page).locator(".media-library__card")).toHaveCount(1);
  const tile = picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(picker(page).locator(".media-library__chosen-text")).toHaveText("studio-desk.svg");
  await use.click();
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Image replaced");
  await expect.poll(() => source(page)).toContain('src="/images/studio-desk.svg"');
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
});

test("a phone shows the picker full-screen, its status above one row of Cancel and Use", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await openPicker(page);
  const box = (await picker(page).boundingBox())!;
  expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  // Before a pick, the footer is one 56 px row of Cancel and Use (slice 113).
  expect((await picker(page).locator(".media-library__choice").boundingBox())!.height).toBe(56);
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  const cancel = picker(page).getByRole("button", { name: "Cancel", exact: true });
  const use = picker(page).getByRole("button", { name: "Use image", exact: true });
  await expect(cancel).toBeInViewport(); await expect(use).toBeInViewport();
  const [c, u, status] = [(await cancel.boundingBox())!, (await use.boundingBox())!, (await picker(page).locator(".media-library__chosen").boundingBox())!];
  expect(c.height).toBeGreaterThanOrEqual(44); expect(u.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(c.y - u.y)).toBeLessThan(1); expect(c.x + c.width).toBeLessThanOrEqual(u.x);
  expect(status.y + status.height).toBeLessThanOrEqual(c.y);
  // The One bar fits on the phone: search, Collections and More on one row.
  const [search, more] = [(await picker(page).getByLabel("Search media", { exact: true }).boundingBox())!, (await picker(page).getByRole("button", { name: "More", exact: true }).boundingBox())!];
  expect(Math.abs(search.y - more.y)).toBeLessThan(1); expect(more.x + more.width).toBeLessThanOrEqual(390);
  await use.click();
  await expect.poll(() => source(page)).toContain('src="/images/studio-desk.svg"');
});

test("Use leaves an undescribed file missing until File details supplies its description", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPicker(page);
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  const image = frame(page).locator(".hero img");
  await expect(image).toHaveAttribute("alt", "");
  await image.click();
  await expect(bar(page).getByRole("button", { name: "Not described yet", exact: true })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Decorative", exact: true })).toHaveAttribute("aria-pressed", "false");
  await openPicker(page);
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "File details", exact: true }).click();
  await picker(page).getByLabel("Description", { exact: true }).fill("A studio desk, now described");
  await picker(page).getByRole("button", { name: "Save details", exact: true }).click();
  await expect(image).toHaveAttribute("alt", "A studio desk, now described");
  await picker(page).getByRole("button", { name: "Back", exact: true }).click();
  await picker(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await image.click();
  await expect(bar(page).getByRole("button", { name: "Not described yet", exact: true })).toHaveCount(0);
});

test("a phone picker with 30 collections keeps Filter's menu inside the screen; Escape closes only the menu and keeps the choice", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseURL!);
  const collections = Array.from({ length: 30 }, (_, at) => `Trip ${at + 1}`);
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: ".editor/media.json", content: JSON.stringify({ version: 2, collections, files: {} }) } })).status()).toBe(204);
  await open(page, baseURL);
  // Opened wide (the edit bar can cover a phone's hero image), then the phone's full-screen picker.
  await openPicker(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  // The phone picker's Filter reads as a muted "Filter" and its choice too (slice 122).
  const filter = picker(page).getByRole("button", { name: /^Filter/ });
  await expect(filter.locator(".media-library__filter-name")).toBeVisible();
  await expect(filter.locator(".media-library__filter-label")).toHaveText("All");
  await filter.click();
  const menu = page.getByRole("menu", { name: "Filter", exact: true });
  const box = await menu.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  const list = menu.getByRole("menuitemradio", { name: "List", exact: true });
  await list.scrollIntoViewIfNeeded(); await expect(list).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(picker(page)).toBeVisible();
  await expect(picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: /^Filter/ }).click();
  await list.click();
  await expect(picker(page).locator(".media-library__grid")).toHaveClass(/media-library__grid--list/);
  await expect(picker(page).getByRole("button", { name: "Use image", exact: true })).toBeEnabled();
});

test("the picker has the pane's Filter, + and More, shows only images, and keeps its choice through File details", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await openPicker(page);
  await expect(picker(page).getByRole("button", { name: "Add files", exact: true })).toBeVisible();
  await picker(page).getByRole("button", { name: /^Filter/ }).click();
  const filter = page.getByRole("menu", { name: "Filter", exact: true });
  await expect(filter.getByRole("group", { name: "Collections", exact: true }).getByRole("menuitem")).toHaveText(["Manage collections…"]);
  await expect(filter.getByRole("menuitemradio", { name: "All collections", exact: true })).toBeVisible();
  await expect(filter.getByRole("menuitemradio", { name: "List", exact: true })).toBeVisible();
  // Only compatible files: no kinds to choose.
  await expect(filter.getByRole("menuitemradio", { name: "Video", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // More keeps the one tool a picker has.
  await picker(page).getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem")).toHaveText(["Adding settings"]);
  await page.keyboard.press("Escape");
  await expect(picker(page)).toBeVisible();
  // There is no selecting many in the picker.
  await expect(picker(page).getByRole("checkbox", { name: /^Select / })).toHaveCount(0);
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "File details", exact: true }).click();
  await expect(picker(page).getByLabel("File name", { exact: true })).toHaveValue("studio-desk.svg");
  // Details has its own action row; Use waits until Back.
  await expect(picker(page).getByRole("button", { name: "Use image", exact: true })).toBeHidden();
  await picker(page).getByLabel("Description", { exact: true }).fill("A studio desk");
  await picker(page).getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(async () => JSON.stringify(await records(page))).toContain("A studio desk");
  await picker(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  // The place had no alt: it takes the new file's description.
  await expect.poll(() => source(page)).toMatch(/src="\/images\/studio-desk\.svg"[^>]*alt="A studio desk"|alt="A studio desk"[^>]*src="\/images\/studio-desk\.svg"/);
});

test("a Decorative place keeps its mark when its picture is swapped; one Undo brings both back", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pickPicture(page, ".hero img");
  await bar(page).getByRole("button", { name: "Decorative", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Decorative", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await records(page))?.files?.["images/placeholder.svg"]?.places?.["index.html"]?.decorative).toBe(true);
  const marked = await source(page), markedRecords = await records(page);
  await openPicker(page);
  await expect(picker(page).locator(".media-library__place")).toHaveText("Home · Image");
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Image replaced");
  await expect.poll(() => source(page)).toContain('src="/images/studio-desk.svg"');
  expect(await source(page)).toMatch(/<img[^>]*src="\/images\/studio-desk\.svg"[^>]*alt=""|<img[^>]*alt=""[^>]*src="\/images\/studio-desk\.svg"/);
  const moved = await records(page);
  expect(moved?.files?.["images/studio-desk.svg"]?.places?.["index.html"]?.decorative).toBe(true);
  expect(moved?.files?.["images/placeholder.svg"]?.places?.["index.html"]).toBeUndefined();
  await pickPicture(page, ".hero img");
  await expect(bar(page).getByRole("button", { name: "Decorative", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page).getByRole("button", { name: /Not described yet/ })).toHaveCount(0);
  // The swap and the moved mark are one step.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(marked);
  await expect.poll(() => records(page)).toEqual(markedRecords);
});

test("a file dropped on a page's image is added and chosen in the picker, placed only by Use", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="#36c"/></svg>';
  await frame(page).locator(".hero img").evaluate((image, svg) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([svg], "Dropped Photo.svg", { type: "image/svg+xml" }));
    for (const type of ["dragover", "drop"]) image.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, composed: true }));
  }, svg);
  await expect(picker(page)).toBeVisible();
  // No Optimise screen first: the file is prepared at once (slice 17's path), held and chosen; Use saves and places it (slice 23).
  await expect(picker(page).getByRole("heading", { name: "Optimise", exact: true })).toHaveCount(0);
  await expect(picker(page).getByRole("button", { name: "Choose Dropped Photo.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await source(page)).toBe(before);
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect.poll(() => source(page)).toContain('src="/media/images/dropped-photo.svg"');
});

test("Site settings' Choose favicon… opens the picker over the settings and fills the field on Use", async ({ page, baseURL }) => {
  await open(page, baseURL);
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Site settings", exact: true });
  const favicon = settings.getByLabel("Favicon", { exact: true });
  const before = await favicon.inputValue();
  await settings.getByRole("button", { name: "Choose favicon…", exact: true }).click();
  await expect(picker(page).locator(".media-library__place")).toHaveText("Site settings · Favicon");
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  // Escape closes only the picker; the field keeps its value.
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(favicon).toHaveValue(before);
  await settings.getByRole("button", { name: "Choose favicon…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(favicon).toHaveValue("/images/studio-desk.svg");
  // Slice 113: the favicon's 32 px preview sits before the field, and Choose favicon… is a button in the field's column.
  const preview = settings.locator(".site-settings__favicon-preview");
  await expect(preview.locator("img")).toBeVisible();
  await expect.poll(() => preview.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const [frame32, field, choose] = [(await preview.boundingBox())!, (await favicon.boundingBox())!, (await settings.getByRole("button", { name: "Choose favicon…", exact: true }).boundingBox())!];
  expect([frame32.width, frame32.height]).toEqual([32, 32]);
  expect(frame32.x + frame32.width).toBeLessThanOrEqual(field.x);
  expect(Math.abs(choose.x - frame32.x)).toBeLessThan(1);
  expect(choose.y).toBeGreaterThan(field.y + field.height);
});

test("the picker's height follows its content between 480 and 850 px, the grid scrolling inside", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await open(page, baseURL);
  await openPicker(page);
  await expect(picker(page).locator(".media-library__card").first()).toBeVisible();
  // A few files: shorter than 850 px, but never under 480.
  const few = (await picker(page).boundingBox())!.height;
  expect(few).toBeGreaterThanOrEqual(480); expect(few).toBeLessThan(850);
  const grid = picker(page).locator(".media-library__browse");
  expect(await grid.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  // A short window: the box fits it with 24 px to spare on each side, and the grid scrolls inside.
  await page.setViewportSize({ width: 1280, height: 520 });
  await expect.poll(async () => (await picker(page).boundingBox())!.height).toBe(520 - 48);
});
