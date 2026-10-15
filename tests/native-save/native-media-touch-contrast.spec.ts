import { expect, test, type Locator, type Page } from "@playwright/test";
import { sampleContrast, type Pixel } from "./tone-contrast";

// Slice 106 (audit C3): a tap leaves no hover patch, a mouse still gets one; links and disabled
// buttons keep their contrast in both themes; see-through pictures sit on a light checkerboard.

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
const media = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
async function openMedia(page: Page, press: (target: Locator) => Promise<void>) {
  if (!await page.getByRole("tab", { name: "Media", exact: true }).isVisible()) await press(page.locator("#explorer-toggle"));
  await press(page.getByRole("tab", { name: "Media", exact: true }));
  await expect(media(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
async function addingSettings(page: Page, press: (target: Locator) => Promise<void>) {
  await press(media(page).getByRole("button", { name: "More", exact: true }));
  const item = page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem", { name: "Adding settings", exact: true });
  const box = (await item.boundingBox())!;
  await press(item);
  await expect(media(page).getByRole("heading", { name: "Adding settings", exact: true })).toBeFocused();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
/** The background a control paints, read from the browser. */
const background = (target: Locator) => target.evaluate(element => getComputedStyle(element).backgroundColor);
/** Controls in the Media panel painting the hover grey (no pointer is over any of them). */
const lit = (page: Page) => media(page).evaluate(region => {
  const probe = document.createElement("span"); probe.style.background = "var(--hover)"; region.append(probe);
  const hover = getComputedStyle(probe).backgroundColor; probe.remove();
  return [...region.querySelectorAll("button, label, a, summary")]
    .filter(element => getComputedStyle(element).backgroundColor === hover).map(element => element.textContent?.trim() || element.className);
});

/** The element's text colour and the backgrounds behind it, nearest first, to the first opaque one. */
function colours(target: Locator) {
  return target.evaluate(element => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const pixel = (colour: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = "#0000"; context.fillStyle = colour; context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return { colour, rgba: [r / 255, g / 255, b / 255, a / 255] as [number, number, number, number] };
    };
    const backgrounds: Pixel[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const behind = pixel(getComputedStyle(node).backgroundColor);
      if (behind.rgba[3] > 0) backgrounds.push(behind);
      if (behind.rgba[3] === 1) break;
    }
    return { foreground: pixel(getComputedStyle(element).color), backgrounds };
  });
}
async function contrast(target: Locator) { return sampleContrast(await colours(target)).ratio; }

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a tapped menu item and a tapped choice leave no hover background behind", async ({ page, baseURL }) => {
    await open(page, baseURL);
    expect(await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)).toBe(false);
    const press = (target: Locator) => target.tap();
    await openMedia(page, press);
    const point = await addingSettings(page, press);
    expect(await lit(page)).toEqual([]);
    // A control now under the finger paints what it paints with no pointer over it.
    const under = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y)?.closest("button, label, a, summary");
      element?.setAttribute("data-under-tap", "");
      return element ? getComputedStyle(element).backgroundColor : undefined;
    }, point);
    if (under !== undefined) {
      await page.mouse.move(1, 1);
      expect(await background(page.locator("[data-under-tap]"))).toBe(under);
    }

    const choice = media(page).locator(".media-settings__choice").filter({ hasText: "Smaller files" }).first();
    const resting = await background(choice);
    await choice.tap();
    await expect(choice.locator("input")).toBeChecked();
    expect(await background(choice)).toBe(resting);
    expect(await lit(page)).toEqual([]);
    // The selection circle on a tile, tapped on and off, leaves nothing lit either.
    await press(media(page).getByRole("button", { name: "Back", exact: true }));
    const select = media(page).locator('.media-library__card[data-path="images/studio-desk.svg"] .media-library__select');
    await select.tap(); await expect(select.locator("input")).toBeChecked();
    await select.tap(); await expect(select.locator("input")).not.toBeChecked();
    expect(await lit(page)).toEqual([]);
  });
});

test("a mouse still lights the row under it, and a disabled filled button is plain, not a pale colour", async ({ page, baseURL }) => {
  await open(page, baseURL);
  expect(await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)).toBe(true);
  const press = (target: Locator) => target.click();
  await openMedia(page, press);
  await addingSettings(page, press);
  const choice = media(page).locator(".media-settings__choice").filter({ hasText: "Smaller files" }).first();
  await page.mouse.move(1, 1);
  const resting = await background(choice);
  await choice.hover();
  await expect.poll(() => background(choice)).not.toBe(resting);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const reset = media(page).getByRole("button", { name: "Reset to defaults", exact: true });
    await expect(reset).toBeDisabled();
    const look = await reset.evaluate(element => {
      const probe = document.createElement("span"); probe.style.background = "var(--surface-subtle)"; probe.style.color = "var(--muted)";
      element.parentElement!.append(probe);
      const style = getComputedStyle(element), wanted = getComputedStyle(probe);
      const result = { opacity: style.opacity, background: style.backgroundColor, color: style.color, subtle: wanted.backgroundColor, muted: wanted.color };
      probe.remove(); return result;
    });
    expect(look, scheme).toMatchObject({ opacity: "1", background: look.subtle, color: look.muted });
    expect(await contrast(reset), `${scheme} disabled button`).toBeGreaterThanOrEqual(4.5);

    // Every disabled primary: the neutral surface with muted words, never the action colour.
    const primary = await page.evaluate(() => {
      const enabled = document.createElement("button"), disabled = document.createElement("button");
      enabled.className = disabled.className = "button primary"; disabled.disabled = true;
      document.body.append(enabled, disabled);
      const result = { enabled: getComputedStyle(enabled).backgroundColor, disabled: getComputedStyle(disabled).backgroundColor, opacity: getComputedStyle(disabled).opacity };
      enabled.remove(); disabled.remove(); return result;
    });
    expect(primary.disabled, scheme).not.toBe(primary.enabled);
    expect(primary.opacity, scheme).toBe("1");
  }
});

test("usage page names and Choose favicon… use the link colour at 4.5:1 or more in both themes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const press = (target: Locator) => target.click();
  await openMedia(page, press);
  await media(page).getByRole("button", { name: "Details for images/placeholder.svg", exact: true }).click();
  const usage = media(page).locator("summary").filter({ hasText: "Usage" });
  await expect(usage).toContainText("Used on 1 page");
  if (await usage.evaluate(summary => !(summary.parentElement as HTMLDetailsElement).open)) await usage.click();
  const name = media(page).locator(".media-detail__uses .media-library__page").first();
  await expect(name).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const link = await page.evaluate(() => { const probe = document.createElement("span"); probe.style.color = "var(--link)"; document.body.append(probe); const colour = getComputedStyle(probe).color; probe.remove(); return colour; });
    await expect(name).toHaveCSS("color", link);
    expect(await contrast(name), `${scheme} usage page name`).toBeGreaterThanOrEqual(4.5);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.keyboard.press("Escape");
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  const favicon = page.getByRole("dialog", { name: "Site settings", exact: true }).getByRole("button", { name: "Choose favicon…", exact: true });
  await expect(favicon).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await contrast(favicon), `${scheme} Choose favicon…`).toBeGreaterThanOrEqual(4.5);
  }
});

test("a see-through picture is marked and sits on the light checkerboard in both themes; an opaque one is not", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openMedia(page, target => target.click());
  // The fixture's SVG paints a full background: sampled, it is opaque.
  const desk = media(page).locator('.media-library__card[data-path="images/studio-desk.svg"] img');
  await expect(desk).toHaveJSProperty("complete", true);
  await expect(desk).not.toHaveAttribute("data-transparent");
  const marks = await page.evaluate(async () => {
    const { markTransparency } = await import("/src/page-builder/media-transparency.ts");
    const picture = async (alpha: number, path: string) => {
      const canvas = document.createElement("canvas"); canvas.width = 40; canvas.height = 20;
      const context = canvas.getContext("2d")!; context.fillStyle = `rgb(20 24 40 / ${alpha})`; context.fillRect(0, 0, 40, 20);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
      const image = document.createElement("img"); image.alt = ""; image.dataset.probe = path;
      document.querySelector(".media-library")!.append(image);
      markTransparency(image, path); image.src = URL.createObjectURL(blob); await image.decode();
      await new Promise(requestAnimationFrame);
      return image.hasAttribute("data-transparent");
    };
    return { logo: await picture(0.5, "images/logo.png"), photo: await picture(1, "images/photo.png"), jpeg: await picture(0.5, "images/named.jpg") };
  });
  expect(marks).toEqual({ logo: true, photo: false, jpeg: false });
  const logo = page.locator('[data-probe="images/logo.png"]');
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const board = await logo.evaluate(element => getComputedStyle(element).backgroundImage);
    expect(board, scheme).toContain("conic-gradient");
    // Light squares in both themes: 97 % and 90 % lightness, no hue.
    expect(board, scheme).toMatch(/oklch\(0\.97 0 none\)|oklch\(97% 0 none\)/);
  }
});
