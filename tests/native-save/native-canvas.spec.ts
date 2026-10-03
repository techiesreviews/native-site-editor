import { expect, test, type Page } from "@playwright/test";

// The canvas (page builder, canvas slice; docs/page-builder/canvas.md):
// breakpoints and a draggable frame width, hover labels, the selection's
// breadcrumb with Esc / Ctrl+↑ to the parent, code ⇄ canvas linking and
// the spacing overlay.

const nativeHash = "#repo=501&branch=main&file=index.html";

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
});

const crumbs = (page: Page) => page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByRole("button");
const current = (page: Page) => page.locator(".canvas-crumb[aria-current=true]");
const frameWidth = async (page: Page) => Math.round((await page.locator(".native-preview-frame").boundingBox())!.width);
const kind = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind");

test("breakpoints resize the frame, a side handle drags its width, and the session remembers it", async ({ page }) => {
  const desktop = page.getByRole("button", { name: "Desktop, fills the canvas" });
  const tablet = page.getByRole("button", { name: "Tablet, 768 px" });
  const mobile = page.getByRole("button", { name: "Mobile, 390 px" });
  const width = page.getByRole("textbox", { name: "Frame width in pixels" });
  await expect(desktop).toHaveAttribute("aria-pressed", "true");
  const full = await frameWidth(page);
  await expect(width).toHaveValue(String(full));

  await tablet.click();
  await expect(tablet).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => frameWidth(page)).toBe(768);
  await expect(width).toHaveValue("768");
  // The frame stands centred on the canvas.
  const host = (await page.locator(".preview-frame-host").boundingBox())!;
  const frame = (await page.locator(".native-preview-frame").boundingBox())!;
  expect(Math.abs(frame.x - host.x - (host.x + host.width - frame.x - frame.width))).toBeLessThan(2);

  await mobile.click();
  await expect.poll(() => frameWidth(page)).toBe(390);
  // The page inside lays out at that width.
  const inner = await page.frameLocator(".native-preview-frame").locator("html").evaluate(() => window.innerWidth);
  expect(inner).toBe(390);

  // Dragging the right handle 50px out widens the frame by 100px (both edges move).
  const handle = page.getByRole("separator", { name: "Frame width" }).last();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, { steps: 3 });
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 3 });
  await expect(page.locator(".canvas-size")).toHaveText("490 px");
  await page.mouse.up();
  await expect.poll(() => frameWidth(page)).toBe(490);
  await expect(width).toHaveValue("490");
  for (const device of [desktop, tablet, mobile]) await expect(device).toHaveAttribute("aria-pressed", "false");

  // The keyboard moves a focused handle too.
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => frameWidth(page)).toBe(500);

  // A typed width.
  await width.fill("600");
  await width.press("Enter");
  await expect.poll(() => frameWidth(page)).toBe(600);

  // Remembered for the session, across a reload.
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => frameWidth(page)).toBe(600);

  await desktop.click();
  await expect.poll(() => frameWidth(page)).toBe(full);
});

test("hovering labels an element, selecting shows its ancestors, and crumbs, Esc and Ctrl+Up climb", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const label = frame.locator("[data-native-selection-box=label]");
  await frame.locator(".hero p.lead").hover();
  await expect(label).toBeVisible();
  await expect(label).toHaveText("p.lead");
  // Inside a component's template.
  await frame.locator("project-card").first().locator("article").hover({ position: { x: 4, y: 4 } });
  await expect(label).toHaveText("article.project-card");

  await expect(crumbs(page)).toHaveText(["body"]);
  await frame.locator(".hero h1").click();
  await expect(crumbs(page)).toHaveText(["body", "main.page", "section.hero", "h1"]);
  await expect(current(page)).toHaveText("h1");

  // Hovering a crumb points at its element on the canvas.
  const hint = frame.locator("[data-native-selection-box=hint]");
  await crumbs(page).filter({ hasText: "section.hero" }).hover();
  await expect(hint).toBeVisible();
  const hero = (await frame.locator(".hero").boundingBox())!;
  const hinted = (await hint.boundingBox())!;
  expect(Math.abs(hinted.y - hero.y)).toBeLessThan(2);
  expect(Math.abs(hinted.height - hero.height)).toBeLessThan(2);
  await page.mouse.move(10, 500);
  await expect(hint).toBeHidden();

  // Clicking a crumb selects that ancestor, as a click on it would.
  await crumbs(page).filter({ hasText: "section.hero" }).click();
  await expect(current(page)).toHaveText("section.hero");
  await expect(kind(page)).toHaveText("Section");
  await expect(page.locator("#content .code-editor__element")).toBeVisible();

  // Esc in the canvas selects the parent; Ctrl/⌘+↑ too; above the top, nothing.
  await frame.locator(".hero h1").click();
  await expect(current(page)).toHaveText("h1");
  await page.keyboard.press("Escape");
  await expect(current(page)).toHaveText("section.hero");
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await expect(current(page)).toHaveText("main.page");
  await page.keyboard.press("Escape");
  await expect(crumbs(page)).toHaveText(["body"]);
  await expect(frame.locator("[data-native-selection-box=selected]")).toBeHidden();

  // The body crumb clears the selection.
  await frame.locator(".hero p.lead").click();
  await expect(current(page)).toHaveText("p.lead");
  await crumbs(page).first().click();
  await expect(crumbs(page)).toHaveText(["body"]);
});

test("the breadcrumb follows a selection into components within components", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await frame.getByText("Shared across cards").first().click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/card-note/card-note.html");
  await expect(crumbs(page)).toHaveText(["body", "main.page", "section.cards", "project-card", "article.project-card", "card-note", "p.card-note"]);
  await expect(page.locator(".canvas-crumb--component")).toHaveText(["project-card", "card-note"]);
  await crumbs(page).filter({ hasText: /^project-card$/ }).click();
  await expect(current(page)).toHaveText("project-card");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
});

test("the code pane's cursor selects its element on the canvas, and a hovered line points at its element", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const hint = frame.locator("[data-native-selection-box=hint]");
  const line = page.locator("#content .view-line").filter({ hasText: "<section class=\"hero\"" });
  await line.hover();
  await expect(hint).toBeVisible();
  const hero = (await frame.locator(".hero").boundingBox())!;
  expect(Math.abs((await hint.boundingBox())!.height - hero.height)).toBeLessThan(2);
  await expect(frame.locator("[data-native-selection-box=label]")).toHaveText("section.hero");
  await page.locator(".canvas-bar").hover();
  await expect(hint).toBeHidden();

  // A click in the code selects; the cursor stays where it was clicked.
  await line.click();
  await expect(current(page)).toHaveText("section.hero");
  await expect(kind(page)).toHaveText("Section");
  await expect(frame.locator("[data-native-selection-box=selected]")).toBeVisible();
  // Arrow keys walk the source (unfolded), and the selection follows.
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.press("ControlOrMeta+J");
  await expect(page.locator("#content .view-line").filter({ hasText: "<h1 data-key=\"hero-title\"" })).toBeVisible();
  await expect(current(page)).toHaveText("section.hero");
  await page.keyboard.press("ArrowDown");
  await expect(current(page)).toHaveText("h1");
  await page.keyboard.press("ArrowDown");
  await expect(current(page)).toHaveText("p.lead");
  // Typing does not move the selection, and stays in the code.
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  await expect(current(page)).toHaveText("p.lead");
  await expect(page.locator("#content textarea, #content [role=textbox]").first()).toBeFocused();
});

test("the spacing overlay shades margin and padding", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const toggle = page.getByRole("button", { name: "Show margin and padding" });
  const padding = frame.locator("[data-native-spacing=padding]:visible");
  await frame.locator("project-card").first().locator("article").click({ position: { x: 4, y: 4 } });
  await expect(padding).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(10, 500);
  // The card's 20px padding on all four sides, numbered.
  await expect(padding).toHaveCount(4);
  await expect(padding.first()).toHaveText("20");
  await toggle.click();
  await expect(padding).toHaveCount(0);
});
