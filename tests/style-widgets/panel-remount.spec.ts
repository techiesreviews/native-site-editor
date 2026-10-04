import { expect, test, type Page } from '@playwright/test';
import { showStylePanel } from '../native-save/style-panel-controls';

// The real Style panel (createStylePanel) on a harness page whose image-asset
// boundary (focalAsset) resolves only on request. Each write is recorded and
// then applied to the harness CSS, as a host would apply it. This proves the
// panel's remount rules, not any host or network behaviour.
type Write = { properties: Record<string, string | null>; state: string; key?: string; revision?: string; source?: string };
declare global { interface Window { panel: { writes: Write[]; errors: string[]; pending(): string[]; resolveAll(): void; bumpAsset(revision: string): void; setPosition(position: string): void; selectCard(): void } } }
const x = (page: Page) => page.getByLabel('X (%)', { exact: true });
const call = (page: Page, run: (panel: Window['panel']) => unknown) => page.evaluate(`(${run.toString()})(window.panel)`);
const writes = (page: Page) => page.evaluate(() => window.panel.writes);
const pending = (page: Page) => page.evaluate(() => window.panel.pending());

/** Opens the panel, resolves the first asset, and types 42 into the focused X without committing. */
async function typeDraft(page: Page) {
  await page.goto('/tests/style-widgets/panel-remount.html');
  await showStylePanel(page);
  expect(await pending(page)).toContain('hero@a1');
  await call(page, panel => panel.resolveAll());
  await page.getByText('Image focus', { exact: true }).click();
  await expect(x(page)).toHaveValue('20');
  await x(page).fill('42');
  await expect(x(page)).toBeFocused();
}

test('a new image asset revision remounts the focal widget and keeps the typed X, focused, for the same CSS', async ({ page }) => {
  await typeDraft(page);
  await call(page, panel => panel.bumpAsset('a2'));
  expect(await pending(page)).toContain('hero@a2');
  await call(page, panel => panel.resolveAll());
  await expect(x(page)).toHaveValue('42');
  await expect(x(page)).toBeFocused();
  expect(await writes(page)).toEqual([]);
  await x(page).press('Enter');
  expect(await writes(page)).toEqual([{ properties: { 'object-position': '42% 30%' }, state: '', key: 'hero', revision: 'a2', source: '.hero { object-position: 20% 30%; }\n.card { object-position: 70% 80%; }\n' }]);
});

test('newer CSS for the same rule drops the typed X: the field shows the newer value and Enter writes nothing over it', async ({ page }) => {
  await typeDraft(page);
  await call(page, panel => panel.setPosition('10% 30%'));
  await call(page, panel => panel.resolveAll());
  await expect(x(page)).toHaveValue('10');
  await x(page).press('Enter');
  expect(await writes(page)).toEqual([]);
});

test('newer CSS together with a new asset revision also drops the typed X', async ({ page }) => {
  await typeDraft(page);
  await page.evaluate(() => { window.panel.bumpAsset('a2'); window.panel.setPosition('10% 30%'); });
  await call(page, panel => panel.resolveAll());
  await expect(x(page)).toHaveValue('10');
  await x(page).press('Enter');
  expect(await writes(page)).toEqual([]);
});

test('a state change or another target while an asset loads never lets the old field or response write', async ({ page }) => {
  await typeDraft(page);
  await call(page, panel => panel.bumpAsset('a2'));
  // Choosing a state blurs the typed X (a native change); the old widget is no longer current, so nothing is written.
  await page.getByRole('combobox', { name: 'Style state' }).selectOption(':hover');
  await call(page, panel => panel.selectCard());
  // All responses resolve oldest first; only the card's newest request may mount.
  await call(page, panel => panel.resolveAll());
  // The card has no :hover rule, so its hover fields are empty, never the old 42.
  await expect(x(page)).toHaveValue('');
  await page.getByRole('combobox', { name: 'Style state' }).selectOption('');
  await call(page, panel => panel.resolveAll());
  await expect(x(page)).toHaveValue('70');
  await expect(page.getByLabel('Y (%)', { exact: true })).toHaveValue('80');
  expect(await writes(page)).toEqual([]);
  expect(await page.evaluate(() => window.panel.errors)).toEqual([]);
});

test('ArrowUp steps from a valid typed X, so the field and the written value agree', async ({ page }) => {
  await typeDraft(page);
  await x(page).press('ArrowUp');
  await expect(x(page)).toHaveValue('43');
  expect(await writes(page)).toEqual([{ properties: { 'object-position': '43% 30%' }, state: '', key: 'hero', revision: 'a1', source: '.hero { object-position: 20% 30%; }\n.card { object-position: 70% 80%; }\n' }]);
});
