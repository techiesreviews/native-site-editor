import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, originalTitle, preparePreview } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('real Astro heading exposes the contextual level control and preserves source around both tags', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Heading');
  const level = bar.getByRole('combobox', { name: 'Heading level', exact: true });
  await expect(level).toHaveValue('h1');
  await level.selectOption('h2');
  await expect(frame.getByRole('heading', { level: 2, name: originalTitle, exact: true })).toBeVisible();
  const expected = originalSource.replace(`<h1>${originalTitle}</h1>`, `<h2>${originalTitle}</h2>`);
  await expect(page.locator('#content .view-lines')).toContainText(`<h2>${originalTitle}</h2>`);
  await page.screenshot({ path: '.scratch/heading-bar/heading-bar-desktop.png', animations: 'disabled' });
  expect(await editor.submittedSource()).toBe(expected);
  const html = independentlyBuild(expected);
  expect(html).toContain(`>${originalTitle}</h2>`);
  expect(html).not.toContain('data-ase=');
  expect(editor.errors).toEqual([]);
});

test('one code-panel Undo and Redo keep the source and rendered heading together', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  await expect(frame.getByRole('heading', { level: 3, name: originalTitle, exact: true })).toBeVisible();
  await page.locator('#content .view-line').filter({ hasText: originalTitle }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#content .view-lines')).toContainText(`<h1>${originalTitle}</h1>`);
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('#content .view-lines')).toContainText(`<h3>${originalTitle}</h3>`);
  await expect(frame.getByRole('heading', { level: 3, name: originalTitle, exact: true })).toBeVisible();
  expect(editor.errors).toEqual([]);
});

test('heading level survives both preview-frame reload and full editor reload', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h6');
  await expect(frame.getByRole('heading', { level: 6, name: originalTitle, exact: true })).toBeVisible();
  await frame.locator('body').evaluate(() => location.reload());
  await expect(frame.getByRole('heading', { level: 6, name: originalTitle, exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('#content .view-lines')).toContainText(`<h6>${originalTitle}</h6>`);
  await expect(frame.getByRole('heading', { level: 6, name: originalTitle, exact: true })).toBeVisible();
  await frame.getByRole('heading', { level: 6, name: originalTitle, exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Heading level', exact: true })).toHaveValue('h6');
  expect(editor.errors).toEqual([]);
});

test('typing before a level change keeps source ranges and restores the selected text for continued typing', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Alpha Bravo Charlie');
  await page.keyboard.press('Home');
  for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowRight');
  for (let index = 0; index < 5; index++) await page.keyboard.press('Shift+ArrowRight');
  const level = page.getByRole('combobox', { name: 'Heading level', exact: true });
  await level.focus();
  await level.selectOption('h4');
  const heading = frame.getByRole('heading', { level: 4, name: 'Alpha Bravo Charlie', exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect.poll(() => heading.evaluate(() => getSelection()?.toString())).toBe('Bravo');
  await page.keyboard.type('Beta');
  await expect(frame.getByRole('heading', { level: 4, name: 'Alpha Beta Charlie', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  const expected = originalSource.replace(`<h1>${originalTitle}</h1>`, '<h4>Alpha Beta Charlie</h4>');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});
