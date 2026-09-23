import { test, expect } from '@playwright/test';
import { openEditor, originalSource, preparePreview } from './fixture';
import { generatedSizeSource } from './expected-size';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('a longer preceding link keeps later heading size and Undo mappings intact', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('link', { name: 'Get to know this project ↗' }).click();
  await expect(page.locator('.preview-summary')).toContainText('Editing a in src/pages/index.astro');
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  const link = page.getByRole('textbox', { name: 'Destination', exact: true });
  await link.fill('/about-this-project/');
  await link.press('Enter');
  await expect(frame.getByRole('link', { name: 'Get to know this project ↗' })).toHaveAttribute('href', '/about-this-project/');
  const heading = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await heading.click();
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xl');
  await expect(heading).toHaveClass('heading-title');
  await expect(heading).not.toHaveAttribute('style', /font-size/);
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  await expect(heading).toHaveJSProperty('tagName', 'H3');
  await page.locator('#content .view-line').filter({ hasText: 'Start with something simple.' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(heading).toHaveJSProperty('tagName', 'H2');
  const linked = originalSource.replace('href="/about/"', 'href="/about-this-project/"');
  const expected = generatedSizeSource(linked, '<h2>', 'heading-title', 'xl');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});
