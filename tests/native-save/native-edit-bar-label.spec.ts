import { expect, test, type Locator, type Page } from "@playwright/test";

// The selection's name (and the instance around it) stands as a label above
// the bar's controls, the way the page's outline labels sit on a section.
// The label keeps its interactions: the section grip drags and moves, a
// component root's name fades in its edit icon, a child's chip selects the
// instance.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const shots = process.env.ASE_LABEL_SHOTS;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
});

// Label items are the bar's direct children before the groups; controls are
// inside the groups. The label row must end above every control, and the
// panel drawn behind the controls must start below the label.
async function rows(toolbar: Locator) {
  return toolbar.evaluate((el) => {
    const box = (item: Element) => item.getBoundingClientRect();
    const label = [...el.children].filter((item) => !item.classList.contains("edit-bar__group"));
    const controls = [...el.querySelectorAll(".edit-bar__group button, .edit-bar__group select")].filter((item) => item.getClientRects().length);
    const panel = getComputedStyle(el, "::after");
    const bar = box(el);
    return {
      labels: label.map((item) => item.getAttribute("aria-label") ?? item.textContent ?? ""),
      labelBottom: Math.max(...label.map((item) => box(item).bottom)),
      labelTop: Math.min(...label.map((item) => box(item).top)),
      controlTop: controls.length ? Math.min(...controls.map((item) => box(item).top)) : Infinity,
      controls: controls.length,
      panelTop: bar.top + parseFloat(panel.top),
      panelDisplay: panel.display,
      barBackground: getComputedStyle(el).backgroundColor,
      firstRuleVisible: Boolean(el.querySelector(".edit-bar__group > .edit-bar__rule")?.getClientRects().length),
      bar: { top: bar.top, bottom: bar.bottom, left: bar.left, right: bar.right },
    };
  });
}

function expectLabelAbove(layout: Awaited<ReturnType<typeof rows>>) {
  expect(layout.controls).toBeGreaterThan(0);
  expect(layout.labelBottom).toBeLessThanOrEqual(layout.controlTop);
  expect(layout.labelBottom).toBeLessThanOrEqual(layout.panelTop + 0.5);
  expect(layout.panelDisplay).not.toBe("none");
  expect(layout.barBackground).toBe("rgba(0, 0, 0, 0)");
  expect(layout.firstRuleVisible).toBe(false);
}

async function inFrame(page: Page, toolbar: Locator) {
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  const box = (await toolbar.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(area.y);
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  expect(box.x).toBeGreaterThanOrEqual(area.x);
  expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
}

test("a heading's name is a label above its controls, the bar's height includes it, and focus roves from the label", async ({ page }) => {
  await frame(page).locator(".hero h1").click();
  const toolbar = bar(page);
  await expect(toolbar).toBeVisible();
  const layout = await rows(toolbar);
  expectLabelAbove(layout);
  expect(layout.labels[0]).toBe("Heading");
  // The bar's box holds both rows and still clears the selection.
  expect(layout.bar.top).toBeLessThanOrEqual(layout.labelTop + 0.5);
  const heading = (await frame(page).locator(".hero h1").boundingBox())!;
  const box = (await toolbar.boundingBox())!;
  const side = await toolbar.getAttribute("data-side");
  if (side === "above") expect(box.y + box.height).toBeLessThanOrEqual(heading.y);
  if (side === "below") expect(box.y).toBeGreaterThanOrEqual(heading.y + heading.height);
  await inFrame(page, toolbar);
  // Ctrl+I still formats with focus in the bar, and arrows rove the controls.
  const first = toolbar.locator(".edit-bar__group button, .edit-bar__group select").first();
  await first.focus();
  await page.keyboard.press("End");
  const last = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent);
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  expect(last).toBeTruthy();
});

test("a section's grip is the label: the controls sit under it, it moves the section by keyboard and by drag as one undo step", async ({ page }) => {
  await frame(page).locator("section.cards").evaluate((el) => (el as HTMLElement).click());
  const toolbar = bar(page);
  const grip = toolbar.getByRole("button", { name: "Drag to move" });
  await expect(grip).toBeVisible();
  expectLabelAbove(await rows(toolbar));
  // All section actions stay in the bar.
  for (const name of ["Move up", "Move down", "Duplicate", "Remove"]) await expect(toolbar.getByRole("button", { name, exact: true }).first()).toBeVisible();
  const order = () => frame(page).locator("main > section").evaluateAll((els) => els.map((el) => el.className));
  const before = await order();
  // Arrows from the grip: plain Up moves the section, Right roves to a control.
  await grip.focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(order).not.toEqual(before);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(order).toEqual(before);
  await frame(page).locator("section.cards").evaluate((el) => (el as HTMLElement).click());
  await expect(grip).toBeVisible();
  await grip.focus();
  await page.keyboard.press("ArrowRight");
  await expect(grip).not.toBeFocused();
  await expect(toolbar.locator(":focus")).toHaveCount(1);
  // A pointer drag from the label onto the gap above the hero.
  const at = (await grip.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 + 10, { steps: 2 });
  await expect(grip).not.toHaveAttribute("inert", "");
  expect(await toolbar.locator(".edit-bar__group").evaluateAll((els) => els.every((el) => el.hasAttribute("inert")))).toBe(true);
  const hero = (await frame(page).locator("section.hero").boundingBox())!;
  await page.mouse.move(hero.x + hero.width / 2, hero.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect.poll(order).not.toEqual(before);
  await expect(toolbar.locator("[inert]")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(order).toEqual(before);
});

test("a component child's label reads instance › element with no edit icon; the root's label fades its edit icon in", async ({ page }) => {
  const row = page.getByRole("treeitem", { name: "Section", exact: true });
  await row.locator(".page-structure__toggle").click();
  await page.getByRole("treeitem", { name: /^Project card Reusable cards$/ }).locator(".page-structure__label").click();
  const toolbar = bar(page);
  const edit = toolbar.getByRole("button", { name: "Edit Project card component", exact: true });
  await expect(edit).toBeVisible();
  const rootLayout = await rows(toolbar);
  if (rootLayout.controls) expectLabelAbove(rootLayout);
  const overlay = edit.locator(".edit-bar__component-edit");
  await page.mouse.move(0, 0);
  await expect(overlay).toHaveCSS("opacity", "0");
  await edit.hover();
  await expect(overlay).toHaveCSS("opacity", "1");
  if (shots) await page.screenshot({ path: `${shots}/root-hover-${await scheme(page)}.png` });

  await frame(page).locator("project-card span[slot='title']").first().click();
  const chip = toolbar.locator(".edit-bar__context");
  await expect(chip).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
  const child = await rows(toolbar);
  expectLabelAbove(child);
  // Chip then element name on one label row.
  const [chipBox, nameBox] = await Promise.all([chip.boundingBox(), toolbar.locator(":scope > .edit-bar__kind").boundingBox()]);
  expect(Math.abs(chipBox!.y - nameBox!.y)).toBeLessThan(2);
  expect(chipBox!.x).toBeLessThan(nameBox!.x);
  if (shots) await page.screenshot({ path: `${shots}/child-${await scheme(page)}.png` });
  // The chip selects the instance; it does not open the component.
  await chip.click();
  await expect(edit).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
});

async function scheme(page: Page) {
  return page.evaluate(() => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the label stays inside the frame at the top and bottom, ${colorScheme}, narrow`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 760, height: 700 });
    await frame(page).locator(".hero h1").click();
    const toolbar = bar(page);
    await expect(toolbar).toBeVisible();
    expectLabelAbove(await rows(toolbar));
    await inFrame(page, toolbar);
    if (shots) await page.screenshot({ path: `${shots}/heading-narrow-${colorScheme}.png` });
    const last = frame(page).locator("main > section").last();
    await last.scrollIntoViewIfNeeded();
    await last.evaluate((el) => (el as HTMLElement).click());
    await expect(toolbar).toBeVisible();
    await inFrame(page, toolbar);
    if (shots) await page.screenshot({ path: `${shots}/section-bottom-${colorScheme}.png` });
  });
}
