import { test, expect, type Page } from '@playwright/test';
import { openEditor, preparePreview } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

const primaryPane = (page: Page) => page.locator('#code-split > .code-pane').first();
const splitter = (page: Page) => page.getByRole('separator', { name: 'Resize code pane widths' });

async function openSecondary(page: Page) {
  await page.frameLocator('.preview-frame--after').locator('p.lead').click();
  await expect(page.locator('#secondary-title')).toHaveText('src/styles/site.css');
}

async function paneWidth(page: Page) {
  return (await primaryPane(page).boundingBox())!.width;
}

test('the primary code pane shows the open file path and no minimap', async ({ page }) => {
  await openEditor(page);
  // Selecting an element in the preview opens its source in the primary pane.
  await page.frameLocator('.preview-frame--after').locator('h1').click();
  await expect(page.locator('#primary-title')).toHaveText('src/pages/index.astro');
  await expect(page.locator('#content .view-lines')).toBeVisible();
  await expect(page.locator('#content .minimap')).toBeHidden();
});

test('opening a linked stylesheet reveals the width splitter with both pane titles', async ({ page }) => {
  await openEditor(page);
  await expect(splitter(page)).toBeHidden();
  await openSecondary(page);
  await expect(page.locator('#primary-title')).toHaveText('src/pages/index.astro');
  await expect(splitter(page)).toBeVisible();
  await expect(splitter(page)).toHaveAttribute('aria-orientation', 'vertical');
});

test('dragging the splitter resizes the panes and the ratio persists across reload', async ({ page }) => {
  await openEditor(page);
  await openSecondary(page);
  const before = await paneWidth(page);
  const box = (await splitter(page).boundingBox())!;
  await page.mouse.move(box.x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 160, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await paneWidth(page);
  expect(after).toBeLessThan(before - 80);

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  await openSecondary(page);
  const restored = await paneWidth(page);
  expect(Math.abs(restored - after)).toBeLessThan(24);
});

test('keyboard moves the splitter, Home/End reach the bounds and double-click resets to 50/50', async ({ page }) => {
  await openEditor(page);
  await openSecondary(page);
  const split = (await page.locator('#code-split').boundingBox())!.width;
  const handle = (await splitter(page).boundingBox())!.width;
  const available = split - handle;
  const min = Math.min(240, available / 2);

  await splitter(page).focus();
  const start = await paneWidth(page);
  await splitter(page).press('ArrowLeft');
  await splitter(page).press('ArrowLeft');
  expect(await paneWidth(page)).toBeLessThan(start);

  await splitter(page).press('End');
  expect(await paneWidth(page)).toBeGreaterThan(available - min - 4);
  await splitter(page).press('Home');
  expect(await paneWidth(page)).toBeLessThan(min + 4);

  await splitter(page).dblclick();
  expect(Math.abs((await paneWidth(page)) - available / 2)).toBeLessThan(12);
});

test('a narrow window splits evenly instead of pinning a pane', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await openEditor(page);
  await openSecondary(page);
  const split = (await page.locator('#code-split').boundingBox())!.width;
  const handle = (await splitter(page).boundingBox())!.width;
  const available = split - handle;
  const min = Math.min(240, available / 2);
  const secondaryWidth = async () => (await page.locator('#secondary-pane').boundingBox())!.width;

  await splitter(page).focus();
  // Pushed fully left, the primary still keeps its minimum and the secondary the
  // rest — an even split on a narrow window rather than a pinned pane.
  await splitter(page).press('Home');
  expect(await paneWidth(page)).toBeGreaterThanOrEqual(min - 2);
  expect(await paneWidth(page)).toBeLessThanOrEqual(min + 2);
  expect(await secondaryWidth()).toBeGreaterThanOrEqual(min - 2);
});
