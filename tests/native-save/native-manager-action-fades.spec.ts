import { expect, test, type Locator, type Page } from "@playwright/test";

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
  // The faded lead-in never takes clicks from the row beneath it.
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
  test("row icons are exposed with usable touch targets", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const overlay = page.locator(".pages-row.is-current .row-action-overlay").first();
    await painted(overlay, "1");
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
