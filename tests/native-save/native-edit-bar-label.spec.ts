import { expect, test, type Locator, type Page } from "@playwright/test";

// The selection's name (and the instance around it) stands as a label above
// the bar's controls, the way the page's outline labels sit on a section.
// The label keeps its interactions: a block's name drags and moves it, a
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

// The bar is a label (chip and name, one piece) stacked on a panel of
// controls. The label ends above every control, the panel fits its controls
// (about 4px after the last one, no label-wide empty tail), and the bar box
// itself lets the pointer through.
async function rows(toolbar: Locator) {
  return toolbar.evaluate((el) => {
    const box = (item: Element) => item.getBoundingClientRect();
    const label = el.querySelector(":scope > .edit-bar__label")!;
    const panel = el.querySelector(":scope > .edit-bar__controls");
    const controls = [...el.querySelectorAll(".edit-bar__group button, .edit-bar__group select")].filter((item) => item.getClientRects().length);
    return {
      labels: [...label.children].map((item) => item.getAttribute("aria-label") ?? item.textContent ?? ""),
      labelBottom: box(label).bottom,
      labelTop: box(label).top,
      labelLeft: box(label).left,
      controlTop: controls.length ? Math.min(...controls.map((item) => box(item).top)) : Infinity,
      controls: controls.length,
      panelTop: panel ? box(panel).top : Infinity,
      panelLeft: panel ? box(panel).left : Infinity,
      rightGap: panel && controls.length ? box(panel).right - Math.max(...controls.map((item) => box(item).right)) : 0,
      barPointer: getComputedStyle(el).pointerEvents,
      firstRuleVisible: Boolean(el.querySelector(".edit-bar__group > .edit-bar__rule")?.getClientRects().length),
      bar: { top: box(el).top, bottom: box(el).bottom, left: box(el).left, right: box(el).right },
    };
  });
}

function expectLabelAbove(layout: Awaited<ReturnType<typeof rows>>) {
  expect(layout.controls).toBeGreaterThan(0);
  expect(layout.labelBottom).toBeLessThanOrEqual(layout.controlTop);
  // Joined: the panel starts where the label ends, at the same left edge.
  expect(Math.abs(layout.panelTop - layout.labelBottom)).toBeLessThan(1);
  expect(Math.abs(layout.panelLeft - layout.labelLeft)).toBeLessThan(1);
  expect(layout.rightGap).toBeGreaterThanOrEqual(0);
  expect(layout.rightGap).toBeLessThanOrEqual(6);
  expect(layout.barPointer).toBe("none");
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

test("a section's name is its handle: the controls sit under it, it moves the section by keyboard and by drag as one undo step", async ({ page }) => {
  await frame(page).locator("section.cards").evaluate((el) => (el as HTMLElement).click());
  const toolbar = bar(page);
  const grip = toolbar.locator(".edit-bar__handle");
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
  await expect(page.locator(".pb-drag-ghost")).toBeVisible();
  const hero = (await frame(page).locator("section.hero").boundingBox())!;
  await page.mouse.move(hero.x + hero.width / 2, hero.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect.poll(order).not.toEqual(before);
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
  const [chipBox, nameBox] = await Promise.all([chip.boundingBox(), toolbar.locator(".edit-bar__label > .edit-bar__kind").boundingBox()]);
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

// Only a whole section moves from the bar. A child (a heading here) shows no
// Move up/down or Move to, and Alt+Up from its bar leaves the source alone.
test("a child of a section has no move controls; the section keeps them", async ({ page }) => {
  const toolbar = bar(page);
  const order = () => frame(page).locator(".hero > *").evaluateAll((els) => els.map((el) => el.tagName));
  await frame(page).locator(".hero p.lead").click();
  await expect(toolbar).toBeVisible();
  for (const name of ["Move up", "Move down", "Move left", "Move right", "Move to"]) await expect(toolbar.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Bold" })).toBeVisible();
  const before = await order();
  await toolbar.getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await page.waitForTimeout(300);
  expect(await order()).toEqual(before);
  // Alt+Up with focus in the page does not move it either.
  await frame(page).locator(".hero p.lead").click();
  await page.keyboard.press("Alt+ArrowUp");
  await page.waitForTimeout(300);
  expect(await order()).toEqual(before);
  await frame(page).locator("section.cards").evaluate((el) => (el as HTMLElement).click());
  for (const name of ["Move up", "Move down"]) await expect(toolbar.getByRole("button", { name, exact: true })).toBeVisible();
  // The section still moves with Alt+Down from the page, as one undo step.
  const sections = () => frame(page).locator("main > section").evaluateAll((els) => els.map((el) => el.className));
  const start = await sections();
  await frame(page).locator("section.cards").evaluate((el) => (el as HTMLElement).focus?.());
  await toolbar.getByRole("button", { name: "Duplicate", exact: true }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(sections).not.toEqual(start);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(sections).toEqual(start);
});

// The link's Address suggestions fit the popover: no sideways scroll, long
// names cut with an ellipsis, one row per value; arrows and Escape still work.
test("the address suggestions fit the field with no sideways scroll", async ({ page }) => {
  const lead = frame(page).locator(".hero p.lead");
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  await child!.evaluate(() => {
    const text = document.querySelector(".hero p.lead")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 5); range.setEnd(text, 10);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  });
  const toolbar = bar(page);
  await expect(toolbar).toBeVisible();
  const link = toolbar.getByRole("button", { name: "Link", exact: true });
  await link.click();
  const popover = page.locator(".edit-bar__popover");
  const address = popover.getByRole("combobox", { name: "Address" });
  await expect(address).toBeFocused();
  const list = popover.getByRole("listbox", { name: "Pages of this site" });
  await expect(list.getByRole("option").first()).toBeVisible();
  const fit = await popover.evaluate((el) => {
    const list = el.querySelector(".edit-bar__options")!;
    const option = getComputedStyle(el.querySelector(".edit-bar__option")!);
    const values = [...el.querySelectorAll("[role='option']")].map((item) => item.textContent);
    return { popover: el.scrollWidth <= el.clientWidth, list: list.scrollWidth <= list.clientWidth, ellipsis: option.textOverflow, unique: new Set(values).size === values.length };
  });
  expect(fit).toEqual({ popover: true, list: true, ellipsis: "ellipsis", unique: true });
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("option").first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(address).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

// The component child's label is one piece: chip and name on one background.
test("a component child's chip and name share one label background", async ({ page }) => {
  const row = page.getByRole("treeitem", { name: "Section", exact: true });
  await row.locator(".page-structure__toggle").click();
  await page.getByRole("treeitem", { name: /^Project card Reusable cards$/ }).locator(".page-structure__label").click();
  await frame(page).locator("project-card span[slot='title']").first().click();
  const label = bar(page).locator(".edit-bar__label");
  await expect(label.locator(".edit-bar__context")).toBeVisible();
  const colours = await label.evaluate((el) => ({
    label: getComputedStyle(el).backgroundColor,
    chip: getComputedStyle(el.querySelector(".edit-bar__context")!).backgroundColor,
    name: getComputedStyle(el.querySelector(".edit-bar__kind")!).backgroundColor,
  }));
  expect(colours.label).not.toBe("rgba(0, 0, 0, 0)");
  expect(colours.chip).toBe("rgba(0, 0, 0, 0)");
  expect(colours.name).toBe("rgba(0, 0, 0, 0)");
  expect(await label.getAttribute("title")).toBe("Project card › Text");
});

// A long name is cut at 320px with an ellipsis and never widens the panel;
// the see-through space beside the label lets a click reach the page.
test("a long label is cut with an ellipsis and the space beside it clicks through", async ({ page }) => {
  await frame(page).locator("section.cards").evaluate((el) => (el as HTMLElement).click());
  const toolbar = bar(page);
  await expect(toolbar.locator(".edit-bar__label")).toBeVisible();
  // The click-through: a point right of the label, inside the bar's box, above the panel.
  const point = await toolbar.evaluate((el) => {
    const label = el.querySelector(".edit-bar__label")!.getBoundingClientRect();
    const barBox = el.getBoundingClientRect();
    return { x: (label.right + barBox.right) / 2, y: label.top + label.height / 2, room: barBox.right - label.right };
  });
  expect(point.room).toBeGreaterThan(8);
  const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? "", point);
  expect(under).not.toContain("edit-bar");
  // A name too long for 320px.
  await toolbar.locator(".edit-bar__label .edit-bar__kind").evaluate((el) => { el.textContent = "A very long section name ".repeat(8); });
  const long = await toolbar.evaluate((el) => {
    const label = el.querySelector(".edit-bar__label")! as HTMLElement;
    const name = label.querySelector(".edit-bar__kind")! as HTMLElement;
    return { width: label.getBoundingClientRect().width, height: label.getBoundingClientRect().height, cut: name.scrollWidth > name.clientWidth, overflow: getComputedStyle(name).textOverflow };
  });
  expect(long.width).toBeLessThanOrEqual(320.5);
  expect(long.height).toBeLessThanOrEqual(24.5);
  expect(long).toMatchObject({ cut: true, overflow: "ellipsis" });
  // The name is a text box, not a flex box, so the ellipsis is drawn.
  expect(await toolbar.locator(".edit-bar__label .edit-bar__kind").evaluate((el) => getComputedStyle(el).display)).toBe("block");
});

// Ctrl/Cmd+B, I and K still format from the bar.
test("Ctrl+B, Ctrl+I and Ctrl+K format from the bar", async ({ page }) => {
  const lead = frame(page).locator(".hero p.lead");
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  const select = () => child!.evaluate(() => {
    const p = document.querySelector(".hero p.lead")!;
    // A plain stretch of text not yet formatted.
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && (text.textContent!.length < 12 || text.parentElement !== p)) text = walker.nextNode();
    const range = document.createRange();
    range.setStart(text!, 6); range.setEnd(text!, 11);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  });
  await select();
  await bar(page).getByRole("button", { name: "Bold", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+b");
  await expect(lead.locator("strong")).toHaveCount(1);
  await select();
  await bar(page).getByRole("button", { name: "Italic", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+i");
  await expect(lead.locator("em")).toHaveCount(1);
  await select();
  await bar(page).getByRole("button", { name: "Bold", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.locator(".edit-bar__popover").getByRole("combobox", { name: "Address" })).toBeFocused();
});

// Roving focus skips a disabled control: the first section's Move up.
test("roving focus from the grip skips the disabled Move up of the first section", async ({ page }) => {
  await frame(page).locator("section.hero").evaluate((el) => (el as HTMLElement).click());
  const toolbar = bar(page);
  await expect(toolbar.getByRole("button", { name: "Move up", exact: true })).toBeDisabled();
  await toolbar.locator(".edit-bar__handle").focus();
  // Grip, then Label, then Move down: the disabled Move up between them is skipped.
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Label", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Move down", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(toolbar.getByRole("button", { name: "Label", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(toolbar.locator(".edit-bar__handle")).toBeFocused();
});

// A card of a grid has no move arrows, and Alt+Right in the page does not move it.
test("a card has no move arrows and the page's Alt+arrows leave it in place", async ({ page }) => {
  const row = page.getByRole("treeitem", { name: "Section", exact: true });
  await row.locator(".page-structure__toggle").click();
  await page.getByRole("treeitem", { name: /^Project card Reusable cards$/ }).locator(".page-structure__label").click();
  const toolbar = bar(page);
  await expect(toolbar.getByRole("button", { name: "Duplicate", exact: true })).toBeVisible();
  for (const name of ["Move up", "Move down", "Move left", "Move right", "Move to"]) await expect(toolbar.getByRole("button", { name, exact: true })).toHaveCount(0);
  const cards = () => frame(page).locator("project-card").evaluateAll((els) => els.map((el) => el.textContent?.trim()));
  const before = await cards();
  await toolbar.getByRole("button", { name: "Duplicate", exact: true }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(300);
  expect(await cards()).toEqual(before);
});
