// The Image button and the image popup (media-manager build slice 39, ticket 09 "Entry point and
// popup"): one Image button with a state badge; the popup's shape menu, focus dot and Replace show
// on the page at once but are kept only by Done (one Undo step); ✕ or Escape put everything back.
// Default fixture: index.html's hero image is images/placeholder.svg (no alt); images/studio-desk.svg is unused.
import { expect, test, type Page } from "@playwright/test";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const popup = (page: Page) => page.getByRole("dialog", { name: "Image", exact: true });
const picker = (page: Page) => page.getByRole("dialog", { name: "Choose image", exact: true });
// Named "Image" with its badge (the bar's name chip is "Image" too).
const imageButton = (page: Page) => bar(page).locator(".edit-bar__image");
const dot = (page: Page) => popup(page).getByRole("slider", { name: "Focus dot" });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const heroTag = async (page: Page) => (await source(page)).match(/<img[^>]*placeholder\.svg[^>]*>|<img[^>]*studio-desk\.svg[^>]*>/)?.[0] ?? "";

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openPopup(page: Page) {
  await frame(page).locator(".hero img").click();
  await imageButton(page).click();
  await expect(popup(page)).toBeVisible();
  await expect(imageButton(page)).toHaveAttribute("aria-expanded", "true");
}
async function chooseShape(page: Page, label: string) {
  await popup(page).getByRole("button", { name: /^Shape:/ }).click();
  await popup(page).getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(popup(page).getByRole("button", { name: `Shape: ${label}`, exact: true })).toBeVisible();
}

test("Image → Square, move the focus dot, Done: the page has the shape and object-position; Undo restores", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const before = await source(page);
  await frame(page).locator(".hero img").click();
  // One Image button with its state badge, where Choose image… was.
  await expect(imageButton(page)).toHaveText("ImageOriginal");
  await expect(bar(page).getByRole("button", { name: "Choose image…" })).toHaveCount(0);
  await imageButton(page).click();
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("status").filter({ hasText: "Only changes this spot" })).toBeVisible();
  await chooseShape(page, "Square");
  // The page shows the shape at once; nothing is written before Done.
  await expect(frame(page).locator(".hero img")).toHaveAttribute("style", /aspect-ratio: 1 \/ 1; object-fit: cover/);
  expect(await source(page)).toBe(before);
  // Drag the dot to the left edge, half way down.
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!;
  await dot(page).hover();
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await expect(dot(page)).toHaveAttribute("aria-valuetext", /^20% across, 50% down/);
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/style="aspect-ratio: 1 \/ 1; object-fit: cover; object-position: 20% 50%"/);
  await expect(frame(page).locator(".hero img")).toHaveCSS("object-position", "20% 50%");
  await frame(page).locator(".hero img").click();
  await expect(imageButton(page)).toHaveText("ImageSquare");
  // Done was one step.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("Escape cancels a Replace made in the popup: the page and its picture stay as they were", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  const shown = await frame(page).locator(".hero img").getAttribute("src");
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(popup(page).getByRole("status").filter({ hasText: "studio-desk.svg is in." })).toBeVisible();
  // The page shows the new picture before Done.
  await expect.poll(() => frame(page).locator(".hero img").getAttribute("src")).not.toBe(shown);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", shown!);
  expect(await source(page)).toBe(before);
  await expect(imageButton(page)).toBeFocused();
});

test("Replace and Done swap the picture in one Undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  await openPopup(page);
  await chooseShape(page, "16:9");
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page).getByRole("status").filter({ hasText: "The 16:9 shape stays and the picture is centred." })).toBeVisible();
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Image replaced");
  await expect.poll(() => heroTag(page)).toMatch(/src="\/images\/studio-desk\.svg"[^>]*style="aspect-ratio: 16 \/ 9; object-fit: cover"|style="aspect-ratio: 16 \/ 9; object-fit: cover"[^>]*src="\/images\/studio-desk\.svg"/);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("arrow keys move the dot; ✕ closes without changes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  await openPopup(page);
  // Original shows the whole picture: no dot until a shape crops it.
  await expect(dot(page)).toBeHidden();
  await chooseShape(page, "Tall 4:5");
  await dot(page).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(dot(page)).toHaveAttribute("aria-valuetext", /^46% across, 40% down/);
  await expect(frame(page).locator(".hero img")).toHaveCSS("object-position", "46% 40%");
  await popup(page).getByRole("button", { name: "Close without changes", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(frame(page).locator(".hero img")).not.toHaveAttribute("style", /aspect-ratio/);
  expect(await source(page)).toBe(before);
  // Done after the keys writes them.
  await openPopup(page);
  await chooseShape(page, "Tall 4:5");
  await dot(page).focus();
  await page.keyboard.press("ArrowRight");
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => heroTag(page)).toContain("object-position: 52% 50%");
});

test("a phone shows the popup as a bottom sheet with 44 px targets", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await openPopup(page);
  const sheet = (await popup(page).boundingBox())!;
  expect(sheet.x).toBe(0);
  expect(sheet.width).toBe(390);
  expect(Math.round(sheet.y + sheet.height)).toBe(844);
  expect(sheet.height).toBeLessThanOrEqual(844 * 0.56 + 1);
  for (const target of [popup(page).getByRole("button", { name: /^Shape:/ }), popup(page).getByRole("button", { name: "Replace", exact: true }),
    popup(page).getByRole("button", { name: "Done", exact: true }), popup(page).getByRole("button", { name: "Close without changes", exact: true })]) {
    const size = (await target.boundingBox())!;
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  await expect(popup(page).getByRole("button", { name: "Done", exact: true })).toBeInViewport();
  // Only the computer preview: the page itself is the phone view.
  await expect(popup(page).locator(".image-popup__device--phone")).toBeHidden();
  await expect(popup(page).locator(".image-popup__device--computer")).toBeVisible();
});
