import { test, expect } from '@playwright/test';
import { openEditor, originalSource, originalTitle, preparePreview } from './fixture';
import { generatedSizeSource } from './expected-size';

const customSource = originalSource.replace('<h1>', '<h1 style="font-size: 2.25rem;">');

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(customSource); });

test('Undo restores a custom literal size in the preview and shared text bar', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  const size = page.getByRole('combobox', { name: 'Text size', exact: true });
  await expect(size).toHaveValue('custom');
  await size.selectOption('l');
  await expect(heading).toHaveClass('heading-title');
  await expect(heading).not.toHaveAttribute('style');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading).toHaveAttribute('style', 'font-size: 2.25rem;');
  await heading.click();
  await expect(size).toHaveValue('custom');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(heading).toHaveClass('heading-title');
  await heading.click();
  await expect(size).toHaveValue('l');
  expect(await editor.submittedSource()).toBe(generatedSizeSource(originalSource, '<h1>', 'heading-title', 'l'));
  expect(editor.errors).toEqual([]);
});
