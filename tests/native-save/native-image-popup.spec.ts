// The Image button and the image popup (media-manager build slice 39, ticket 09 "Entry point and
// popup"): one Image button with a state badge; the popup's shape menu, focus dot and Replace show
// on the page at once but are kept only by Done (one Undo step); ✕ or Escape put everything back.
// Trim, zoom and turn (slice 41) save a trimmed copy for this spot only; so do straighten and flip
// in the large editor (slice 42), whose Cancel goes back to the popup as it was.
// Default fixture: index.html's hero image is images/placeholder.svg (no alt); images/studio-desk.svg is unused.
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const popup = (page: Page) => page.getByRole("dialog", { name: "Image", exact: true });
const picker = (page: Page) => page.getByRole("dialog", { name: "Choose image", exact: true });
// Named "Image" with its badge (the bar's name chip is "Image" too).
const imageButton = (page: Page) => bar(page).locator(".edit-bar__image");
const dot = (page: Page) => popup(page).getByRole("slider", { name: "Focus dot" });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const heroTag = async (page: Page) => (await source(page)).match(/<img\b[^>]*class="hero-image"[^>]*>/)?.[0] ?? "";

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

// A raster picture to trim (the fixture's are SVGs, which cannot be): four coloured quarters.
const quarters = (page: Page) => page.evaluate(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 400;
  const context = canvas.getContext("2d")!;
  [["#d22", 0, 0], ["#2a2", 400, 0], ["#22d", 0, 200], ["#dd2", 400, 200]].forEach(([colour, x, y]) => { context.fillStyle = colour as string; context.fillRect(x as number, y as number, 400, 200); });
  return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
});
// A corner of the trim dragged by a share of the picture's size.
async function dragCorner(page: Page, corner: "nw" | "se", dx: number, dy: number) {
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!;
  const handle = (await popup(page).locator(`.image-popup__corner--${corner}`).boundingBox())!;
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + box.width * dx, y + box.height * dy, { steps: 5 });
  await page.mouse.up();
}
const records = async (page: Page) => JSON.parse((await storedDraft(page, ".editor/media.json"))?.content ?? "{}");

test("Free trim saves a -crop copy for this spot only; re-opening shows the trim on the original; re-trimming writes a new name", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  // An SVG cannot be trimmed: no Zoom, Turn or Free.
  await openPopup(page);
  await expect(popup(page).getByRole("slider", { name: "Zoom" })).toBeHidden();
  await expect(popup(page).getByRole("button", { name: "Turn left", exact: true })).toBeHidden();
  // Put a photo in the spot first.
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Quarters.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Quarters.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(popup(page).getByRole("slider", { name: "Zoom" })).toBeVisible();
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters\.webp"/);
  const original = "media/images/quarters.webp";

  // Free: drag the bottom-right corner in (not to the picture's own shape, which re-opens as Original zoomed in); the message turns yellow and the page shows the trim at once.
  await openPopup(page);
  await expect(popup(page).getByRole("status").filter({ hasText: "Only changes this spot" })).toBeVisible();
  await chooseShape(page, "Free");
  await expect(popup(page).getByRole("group", { name: /^Trim area/ })).toBeVisible();
  await dragCorner(page, "se", -0.5, -0.3);
  await expect(popup(page).getByRole("status").filter({ hasText: "Saves a new picture for this spot" })).toBeVisible();
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", /^data:image\//);
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop.webp.", { timeout: 30_000 });
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);
  // A new file with its record; the original is unchanged and stays for other places.
  const saved = await records(page);
  expect(saved.files["media/images/quarters-crop.webp"].trimmedFrom.source).toBe(original);
  expect(saved.files["media/images/quarters-crop.webp"].trimmedFrom.trim.width).toBeCloseTo(0.5, 1);
  const paths = (await storedDrafts(page)).map(draft => draft.path);
  expect(paths).toContain("media/images/quarters-crop.webp");
  expect((await storedDraft(page, original))?.deleted).toBeUndefined();
  await frame(page).locator(".hero img").click();
  await expect(imageButton(page)).toHaveText("ImageTrimmed");

  // Re-opened and left as it was, Done changes nothing.
  const trimmed = await source(page), drafts = JSON.stringify(await storedDrafts(page));
  await imageButton(page).click();
  await expect(popup(page).locator(".image-popup__where")).toHaveText("quarters.webp");
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  expect(await source(page)).toBe(trimmed);
  expect(JSON.stringify(await storedDrafts(page))).toBe(drafts);

  // Re-opening starts from the full original with the trim put back.
  await frame(page).locator(".hero img").click();
  await imageButton(page).click();
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).locator(".image-popup__where")).toHaveText("quarters.webp");
  await expect(popup(page).getByRole("button", { name: "Shape: Free", exact: true })).toBeVisible();
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!;
  const trim = (await popup(page).locator(".image-popup__frame").boundingBox())!;
  expect(trim.width / box.width).toBeCloseTo(0.5, 1);
  expect(trim.height / box.height).toBeCloseTo(0.7, 1);
  expect(trim.x - box.x).toBeLessThan(3);
  // Re-trimming writes a fresh name; the earlier copy, used nowhere else, goes to Recently removed.
  await dragCorner(page, "nw", 0.2, 0.2);
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => heroTag(page), { timeout: 30_000 }).toMatch(/src="\/media\/images\/quarters-crop-2\.webp"/);
  const again = await records(page);
  expect(again.files["media/images/quarters-crop-2.webp"].trimmedFrom.source).toBe(original);
  expect(again.files["media/images/quarters-crop.webp"]).toBeUndefined();
  expect(again.removed.map((entry: { path: string }) => entry.path)).toContain("media/images/quarters-crop.webp");
  // Replace on a trimmed spot, then zoom: the copy is cut from the new picture; the old copy, used nowhere else, goes.
  await frame(page).locator(".hero img").click();
  await expect(imageButton(page)).toHaveText("ImageTrimmed");
  await imageButton(page).click();
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Second.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Second.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page).getByRole("status").filter({ hasText: "Trimming made for the old picture was dropped." })).toBeVisible();
  await popup(page).getByRole("slider", { name: "Zoom" }).fill("200");
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => heroTag(page), { timeout: 30_000 }).toMatch(/src="\/media\/images\/second-crop\.webp"/);
  const replaced = await records(page);
  expect(replaced.files["media/images/second-crop.webp"].trimmedFrom.source).toBe("media/images/second.webp");
  expect(replaced.files["media/images/quarters-crop-2.webp"]).toBeUndefined();
  expect(replaced.files[original]?.trimmedFrom).toBeUndefined();
  // Done was one Undo step: the earlier copy is back in the spot.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop-2\.webp"/);
});

test("Zoom and Turn save a trimmed copy; back at 100 % and unturned only the spot changes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Turned.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Turned.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page).getByRole("slider", { name: "Zoom" })).toBeVisible();
  const message = popup(page).locator(".image-popup__message");
  const zoom = popup(page).getByRole("slider", { name: "Zoom" });
  await zoom.fill("200");
  await expect(popup(page).locator(".image-popup__zoom output")).toHaveText("200 %");
  await expect(message).toHaveText("Saves a new picture for this spot");
  // Zoomed in, Original shows the dot; arrow keys move what stays in view.
  await expect(dot(page)).toBeVisible();
  await zoom.fill("100");
  await expect(message).toHaveText("Only changes this spot");
  await popup(page).getByRole("button", { name: "Turn right", exact: true }).click();
  await expect(popup(page).locator(".image-popup__turned")).toHaveText("90°");
  await expect(message).toHaveText("Saves a new picture for this spot");
  // The picture is drawn turned: tall now.
  const turned = (await popup(page).locator(".image-popup__picbox").boundingBox())!;
  expect(turned.height).toBeGreaterThan(turned.width);
  await popup(page).getByRole("button", { name: "Turn left", exact: true }).click();
  await expect(popup(page).locator(".image-popup__turned")).toHaveText("0°");
  await expect(message).toHaveText("Only changes this spot");
  // Turned and zoomed in, Done saves one trimmed copy with the picture: one Undo step puts the SVG back.
  const before = await source(page);
  await popup(page).getByRole("button", { name: "Turn right", exact: true }).click();
  await zoom.fill("200");
  await expect(message).toHaveText("Saves a new picture for this spot");
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/turned-crop.webp.", { timeout: 30_000 });
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/turned-crop\.webp"/);
  // The 800 × 400 picture turned is 400 × 800; at 200 % half of each side stays.
  expect(await heroTag(page)).toMatch(/width="200"[^>]*height="400"|height="400"[^>]*width="200"/);
  const saved = (await records(page)).files["media/images/turned-crop.webp"].trimmedFrom;
  expect(saved.source).toBe("media/images/turned.webp");
  expect(saved.trim).toMatchObject({ x: 0.25, y: 0.25, width: 0.5, height: 0.5, turn: 90 });
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

const large = (page: Page) => page.getByRole("dialog", { name: "Edit image", exact: true });

test("the large editor carries the popup's state; Cancel returns to the popup unchanged; straighten and flip save a trimmed copy", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await openPopup(page);
  // An SVG cannot be trimmed: no large editor.
  await expect(popup(page).getByRole("button", { name: "Open large editor", exact: true })).toBeHidden();
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Level.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Level.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/level\.webp"/);

  // The popup's shape is carried into the large window.
  await openPopup(page);
  await chooseShape(page, "16:9");
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  await expect(large(page)).toBeVisible();
  await expect(large(page).getByRole("combobox", { name: "Shape" })).toHaveValue("16:9");
  const message = large(page).getByRole("status");
  await expect(message).toHaveText("Only changes this spot");
  // Flip and Cancel: back to the popup as it was.
  const previews = large(page).locator(".image-popup__spot img");
  const unflipped = (await previews.first().getAttribute("src"))!;
  await large(page).getByRole("button", { name: "Flip side to side", exact: true }).click();
  await expect(message).toHaveText("Saves a new picture for this spot");
  // Both previews show the flipped picture at once.
  for (const index of [0, 1]) await expect(previews.nth(index)).not.toHaveAttribute("src", unflipped);
  // Undo, Redo and Reset (the whole original in the place's own shape, Original).
  const shape = large(page).getByRole("combobox", { name: "Shape" });
  await large(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(message).toHaveText("Only changes this spot");
  await expect(previews.first()).toHaveAttribute("src", unflipped);
  await large(page).getByRole("button", { name: "Redo", exact: true }).click();
  await expect(message).toHaveText("Saves a new picture for this spot");
  await large(page).getByRole("button", { name: "Reset", exact: true }).click();
  await expect(message).toHaveText("Only changes this spot");
  await expect(shape).toHaveValue("original");
  await large(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(shape).toHaveValue("16:9");
  await expect(message).toHaveText("Saves a new picture for this spot");
  await large(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(large(page)).toHaveCount(0);
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("button", { name: "Shape: 16:9", exact: true })).toBeVisible();
  await expect(popup(page).locator(".image-popup__turned")).toHaveText("0°");
  await expect(popup(page).locator(".image-popup__message")).toHaveText("Only changes this spot");
  await expect(popup(page).getByRole("button", { name: "Open large editor", exact: true })).toBeFocused();

  // Straighten 4° on the ruler, flip, Done: one trimmed copy, both windows closed.
  const before = await source(page);
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  const ruler = large(page).getByRole("slider", { name: "Straighten" });
  await ruler.focus();
  for (let press = 0; press < 8; press++) await page.keyboard.press("ArrowRight");
  await expect(ruler).toHaveAttribute("aria-valuetext", "4 degrees");
  await expect(message).toHaveText("Saves a new picture for this spot");
  await large(page).getByRole("button", { name: "Flip side to side", exact: true }).click();
  await large(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/level-crop.webp.", { timeout: 30_000 });
  await expect(large(page)).toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/level-crop\.webp"/);
  // Flipping a straightened picture mirrors its straighten too; the copy has the place's 16:9 shape.
  const saved = (await records(page)).files["media/images/level-crop.webp"].trimmedFrom;
  expect(saved.source).toBe("media/images/level.webp");
  expect(saved.trim).toMatchObject({ straighten: -4, flipX: true });
  expect(saved.trim.width * 800 / (saved.trim.height * 400)).toBeCloseTo(16 / 9, 2);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

// A component whose CSS gives its picture a fixed 4:3 shape (slice 43), with one filled instance and one showing its fallback.
async function seedPhotoCard(page: Page, baseURL: string | undefined) {
  for (const [path, content] of [
    ["components/photo-card/photo-card.html", '<figure class="photo"><slot name="image"><img src="/images/placeholder.svg" alt=""></slot></figure>'],
    ["components/photo-card/photo-card.css", ".photo img { display:block; width:100%; aspect-ratio:4 / 3; object-fit:cover; }"],
  ]) {
    const edited = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
    expect(edited.ok()).toBe(true);
  }
  const response = await page.request.get(`${baseURL}/__demo/file?path=index.html`);
  expect(response.ok()).toBe(true);
  const seeded = (await response.text()).replace("</main>", '<photo-card><img slot="image" src="/images/studio-desk.svg" alt="A desk"></photo-card><photo-card data-fallback></photo-card></main>');
  const edited = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: seeded } });
  expect(edited.ok()).toBe(true);
  await page.locator(".repository-menu__trigger").click();
  await page.locator('.repository-menu__repo[aria-current="true"]').hover();
  await page.getByRole("menu", { name: "Branches" }).getByRole("menuitem", { name: "Refresh from GitHub" }).click();
  await expect.poll(() => source(page)).toContain("<photo-card>");
  const image = frame(page).locator("photo-card > img");
  await expect(image).toBeVisible();
  return image;
}

test("a slotted component image opens on its shape; other choices and restoring it each undo once", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const image = await seedPhotoCard(page, baseURL);
  const before = await source(page);
  const tag = async () => (await source(page)).match(/<img[^>]*slot="image"[^>]*>/)?.[0] ?? "";
  await image.click();
  await expect(imageButton(page)).toHaveText("ImagePhoto card's shape");
  await imageButton(page).click();
  await expect(popup(page).getByRole("button", { name: "Shape: Photo card's shape (4:3)", exact: true })).toBeVisible();
  await expect(dot(page)).toBeVisible();
  await chooseShape(page, "Square");
  await expect(popup(page).getByRole("status").filter({ hasText: "This Photo card will look different from the others." })).toBeVisible();
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(tag).toContain("aspect-ratio: 1 / 1");
  const square = await source(page);
  await image.click();
  await imageButton(page).click();
  await chooseShape(page, "Photo card's shape (4:3)");
  await expect(popup(page).getByRole("status").filter({ hasText: "will look different" })).toBeHidden();
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(tag).not.toMatch(/aspect-ratio|object-fit/);
  await expect(image).toHaveCSS("aspect-ratio", "4 / 3");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(square);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
  // Original overrides the component crop and reads back as Original.
  await image.click();
  await imageButton(page).click();
  await chooseShape(page, "Original");
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(tag).toContain("aspect-ratio: auto");
  await expect(image).toHaveCSS("object-fit", "contain");
  await image.click();
  await imageButton(page).click();
  await expect(popup(page).getByRole("button", { name: "Shape: Original", exact: true })).toBeVisible();
  await popup(page).getByRole("button", { name: "Close without changes", exact: true }).click();
  // A template fallback clicked from the page cannot expose a popup writing to its template.
  await frame(page).locator("photo-card[data-fallback] img").click();
  await expect(popup(page)).toHaveCount(0);
  await expect(imageButton(page)).toHaveCount(0);
});

test("a Free trim on a component's picture shows the trimmed copy whole, not cropped to the component's shape", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const image = await seedPhotoCard(page, baseURL);
  const tag = async () => (await source(page)).match(/<img[^>]*slot="image"[^>]*>/)?.[0] ?? "";
  // A photo first (SVGs cannot be trimmed); the place keeps the component's shape.
  await image.click();
  await imageButton(page).click();
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Quarters.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Quarters.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(popup(page).getByRole("button", { name: "Shape: Photo card's shape (4:3)", exact: true })).toBeVisible();
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(tag).toMatch(/src="\/media\/images\/quarters\.webp"/);
  expect(await tag()).not.toMatch(/aspect-ratio/);
  // Free: the trimmed copy has its own shape, so the place undoes the component's crop.
  await image.click();
  await imageButton(page).click();
  await chooseShape(page, "Free");
  await expect(popup(page).getByRole("status").filter({ hasText: "This Photo card will look different from the others." })).toBeVisible();
  await dragCorner(page, "se", -0.5, -0.3);
  await popup(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop.webp.", { timeout: 30_000 });
  await expect.poll(tag).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);
  expect(await tag()).toMatch(/aspect-ratio: auto/);
  await expect(image).toHaveCSS("aspect-ratio", "auto");
});
