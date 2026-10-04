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

async function labelAbove(page: Page) {
  const layout = await bar(page).evaluate((el) => {
    const label = [...el.children].filter((item) => !item.classList.contains("edit-bar__group"));
    const controls = [...el.querySelectorAll(".edit-bar__group button, .edit-bar__group select")].filter((item) => item.getClientRects().length);
    return {
      labelBottom: Math.max(...label.map((item) => item.getBoundingClientRect().bottom)),
      controlTop: Math.min(...controls.map((item) => item.getBoundingClientRect().top)),
      labels: label.map((item) => item.textContent?.trim()),
    };
  });
  expect(layout.labelBottom).toBeLessThanOrEqual(layout.controlTop);
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(area.y);
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  return layout.labels;
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1440, 760]) {
    test(`section-hero root and its title: labels above controls, moves only on the section (${colorScheme}, ${width})`, async ({ page }) => {
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
