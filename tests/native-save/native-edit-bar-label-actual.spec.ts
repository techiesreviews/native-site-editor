import { expect, test, type Page } from "@playwright/test";

// The edit bar's label and move rules on the actual starter (section-hero
// and friends): ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_LABEL_SHOTS=<dir> saves light/dark, desktop/narrow screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const shots = process.env.ASE_LABEL_SHOTS;
const consoleErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  consoleErrors.length = 0;
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-hero h1:visible").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
});

// The bar never covers the page's sticky header (site-header sticks).
async function clearOfHeader(page: Page) {
  const header = (await frame(page).locator("site-header").boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height - 0.5);
}

async function labelAbove(page: Page) {
  const layout = await bar(page).evaluate((el) => {
    const label = el.querySelector(":scope > .edit-bar__label")!;
    const panel = el.querySelector(":scope > .edit-bar__controls")!;
    const controls = [...el.querySelectorAll(".edit-bar__group button, .edit-bar__group select")].filter((item) => item.getClientRects().length);
    return {
      labelBottom: label.getBoundingClientRect().bottom,
      controlTop: Math.min(...controls.map((item) => item.getBoundingClientRect().top)),
      rightGap: panel.getBoundingClientRect().right - Math.max(...controls.map((item) => item.getBoundingClientRect().right)),
      labels: [...label.children].map((item) => item.textContent?.trim()),
    };
  });
  expect(layout.labelBottom).toBeLessThanOrEqual(layout.controlTop);
  expect(layout.rightGap).toBeLessThanOrEqual(6);
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(area.y);
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  return layout.labels;
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1440, 760]) {
    test(`section-hero root and its title: labels above controls, moves only on the section (${colorScheme}, ${width})`, { tag: "@actual" }, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      const name = `${colorScheme}-${width}`;
      // The title inside the hero: instance › element, no move controls.
      await frame(page).locator("section-hero h1:visible").first().click();
      await expect(bar(page)).toBeVisible();
      const child = await labelAbove(page);
      expect(child.length).toBeGreaterThan(1);
      for (const move of ["Move up", "Move down", "Move to"]) await expect(bar(page).getByRole("button", { name: move, exact: true })).toHaveCount(0);
      await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
      if (shots) await page.screenshot({ path: `${shots}/actual-child-${name}.png` });
      // The hero itself, from its chip: grip label, moves, and the label's hover.
      await bar(page).locator(".edit-bar__context").click();
      const grip = bar(page).locator(".edit-bar__grip");
      await expect(grip).toBeVisible();
      await labelAbove(page);
      await clearOfHeader(page);
      for (const move of ["Move up", "Move down"]) await expect(bar(page).getByRole("button", { name: move, exact: true })).toBeVisible();
      await grip.hover();
      if (shots) await page.screenshot({ path: `${shots}/actual-root-hover-${name}.png` });
      await page.mouse.move(0, 0);
      if (shots) await page.screenshot({ path: `${shots}/actual-root-${name}.png` });
      // Plain Down from the grip moves the hero; one undo puts it back.
      const order = () => frame(page).locator("main > *").evaluateAll((els) => els.map((el) => el.tagName));
      const before = await order();
      await grip.focus();
      await page.keyboard.press("ArrowDown");
      await expect.poll(order).not.toEqual(before);
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(order).toEqual(before);
      console.log(`console errors (${name}): ${consoleErrors.length}`);
    });
  }
}

// With the code pane hidden, the hero's label and
// panel still fit the canvas, and the root label is screenshotted against
// the sticky header.
test("section-hero with the code pane hidden", { tag: "@actual" }, async ({ page }) => {
  await page.getByRole("separator", { name: "Resize code pane", exact: true }).click();
  await frame(page).locator("section-hero h1:visible").first().click();
  await expect(bar(page)).toBeVisible();
  await labelAbove(page);
  if (shots) await page.screenshot({ path: `${shots}/actual-child-code-hidden.png` });
  await bar(page).locator(".edit-bar__context").click();
  await expect(bar(page).locator(".edit-bar__grip")).toBeVisible();
  await labelAbove(page);
  await clearOfHeader(page);
  if (shots) await page.screenshot({ path: `${shots}/actual-root-code-hidden.png` });
  console.log(`console errors (code-hidden): ${consoleErrors.length}`);
});

// The sticky header itself selected is not its own obstacle: its bar may
// stand at the frame's top, still inside the frame.
test("the selected sticky header is not kept clear of itself", { tag: "@actual" }, async ({ page }) => {
  await frame(page).locator("site-header").first().click({ position: { x: 5, y: 5 } });
  await expect(bar(page)).toBeVisible();
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(area.y);
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
});

// Alt+Up pressed in the page moves the selected whole section, and one Undo
// restores the source exactly; a paragraph inside it does not move. Narrow,
// code hidden, under the sticky header.
test("Alt+arrows in the page move a whole section only, one exact undo", { tag: "@actual" }, async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
  const before = await source();
  const order = () => frame(page).locator("main > *").evaluateAll((els) => els.map((el) => el.tagName));
  const start = await order();
  // A paragraph of the feature section: Alt+Up in the page leaves it.
  await frame(page).locator("section-feature p:visible").first().click();
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press("Alt+ArrowUp");
  await page.waitForTimeout(300);
  expect(await source()).toBe(before);
  // The whole feature section (picked in Structure), then Alt+Up with the
  // focus in the page: it moves.
  await page.getByRole("treeitem", { name: /^Section feature/ }).locator(".page-structure__label").click();
  await expect(bar(page).locator(".edit-bar__grip")).toBeVisible();
  await clearOfHeader(page);
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  await page.locator(".native-preview-frame").focus();
  await child!.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); document.body.focus(); });
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(order).not.toEqual(start);
  if (shots) await page.screenshot({ path: `${shots}/actual-section-moved-code-hidden.png` });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(source).toBe(before);
  expect(await order()).toEqual(start);
});
