import { expect, test, type Locator, type Page } from "@playwright/test";

// Default fixture group: selected and focused text stays clear while typing,
// on the page and in Edit component mode, including wrapped controls.
const TEMPLATE = "components/section-promo/section-promo.html";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
}

async function clear(page: Page, heading: Locator) {
  await expect(bar(page)).toBeVisible();
  await expect.poll(async () => {
    const area = await page.locator(".native-preview-frame").boundingBox();
    const text = await heading.boundingBox();
    const controls = await bar(page).boundingBox();
    if (!area || !text || !controls) return { intersects: true, inFrame: false };
    const intersects = controls.x < text.x + text.width && controls.x + controls.width > text.x
      && controls.y < text.y + text.height && controls.y + controls.height > text.y;
    const inFrame = controls.x >= area.x && controls.x + controls.width <= area.x + area.width
      && controls.y >= area.y && controls.y + controls.height <= area.y + area.height;
    return { intersects, inFrame, area, text, controls };
  }).toMatchObject({ intersects: false, inFrame: true });
}

async function edit(page: Page, heading: Locator, width: number) {
  if (width === 760) {
    // These short heading controls fit the default 432px canvas. Constrain
    // the frame to exercise wrapping as well as the narrow editor viewport.
    await page.locator(".native-preview-frame").evaluate(el => { el.style.flex = "none"; el.style.width = "200px"; });
    await expect.poll(async () => (await page.locator(".native-preview-frame").boundingBox())?.width).toBe(200);
  }
  await heading.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await clear(page, heading);
  await expect(heading).toHaveAttribute("contenteditable", /^(plaintext-only|true)$/);
  await expect(heading).toBeFocused();
  await page.keyboard.press("ControlOrMeta+End");
  const original = await heading.textContent();
  const startHeight = (await heading.boundingBox())!.height;
  let expected = original;
  // In the narrow frame the typed words wrap the heading onto more lines.
  for (const text of width === 760 ? [" x", "y", "z", " more words"] : [" x", "y", "z"]) {
    await page.keyboard.type(text);
    expected += text;
    await expect(heading).toHaveText(expected);
    await expect(heading).toBeFocused();
    await clear(page, heading);
  }
  if (width === 760) {
    // Controls actually wrap at this width; exercise the measured wrapped height.
    await expect.poll(() => bar(page).locator(".edit-bar__controls").evaluate(el => {
      const controls = [...el.querySelectorAll("button, select")].map(item => item.getBoundingClientRect());
      return Math.max(...controls.map(box => box.top)) >= Math.min(...controls.map(box => box.bottom));
    })).toBe(true);
    expect((await heading.boundingBox())!.height).toBeGreaterThan(startHeight);
  }
  // Escape restores the text (shorter again): the bar follows and stays clear.
  await page.keyboard.press("Escape");
  await expect(heading).toHaveText(original!);
  await clear(page, heading);
}

for (const width of [1440, 760]) {
  test(`the page's first heading stays uncovered while typing at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, baseURL);
    await edit(page, frame(page).locator(".hero h1"), width);
  });

  test(`the template's first heading stays uncovered in Edit component mode at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(baseURL!);
    const source = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
    const before = '<section class="hero" data-key="hero">';
    expect(source).toContain(before);
    const writes = [
      [TEMPLATE, '<section class="promo"><h2>Made by hand</h2><slot name="body"><p>Say what it is.</p></slot></section>\n'],
      ["index.html", source.replace(before, `<section-promo><p slot="body">Home's own words.</p></section-promo>\n  ${before}`)],
    ];
    for (const [path, content] of writes) {
      expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
    }
    await open(page, baseURL);
    await expect(frame(page).locator("section-promo").getByText("Home's own words.")).toBeVisible();
    await page.getByRole("treeitem", { name: /^Section promo/ }).first().locator(".page-structure__label").click();
    await bar(page).getByRole("button", { name: "Edit Section promo component", exact: true }).click();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
    await expect(page.locator(".canvas-bar .edit-mode__title")).toHaveText("Editing<section-promo>");
    await edit(page, frame(page).locator("section-promo h2"), width);
  });
}
