import { test, expect, type Page } from '@playwright/test';

type WidgetAPI = { writes: { properties: Record<string, string | null>; sameExpected: boolean }[]; mount(kind: 'grid' | 'focal', raw?: string, mode?: 'object-position' | 'background-position'): void; stale(refresh?: boolean): void; lock(refresh?: boolean): void; errors: string[]; failNext(): void; deferNext(): void; resolve(): void; computedGrid(): void; svg(trusted?: boolean): boolean; dispose(): void; rejectURL(): boolean };
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
  await page.getByLabel('Columns', { exact: true }).fill('3'); await page.getByRole('button', { name: 'Replace with 3 equal columns' }).click();
  expect((await writes(page))[1]).toEqual({ properties: { 'grid-template-columns': 'repeat(3, minmax(0, 1fr))' }, sameExpected: true });
  await expect(page.getByRole('img')).toHaveAttribute('aria-label', 'Equal grid preview: 3 columns, 2 rows');
});
test('grid bounded counts, stale and readOnly reject controls', async ({ page }) => {
  await page.getByLabel('Rows', { exact: true }).fill('25'); await page.getByRole('button', { name: /Replace with .* equal rows/ }).click(); expect(await writes(page)).toEqual([]);
  await page.evaluate(() => window.widgets.stale(false)); await page.getByLabel('Rows', { exact: true }).fill('3'); await page.getByRole('button', { name: /Replace with .* equal rows/ }).click(); expect(await writes(page)).toEqual([]);
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

test('custom counts remain blank, computed pixels honest, invalid gaps recover and rejected writes retry', async ({ page }) => {
  await expect(page.getByLabel('Columns', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Replace with N equal columns' }).click(); expect(await writes(page)).toEqual([]);
  const gap = page.getByLabel('Gap', { exact: true });
  await gap.fill('bad-gap'); await gap.press('Enter');
  await expect(gap).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByText('Enter a valid gap.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.widgets.errors)).toEqual(['Error: Enter a valid gap.']);
  await page.evaluate(() => window.widgets.failNext()); await gap.fill('12px'); await gap.press('Enter');
  await expect(gap).not.toHaveAttribute('aria-invalid');
  await expect.poll(() => page.evaluate(() => window.widgets.errors.length)).toBe(2); expect(await writes(page)).toEqual([]);
  await gap.press('Enter'); await expect.poll(() => writes(page)).toHaveLength(1);
  await page.evaluate(() => window.widgets.computedGrid()); await expect(page.getByText('Computed columns:', { exact: false })).toContainText('120px 120px');
});
test('async tracks update only after success; rejected retry, stale and disposed completions stay guarded', async ({ page }) => {
  const count = page.getByLabel('Columns', { exact: true }); await count.fill('3');
  await page.evaluate(() => window.widgets.failNext()); await page.getByRole('button', { name: 'Replace with 3 equal columns' }).click();
  await expect.poll(() => page.evaluate(() => window.widgets.errors.length)).toBe(1);
  await expect(page.getByText('Custom columns:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Replace with 3 equal columns' }).click(); await expect(page.getByText('3 equal tracks', { exact: true })).toBeVisible();
  for (const end of ['stale', 'dispose']) {
    await page.evaluate(() => { window.widgets.mount('grid'); window.widgets.deferNext(); });
    await count.fill('4'); await page.getByRole('button', { name: 'Replace with 4 equal columns' }).click();
    await expect(count).toBeDisabled(); await expect(page.getByText('Custom columns:', { exact: false })).toBeVisible();
    await page.evaluate(end => { if (end === 'stale') window.widgets.stale(); else window.widgets.dispose(); window.widgets.resolve(); }, end);
    await expect(page.getByText('4 equal tracks', { exact: true })).toHaveCount(0);
  }
});
test('raw out-of-range focus is explained; trusted native starter SVG loads and accepts pointer focus', async ({ page }) => {
  await focal(page, '120% -2%');
  await expect(page.locator('.image-focal-point__status')).toHaveText('Authored position: 120% -2%. Editing marker clamped to 100% 0%; source unchanged.');
  expect(await writes(page)).toEqual([]);
  await expect(page.locator('.image-focal-point__preview')).toHaveAttribute('aria-describedby', await page.locator('.image-focal-point__status').getAttribute('id') as string);
  await page.getByLabel('X (%)', { exact: true }).press('Enter'); await page.getByLabel('X (%)', { exact: true }).blur();
  expect(await writes(page)).toEqual([{ properties: { 'object-position': '100% 0%' }, sameExpected: true }]);
  const requests: string[] = []; page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5386')) requests.push(request.url()); });
  expect(await page.evaluate(() => window.widgets.svg(false))).toBe(false);
  expect(await page.evaluate(() => window.widgets.svg())).toBe(true);
  await expect.poll(() => page.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);
  expect(await page.locator('img').evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(180);
  const box = (await page.locator('img').boundingBox())!; await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await writes(page)).toHaveLength(1); expect(requests).toEqual([]);
});
