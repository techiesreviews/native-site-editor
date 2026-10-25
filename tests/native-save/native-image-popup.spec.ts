// The Image button and the image popup (media-manager build slice 39, ticket 09 "Entry point and
// popup"): one Image button with a state badge; the popup's shape menu and focus square show on the page
// at once and closing the popup (Close, Escape, a press outside) keeps them as one Undo step; there is
// no Done. Replace closes the popup and places the chosen picture at once, as its own Undo step.
// Trim, zoom and turn (slice 41) save a trimmed copy for this spot only; so do straighten and flip
// in the large editor (slice 42), whose Cancel goes back to the popup as it was.
// Ordinary-picture popup tests use a separate SVG; placeholder Replace chooses any media immediately.
import { expect, test, type Page } from "@playwright/test";
import { openEditor, pickPicture } from "../support/scenarios";
import { storedDraft, storedDrafts } from "./drafts";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const popup = (page: Page) => page.getByRole("dialog", { name: "Image", exact: true });
// A picture spot's Replace also lists videos (slice 119): its picker is "Choose image or video".
const picker = (page: Page) => page.getByRole("dialog", { name: /^Choose image( or video)?$/ });
// The Media button; the place's shape is in its tooltip.
const imageButton = (page: Page) => bar(page).locator(".edit-bar__media");
// The frame on the picture is the focus square (ticket 42): there is no separate dot.
const square = (page: Page) => popup(page).getByRole("slider", { name: "Focus point" });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const heroTag = async (page: Page) => (await source(page)).match(/<img\b[^>]*class="hero-image"[^>]*>/)?.[0] ?? "";

async function open(page: Page, baseURL: string | undefined) {
  await openEditor(page, baseURL);
  const picture = await page.request.get(`${baseURL}/__demo/file?path=images/placeholder.svg`);
  const home = await page.request.get(`${baseURL}/__demo/file?path=index.html`);
  expect(picture.ok() && home.ok()).toBe(true);
  for (const [path, content] of [
    ["images/popup-picture.svg", await picture.text()],
    ["index.html", (await home.text()).replace('src="/images/placeholder.svg"', 'src="/images/popup-picture.svg"')],
  ]) expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).ok()).toBe(true);
  await page.reload();
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
}
async function openPopup(page: Page) {
  await pickPicture(page, ".hero img");
  await imageButton(page).click();
  await expect(popup(page)).toBeVisible();
  await expect(imageButton(page)).toHaveAttribute("aria-expanded", "true");
}
async function chooseShape(page: Page, label: string) {
  await popup(page).getByRole("button", { name: /^Shape:/ }).click();
  await popup(page).getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(popup(page).getByRole("button", { name: `Shape: ${label}`, exact: true })).toBeVisible();
}

test("Image → Square, drag the square, Close: the page has the shape and object-position; Undo restores", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const before = await source(page);
  await pickPicture(page, ".hero img");
  // One Media button, where Choose image… was; the place's shape is in its tooltip.
  await expect(imageButton(page)).toHaveAttribute("title", /· Original$/);
  await expect(bar(page).getByRole("button", { name: "Choose image…" })).toHaveCount(0);
  await imageButton(page).click();
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("status").filter({ hasText: "Only changes this spot" })).toBeVisible();
  await chooseShape(page, "Square");
  // The page shows the shape at once; nothing is written before the popup closes.
  await expect(frame(page).locator(".hero img")).toHaveAttribute("style", /aspect-ratio: 1 \/ 1; object-fit: cover/);
  expect(await source(page)).toBe(before);
  // The square is the focus: no dot. Drag it from its middle to the left, a fifth of its room along.
  await expect(popup(page).locator(".image-popup__dot")).toHaveCount(0);
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!, held = (await square(page).boundingBox())!;
  expect(held.width).toBeLessThan(box.width - 20);
  await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width - held.width) * 0.2 + held.width / 2, held.y + held.height / 2, { steps: 4 });
  await page.mouse.up();
  // The saved object-position is the one that shows just the square: its left edge sits at (room × focus).
  const moved = (await square(page).boundingBox())!;
  const across = Math.round((moved.x - box.x) / (box.width - moved.width) * 100);
  expect(Math.abs(across - 20)).toBeLessThanOrEqual(2);
  expect(Math.abs(moved.x + moved.width / 2 - (box.x + (box.width - held.width) * 0.2 + held.width / 2))).toBeLessThanOrEqual(2);
  await expect(square(page)).toHaveAttribute("aria-valuetext", new RegExp(`^${across}% across, 50% down`));
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toContain(`style="aspect-ratio: 1 / 1; object-fit: cover; object-position: ${across}% 50%"`);
  await expect(frame(page).locator(".hero img")).toHaveCSS("object-position", `${across}% 50%`);
  await pickPicture(page, ".hero img");
  await expect(imageButton(page)).toHaveAttribute("title", /· Square$/);
  // Closing kept it as one step.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("a square that fills the picture both ways cannot move: keys change nothing and no object-position is written", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await openPopup(page);
  // The popup's picture is 320 × 180, so 16:9 shows all of it.
  await chooseShape(page, "16:9");
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!, held = (await square(page).boundingBox())!;
  expect(Math.abs(held.width - box.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(held.height - box.height)).toBeLessThanOrEqual(1);
  await square(page).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(square(page)).toHaveAttribute("aria-valuetext", /^50% across, 50% down/);
  await expect(square(page)).toBeFocused();
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toContain("aspect-ratio: 16 / 9; object-fit: cover");
  expect(await heroTag(page)).not.toContain("object-position");
});

test("a press on the picture beside the square centres the square there", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await openPopup(page);
  await chooseShape(page, "Square");
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!, held = (await square(page).boundingBox())!;
  // Right of the square, half way to the picture's edge: the square centres there, as far as its room allows.
  const x = (held.x + held.width + box.x + box.width) / 2, y = box.y + box.height * 0.5;
  expect(box.x + box.width - (held.x + held.width)).toBeGreaterThan(8);
  await page.mouse.click(x, y);
  const moved = (await square(page).boundingBox())!;
  expect(Math.abs(moved.x + moved.width / 2 - Math.min(x, box.x + box.width - held.width / 2))).toBeLessThanOrEqual(2);
  expect(moved.x).toBeGreaterThan(held.x);
  const across = Math.round((moved.x - box.x) / (box.width - moved.width) * 100);
  await expect(square(page)).toHaveAttribute("aria-valuetext", new RegExp(`^${across}% across, 50% down`));
  await expect(square(page)).toBeFocused();
  await expect(frame(page).locator(".hero img")).toHaveCSS("object-position", `${across}% 50%`);
});

test("Replace in the popup closes it and places the chosen picture at once; one Undo restores the original", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  const shown = await frame(page).locator(".hero img").getAttribute("src");
  await openPopup(page);
  // Replace closes the popup first; there is no Done step for a replacement.
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Image replaced");
  await expect.poll(() => heroTag(page)).toMatch(/src="\/images\/studio-desk\.svg"/);
  await expect.poll(() => frame(page).locator(".hero img").getAttribute("src")).not.toBe(shown);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", shown!);
});

test("Replace keeps the shape chosen before it and centres the picture, in one Undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  await openPopup(page);
  await chooseShape(page, "16:9");
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Image replaced");
  await expect.poll(() => heroTag(page)).toMatch(/src="\/images\/studio-desk\.svg"[^>]*style="aspect-ratio: 16 \/ 9; object-fit: cover"|style="aspect-ratio: 16 \/ 9; object-fit: cover"[^>]*src="\/images\/studio-desk\.svg"/);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("selecting another element closes the popup and keeps its shape and focus as one Undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  await openPopup(page);
  await chooseShape(page, "Square");
  await square(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(frame(page).locator(".hero img")).toHaveCSS("object-position", "48% 50%");
  // A press on another element on the page moves the bar there: the popup closes and keeps its changes.
  await frame(page).locator(".hero h1").click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toContain("aspect-ratio: 1 / 1; object-fit: cover; object-position: 48% 50%");
  // The heading pressed stays selected after the save redraws the page.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText(/Heading/);
  await page.waitForTimeout(500); // fixed-wait: the bug moved the selection back only after the redraw, so absence needs a settle
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText(/Heading/);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("arrow keys move the square; Close keeps the change as one Undo step; Escape keeps it too", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await source(page);
  await openPopup(page);
  // Original shows the whole picture: the frame is no square to move until a shape crops it.
  await expect(square(page)).toBeHidden();
  await chooseShape(page, "Tall 4:5");
  await square(page).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  // The square keeps the keyboard focus between moves.
  await expect(square(page)).toBeFocused();
  await expect(square(page)).toHaveAttribute("aria-valuetext", /^46% across, 50% down/);
  // The 4:5 square is as tall as the picture: up and down do nothing, as a drag does.
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!, held = (await square(page).boundingBox())!;
  expect(Math.abs(held.height - box.height)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(square(page)).toHaveAttribute("aria-valuetext", /^46% across, 50% down/);
  expect((await square(page).boundingBox())!.y).toBeCloseTo(held.y, 1);
  await expect(frame(page).locator(".hero img")).toHaveCSS("object-position", "46% 50%");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toContain("aspect-ratio: 4 / 5; object-fit: cover; object-position: 46% 50%");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
  // Escape after the keys keeps them too. The hint seen last time is now only the square's description (slice 109).
  await openPopup(page);
  await chooseShape(page, "Tall 4:5");
  await expect(popup(page).locator(".image-popup__hint")).toHaveClass(/sr-only/);
  await expect(square(page)).toHaveAccessibleDescription("Drag the square to what matters most.");
  await square(page).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toContain("object-position: 52% 50%");
  // Opened and closed with no change, nothing is written.
  const kept = await source(page);
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  expect(await source(page)).toBe(kept);
});

test("a phone shows the popup as a bottom sheet with 44 px targets", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await openPopup(page);
  const sheet = (await popup(page).boundingBox())!;
  expect(sheet.x).toBe(0);
  expect(sheet.width).toBe(390);
  expect(Math.round(sheet.y + sheet.height)).toBe(844);
  expect(sheet.height).toBeLessThanOrEqual(844 * 0.85 + 1);
  for (const target of [popup(page).getByRole("button", { name: /^Shape:/ }), popup(page).getByRole("button", { name: "Replace", exact: true }),
    popup(page).getByRole("button", { name: "Close", exact: true })]) {
    const size = (await target.boundingBox())!;
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  await expect(popup(page).getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  // Only the computer preview: the page itself is the phone view.
  await expect(popup(page).locator(".image-popup__device--phone")).toBeHidden();
  await expect(popup(page).locator(".image-popup__device--computer")).toBeVisible();
  // Slice 109: labels sit above their controls, the picture takes the full width, and the previews
  // and the message show without scrolling.
  const rows = (await popup(page).locator(".image-popup__rows").boundingBox())!, preview = (await popup(page).locator(".image-popup__device--computer").boundingBox())!;
  expect(preview.y + preview.height).toBeLessThanOrEqual(rows.y + rows.height + 0.5);
  expect(await popup(page).locator(".image-popup__rows").evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  const well = (await popup(page).locator(".image-popup__well").boundingBox())!, label = (await popup(page).locator(".image-popup__row--picture > .image-popup__label").boundingBox())!;
  expect(well.width).toBeGreaterThanOrEqual(390 - 2 * 14 - 1);
  expect(label.y + label.height).toBeLessThanOrEqual(well.y + 0.5);
  await expect(popup(page).locator(".image-popup__message")).toBeInViewport({ ratio: 1 });
});

// A raster picture to trim (the fixture's are SVGs, which cannot be): four coloured quarters.
const quarters = (page: Page) => page.evaluate(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 400;
  const context = canvas.getContext("2d")!;
  [["#d22", 0, 0], ["#2a2", 400, 0], ["#22d", 0, 200], ["#dd2", 400, 200]].forEach(([colour, x, y]) => { context.fillStyle = colour as string; context.fillRect(x as number, y as number, 400, 200); });
  return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
});
// Slice 94: on a phone the shape menu stands clear of the sheet's pinned message.
test("a phone's shape menu is whole on screen, uncovered, and Free can be pressed", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await openPopup(page);
  // A photo, so Free is offered (an SVG cannot be trimmed).
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Phone.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Phone.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/phone\.webp"/);
  await openPopup(page);
  await expect(popup(page).getByRole("slider", { name: "Zoom" })).toBeVisible();
  const entries = popup(page).getByRole("menuitemradio");
  const wholeAndOnTop = async () => {
    await popup(page).getByRole("button", { name: /^Shape:/ }).click();
    await expect(entries).toHaveCount(6);
    for (const entry of await entries.all()) {
      await expect(entry).toBeInViewport({ ratio: 1 });
      const box = (await entry.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Nothing (the message) covers it.
      expect(await entry.evaluate((item, at) => item.contains(document.elementFromPoint(at.x, at.y)), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
    }
  };
  await wholeAndOnTop();
  await popup(page).getByRole("menuitemradio", { name: "Free", exact: true }).click();
  await expect(popup(page).getByRole("group", { name: /^Trim area/ })).toBeVisible();
  await expect(popup(page).getByRole("button", { name: "Shape: Free", exact: true })).toBeVisible();
  // The smallest phones too.
  await page.setViewportSize({ width: 320, height: 568 });
  await wholeAndOnTop();
  await popup(page).getByRole("menuitemradio", { name: "Square", exact: true }).click();
  await expect(popup(page).getByRole("button", { name: "Shape: Square", exact: true })).toBeVisible();
  await expect(popup(page).locator(".image-popup__message")).toBeInViewport({ ratio: 1 });
  // Room neither under nor over the button (a phone on its side): the menu stays on screen and scrolls.
  await page.setViewportSize({ width: 320, height: 280 });
  await popup(page).getByRole("button", { name: /^Shape:/ }).click();
  const menu = popup(page).getByRole("menu", { name: "Shape" });
  await expect(menu).toBeInViewport({ ratio: 1 });
  expect(await menu.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  const free = popup(page).getByRole("menuitemradio", { name: "Free", exact: true });
  await free.scrollIntoViewIfNeeded();
  await expect(free).toBeInViewport({ ratio: 1 });
  expect((await free.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await free.click();
  await expect(popup(page).getByRole("button", { name: "Shape: Free", exact: true })).toBeAttached();
});

test.describe("on a touch phone", () => {
  test.use({ hasTouch: true });
  test("a square that can move both ways takes the finger: a swipe up on it moves it, not the sheet", async ({ page, baseURL }) => {
    await openStepsPicture(page, baseURL);
    await chooseShape(page, "Original");
    await popup(page).getByRole("slider", { name: "Zoom" }).fill("200");
    await expect(zoomOutput(page)).toHaveText("200 %");
    await page.setViewportSize({ width: 320, height: 568 });
    const rows = popup(page).locator(".image-popup__rows");
    await expect.poll(() => rows.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await rows.evaluate(element => element.scrollTo(0, 0));
    await expect(square(page)).toHaveAttribute("aria-valuetext", /^50% across, 50% down/);
    // From near the square's top (its lower part may sit under the pinned message), straight up.
    const held = (await square(page).boundingBox())!;
    const x = Math.round(held.x + held.width / 2), y = Math.round(held.y + 12);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => Number((await square(page).getAttribute("aria-valuetext"))?.match(/(\d+)% down/)?.[1])).toBeLessThan(50);
    expect(await rows.evaluate(element => element.scrollTop)).toBe(0);
  });

  test("a swipe on the picture scrolls the short sheet without moving the square; a tap moves it", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, baseURL);
    await openPopup(page);
    await chooseShape(page, "Square");
    // The smallest phones: the picture fills what the sheet shows between its head and its pinned message.
    await page.setViewportSize({ width: 320, height: 568 });
    const rows = popup(page).locator(".image-popup__rows");
    await expect.poll(() => rows.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const where = await square(page).getAttribute("aria-valuetext");
    // A finger swipes up from the picture's visible part, beside the square (its lower half sits under the pinned message).
    const well = (await popup(page).locator(".image-popup__picbox").boundingBox())!, shown = (await rows.boundingBox())!;
    const x = Math.round(well.x + well.width * 0.1), y = Math.round(Math.min(well.y + well.height, shown.y + shown.height) - 12);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => rows.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(square(page)).toHaveAttribute("aria-valuetext", where!);
    await expect(popup(page).locator(".image-popup__message")).toBeInViewport({ ratio: 1 });
    // The square is as tall as the picture, so it cannot move up or down: a swipe up on it scrolls the sheet too.
    await rows.evaluate(element => element.scrollTo(0, 0));
    await expect.poll(() => rows.evaluate(element => element.scrollTop)).toBe(0);
    const held = (await square(page).boundingBox())!;
    expect(Math.abs(held.height - well.height)).toBeLessThanOrEqual(1);
    const mx = Math.round(held.x + held.width / 2);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mx, y }] });
    for (let step = 1; step <= 10; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mx, y: y - step * 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => rows.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(square(page)).toHaveAttribute("aria-valuetext", where!);
    // A tap on the picture beside the square still moves the square there: at a tenth across it goes to the left edge.
    await rows.evaluate(element => element.scrollTo(0, 0));
    const picture = (await popup(page).locator(".image-popup__picbox").boundingBox())!;
    await page.touchscreen.tap(picture.x + picture.width * 0.1, picture.y + picture.height * 0.15);
    await expect(square(page)).toHaveAttribute("aria-valuetext", /^0% across, 50% down/);
    expect(Math.abs((await square(page).boundingBox())!.x - picture.x)).toBeLessThanOrEqual(1);
    await expect(square(page)).toBeFocused();

    // A phone on its side: the whole sheet scrolls; a swipe on the picture moves it, not the square; the message stays uncovered.
    await page.setViewportSize({ width: 320, height: 280 });
    const sheet = popup(page);
    await sheet.evaluate(element => element.scrollTo(0, 0));
    const moved = await square(page).getAttribute("aria-valuetext");
    const pic = (await sheet.locator(".image-popup__picbox").boundingBox())!, foot = (await sheet.locator(".image-popup__bottom").boundingBox())!;
    const sx = Math.round(pic.x + pic.width * 0.8), sy = Math.round(Math.min(pic.y + pic.height, foot.y) - 10);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    for (let step = 1; step <= 6; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx, y: sy - step * 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => sheet.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(square(page)).toHaveAttribute("aria-valuetext", moved!);
    for (const target of [sheet.locator(".image-popup__message")]) {
      await expect(target).toBeInViewport({ ratio: 1 });
      const box = (await target.boundingBox())!;
      expect(await target.evaluate((element, at) => element.contains(document.elementFromPoint(at.x, at.y)), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
    }
  });
});

test("on a phone the large editor's Shape ends a row of labelled tools and opens the popup's menu; Done stays on screen", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Wide.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Wide.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/wide\.webp"/);
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit image", exact: true });
  // Slice 110: seven tools, each an icon over an 11 px label, 56 px tall; Shape names the current shape.
  const row = editor.locator(".image-large__iconrow");
  await expect(row.locator(".image-large__tool-label")).toHaveText(["Turn", "Turn", "Flip", "Flip", "Zoom −", "Zoom +", "Original"]);
  for (const tool of await row.locator(".image-large__tool").all()) {
    expect(Math.round((await tool.boundingBox())!.height)).toBe(56);
    expect(await tool.locator(".image-large__tool-label").evaluate(element => getComputedStyle(element).fontSize)).toBe("11px");
  }
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    const shape = editor.getByRole("button", { name: /^Shape:/ });
    await expect(shape).toBeInViewport({ ratio: 1 });
    expect((await shape.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const label = width === 390 ? "Free" : "Square";
    await shape.click();
    const item = editor.getByRole("menuitemradio", { name: label, exact: true });
    await expect(item).toBeInViewport({ ratio: 1 });
    await item.click();
    await expect(shape).toHaveAccessibleName(`Shape: ${label}`);
    await expect(shape.locator(".image-large__tool-label")).toHaveText(label);
    await expect(shape).toBeFocused();
    await expect(editor.getByRole("button", { name: "Done", exact: true })).toBeInViewport({ ratio: 1 });
    // The message is one quiet line above the buttons, with no box.
    const message = editor.getByRole("status");
    await expect(message).toBeInViewport({ ratio: 1 });
    expect((await message.boundingBox())!.y + (await message.boundingBox())!.height).toBeLessThanOrEqual((await editor.getByRole("button", { name: "Done", exact: true }).boundingBox())!.y);
    expect(await message.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  }
  // The previews in the phone's sheet sit whole inside the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.getByRole("button", { name: "Preview", exact: true }).click();
  for (const screen of await editor.locator(".image-popup__screen").all()) await expect(screen).toBeInViewport({ ratio: 1 });
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

// A see-through picture: a dark word on nothing.
const seeThrough = (page: Page) => page.evaluate(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 300;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#123"; context.fillRect(100, 100, 400, 100);
  return canvas.toDataURL("image/png").split(",")[1];
});
async function replaceWith(page: Page, name: string, mimeType: string, base64: string) {
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name, mimeType, buffer: Buffer.from(base64, "base64") });
  await expect(picker(page).getByRole("button", { name: `Choose ${name}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  // The picture is placed at once and the popup closes; open it again on the new picture.
  await expect(popup(page)).toHaveCount(0);
  const stem = name.replace(/\.[^.]+$/, "").toLowerCase();
  await expect.poll(() => heroTag(page)).toMatch(new RegExp(`src="/media/images/${stem}\\.`));
  await openPopup(page);
}

// Slice 109 (and slice 106's checkerboard): a see-through picture sits on the light checkerboard in the
// popup and its previews, for the picture now shown; Free's corners take a 44 px press past the picture.
test("a replaced see-through picture is on the checkerboard and an opaque one is not; Free's corners grab 44 px", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await openPopup(page);
  const marked = popup(page).locator(".image-popup__pic[data-transparent], .image-popup__spot img[data-transparent]");
  await replaceWith(page, "Logo.png", "image/png", await seeThrough(page));
  await expect(marked).toHaveCount(3);
  expect(await popup(page).locator(".image-popup__picbox").evaluate(element => getComputedStyle(element).backgroundImage)).toContain("conic-gradient");
  await replaceWith(page, "Quarters.jpg", "image/jpeg", await quarters(page));
  await expect(popup(page).locator(".image-popup__where")).toHaveText(/quarters/i);
  await expect(marked).toHaveCount(0);
  expect(await popup(page).locator(".image-popup__picbox").evaluate(element => getComputedStyle(element).backgroundImage)).toBe("none");

  // The one frame changes part with the shape: the focus square (a slider), Free's trim area, the square
  // again with its value, and under Original only a picture of what shows, out of the tab order.
  const frameOnPicture = popup(page).locator(".image-popup__frame");
  const valueNames = ["aria-valuenow", "aria-valuetext", "aria-valuemin", "aria-valuemax"];
  const attributes = () => frameOnPicture.evaluate(element => Object.fromEntries([...element.attributes].map(item => [item.name, item.value])));
  await chooseShape(page, "Square");
  await expect(frameOnPicture).toHaveAttribute("role", "slider");
  await expect(frameOnPicture).toHaveAttribute("aria-valuenow", "50");
  await chooseShape(page, "Free");
  await expect(frameOnPicture).toHaveAttribute("role", "group");
  for (const name of valueNames) expect(await attributes()).not.toHaveProperty(name);
  await chooseShape(page, "Square");
  await expect(frameOnPicture).toHaveAttribute("role", "slider");
  await expect(frameOnPicture).toHaveAttribute("aria-valuenow", "50");
  await expect(frameOnPicture).toHaveAttribute("aria-valuetext", /^50% across, 50% down/);
  await chooseShape(page, "Original");
  await expect(frameOnPicture).toHaveAttribute("aria-hidden", "true");
  for (const name of ["tabindex", "role", ...valueNames]) expect(await attributes()).not.toHaveProperty(name);

  await chooseShape(page, "Free");
  const corner = popup(page).locator(".image-popup__corner--nw");
  const box = (await corner.boundingBox())!, picture = (await popup(page).locator(".image-popup__picbox").boundingBox())!;
  expect(Math.round(box.width)).toBe(44);
  expect(Math.round(box.height)).toBe(44);
  // The visible circle is 12 px; a press outside the picture, inside the grab area, takes the corner.
  expect(await corner.evaluate(element => getComputedStyle(element, "::after").width)).toBe("12px");
  const outside = { x: picture.x - 15, y: picture.y - 15 };
  // Every corner takes a press 15 px past the picture's edge.
  for (const [name, dx, dy] of [["nw", -15, -15], ["ne", 15, -15], ["se", 15, 15], ["sw", -15, 15]] as const) {
    const at = { x: (dx < 0 ? picture.x : picture.x + picture.width) + dx, y: (dy < 0 ? picture.y : picture.y + picture.height) + dy };
    expect(await popup(page).locator(`.image-popup__corner--${name}`).evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), at)).toBe(true);
  }
  const before = (await popup(page).locator(".image-popup__frame").boundingBox())!;
  await page.mouse.move(outside.x, outside.y);
  await page.mouse.down();
  await page.mouse.move(outside.x + 60, outside.y + 40, { steps: 6 });
  await page.mouse.up();
  const after = (await popup(page).locator(".image-popup__frame").boundingBox())!;
  expect(after.width).toBeLessThan(before.width - 20);
  // The opposite corner, pressed past the picture's bottom right, sizes it from there.
  const se = { x: picture.x + picture.width + 15, y: picture.y + picture.height + 15 };
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x - 60, se.y - 40, { steps: 6 });
  await page.mouse.up();
  const smaller = (await popup(page).locator(".image-popup__frame").boundingBox())!;
  expect(smaller.width).toBeLessThan(after.width - 20);
  expect(Math.round(smaller.x)).toBe(Math.round(after.x));
  await expect(popup(page).locator(".image-popup__message")).toHaveText("Saves a new picture for this spot");
});

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
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop.webp.", { timeout: 30_000 });
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);
  // A new file with its record; the original is unchanged and stays for other places.
  const saved = await records(page);
  expect(saved.files["media/images/quarters-crop.webp"].trimmedFrom.source).toBe(original);
  expect(saved.files["media/images/quarters-crop.webp"].trimmedFrom.trim.width).toBeCloseTo(0.5, 1);
  const paths = (await storedDrafts(page)).map(draft => draft.path);
  expect(paths).toContain("media/images/quarters-crop.webp");
  expect((await storedDraft(page, original))?.deleted).toBeUndefined();
  await pickPicture(page, ".hero img");
  await expect(imageButton(page)).toHaveAttribute("title", /· Trimmed$/);

  // Re-opened and left as it was, closing changes nothing.
  const trimmed = await source(page), drafts = JSON.stringify(await storedDrafts(page));
  await imageButton(page).click();
  await expect(popup(page).locator(".image-popup__where")).toHaveText("quarters.webp");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  expect(await source(page)).toBe(trimmed);
  expect(JSON.stringify(await storedDrafts(page))).toBe(drafts);

  // Re-opening starts from the full original with the trim put back.
  await pickPicture(page, ".hero img");
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
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => heroTag(page), { timeout: 30_000 }).toMatch(/src="\/media\/images\/quarters-crop-2\.webp"/);
  const again = await records(page);
  expect(again.files["media/images/quarters-crop-2.webp"].trimmedFrom.source).toBe(original);
  expect(again.files["media/images/quarters-crop.webp"]).toBeUndefined();
  expect(again.removed.map((entry: { path: string }) => entry.path)).toContain("media/images/quarters-crop.webp");
  // Replace on a trimmed spot drops the trim; then zoom: the copy is cut from the new picture; the old copy, used nowhere else, goes.
  await pickPicture(page, ".hero img");
  await expect(imageButton(page)).toHaveAttribute("title", /· Trimmed$/);
  await imageButton(page).click();
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Second.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Second.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/second\.webp"/);
  await openPopup(page);
  await popup(page).getByRole("slider", { name: "Zoom" }).fill("200");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => heroTag(page), { timeout: 30_000 }).toMatch(/src="\/media\/images\/second-crop\.webp"/);
  const replaced = await records(page);
  expect(replaced.files["media/images/second-crop.webp"].trimmedFrom.source).toBe("media/images/second.webp");
  // Replace removed the earlier trimmed copy, used nowhere else, in its own step.
  expect(replaced.files["media/images/quarters-crop-2.webp"]).toBeUndefined();
  expect(replaced.removed.map((entry: { path: string }) => entry.path)).toContain("media/images/quarters-crop-2.webp");
  expect(replaced.files[original]?.trimmedFrom).toBeUndefined();
  // The zoom's close and the replacement are one Undo step each: the earlier copy is back after two.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/second\.webp"/);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop-2\.webp"/);
  // That Undo brought the copy back with its record.
  expect((await records(page)).files["media/images/quarters-crop-2.webp"]?.trimmedFrom.source).toBe(original);
});

test("Undo of a re-trim keeps the unsaved picture available to trim again", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Quarters.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Quarters.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters\.webp"/);

  await openPopup(page);
  await chooseShape(page, "Free");
  await dragCorner(page, "se", -0.5, -0.3);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop.webp.", { timeout: 30_000 });
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);

  await openPopup(page);
  await dragCorner(page, "nw", 0.2, 0.2);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop-2.webp.", { timeout: 30_000 });
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop-2\.webp"/);
  // Each completed file change sweeps unreferenced upload bytes, including the removed first trim.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);

  await openPopup(page);
  await dragCorner(page, "se", -0.1, -0.1);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop-2.webp.", { timeout: 30_000 });
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/quarters-crop-2\.webp"/);
  await expect(page.locator("#status")).not.toContainText("missing from this browser's storage");
});

test("Zoom and Turn save a trimmed copy; back at 100 % and unturned only the spot changes", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, baseURL);
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Turned.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Turned.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/turned\.webp"/);
  await openPopup(page);
  await expect(popup(page).getByRole("slider", { name: "Zoom" })).toBeVisible();
  // Slice 109: Turn ends the Zoom row; Open large editor is in the head.
  await chooseShape(page, "Square");
  const zoomRow = popup(page).locator(".image-popup__row", { has: page.getByRole("slider", { name: "Zoom" }) });
  for (const name of ["Turn left", "Turn right"]) await expect(zoomRow.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(popup(page).locator(".image-popup__head").getByRole("button", { name: "Open large editor", exact: true })).toBeVisible();
  // The square's hint is never shown; it is only the square's description.
  const hint = popup(page).locator(".image-popup__hint");
  await expect(hint).toHaveText("Drag the square to what matters most.");
  await expect(hint).toHaveClass(/sr-only/);
  await expect(square(page)).toHaveAccessibleDescription("Drag the square to what matters most.");
  await chooseShape(page, "Original");
  const message = popup(page).locator(".image-popup__message");
  const zoom = popup(page).getByRole("slider", { name: "Zoom" });
  await zoom.fill("200");
  await expect(popup(page).locator(".image-popup__zoom output")).toHaveText("200 %");
  await expect(message).toHaveText("Saves a new picture for this spot");
  // Zoomed in, Original's frame is the square; arrow keys move what stays in view.
  await expect(square(page)).toBeVisible();
  await zoom.fill("100");
  await expect(message).toHaveText("Only changes this spot");
  await popup(page).getByRole("button", { name: "Turn right", exact: true }).click();
  await expect(popup(page).locator(".image-popup__turn")).toHaveAttribute("aria-label", "Turn, now 90°");
  await expect(message).toHaveText("Saves a new picture for this spot");
  // The picture is drawn turned: tall now.
  const turned = (await popup(page).locator(".image-popup__picbox").boundingBox())!;
  expect(turned.height).toBeGreaterThan(turned.width);
  await popup(page).getByRole("button", { name: "Turn left", exact: true }).click();
  await expect(popup(page).locator(".image-popup__turn")).toHaveAttribute("aria-label", "Turn, now 0°");
  await expect(message).toHaveText("Only changes this spot");
  // Turned and zoomed in, closing saves one trimmed copy: one Undo step puts the untrimmed photo back.
  const before = await source(page);
  await popup(page).getByRole("button", { name: "Turn right", exact: true }).click();
  await zoom.fill("200");
  await expect(message).toHaveText("Saves a new picture for this spot");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/turned-crop.webp.", { timeout: 30_000 });
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/turned-crop\.webp"/);
  // The 800 × 400 picture turned is 400 × 800; at 200 % half of each side stays.
  expect(await heroTag(page)).toMatch(/width="200"[^>]*height="400"|height="400"[^>]*width="200"/);
  const saved = (await records(page)).files["media/images/turned-crop.webp"].trimmedFrom;
  expect(saved.source).toBe("media/images/turned.webp");
  expect(saved.trim).toMatchObject({ x: 0.25, y: 0.25, width: 0.5, height: 0.5, turn: 90 });
  // Slice 109: about Brizy's height. Opened again (its hints seen), a fixed shape at
  // 1280 is at most 450 px tall.
  await openPopup(page);
  await chooseShape(page, "Square");
  await expect(popup(page).locator(".image-popup__notice")).toBeHidden();
  expect((await popup(page).boundingBox())!.height).toBeLessThanOrEqual(450);
  // Closing keeps Square as its own step, so two Undo steps put the untrimmed photo back.
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await page.locator(".code-editor__undo").first().click();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

// Ticket 93: each zoom or move step used to put the image's own picture back before the next trim,
// so the page flicked to the uncropped picture between steps. The same element now goes from one
// trimmed picture to the next, each shown once it has decoded.
type Ticket93Probe = { el: Element; seen: (string | null)[] };
type Ticket93Held = { ticket93Held: { src: string; release: () => void; reject: () => void }[] };
type Ticket93Update = { ticket93Update?: unknown };
/** A raster picture on the hero (a JPEG, saved as WebP), its popup open; returns the page's image.
 *  The preview keeps the last render it was sent, to draw the page again with `redraw`. */
async function openStepsPicture(page: Page, baseURL: string | undefined) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, baseURL);
  await frame(page).locator("body").evaluate(() => window.addEventListener("message", event => {
    if (event.source === parent && (event.data as { type?: string } | null)?.type === "update") Object.assign(window, { ticket93Update: event.data } satisfies Ticket93Update);
  }));
  await openPopup(page);
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Steps.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Steps.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/steps\.webp"/);
  await openPopup(page);
  return frame(page).locator(".hero img");
}
const zoomOutput = (page: Page) => popup(page).locator(".image-popup__zoom output");
type Hero = Awaited<ReturnType<typeof openStepsPicture>>;
/** Every src the page's image is given, in order, on the element first shown: each set is seen,
 *  even two in one task, which no paint separates but which still start a picture's load. Returns its own src. */
const probeSources = (hero: Hero) => hero.evaluate(el => {
  const seen = [el.getAttribute("src")];
  Object.assign(window, { ticket93: { el, seen } satisfies Ticket93Probe });
  const set = el.setAttribute.bind(el);
  el.setAttribute = (name: string, value: string) => { set(name, value); if (name === "src") seen.push(value); };
  return el.getAttribute("src");
});
const probed = (hero: Hero) => hero.evaluate(el => {
  const probe = (window as Window & { ticket93: Ticket93Probe }).ticket93;
  return { same: probe.el === el, seen: probe.seen };
});
/** After the first trim the page's own picture never comes back, and more than one trim showed. */
async function expectOwnNeverBack(hero: Hero, own: string | null) {
  const after = await probed(hero);
  expect(after.same).toBe(true);
  const first = after.seen.findIndex(src => src !== own);
  expect(first).toBeGreaterThan(0);
  expect(after.seen.slice(first).filter(src => src === own)).toEqual([]);
  expect(new Set(after.seen.slice(first)).size).toBeGreaterThan(1);
}
/** Holds every picture decode the preview starts, to settle them in any order. The trims are data:
 *  addresses, which `page.route` cannot hold, so `decode` itself is held. */
async function holdDecodes(hero: Hero) {
  await hero.evaluate(() => {
    const held: Ticket93Held["ticket93Held"] = [];
    Object.assign(window, { ticket93Held: held } satisfies Ticket93Held);
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      return new Promise<void>((release, reject) => { held.push({ src: this.src, release, reject: () => reject(new DOMException("held", "EncodingError")) }); });
    };
  });
  return {
    srcs: () => hero.evaluate(() => (window as Window & Ticket93Held).ticket93Held.map(entry => entry.src)),
    release: (index: number) => hero.evaluate((_, at) => (window as Window & Ticket93Held).ticket93Held[at].release(), index),
    reject: (index: number) => hero.evaluate((_, at) => (window as Window & Ticket93Held).ticket93Held[at].reject(), index),
  };
}
/** The src after the page has had two frames to show whatever was settled. A deliberate fixed wait:
 *  it proves a write did not happen, which no event announces. */
const settledSrc = (hero: Hero) => hero.evaluate(el => new Promise<string | null>(done =>
  requestAnimationFrame(() => requestAnimationFrame(() => done(el.getAttribute("src"))))));

test("zooming and moving step by step never shows the page's own picture between steps", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await probeSources(hero);
  // The popup's previews too: every src the phone preview's picture takes, on the element first shown.
  const preview = popup(page).locator(".image-popup__spot img").first();
  const untrimmed = await preview.evaluate(image => {
    const changes: (string | null)[] = [];
    Object.assign(window, { ticket93Preview: { image, changes } });
    new MutationObserver(records => { for (const record of records) changes.push(record.oldValue); })
      .observe(image, { attributes: true, attributeOldValue: true, attributeFilter: ["src"] });
    return image.getAttribute("src");
  });
  const zoom = popup(page).getByRole("slider", { name: "Zoom" });
  await zoom.focus();
  for (let step = 0; step < 6; step++) {
    const shown = await hero.getAttribute("src");
    await page.keyboard.press("ArrowRight");
    await expect(zoomOutput(page)).toHaveText(`${105 + step * 5} %`);
    // Each step reaches the page as its own trim.
    await expect(hero).not.toHaveAttribute("src", shown!);
  }
  // The preview kept its element, and after its first trim never went back to the untrimmed picture.
  const previewed = await preview.evaluate(image => {
    const probe = (window as Window & { ticket93Preview: { image: Element; changes: (string | null)[] } }).ticket93Preview;
    // Each record holds the value before its change: those values, then the one now, in order.
    return { same: probe.image === image, values: [...probe.changes, image.getAttribute("src")] };
  });
  expect(previewed.same).toBe(true);
  expect(previewed.values[0]).toBe(untrimmed);
  expect(previewed.values.slice(1)).not.toContain(untrimmed);
  expect(new Set(previewed.values.slice(1)).size).toBeGreaterThan(1);
  // Zoomed in, the square moves the picture to the side in several steps, each within its room.
  const box = (await popup(page).locator(".image-popup__picbox").boundingBox())!, held = (await square(page).boundingBox())!;
  const room = (box.width - held.width) / 2, middle = { x: held.x + held.width / 2, y: held.y + held.height / 2 };
  expect(room).toBeGreaterThan(12);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  for (const share of [0.25, 0.5, 0.75]) {
    const shown = await hero.getAttribute("src");
    await page.mouse.move(middle.x - room * share, middle.y, { steps: 3 });
    // Each move shows its own trim before the next one starts.
    await expect(hero).not.toHaveAttribute("src", shown!);
  }
  await page.mouse.up();
  await expect(square(page)).not.toHaveAttribute("aria-valuetext", /^50% across/);
  // The focus kept is the one that shows the square where it now sits.
  const moved = (await square(page).boundingBox())!;
  const across = Math.round((moved.x - box.x) / (box.width - moved.width) * 100);
  await expect(square(page)).toHaveAttribute("aria-valuetext", new RegExp(`^${across}% across`));
  // After the first trim the page's own picture never comes back while the popup is open.
  await expectOwnNeverBack(hero, own);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed", { timeout: 30_000 });
});

test("turning step by step never shows the page's own picture between steps", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await probeSources(hero);
  // Each turn is a trim (a turn sets Zoom back to 100 %, so a full turn would be the picture itself again).
  for (const angle of ["90°", "180°", "270°"]) {
    const shown = await hero.getAttribute("src");
    await popup(page).getByRole("button", { name: "Turn right", exact: true }).click();
    await expect(popup(page).locator(".image-popup__turn")).toHaveAttribute("aria-label", `Turn, now ${angle}`);
    await expect(hero).not.toHaveAttribute("src", shown!);
  }
  await expectOwnNeverBack(hero, own);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed", { timeout: 30_000 });
});

test("a page drawn again while a trim shows keeps the trim in every frame", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await hero.getAttribute("src");
  const decodes = await holdDecodes(hero);
  await popup(page).getByRole("slider", { name: "Zoom" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("105 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(0);
  const trims = await decodes.srcs();
  await decodes.release(trims.length - 1);
  const trim = trims[trims.length - 1];
  await expect(hero).toHaveAttribute("src", trim);
  // The last render arrives again (as any edit's would) while every later decode is held: each
  // frame after it still has the trim, never the page's own picture.
  const frames = await hero.evaluate(el => new Promise<(string | null)[]>(done => {
    const seen: (string | null)[] = [];
    const sample = () => { seen.push(el.getAttribute("src")); if (seen.length < 6) requestAnimationFrame(sample); else done(seen); };
    const update = (window as Window & Ticket93Update).ticket93Update;
    if (!update) throw new Error("No render was kept to draw again.");
    window.dispatchEvent(new MessageEvent("message", { data: update, source: parent }));
    requestAnimationFrame(sample);
  }));
  expect(frames).toEqual(Array(6).fill(trim));
  expect(frames).not.toContain(own);
  await expect(hero).toHaveAttribute("src", trim);
});

test("a page drawn again while the next trim decodes keeps the trim shown until that one is ready", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await hero.getAttribute("src");
  const decodes = await holdDecodes(hero);
  await popup(page).getByRole("slider", { name: "Zoom" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("105 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(0);
  const first = await decodes.srcs();
  await decodes.release(first.length - 1);
  const shown = first[first.length - 1];
  await expect(hero).toHaveAttribute("src", shown);
  // The next step is still decoding when the page is drawn again (Close's write right after a step).
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("110 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(first.length);
  const pending = (await decodes.srcs()).at(-1)!;
  expect(pending).not.toBe(shown);
  const frames = await hero.evaluate(el => new Promise<(string | null)[]>(done => {
    const seen: (string | null)[] = [];
    const sample = () => { seen.push(el.getAttribute("src")); if (seen.length < 6) requestAnimationFrame(sample); else done(seen); };
    window.dispatchEvent(new MessageEvent("message", { data: (window as Window & Ticket93Update).ticket93Update, source: parent }));
    requestAnimationFrame(sample);
  }));
  expect(frames).not.toContain(own);
  expect(frames).toEqual(Array(6).fill(shown));
  // Released, the next trim takes its place.
  const all = await decodes.srcs();
  for (let index = first.length; index < all.length; index++) await decodes.release(index);
  await expect(hero).toHaveAttribute("src", pending);
});

test("assets arriving while the next trim decodes keep the trim shown until that one is ready", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await hero.getAttribute("src");
  const decodes = await holdDecodes(hero);
  await popup(page).getByRole("slider", { name: "Zoom" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("105 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(0);
  const first = await decodes.srcs();
  await decodes.release(first.length - 1);
  const shown = first[first.length - 1];
  await expect(hero).toHaveAttribute("src", shown);
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("110 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(first.length);
  const pending = (await decodes.srcs()).at(-1)!;
  // An asset arrives (as the host sends one read late) while that trim is held.
  const frames = await hero.evaluate(el => new Promise<(string | null)[]>(done => {
    const seen: (string | null)[] = [];
    const sample = () => { seen.push(el.getAttribute("src")); if (seen.length < 6) requestAnimationFrame(sample); else done(seen); };
    const update = (window as Window & Ticket93Update).ticket93Update as { source: string };
    const assets = { source: update.source, type: "assets", assetChanges: { set: { "images/ticket-93-late.png": "data:image/png;base64,AAAA" } } };
    window.dispatchEvent(new MessageEvent("message", { data: assets, source: parent }));
    requestAnimationFrame(sample);
  }));
  expect(frames).not.toContain(own);
  expect(frames).toEqual(Array(6).fill(shown));
  const all = await decodes.srcs();
  for (let index = first.length; index < all.length; index++) await decodes.release(index);
  await expect(hero).toHaveAttribute("src", pending);
});

test("zooming in the large editor never shows the page's own picture between steps", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await probeSources(hero);
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  await expect(large(page)).toBeVisible();
  const zoomIn = large(page).locator(".image-large__tools:not(.image-large__iconrow)").getByRole("button", { name: "Zoom in", exact: true });
  for (let step = 0; step < 3; step++) {
    const shown = await hero.getAttribute("src");
    await zoomIn.click();
    await expect(hero).not.toHaveAttribute("src", shown!);
  }
  await expectOwnNeverBack(hero, own);
});

test("a trim whose decode fails still shows, as the page would show that picture", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await hero.getAttribute("src");
  const decodes = await holdDecodes(hero);
  await popup(page).getByRole("slider", { name: "Zoom" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("105 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(0);
  expect(await settledSrc(hero)).toBe(own);
  const trims = await decodes.srcs();
  await decodes.reject(trims.length - 1);
  await expect(hero).toHaveAttribute("src", trims[trims.length - 1]);
});

test("a see-through picture's previews keep the checkerboard on every zoom step, in the popup and the large editor", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await openPopup(page);
  // Half see-through everywhere, so every trim of it is too.
  const clear = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 400;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(34, 34, 221, 0.5)"; context.fillRect(0, 0, 800, 400);
    context.fillStyle = "rgba(221, 34, 34, 0.5)"; context.fillRect(0, 0, 400, 200);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Clear.png", mimeType: "image/png", buffer: Buffer.from(clear, "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Clear.png", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await openPopup(page);
  const spots = page.locator(".image-popup__spot img");
  await expect(spots.first()).toHaveAttribute("data-transparent", "");
  // Every removal of the mark from any preview, even one put back in the same task.
  const watch = () => page.evaluate(() => {
    const removed: string[] = [];
    Object.assign(window, { ticket93Removed: removed });
    new MutationObserver(records => {
      for (const record of records) if (record.oldValue !== null) removed.push((record.target as HTMLImageElement).src.slice(0, 40));
    }).observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["data-transparent"] });
  });
  const removed = () => page.evaluate(() => (window as Window & { ticket93Removed: string[] }).ticket93Removed);
  await watch();
  const zoom = popup(page).getByRole("slider", { name: "Zoom" });
  await zoom.focus();
  for (let step = 0; step < 4; step++) {
    const shown = await spots.first().getAttribute("src");
    await page.keyboard.press("ArrowRight");
    await expect(spots.first()).not.toHaveAttribute("src", shown!);
    await expect(spots.first()).toHaveAttribute("data-transparent", "");
  }
  expect(await removed()).toEqual([]);
  // The large editor draws its own previews and the popup's as each step changes.
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  await expect(large(page)).toBeVisible();
  const largeSpot = large(page).locator(".image-popup__spot img").first();
  await expect(largeSpot).toHaveAttribute("data-transparent", "");
  const zoomIn = large(page).locator(".image-large__tools:not(.image-large__iconrow)").getByRole("button", { name: "Zoom in", exact: true });
  for (let step = 0; step < 3; step++) {
    const shown = await largeSpot.getAttribute("src");
    await zoomIn.click();
    await expect(largeSpot).not.toHaveAttribute("src", shown!);
    await expect(largeSpot).toHaveAttribute("data-transparent", "");
  }
  expect(await removed()).toEqual([]);
  // A preview whose picture fails to load drops the mark, which described the picture before.
  // (Read from the removals seen: the previews' next redraw puts the trim and its mark back.)
  await largeSpot.evaluate(image => { (image as HTMLImageElement).src = "data:image/png;base64,AAAA"; });
  await expect.poll(removed).toContain("data:image/png;base64,AAAA");
});

// Each row of the settle matrix for a trim that has lost: released late, or failing late, it writes nothing.
for (const [late, settle] of [["decodes", "release"], ["fails to decode", "reject"]] as const) test(`a trim that ${late} late never replaces a newer one, nor the picture once the popup has closed`, async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const own = await hero.getAttribute("src");
  const decodes = await holdDecodes(hero), { srcs: held, release } = decodes, lose = decodes[settle];
  const settled = () => settledSrc(hero);
  const zoom = popup(page).getByRole("slider", { name: "Zoom" });
  await zoom.focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("105 %");
  await expect.poll(async () => (await held()).length).toBeGreaterThan(0);
  const one = (await held()).length;
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("110 %");
  await expect.poll(async () => (await held()).length).toBeGreaterThan(one);
  // Nothing shows until a trim has decoded: the page keeps its own picture.
  expect(await settled()).toBe(own);
  // The newest trim decodes first and shows; the older ones, settled after, are dropped.
  const trims = await held();
  const newest = trims[trims.length - 1];
  await release(trims.length - 1);
  await expect(hero).toHaveAttribute("src", newest);
  for (let index = 0; index < trims.length - 1; index++) await lose(index);
  expect(await settled()).toBe(newest);
  // A step still decoding when the popup closes never reaches the page afterwards.
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("115 %");
  await expect.poll(async () => (await held()).length).toBeGreaterThan(trims.length);
  const pending = (await held()).slice(trims.length);
  expect(await settled()).toBe(newest);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed", { timeout: 30_000 });
  // The saved trimmed copy is drawn (none of the looks' pictures, nor the picture before).
  await expect.poll(async () => {
    const src = await settled();
    return Boolean(src?.startsWith("data:image/")) && ![own, newest, ...pending].includes(src);
  }).toBe(true);
  const saved = await settled();
  for (let index = trims.length; index < trims.length + pending.length; index++) await lose(index);
  expect(await settled()).toBe(saved);
});

// The settle matrix's deliberate row: an older trim whose decode ends before a newer one's shows (a
// drag keeps moving), then the newer one takes its place; a failing older one shows as the page would.
for (const [first, settle] of [["decodes", "release"], ["fails to decode", "reject"]] as const) test(`an older trim that ${first} first shows until the newer one is ready`, async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  const decodes = await holdDecodes(hero);
  await popup(page).getByRole("slider", { name: "Zoom" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("105 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(0);
  const one = (await decodes.srcs()).length;
  await page.keyboard.press("ArrowRight");
  await expect(zoomOutput(page)).toHaveText("110 %");
  await expect.poll(async () => (await decodes.srcs()).length).toBeGreaterThan(one);
  const trims = await decodes.srcs();
  const older = trims[one - 1], newer = trims[trims.length - 1];
  expect(older).not.toBe(newer);
  await decodes[settle](one - 1);
  await expect(hero).toHaveAttribute("src", older);
  await decodes.release(trims.length - 1);
  await expect(hero).toHaveAttribute("src", newer);
});

test("closing at 100 % gives the image back its own srcset and sizes after trims took their place", async ({ page, baseURL }) => {
  const hero = await openStepsPicture(page, baseURL);
  // The image's own responsive picture, as a hand-written page would have it.
  const own = await hero.evaluate(el => {
    el.setAttribute("srcset", `${el.getAttribute("src")} 800w`);
    el.setAttribute("sizes", "(min-width: 40rem) 50vw, 100vw");
    return { srcset: el.getAttribute("srcset"), sizes: el.getAttribute("sizes") };
  });
  const zoom = popup(page).getByRole("slider", { name: "Zoom" });
  await zoom.focus();
  for (let step = 0; step < 3; step++) {
    const shown = await hero.getAttribute("src");
    await page.keyboard.press("ArrowRight");
    await expect(zoomOutput(page)).toHaveText(`${105 + step * 5} %`);
    await expect(hero).not.toHaveAttribute("src", shown!);
    // A trim is a single picture: the look takes the srcset and sizes away while it shows.
    await expect(hero).not.toHaveAttribute("srcset", /./);
    await expect(hero).not.toHaveAttribute("sizes", /./);
  }
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowLeft");
  await expect(zoomOutput(page)).toHaveText("100 %");
  await expect(hero).toHaveAttribute("srcset", own.srcset!);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(hero).toHaveAttribute("srcset", own.srcset!);
  await expect(hero).toHaveAttribute("sizes", own.sizes!);
});

const large = (page: Page) => page.getByRole("dialog", { name: "Edit image", exact: true });
// The large editor's own Undo (the editor toast, slice 105, can stand in the dialog with its Undo).
// The large editor's Shape: the popup's shape menu on a button naming the current shape (slice 110).
const largeShape = (page: Page) => large(page).getByRole("button", { name: /^Shape:/ });
async function chooseLargeShape(page: Page, label: string) {
  await largeShape(page).click();
  await large(page).getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(largeShape(page)).toHaveAccessibleName(`Shape: ${label}`);
}
const largeUndo = (page: Page) => large(page).getByRole("button", { name: "Undo", exact: true }).and(page.locator(":not(.editor-toast *)"));

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
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(() => heroTag(page)).toMatch(/src="\/media\/images\/level\.webp"/);

  // The popup's shape is carried into the large window.
  await openPopup(page);
  await chooseShape(page, "16:9");
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  await expect(large(page)).toBeVisible();
  await expect(largeShape(page)).toHaveAccessibleName("Shape: 16:9");
  const message = large(page).getByRole("status");
  await expect(message).toHaveText("Only changes this spot");
  // Flip and Cancel: back to the popup as it was.
  const previews = large(page).locator(".image-popup__spot img");
  const unflipped = (await previews.first().getAttribute("src"))!;
  // Slice 121: Flip is a toggle that shows when it is on, solid in the theme's --pressed, light and dark.
  const flipX = large(page).locator(".image-large__tools:not(.image-large__iconrow)").getByRole("button", { name: "Flip side to side", exact: true });
  const flipY = large(page).locator(".image-large__tools:not(.image-large__iconrow)").getByRole("button", { name: "Flip upside down", exact: true });
  await expect(flipX).toHaveAttribute("aria-pressed", "false");
  const look = (button: typeof flipX) => button.evaluate(element => {
    const probe = document.createElement("i"); probe.style.cssText = "background: var(--pressed); color: var(--on-pressed)";
    element.parentElement!.append(probe);
    const want = getComputedStyle(probe), have = getComputedStyle(element), result = { background: have.backgroundColor, color: have.color, pressed: want.backgroundColor, onPressed: want.color };
    probe.remove(); return result;
  });
  const off = await look(flipX);
  await flipX.click();
  await expect(message).toHaveText("Saves a new picture for this spot");
  await expect(flipX).toHaveAttribute("aria-pressed", "true");
  await expect(flipY).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(0, 0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect.poll(async () => { const on = await look(flipX); return on.background === on.pressed && on.color === on.onPressed; }, { message: `pressed Flip in ${scheme}` }).toBe(true);
  }
  await page.emulateMedia({ colorScheme: "light" });
  expect((await look(flipX)).background).not.toBe(off.background);
  // Both previews show the flipped picture at once.
  for (const index of [0, 1]) await expect(previews.nth(index)).not.toHaveAttribute("src", unflipped);
  // Undo, Redo and Reset (the whole original in the place's own shape, Original).
  const shape = largeShape(page);
  await largeUndo(page).click();
  await expect(message).toHaveText("Only changes this spot");
  await expect(previews.first()).toHaveAttribute("src", unflipped);
  await expect(flipX).toHaveAttribute("aria-pressed", "false");
  await large(page).getByRole("button", { name: "Redo", exact: true }).click();
  await expect(message).toHaveText("Saves a new picture for this spot");
  await large(page).getByRole("button", { name: "Reset", exact: true }).click();
  await expect(message).toHaveText("Only changes this spot");
  await expect(shape).toHaveAccessibleName("Shape: Original");
  await largeUndo(page).click();
  await expect(shape).toHaveAccessibleName("Shape: 16:9");
  await expect(message).toHaveText("Saves a new picture for this spot");
  await large(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(large(page)).toHaveCount(0);
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("button", { name: "Shape: 16:9", exact: true })).toBeVisible();
  await expect(popup(page).locator(".image-popup__turn")).toHaveAttribute("aria-label", "Turn, now 0°");
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

// Slice 110: at 768 both previews sit inside the dialog (light and dark); the message is the popup's quiet
// line by Cancel and Done; the ruler's labels show whole and unfaded; a see-through picture is on the checkerboard.
test("at 768 the large editor's previews fit, its message is one quiet line and a see-through picture is on the checkerboard", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page, baseURL);
  await openPopup(page);
  await replaceWith(page, "Wide.jpg", "image/jpeg", await quarters(page));
  await chooseShape(page, "16:9");
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = (await large(page).boundingBox())!;
    const screens = large(page).locator(".image-popup__screen");
    await expect(screens).toHaveCount(2);
    for (const screen of await screens.all()) {
      const box = (await screen.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(dialog.x);
      expect(box.x + box.width).toBeLessThanOrEqual(dialog.x + dialog.width - 8);
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  // The ruler's labels are not under the fading mask, and each shown one is whole inside the ruler.
  const ruler = (await large(page).locator(".image-large__ruler").boundingBox())!;
  const shown = large(page).locator(".image-large__degrees").filter({ visible: true });
  expect(await shown.count()).toBeGreaterThanOrEqual(2);
  for (const label of await shown.all()) {
    const box = (await label.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(ruler.x);
    expect(box.x + box.width).toBeLessThanOrEqual(ruler.x + ruler.width);
    expect(await label.evaluate(element => getComputedStyle(element.closest(".image-large__labels")!).maskImage)).toBe("none");
  }
  // The message shares the buttons' line, plain (no box), in the muted colour.
  await large(page).getByRole("button", { name: "Flip side to side", exact: true }).click();
  const message = large(page).getByRole("status");
  await expect(message).toHaveText("Saves a new picture for this spot");
  await expect(large(page).locator(".image-large__foot").getByRole("status")).toHaveCount(1);
  const done = (await large(page).getByRole("button", { name: "Done", exact: true }).boundingBox())!, line = (await message.boundingBox())!;
  expect(Math.abs((line.y + line.height / 2) - (done.y + done.height / 2))).toBeLessThan(4);
  expect(await message.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // A see-through logo sits on the checkerboard in the large editor too; an opaque photo does not.
  const picture = large(page).locator(".image-large__pic");
  await expect(picture).not.toHaveAttribute("data-transparent");
  await large(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await replaceWith(page, "Logo.png", "image/png", await seeThrough(page));
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  await expect(picture).toHaveAttribute("data-transparent", "");
  expect(await picture.evaluate(element => getComputedStyle(element).backgroundImage)).toContain("conic-gradient");
});

// Slice 110 (review): the shared shape menu offers a hand-written ratio while the place has it, in the popup and
// the large editor; a press outside the open menu only closes it, and the next gesture edits as usual.
test("a hand-written ratio is offered while the place has it; a press outside the shape menu only closes it", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const response = await page.request.get(`${baseURL}/__demo/file?path=index.html`);
  const seeded = (await response.text()).replace(/<img\b([^>]*class="hero-image"[^>]*)>/, '<img$1 style="aspect-ratio: 3 / 2; object-fit: cover">');
  expect(seeded).toContain("aspect-ratio: 3 / 2");
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: seeded } })).ok()).toBe(true);
  await page.locator(".repository-menu__trigger").click();
  await page.locator('.repository-menu__repo[aria-current="true"]').hover();
  await page.getByRole("menu", { name: "Branches" }).getByRole("menuitem", { name: "Refresh from GitHub" }).click();
  // The page is briefly unmounted while it refreshes.
  await expect.poll(async () => (await source(page)) ?? "").toContain("aspect-ratio: 3 / 2");
  await openPopup(page);
  await replaceWith(page, "Ratio.jpg", "image/jpeg", await quarters(page));
  const custom = "Custom (3 / 2)";
  // The popup: the ratio is named and checked; choosing it again keeps it.
  await expect(popup(page).getByRole("button", { name: `Shape: ${custom}`, exact: true })).toBeVisible();
  await popup(page).getByRole("button", { name: /^Shape:/ }).click();
  await expect(popup(page).getByRole("menuitemradio", { name: custom, exact: true })).toHaveAttribute("aria-checked", "true");
  await popup(page).getByRole("menuitemradio", { name: custom, exact: true }).click();
  await expect(popup(page).getByRole("button", { name: `Shape: ${custom}`, exact: true })).toBeVisible();

  // The large editor: the same, then Square hides it and Undo brings it back.
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  await expect(largeShape(page)).toHaveAccessibleName(`Shape: ${custom}`);
  await largeShape(page).click();
  await expect(large(page).getByRole("menuitemradio", { name: custom, exact: true })).toHaveAttribute("aria-checked", "true");
  await large(page).getByRole("menuitemradio", { name: custom, exact: true }).click();
  await expect(largeShape(page)).toHaveAccessibleName(`Shape: ${custom}`);
  await expect(largeUndo(page)).toBeDisabled();
  await chooseLargeShape(page, "Square");
  await largeShape(page).click();
  await expect(large(page).getByRole("menuitemradio", { name: custom, exact: true })).toBeHidden();
  await page.keyboard.press("Escape");
  await largeUndo(page).click();
  await expect(largeShape(page)).toHaveAccessibleName(`Shape: ${custom}`);

  // A press and drag on the ruler or the picture with the menu open only closes the menu.
  const menu = large(page).getByRole("menu", { name: "Shape" });
  const straighten = large(page).getByRole("slider", { name: "Straighten" });
  const frameBox = () => large(page).locator(".image-large__frame").boundingBox();
  const drag = async (selector: string, dx: number) => {
    const box = (await large(page).locator(selector).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  };
  await largeShape(page).click();
  await expect(menu).toBeVisible();
  await drag(".image-large__ruler", -60);
  await expect(menu).toBeHidden();
  await expect(straighten).toHaveAttribute("aria-valuetext", "0 degrees");
  const before = await frameBox();
  await largeShape(page).click();
  await drag(".image-large__stage", 80);
  await expect(menu).toBeHidden();
  expect(await frameBox()).toEqual(before);
  await expect(large(page).getByRole("status")).toHaveText("Only changes this spot");
  // The next gesture edits as usual.
  await drag(".image-large__ruler", -60);
  await expect(straighten).not.toHaveAttribute("aria-valuetext", "0 degrees");
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
  await expect(imageButton(page)).toHaveText("Media");
  await expect(imageButton(page)).toHaveAttribute("title", /· Photo card's shape$/);
  await imageButton(page).click();
  await expect(popup(page).getByRole("button", { name: "Shape: Photo card's shape (4:3)", exact: true })).toBeVisible();
  await expect(square(page)).toBeVisible();
  await chooseShape(page, "Square");
  await expect(popup(page).getByRole("status").filter({ hasText: "This Photo card will look different from the others." })).toBeVisible();
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(tag).toContain("aspect-ratio: 1 / 1");
  const squared = await source(page);
  await image.click();
  await imageButton(page).click();
  await chooseShape(page, "Photo card's shape (4:3)");
  await expect(popup(page).getByRole("status").filter({ hasText: "will look different" })).toBeHidden();
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(tag).not.toMatch(/aspect-ratio|object-fit/);
  await expect(image).toHaveCSS("aspect-ratio", "4 / 3");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(squared);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
  // Original overrides the component crop and reads back as Original.
  await image.click();
  await imageButton(page).click();
  await chooseShape(page, "Original");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(tag).toContain("aspect-ratio: auto");
  await expect(image).toHaveCSS("object-fit", "contain");
  await image.click();
  await imageButton(page).click();
  await expect(popup(page).getByRole("button", { name: "Shape: Original", exact: true })).toBeVisible();
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
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
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(tag).toMatch(/src="\/media\/images\/quarters\.webp"/);
  expect(await tag()).not.toMatch(/aspect-ratio/);
  // Free: the trimmed copy has its own shape, so the place undoes the component's crop.
  await image.click();
  await imageButton(page).click();
  await chooseShape(page, "Free");
  await expect(popup(page).getByRole("status").filter({ hasText: "This Photo card will look different from the others." })).toBeVisible();
  await dragCorner(page, "se", -0.5, -0.3);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop.webp.", { timeout: 30_000 });
  await expect.poll(tag).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);
  expect(await tag()).toMatch(/aspect-ratio: auto/);
  await expect(image).toHaveCSS("aspect-ratio", "auto");
  // Re-opened untouched, closing writes nothing.
  const trimmed = await source(page);
  await image.click();
  await imageButton(page).click();
  await expect(popup(page).getByRole("button", { name: "Shape: Free", exact: true })).toBeVisible();
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  expect(await source(page)).toBe(trimmed);
});

test("zoom on a component's own shape saves a copy the component still crops; a shape of the place's own shows the component note", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const image = await seedPhotoCard(page, baseURL);
  const tag = async () => (await source(page)).match(/<img[^>]*slot="image"[^>]*>/)?.[0] ?? "";
  await image.click();
  await imageButton(page).click();
  // A photo first (SVGs cannot be trimmed); Replace places it at once and closes the popup.
  await popup(page).getByRole("button", { name: "Replace", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Quarters.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker(page).getByRole("button", { name: "Choose Quarters.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(tag).toMatch(/src="\/media\/images\/quarters\.webp"/);
  await image.click();
  await imageButton(page).click();
  // A shape of the place's own shows the component note.
  await chooseShape(page, "Square");
  await expect(popup(page).getByRole("status").filter({ hasText: "This Photo card will look different from the others." })).toBeVisible();
  // Back to the component's shape, zoomed in: a trimmed copy, cropped by the component, with no shape of the place's own.
  await chooseShape(page, "Photo card's shape (4:3)");
  await expect(popup(page).getByRole("status").filter({ hasText: "will look different" })).toHaveCount(0);
  // The large editor opens on the component's shape and always offers it back.
  await popup(page).getByRole("button", { name: "Open large editor", exact: true }).click();
  const componentShape = "Shape: Photo card's shape (4:3)";
  await expect(largeShape(page)).toHaveAccessibleName(componentShape);
  await largeShape(page).click();
  await expect(large(page).getByRole("menuitemradio").first()).toHaveText("Photo card's shape (4:3)");
  await expect(large(page).getByRole("menuitemradio").first()).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(large(page).getByRole("menu", { name: "Shape" })).toBeHidden();
  await expect(large(page)).toBeVisible();
  const largeNote = large(page).locator(".image-large__note").filter({ visible: true });
  await expect(largeNote).toHaveCount(0);
  await chooseLargeShape(page, "Square");
  await expect(largeNote).toHaveText("This Photo card will look different from the others.");
  // Undo and Redo keep the component's shape through the editor's history; Reset returns to it.
  await largeUndo(page).click();
  await expect(largeShape(page)).toHaveAccessibleName(componentShape);
  await expect(largeNote).toHaveCount(0);
  await large(page).getByRole("button", { name: "Redo", exact: true }).click();
  await expect(largeShape(page)).toHaveAccessibleName("Shape: Square");
  await large(page).getByRole("button", { name: "Reset", exact: true }).click();
  await expect(largeShape(page)).toHaveAccessibleName(componentShape);
  await chooseLargeShape(page, "Square");
  await chooseLargeShape(page, "Photo card's shape (4:3)");
  await chooseLargeShape(page, "Square");
  // Cancel with Square chosen: back to the popup as it was, on the component's shape.
  await large(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(large(page)).toHaveCount(0);
  await expect(popup(page).getByRole("button", { name: "Shape: Photo card's shape (4:3)", exact: true })).toBeVisible();
  await popup(page).getByRole("slider", { name: "Zoom" }).fill("200");
  await expect(popup(page).getByRole("status").filter({ hasText: "Saves a new picture for this spot" })).toBeVisible();
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Picture trimmed: media/images/quarters-crop.webp.", { timeout: 30_000 });
  await expect.poll(tag).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);
  expect(await tag()).not.toMatch(/aspect-ratio|object-fit/);
  await expect(image).toHaveCSS("aspect-ratio", "4 / 3");
  // Re-opened on the original with the zoom put back, on the component's shape; untouched, closing writes nothing.
  const zoomed = await source(page);
  await image.click();
  await imageButton(page).click();
  await expect(popup(page).getByRole("button", { name: "Shape: Photo card's shape (4:3)", exact: true })).toBeVisible();
  await expect(popup(page).locator(".image-popup__zoom output")).toHaveText("200 %");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  expect(await source(page)).toBe(zoomed);
});

// Re-select another element each time, so selecting the image requests a new render.
test("an immediate double-click after selecting opens the picker 20 times", async ({ page, baseURL }) => {
  await open(page, baseURL);
  for (let attempt = 0; attempt < 20; attempt++) {
    await frame(page).locator(".hero h1").click();
    await frame(page).locator(".hero img").click();
    await frame(page).locator(".hero img").dblclick();
    await expect(picker(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker(page)).toHaveCount(0);
  }
});
