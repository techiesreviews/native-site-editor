import { expect, test, type Locator, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await expect(page.locator("#explorer")).toBeVisible();
}
type Hit = { inButton: boolean; inOverlay: boolean; inHost: boolean };
// What a pointer would actually reach at a point, without moving the pointer there.
async function hitAt(overlay: Locator, target: Locator, dx?: number): Promise<Hit> {
  const box = (await target.boundingBox())!;
  const x = dx === undefined ? box.x + box.width / 2 : box.x + dx;
  const y = box.y + box.height / 2;
  return overlay.evaluate((el, [x, y]) => {
    const hit = document.elementFromPoint(x, y);
    const host = el.closest(".row-action-host")!;
    const buttons = [...el.children];
    return {
      inButton: Boolean(hit && buttons.some((b) => b.contains(hit))),
      inOverlay: Boolean(hit && el.contains(hit) && hit !== el),
      inHost: Boolean(hit && host.contains(hit)),
    };
  }, [x, y]);
}
async function surface(overlay: Locator) {
  return overlay.evaluate((el) => { const s = getComputedStyle(el, "::before"); return { opacity: s.opacity, pointer: s.pointerEvents }; });
}
/** Rest: nothing visible or hittable; points over the actions reach the row. Shown: real, stable hit targets. */
async function painted(overlay: Locator, opacity: "0" | "1") {
  await expect(overlay).toHaveCSS("pointer-events", "none");
  await expect.poll(() => surface(overlay)).toEqual({ opacity, pointer: "none" });
  const buttons = await overlay.locator("> *").all();
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    await expect(button).toHaveCSS("opacity", opacity);
    await expect(button).toHaveCSS("pointer-events", opacity === "1" ? "auto" : "none");
    const hit = await hitAt(overlay, button);
    if (opacity === "1") expect(hit.inButton).toBe(true);
    else expect(hit).toEqual({ inButton: false, inOverlay: false, inHost: true });
  }
  // The faded lead-in never takes clicks from the row beneath it (touch rows have none).
  if ((await overlay.evaluate((el) => getComputedStyle(el).position)) === "absolute")
    expect(await hitAt(overlay, overlay, 4)).toMatchObject({ inOverlay: false, inHost: true });
}

test("Pages and Files overlay existing actions without shrinking names, and keep keyboard menus", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Pages", exact: true }).click();
  const current = page.locator(".pages-row.is-current").first();
  const overlay = current.locator(".row-action-overlay");
  await page.mouse.move(1400, 900);
  await painted(overlay, "0");
  await expect(overlay).toHaveCSS("position", "absolute");
  const nameWidth = (await current.locator(".pages-label").boundingBox())!.width;
  await current.hover();
  await painted(overlay, "1");
  expect((await current.locator(".pages-label").boundingBox())!.width).toBe(nameWidth);
  const pageItem = current.locator("..");
  await pageItem.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pageItem).toBeFocused();

  await page.locator("#explorer").getByRole("tab", { name: "Files", exact: true }).click();
  const fileLine = page.locator("#explorer .file-row-line.row-action-host:not(.is-folder)").filter({ visible: true }).first();
  const fileOverlay = fileLine.locator(".row-action-overlay");
  await page.mouse.move(1400, 900);
  await painted(fileOverlay, "0");
  await fileLine.locator(".file-row").focus();
  await painted(fileOverlay, "1");
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fileLine.locator(".file-row")).toBeFocused();
});

test("Images reveal usage actions beside the filename while thumbnails and usage metadata stay visible", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Images", exact: true }).click();
  const card = page.locator(".media-library__card").first();
  const overlay = card.locator(".row-action-overlay");
  await page.mouse.move(1400, 900);
  await painted(overlay, "0");
  const thumbnail = await card.locator(".media-library__thumbnail").boundingBox();
  await card.hover();
  await painted(overlay, "1");
  const action = await overlay.boundingBox();
  expect(action!.y).toBeGreaterThanOrEqual(thumbnail!.y + thumbnail!.height);
  await expect(card.locator(".media-library__usage-count")).toHaveText(/Used on \d+ pages/);
  await overlay.getByRole("button").click();
  await expect(page.locator(".media-library__sheet").getByRole("heading", { name: /Used on \d+ pages/ })).toBeVisible();
});

test("reduced motion reveals actions immediately on hover", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, baseURL);
  const overlay = page.locator(".pages-row.is-current .row-action-overlay").first();
  await expect(overlay.locator("> *").first()).toHaveCSS("transition-duration", "0s");
  await page.locator(".pages-row.is-current").first().hover();
  await painted(overlay, "1");
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("row actions take their own room on a narrow touch row, with 44px targets", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const current = page.locator(".pages-row.is-current").first();
    const overlay = current.locator(".row-action-overlay");
    await painted(overlay, "1");
    await expect(overlay).toHaveCSS("position", "static");
    const host = (await current.boundingBox())!;
    const strip = (await overlay.boundingBox())!;
    expect(strip.x + strip.width).toBeLessThanOrEqual(host.x + host.width + 0.5);
    expect(await current.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // Name and URL are never covered: they end where the actions begin.
    for (const text of [current.locator(".pages-label"), current.locator(".pages-url")]) {
      if (!(await text.count())) continue;
      const box = (await text.boundingBox())!;
      expect(box.width).toBeGreaterThan(0);
      expect(box.x + box.width).toBeLessThanOrEqual(strip.x + 0.5);
    }
    const buttons = overlay.getByRole("button");
    for (const button of await buttons.all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    await buttons.last().tap();
    await expect(page.getByRole("menu")).toBeVisible();
  });
});

test("renaming a page in place gives the field its whole row: a click near its end keeps the caret, Escape changes nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Pages", exact: true }).click();
  const current = page.locator(".pages-row.is-current").first();
  const label = (await current.locator(".pages-label").textContent())!;
  const before = JSON.stringify(await storedDrafts(page));
  await current.locator("..").focus();
  await page.keyboard.press("F2");
  const field = page.locator("#explorer").getByRole("textbox", { name: `Title of ${label}` });
  await expect(field).toBeFocused();
  await expect(current.locator(".row-action-overlay")).toBeHidden();
  // The pointer lands in the last 8px of the field, where the actions used to sit.
  const box = (await field.boundingBox())!;
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(label);
  expect(await field.evaluate((el: HTMLInputElement) => el.selectionStart)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(current.locator(".pages-label")).toHaveText(label);
  expect(JSON.stringify(await storedDrafts(page))).toBe(before);
});

test("keyboard focus on an image's checkbox shows its action at once, and it still opens the details", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Images", exact: true }).click();
  const card = page.locator(".media-library__card").first();
  const overlay = card.locator(".row-action-overlay");
  await page.mouse.move(1400, 900);
  await painted(overlay, "0");
  await card.getByRole("checkbox").focus();
  const action = overlay.getByRole("button");
  await expect(action).toHaveCSS("transition-duration", "0s");
  await expect(action).toHaveCSS("opacity", "1");
  await expect(action).toHaveCSS("pointer-events", "auto");
  expect(await overlay.evaluate((el) => getComputedStyle(el, "::before").transitionDuration)).toBe("0s");
  await action.click();
  await expect(page.locator(".media-library__sheet").getByRole("heading", { name: /Used on \d+ pages/ })).toBeVisible();
});

test("a mouse-opened file keeps its own tint: no keyboard gray, and the fade matches it", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Files", exact: true }).click();
  const line = page.locator("#explorer .file-row-line.row-action-host:not(.is-folder)")
    .filter({ visible: true }).filter({ hasNot: page.locator(".file-row.selected, .file-row[data-path=\"index.html\"]") }).first();
  const path = (await line.locator(".file-row").getAttribute("data-path"))!;
  const opened = page.locator(`#explorer .file-row-line:has(> .file-row[data-path="${path}"])`);
  await opened.locator(".file-row").click();
  await expect(opened.locator(".file-row")).toHaveClass(/selected/);
  await page.mouse.move(1400, 900);
  const paint = await opened.evaluate((el) => ({
    row: getComputedStyle(el).backgroundColor,
    fade: getComputedStyle(el.querySelector(".row-action-overlay")!, "::before").backgroundImage,
    keyboard: el.matches(":has(> .file-row:focus-visible)"),
  }));
  expect(paint.keyboard).toBe(false);
  expect(paint.row).not.toBe("rgba(0, 0, 0, 0)");
  expect(paint.fade).toContain(paint.row);
});

test("a hidden Restore cannot be reached at rest; hovering its row reveals it and it restores", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Files", exact: true }).click();
  const line = page.locator("#explorer .file-row-line.row-action-host:not(.is-folder)")
    .filter({ visible: true }).filter({ hasNot: page.locator(".file-row.selected, .file-row[data-path=\"index.html\"]") }).first();
  const fileRow = line.locator(".file-row");
  const path = (await fileRow.getAttribute("data-path"))!;
  await fileRow.focus();
  await page.keyboard.press("Delete");
  await page.getByRole("dialog", { name: `Delete ${path}?` }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#status")).toHaveText(`Deleted ${path}.`);
  await expect(fileRow).toHaveClass(/is-deleted/);

  const overlay = line.locator(".row-action-overlay");
  const restore = overlay.getByRole("button", { name: `Restore ${path}` });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(1400, 900);
  await painted(overlay, "0");
  // A driver or script reaching for the hidden Restore finds the row, not the action.
  await expect(restore.click({ trial: true, timeout: 1_000 })).rejects.toThrow();
  await expect(fileRow).toHaveClass(/is-deleted/);
  await expect(page.locator("#status")).toHaveText(`Deleted ${path}.`);

  await line.hover();
  await painted(overlay, "1");
  await restore.click();
  await expect(page.locator("#status")).toHaveText(`Restored ${path}.`);
  await expect(fileRow).not.toHaveClass(/is-deleted/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`keyboard focus on the open file paints, and fades, in its focus colour in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, baseURL);
    await page.locator("#explorer").getByRole("tab", { name: "Files", exact: true }).click();
    const first = page.locator("#explorer .file-row-line.row-action-host:not(.is-folder)")
      .filter({ visible: true }).filter({ hasNot: page.locator(".file-row.selected, .file-row[data-path=\"index.html\"]") }).first();
    const path = (await first.locator(".file-row").getAttribute("data-path"))!;
    const line = page.locator(`#explorer .file-row-line:has(> .file-row[data-path="${path}"])`);
    await line.locator(".file-row").click();
    await expect(line.locator(".file-row")).toHaveClass(/selected/);
    // Opening the file closes the explorer; reopen it and reach the row from the keyboard.
    await page.locator("#explorer-toggle").click();
    await page.locator("#explorer").getByRole("tab", { name: "Files", exact: true }).click();
    await expect(line.locator(".file-row")).toBeVisible();
    await page.mouse.move(1400, 900);
    const tint = await line.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.keyboard.press("Shift");
    await line.locator(".file-row").focus();
    await expect(line.locator(".file-row")).toBeFocused();
    const paint = await line.evaluate((el) => ({
      row: getComputedStyle(el).backgroundColor,
      fade: getComputedStyle(el.querySelector(".row-action-overlay")!, "::before").backgroundImage,
      keyboard: el.matches(":has(> .file-row:focus-visible)"),
    }));
    expect(paint.keyboard).toBe(true);
    expect(paint.row).not.toBe(tint);
    expect(paint.fade).toContain(paint.row);
  });
}

// Pixel proof that each fade ends opaque on the row's real composited colour.
// Region: the fade's solid part (past its 20px lead-in), inset from the focus ring.
// "plain" is the same host with its text, icons and actions made invisible (colour
// and opacity only: backgrounds, geometry, hover and focus stay real).
type Shot = { width: number; height: number; data: number[] };
async function regionShot(page: Page, overlay: Locator, css: string): Promise<Shot> {
  const box = (await overlay.boundingBox())!;
  const style = await page.addStyleTag({ content: css });
  await page.waitForTimeout(250);
  const clip = { x: Math.ceil(box.x + 22), y: Math.ceil(box.y + 3), width: Math.floor(box.width - 25), height: Math.floor(box.height - 6) };
  const png = (await page.screenshot({ clip, animations: "disabled" })).toString("base64");
  await style.evaluate((el) => el.remove());
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, data: [...ctx.getImageData(0, 0, img.width, img.height).data] };
  }, png);
}
function differing(a: Shot, b: Shot, tolerance = 4) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if ([0, 1, 2].some((c) => Math.abs(a.data[i + c] - b.data[i + c]) > tolerance)) count++;
  return count;
}
async function fadeCheck(page: Page, host: Locator, label: string, { textBeneath = true, tinted = true } = {}) {
  const mark = `fade-${Math.random().toString(36).slice(2)}`;
  await host.evaluate((el, mark) => el.setAttribute("data-fade-check", mark), mark);
  const sel = `[data-fade-check="${mark}"]`;
  const overlay = host.locator(".row-action-overlay");
  const hideText = `${sel}, ${sel} * { color: transparent !important; text-decoration-color: transparent !important; } ${sel} :is(img, svg) { opacity: 0 !important; }`;
  const plain = await regionShot(page, overlay, `${hideText} ${sel} > .row-action-overlay { display: none !important; }`);
  const actual = await regionShot(page, overlay, `${sel} > .row-action-overlay > * { opacity: 0 !important; }`);
  expect(differing(actual, plain), `${label}: fade end matches the plain row`).toBe(0);
  if (textBeneath) {
    const bare = await regionShot(page, overlay, `${sel} > .row-action-overlay { opacity: 0 !important; }`);
    expect(differing(bare, plain), `${label}: there is text beneath the fade`).toBeGreaterThan(20);
  }
  // Negative control: without the opaque base, text shows through and tints double.
  // An untinted row already fades to an opaque surface, so it has no control.
  if (!tinted) return;
  const thin = await regionShot(page, overlay, `${sel} > .row-action-overlay > * { opacity: 0 !important; } ${sel} { --row-action-base: transparent !important; }`);
  expect(differing(thin, plain), `${label}: the check fails without the opaque base`).toBeGreaterThan(20);
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: manager fades end opaque on each row's real colour (hover, current, keyboard, drop)`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, baseURL);
    const explorer = page.locator("#explorer");
    await explorer.getByRole("tab", { name: "Pages", exact: true }).click();
    const other = page.locator(".pages-row.row-action-host:not(.is-current)").filter({ has: page.locator(".pages-url") }).filter({ visible: true }).first();
    const current = page.locator(".pages-row.is-current").first();
    await other.hover();
    await fadeCheck(page, other, `${scheme} pages hover`);
    await current.hover();
    await fadeCheck(page, current, `${scheme} pages current hover`);
    await page.mouse.move(1400, 900);
    await other.locator("..").focus();
    await page.keyboard.press("Shift");
    await expect(other.locator("..")).toBeFocused();
    await fadeCheck(page, other, `${scheme} pages keyboard focus`);
    await other.evaluate((el) => el.classList.add("is-drop-target"));
    await fadeCheck(page, other, `${scheme} pages drop target`);
    await other.evaluate((el) => el.classList.remove("is-drop-target"));

    await explorer.getByRole("tab", { name: "Files", exact: true }).click();
    const lines = page.locator("#explorer .file-row-line.row-action-host:not(.is-folder)").filter({ visible: true });
    // Fixture file and image names stop short of the actions; Pages routes run beneath them.
    const filePath = (await lines.filter({ hasNot: page.locator(".file-row.selected") }).first().locator(".file-row").getAttribute("data-path"))!;
    const file = page.locator(`#explorer .file-row-line:has(> .file-row[data-path="${filePath}"])`);
    await file.hover();
    await fadeCheck(page, file, `${scheme} files hover`, { textBeneath: false });
    await page.mouse.move(1400, 900);
    await file.locator(".file-row").focus();
    await page.keyboard.press("Shift");
    await fadeCheck(page, file, `${scheme} files keyboard focus`, { textBeneath: false });
    await file.evaluate((el) => el.classList.add("is-drop-target"));
    await fadeCheck(page, file, `${scheme} files drop target`, { textBeneath: false });
    await file.evaluate((el) => el.classList.remove("is-drop-target"));
    await file.locator(".file-row").click();
    if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
    await explorer.getByRole("tab", { name: "Files", exact: true }).click();
    await expect(file.locator(".file-row")).toHaveClass(/selected/);
    await file.hover();
    await fadeCheck(page, file, `${scheme} files current hover`, { textBeneath: false });

    await explorer.getByRole("tab", { name: "Images", exact: true }).click();
    const card = page.locator(".media-library__card").first();
    const name = card.locator(".media-library__name-line");
    await card.hover();
    await fadeCheck(page, name, `${scheme} images hover`, { textBeneath: false, tinted: false });
    await card.getByRole("checkbox").check();
    await card.hover();
    await fadeCheck(page, name, `${scheme} images checked hover`, { textBeneath: false });
  });
}
