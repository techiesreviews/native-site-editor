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

  test("a press on the image popup's footer buttons shows on a touch screen, where no hover can, and clears on release", async ({ page, baseURL }) => {
    await open(page, baseURL);
    // Hover rules cannot match here, so what a press paints comes from the :active rules alone.
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
    const looks = await popupButtons(page);
    for (const [id, rest] of [["#probe-plain", looks.rest], ["#probe-done", looks.doneRest]] as const) {
      const box = (await page.locator(id).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      expect(await background(page.locator(id)), `${id} under the pointer, not pressed`).toBe(rest);
      await page.mouse.down();
      const pressed = await background(page.locator(id));
      await page.mouse.up();
      expect(pressed, id).not.toBe(rest);
      if (id === "#probe-done") expect(pressed).toBe(looks.pressedBlue);
      await expect.poll(() => background(page.locator(id)), id).toBe(rest);
    }
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
    // Reset to defaults hides rather than greys (slice 112): a disabled secondary in its place.
    await media(page).locator(".media-settings").evaluate(form => {
      if (form.querySelector(".probe-disabled")) return;
      const probe = document.createElement("button"); probe.type = "button"; probe.className = "button secondary probe-disabled";
      probe.textContent = "Disabled"; probe.disabled = true; form.append(probe);
    });
    const reset = media(page).locator(".probe-disabled");
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

test("usage page names (details and popup) and Choose favicon… use the link colour at 4.5:1 or more in both themes", async ({ page, baseURL }) => {
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
  // The usage popup lists the same page names over its own surface.
  await media(page).getByRole("button", { name: "Back", exact: true }).click();
  await media(page).locator('.media-library__card[data-path="images/placeholder.svg"] .media-library__usage').click();
  const popupName = page.locator("dialog.media-usage .media-library__page").first();
  await expect(popupName).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await contrast(popupName), `${scheme} usage popup page name`).toBeGreaterThanOrEqual(4.5);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.media-usage")).toHaveCount(0);
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
      // The mark is set on load; this listener, added after the helper's, runs after it.
      markTransparency(image, path);
      const loaded = new Promise(resolve => image.addEventListener("load", resolve, { once: true }));
      image.src = URL.createObjectURL(blob); await loaded;
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

test("a see-through picture added to Media sits on the checkerboard on its tile, in details and in the picker", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openMedia(page, target => target.click());
  // Dark lettering on a see-through background, like a site's logo.
  const logo = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 80;
    const context = canvas.getContext("2d")!; context.fillStyle = "rgb(24 28 48)"; context.font = "bold 48px serif"; context.fillText("Logo", 20, 60);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  });
  await media(page).locator('input[name="media-upload"]').setInputFiles({ name: "Logo.png", mimeType: "image/png", buffer: Buffer.from(logo, "base64") });
  const tile = media(page).locator('.media-library__card[data-path^="media/images/logo."]');
  await expect(tile.locator("img")).toHaveAttribute("data-transparent", "", { timeout: 30_000 });
  const path = (await tile.getAttribute("data-path"))!;
  const board = (image: Locator) => image.evaluate(element => getComputedStyle(element).backgroundImage);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await board(tile.locator("img"))).toContain("conic-gradient");

  await media(page).getByRole("button", { name: `Details for ${path}`, exact: true }).click();
  const preview = media(page).locator(".media-detail__preview img");
  await expect(preview).toHaveAttribute("data-transparent", "");
  expect(await board(preview)).toContain("conic-gradient");
  await media(page).getByRole("button", { name: "Back", exact: true }).click();

  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Site settings", exact: true }).getByRole("button", { name: "Choose favicon…", exact: true }).click();
  const picker = page.locator("dialog.media-library--picker");
  await expect(picker.locator(`.media-library__card[data-path="${path}"] img`)).toHaveAttribute("data-transparent", "");
  await picker.getByRole("button", { name: `Choose ${path}`, exact: true }).click();
  const chosen = picker.locator(".media-library__chosen-thumb img");
  await expect(chosen).toHaveAttribute("data-transparent", "");
  expect(await board(chosen)).toContain("conic-gradient");
  // A file added inside the picker is held and chosen: its footer thumbnail is marked too.
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Mark.png", mimeType: "image/png", buffer: Buffer.from(logo, "base64") });
  await expect(picker.getByRole("button", { name: "Choose Mark.png", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chosen).toHaveAttribute("data-transparent", "");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await board(chosen), scheme).toContain("conic-gradient");
  }
});

test("the image popup's footer buttons give press feedback; Done keeps its own darker blue", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const looks = await popupButtons(page);
  for (const [id, rest] of [["#probe-plain", looks.rest], ["#probe-done", looks.doneRest]] as const) {
    const box = (await page.locator(id).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    const pressed = await background(page.locator(id));
    await page.mouse.up(); await page.mouse.move(700, 500);
    expect(pressed, id).not.toBe(rest);
    if (id === "#probe-done") expect(pressed).toBe(looks.pressedBlue);
    await expect.poll(() => background(page.locator(id))).toBe(rest);
  }
});

/** The image popup's two footer buttons (its stylesheet loaded), top left, and their resting colours. */
function popupButtons(page: Page) {
  return page.evaluate(async () => {
    await import("/src/page-builder/image-popup-view.ts");
    const root = document.createElement("div"); root.className = "image-popup"; root.style.cssText = "position:fixed;inset:0 auto auto 0;z-index:10000";
    const plain = document.createElement("button"), done = document.createElement("button");
    plain.className = "image-popup__button"; plain.textContent = "Open large editor"; plain.id = "probe-plain";
    done.className = "image-popup__button image-popup__button--primary"; done.textContent = "Done"; done.id = "probe-done";
    const probe = document.createElement("span"); probe.style.background = "var(--primary-hover)";
    root.append(plain, done, probe); document.body.append(root);
    return { rest: getComputedStyle(plain).backgroundColor, doneRest: getComputedStyle(done).backgroundColor, pressedBlue: getComputedStyle(probe).backgroundColor };
  });
}
