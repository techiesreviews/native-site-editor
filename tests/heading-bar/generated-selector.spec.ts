import { test, expect } from '@playwright/test';
import { openEditor, preparePreview } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('a generated heading class immediately appears in the linked CSS selector pane and follows history', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await heading.click();
  await expect(page.locator('#secondary-rules')).not.toContainText('.heading-title');

  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xl');
  await expect(heading).toHaveClass('heading-title');
  await expect(page.locator('#secondary-title')).toHaveText('src/styles/site.css');
  await expect(page.locator('#secondary-rules')).toContainText('.heading-title');
  await expect(page.locator('#secondary-rules')).toContainText('index.astro');

  await page.locator('#secondary-rules').getByRole('button').filter({ hasText: '.heading-title' }).click();
  await expect(page.locator('#secondary-title')).toHaveText('src/styles/site.css');
  await expect(page.locator('#content .view-lines')).toContainText('.heading-title { font-size: var(--text-xl); }');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading).not.toHaveAttribute('class', /heading-title/);
  await expect(page.locator('#secondary-rules')).not.toContainText('.heading-title');
  await expect(page.locator('#content .view-lines')).not.toContainText('.heading-title');

  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(heading).toHaveClass('heading-title');
  await expect(page.locator('#secondary-title')).toHaveText('src/styles/site.css');
  await expect(page.locator('#secondary-rules')).toContainText('.heading-title');
  await expect(page.locator('#secondary-rules')).toContainText('index.astro');
  expect(editor.errors).toEqual([]);
});
