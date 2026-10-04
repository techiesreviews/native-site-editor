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
  // A template click selects its page instance until explicit Edit.
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(current(page)).toHaveText("project-card");
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  await bar.getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await frame.getByText("Shared across cards").first().click();
  await expect(current(page)).toHaveText("card-note");
  await bar.getByRole("button", { name: "Edit Card note component", exact: true }).click();
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
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(current(page)).toHaveText("project-card");
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await frame.locator("project-card").first().locator("article").click({ position: { x: 4, y: 4 } });
  await expect(current(page)).toHaveText("article.project-card");
  expect(await frame.locator("project-card").first().locator("article").evaluate(el => { const css = getComputedStyle(el); return [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft]; })).toEqual(["20px", "20px", "20px", "20px"]);
  await expect(padding).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(10, 500);
  // The card's 20px padding on all four sides, numbered.
  await expect(padding).toHaveCount(4);
  await expect(padding).toHaveText(["20", "20", "20", "20"]);
  await toggle.click();
  await expect(padding).toHaveCount(0);
});

test("implied end tags map to their parent and pending code pointers can be cancelled", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { elementPathAtOffset } = await import('/src/page-builder/canvas-source.ts');
    const { linkCodeToCanvas } = await import('/src/page-builder/code-link.ts');
    const cases = ['<div><p>Hi</div>', '<ul><li>one<li>two</ul>', '<main><section><p>Hi</section></main>'];
    const mapped = cases.map(source => elementPathAtOffset(source, source.indexOf('</')));
    const selected: number[][] = [];
    const link = linkCodeToCanvas({ owns: () => true, hint: () => {}, select: request => selected.push(request.node) });
    const cursor = () => window.dispatchEvent(new CustomEvent('native-code-pointer', { detail: { path: 'index.html', kind: 'cursor', source: '<div><p>Hi</p></div>', offset: 6, stale: () => false } }));
    cursor();
    window.dispatchEvent(new CustomEvent('native-code-pointer', { detail: { path: 'index.html', kind: 'range' } }));
    await new Promise(resolve => setTimeout(resolve, 180));
    const afterRange = selected.length;
    cursor();
    link.cancel();
    await new Promise(resolve => setTimeout(resolve, 180));
    const afterClear = selected.length;
    cursor();
    await new Promise(resolve => setTimeout(resolve, 180));
    link.destroy();
    return { mapped, afterRange, afterClear, selected };
  });
  expect(result).toEqual({ mapped: [[0], [0], [0, 0]], afterRange: 0, afterClear: 0, selected: [[0, 0]] });
});

test("width arrows accumulate their target during motion and survive blur", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const width = page.getByRole('textbox', { name: 'Frame width in pixels' });
  await width.fill('600');
  await width.press('Enter');
  await expect.poll(() => frameWidth(page)).toBe(600);
  await width.press('ArrowUp');
  await width.press('ArrowUp');
  await width.press('Shift+ArrowUp');
  await expect(width).toHaveValue('612');
  await page.locator('.canvas-bar').click({ position: { x: 5, y: 5 } });
  await expect.poll(() => frameWidth(page)).toBe(612);
});

test("native form fields keep parent-navigation shortcuts, including shadow fields", async ({ page }) => {
  const frame = page.frameLocator('.native-preview-frame');
  await frame.locator('.hero h1').click();
  await expect(current(page)).toHaveText('h1');
  const results = await frame.locator('body').evaluate(() => {
    const targets: HTMLElement[] = [document.createElement('input'), document.createElement('textarea'), document.createElement('select')];
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const nested = document.createElement('textarea');
    shadow.append(nested);
    document.body.append(host, ...targets);
    return [...targets, nested].map(target => {
      target.focus();
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true, composed: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(results).toEqual([false, false, false, false]);
  await expect(current(page)).toHaveText('h1');
});

test("mobile hover labels stay in the viewport and clear the edit bar", async ({ page }) => {
  await page.getByRole('button', { name: 'Mobile, 390 px' }).click();
  await expect.poll(() => frameWidth(page)).toBe(390);
  const frame = page.frameLocator('.native-preview-frame');
  const target = frame.locator('.hero h1');
  await target.evaluate(el => {
    el.className = 'a-very-long-class-name-that-must-fit-in-the-narrow-canvas';
    (el as HTMLElement).style.cssText = 'position:relative;left:300px;width:40px;font-size:12px';
  });
  await target.hover();
  const label = frame.locator('[data-native-selection-box=label]');
  await expect(label).toBeVisible();
  const geometry = await label.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.scroll).toBe(390);
  await frame.locator(".hero p.lead").click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar' })).toBeVisible();
  await page.locator(".canvas-bar").hover();
  await target.hover();
  await expect(label).toBeVisible();
  const bar = (await page.getByRole('toolbar', { name: 'Edit bar' }).boundingBox())!;
  await expect.poll(async () => {
    const at = (await label.boundingBox())!;
    return at.x < bar.x + bar.width && at.x + at.width > bar.x && at.y < bar.y + bar.height && at.y + at.height > bar.y;
  }).toBe(false);
});

test("code navigation reveals an element that remains selected after manual scrolling", async ({ page }) => {
  const frame = page.frameLocator('.native-preview-frame');
  await frame.locator('.hero h1').click();
  await expect(current(page)).toHaveText('h1');
  await frame.locator('body').evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => frame.locator('.hero h1').evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(0);
  const node = await frame.locator('.hero h1').evaluate(el => {
    const path: number[] = [];
    for (let at: Element | null = el; at && at.id !== 'page'; at = at.parentElement) path.unshift([...at.parentElement!.children].indexOf(at));
    return path;
  });
  await page.locator('.native-preview-frame').evaluate((el, node) => {
    (el as HTMLIFrameElement).contentWindow!.postMessage({ source: 'astro-native-preview-host', type: 'canvas-code-select', request: { path: 'index.html', node } }, '*');
  }, node);
  await expect.poll(() => frame.locator('.hero h1').evaluate(el => el.getBoundingClientRect().bottom)).toBeGreaterThan(0);
  await expect(current(page)).toHaveText('h1');
});

test("dragging a code range and clearing the canvas cancel pending cursor selection", async ({ page }) => {
  const frame = page.frameLocator('.native-preview-frame');
  await frame.locator('.hero h1').click();
  await expect(current(page)).toHaveText('h1');
  // Canvas selection reveals its folded source; unfold through Monaco's real shortcut.
  const editor = page.locator('#content .monaco-editor');
  await expect(editor).toBeVisible();
  await editor.locator('textarea').focus();
  await page.keyboard.press('ControlOrMeta+K');
  await page.keyboard.press('ControlOrMeta+J');
  const line = page.locator('#content .view-line').filter({ hasText: '<section class="hero"' });
  await expect(line).toBeVisible();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(180);
  await page.mouse.up();
  await expect(editor.locator('.selected-text').first()).toBeVisible();
  await page.waitForTimeout(180);
  await expect(current(page)).toHaveText('h1');
  // A real code click queues cursor selection; a real body crumb click wins before 120ms.
  const clear = crumbs(page).first();
  const clearBox = (await clear.boundingBox())!;
  const timing = await page.evaluateHandle(() => {
    const result = { cursor: 0, clear: 0, source: '' };
    window.addEventListener('native-code-pointer', event => {
      const pointer = (event as CustomEvent).detail;
      if (pointer.kind === 'cursor') { result.cursor = performance.now(); result.source = pointer.source; }
    }, { once: false });
    window.addEventListener('click', event => {
      if ((event.target as Element).closest('.canvas-crumb')) result.clear = performance.now();
    }, { capture: true });
    return result;
  });
  await page.mouse.click(box.x + 30, box.y + box.height / 2);
  await page.mouse.click(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2);
  const measured = await timing.jsonValue();
  expect(measured.source).toContain('<section class="hero"');
  expect(measured.cursor).toBeGreaterThan(0);
  expect(measured.clear - measured.cursor).toBeGreaterThanOrEqual(0);
  expect(measured.clear - measured.cursor).toBeLessThan(120);
  await timing.dispose();
  await expect(crumbs(page)).toHaveText(['body']);
  await page.waitForTimeout(180);
  await expect(crumbs(page)).toHaveText(['body']);
});
