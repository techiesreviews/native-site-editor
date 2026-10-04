import { expect, test, type Page } from '@playwright/test';

// The focal widget redraws its fields whenever the preview image loads or its
// box resizes. A value typed into a focused X/Y field and not yet committed
// must survive those redraws, then commit as typed. Uses the widget fixture
// page (tests/style-widgets/fixture.ts); its onChange records writes, so this
// is the widget boundary, not a network or host proof.
type Writes = { properties: Record<string, string | null>; sameExpected: boolean }[];
declare global { interface Window { widgets: { writes: Writes; mount(kind: 'focal', raw?: string): void } } }
const writes = (page: Page) => page.evaluate(() => window.widgets.writes);
const marker = (page: Page) => page.locator('.image-focal-point__marker').evaluate(element => (element as HTMLElement).style.left);
/** Resizes the widget's box, so its ResizeObserver redraws it. */
async function redraw(page: Page, width: string) {
  const before = await marker(page);
  await page.locator('#fixture').evaluate((element, width) => { (element as HTMLElement).style.width = width; }, width);
  // The marker moves only when draw() ran for the new box.
  await expect.poll(() => marker(page)).not.toBe(before);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/style-widgets/fixture.html');
  await page.evaluate(() => window.widgets.mount('focal', '25% 75%'));
  await expect(page.locator('.image-focal-point img')).toHaveJSProperty('complete', true);
});

test('typed X and Y survive redraws while focused, then commit exactly once each', async ({ page }) => {
  const x = page.getByLabel('X (%)', { exact: true }), y = page.getByLabel('Y (%)', { exact: true });
  await x.fill('42');
  await redraw(page, '360px');
  await expect(x).toBeFocused(); await expect(x).toHaveValue('42'); await expect(y).toHaveValue('75');
  expect(await writes(page)).toEqual([]);
  await x.press('Enter');
  expect(await writes(page)).toEqual([{ properties: { 'object-position': '42% 75%' }, sameExpected: true }]);
  await y.fill('30');
  await redraw(page, '240px');
  await expect(y).toBeFocused(); await expect(y).toHaveValue('30'); await expect(x).toHaveValue('42');
  await y.press('Enter');
  expect(await writes(page)).toEqual([{ properties: { 'object-position': '42% 75%' }, sameExpected: true }, { properties: { 'object-position': '42% 30%' }, sameExpected: true }]);
});

test('an unfocused field is redrawn from the committed point; nothing is written', async ({ page }) => {
  const x = page.getByLabel('X (%)', { exact: true });
  await x.fill('42');
  // Leaving the field commits it natively (change); then a redraw shows the committed value.
  await x.blur();
  expect(await writes(page)).toEqual([{ properties: { 'object-position': '42% 75%' }, sameExpected: true }]);
  await redraw(page, '360px');
  await expect(x).toHaveValue('42');
  await x.fill('');
  await page.getByLabel('Y (%)', { exact: true }).focus();
  await redraw(page, '240px');
  // An empty field is not a value: it is not written and shows the committed point again.
  await expect(x).toHaveValue('42');
  expect(await writes(page)).toHaveLength(1);
});
