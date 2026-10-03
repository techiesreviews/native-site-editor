import { test, expect, type Page } from '@playwright/test';

type WidgetAPI = { writes: { properties: Record<string, string | null>; sameExpected: boolean }[]; mount(kind: 'grid' | 'focal', raw?: string, mode?: 'object-position' | 'background-position'): void; stale(refresh?: boolean): void; lock(refresh?: boolean): void; dispose(): void; rejectURL(): boolean };
declare global { interface Window { widgets: WidgetAPI } }
const writes = (page: Page) => page.evaluate(() => window.widgets.writes);
async function focal(page: Page, raw = '25% 75%', mode: 'object-position' | 'background-position' = 'object-position') {
  await page.evaluate(({ raw, mode }) => window.widgets.mount('focal', raw, mode), { raw, mode });
  await expect.poll(() => page.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(400);
}
async function dragStart(page: Page) {
  const box = (await page.locator('img').boundingBox())!;
  // 400x200 image fits a 280x160 preview: full-image vertical inset is 10px.
  const imageHeight = box.width / 2, top = box.y + (box.height - imageHeight) / 2;
  await page.mouse.move(box.x + box.width * .2, top + imageHeight * .2); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, top + imageHeight * .6);
}
test.beforeEach(async ({ page }) => { await page.goto('/tests/style-widgets/fixture.html'); });

test('grid render/custom preservation, explicit track conversion, isolated gap and Enter deduplication', async ({ page }) => {
  expect(await writes(page)).toEqual([]);
  await expect(page.getByText('Custom columns:', { exact: false })).toContainText('[start]');
  await page.getByLabel('Column gap', { exact: true }).fill('12px'); await page.getByLabel('Column gap', { exact: true }).press('Enter'); await page.getByLabel('Column gap', { exact: true }).blur();
  expect(await writes(page)).toEqual([{ properties: { 'column-gap': '12px' }, sameExpected: true }]);
  await expect(page.getByText('Custom columns:', { exact: false })).toContainText('[start]');
  await page.getByLabel('Columns', { exact: true }).fill('3'); await page.getByRole('button', { name: 'Set equal columns' }).click();
  expect((await writes(page))[1]).toEqual({ properties: { 'grid-template-columns': 'repeat(3, minmax(0, 1fr))' }, sameExpected: true });
  await expect(page.getByRole('img')).toHaveAttribute('aria-label', 'Equal grid preview: 3 columns, 2 rows');
});
test('grid bounded counts, stale and readOnly reject controls', async ({ page }) => {
  await page.getByLabel('Rows', { exact: true }).fill('25'); await page.getByRole('button', { name: 'Set equal rows' }).click(); expect(await writes(page)).toEqual([]);
  await page.evaluate(() => window.widgets.stale(false)); await page.getByLabel('Rows', { exact: true }).fill('3'); await page.getByRole('button', { name: 'Set equal rows' }).click(); expect(await writes(page)).toEqual([]);
  await page.evaluate(() => { window.widgets.mount('grid'); window.widgets.lock(); }); await expect(page.getByLabel('Gap', { exact: true })).toBeDisabled();
  await page.evaluate(() => window.widgets.dispose()); await expect(page.locator('.grid-editor')).toHaveCount(0);
});
test('focal custom stays unrepresented; numeric clamp, Enter/change dedup, keyboard map isolation', async ({ page }) => {
  await focal(page, 'calc(50% + 2px) 20px', 'background-position'); expect(await writes(page)).toEqual([]);
  await expect(page.locator('.image-focal-point__marker')).toBeHidden(); await expect(page.getByLabel('X (%)', { exact: true })).toHaveValue('');
  await page.getByLabel('X (%)', { exact: true }).fill('120'); await page.getByLabel('X (%)', { exact: true }).press('Enter'); await page.getByLabel('X (%)', { exact: true }).blur();
  expect(await writes(page)).toEqual([{ properties: { 'background-position': '100% 50%' }, sameExpected: true }]);
  await page.getByLabel('Y (%)', { exact: true }).press('Shift+ArrowDown'); expect((await writes(page))[1].properties).toEqual({ 'background-position': '100% 40%' });
});
test('contain full-image coordinates and one final pointer map commit', async ({ page }) => {
  await focal(page); expect(await writes(page)).toEqual([]); await dragStart(page); expect(await writes(page)).toEqual([]); await page.mouse.up();
  const result = await writes(page); expect(result).toHaveLength(1); expect(result[0].sameExpected).toBe(true);
  const percentages = result[0].properties['object-position']!.split(' ').map(Number.parseFloat);
  expect(percentages[0]).toBeCloseTo(80, 0); expect(percentages[1]).toBeCloseTo(60, 0);
});
test('Escape, pointercancel, readOnly, stale and disposal interrupt drags without writes', async ({ page }) => {
  for (const interruption of ['escape', 'cancel', 'lock', 'stale', 'dispose']) {
    await focal(page); await dragStart(page);
    if (interruption === 'escape') await page.keyboard.press('Escape');
    else if (interruption === 'cancel') await page.locator('.image-focal-point__preview').dispatchEvent('pointercancel', { pointerId: 1 });
    else await page.evaluate(kind => { if (kind === 'lock') window.widgets.lock(false); if (kind === 'stale') window.widgets.stale(false); if (kind === 'dispose') window.widgets.dispose(); }, interruption);
    await page.mouse.up(); expect(await writes(page)).toEqual([]);
    if (interruption === 'escape' || interruption === 'cancel') await expect(page.getByLabel('X (%)', { exact: true })).toHaveValue('25');
  }
});
test('keyboard clamps and stale/readOnly cannot commit; external preview rejected without fetch', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => { if (request.url().includes('example.com')) requests.push(request.url()); });
  await focal(page, '99% 1%'); await page.locator('.image-focal-point__preview').focus(); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowUp');
  expect((await writes(page)).map(write => write.properties)).toEqual([{ 'object-position': '100% 1%' }, { 'object-position': '100% 0%' }]);
  await page.evaluate(() => window.widgets.stale(false)); await page.keyboard.press('ArrowLeft'); expect(await writes(page)).toHaveLength(2);
  await focal(page); await page.evaluate(() => window.widgets.lock()); await expect(page.getByLabel('X (%)', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.widgets.rejectURL())).toBe(true); expect(requests).toEqual([]);
});
