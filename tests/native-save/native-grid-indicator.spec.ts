import { test, expect, type Page } from '@playwright/test';
import { showStylePanel } from './style-panel-controls';
import { storedDrafts } from './drafts';

const source = (page: Page) => page.evaluate(async () =>
  (await import('/src/components/code-editor.ts')).getMountedSource('styles/site.css'));

test('auto-fit grid indicates its current columns without replacing its custom CSS', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const frame = page.frameLocator('.native-preview-frame');
  const cards = frame.locator('.cards');
  await expect(cards).toBeVisible();
  await frame.locator('.hero h1').click();
  await expect.poll(() => source(page)).toContain('repeat(auto-fit, minmax(220px, 1fr))');
  const original = (await source(page))!;
  const authored = original.replace('repeat(auto-fit, minmax(220px, 1fr))', 'repeat(auto-fit, minmax(230px, 1fr))');
  await page.evaluate(text => navigator.clipboard.writeText(text), authored);
  await page.locator('#content-secondary [role="textbox"]').first().focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
  await expect.poll(() => source(page)).toBe(authored);
  await expect.poll(() => cards.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length)).toBe(3);
  const box = await cards.boundingBox();
  if (!box) throw new Error('Missing cards grid');
  // The gap between cards exposes the grid's own pixels.
  await cards.click({ position: { x: box.width / 3, y: 5 } });
  await showStylePanel(page);
  const panel = page.getByRole('complementary', { name: 'Style panel' });
  await panel.getByRole('searchbox', { name: 'Search styles' }).fill('grid');
  const grid = panel.getByRole('region', { name: 'Grid layout' });
  await expect(grid).toBeVisible();
  await expect(grid).toContainText('Currently 3 columns at this width');
  await expect(grid.getByLabel('Columns', { exact: true })).toHaveValue('');
  await expect(grid.getByRole('img')).toHaveAttribute('aria-label', /Current grid track count at this width: 3 columns/);
  await expect(grid.getByRole('img').locator('span')).toHaveCount(3);
  const before = await source(page);
  expect(before).toBe(authored);
  expect((await storedDrafts(page)).map(draft => ({ path: draft.path, content: draft.content })))
    .toEqual([{ path: 'styles/site.css', content: authored }]);

  // An explicit count change still replaces the template, as before, in one Undo.
  await grid.getByLabel('Columns', { exact: true }).fill('4');
  await grid.getByRole('button', { name: 'Apply: replace with 4 equal columns', exact: true }).click();
  await expect.poll(() => source(page)).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => source(page)).toBe(before);

  const uneven = authored.replace('repeat(auto-fit, minmax(230px, 1fr))', '80px minmax(0, 1fr) fit-content(240px)');
  await page.evaluate(text => navigator.clipboard.writeText(text), uneven);
  await page.locator('#content-secondary [role="textbox"]').first().focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
  await expect.poll(() => source(page)).toBe(uneven);
  await expect.poll(() => cards.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length)).toBe(3);
  await expect(grid).toContainText('Custom columns: 80px minmax(0, 1fr) fit-content(240px)');
  await expect(grid).toContainText('Currently 3 columns at this width');
  await expect(grid.getByLabel('Columns', { exact: true })).toHaveValue('');
  await expect(grid.getByRole('img').locator('span')).toHaveCount(3);
  expect(await source(page)).toBe(uneven);
});

test('unresolved browser subgrid tracks show a compact unavailable state', async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.evaluate(async () => {
    const parent = document.createElement('div');
    parent.style.cssText = 'display:grid;grid-template-columns:100px 200px;grid-template-rows:30px 40px';
    const child = document.createElement('div');
    child.style.cssText = 'display:grid;grid-column:1/-1;grid-row:1/-1;grid-template-columns:subgrid;grid-template-rows:subgrid';
    parent.append(child); document.body.append(parent);
    const computed = getComputedStyle(child);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:10px;top:100px;width:300px;background:white;z-index:9999';
    document.body.append(host);
    const { mountGridEditor } = await import('/src/components/grid-editor.ts');
    mountGridEditor(host, {
      authored: { 'grid-template-columns': 'subgrid', 'grid-template-rows': 'subgrid' },
      computed: { 'grid-template-columns': computed.gridTemplateColumns, 'grid-template-rows': computed.gridTemplateRows },
      expected: 'unchanged', isCurrent: () => true,
      onChange: () => { throw new Error('Viewing unresolved tracks must not write'); },
    });
  });
  const grid = page.getByRole('region', { name: 'Grid layout' });
  await expect(grid.getByRole('img')).toHaveAttribute('aria-label', /preview unavailable/);
  await expect(grid.getByRole('img')).toHaveText('Current track count unavailable');
  await expect(grid.getByRole('img').locator('span')).toHaveCount(0);
  await expect(grid.getByLabel('Columns', { exact: true })).toHaveValue('');
  expect((await grid.getByRole('img').boundingBox())!.height).toBeLessThan(88);
});
