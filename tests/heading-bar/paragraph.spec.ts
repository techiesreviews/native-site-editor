import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, preparePreview } from './fixture';
import { generatedSizeSource } from './expected-size';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('paragraph uses the shared text bar for formatting and whole-element size', async ({ page }) => {
  const editor = await openEditor(page);
  const paragraph = page.frameLocator('.preview-frame--after').locator('section').first().locator('p');
  await paragraph.click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Paragraph');
  await expect(bar.getByRole('combobox', { name: 'Heading level' })).toBeHidden();
  await paragraph.evaluate(element => {
    const node = element.firstChild!;
    const start = node.textContent!.indexOf('ordinary');
    getSelection()!.setBaseAndExtent(node, start, node, start + 'ordinary'.length);
  });
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(paragraph.locator('strong')).toHaveText('ordinary');
  await bar.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('m');
  await expect(paragraph).toHaveClass('paragraph-text');
  await expect(paragraph).not.toHaveAttribute('style', /font-size/);
  const formatted = originalSource.replace(
    '<p>This is an ordinary Astro site.',
    '<p>This is an <strong>ordinary</strong> Astro site.',
  );
  const expected = generatedSizeSource(formatted, '<p>', 'paragraph-text', 'm');
  expect(await editor.submittedSource()).toBe(expected);
  expect(independentlyBuild(expected)).toMatch(/<strong[^>]*>ordinary<\/strong>/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(paragraph).not.toHaveAttribute('class', /paragraph-text/);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(paragraph).toHaveClass('paragraph-text');
  await page.reload();
  const reloadedParagraph = page.frameLocator('.preview-frame--after').locator('section').first().locator('p');
  await expect(reloadedParagraph.locator('strong')).toHaveText('ordinary');
  await reloadedParagraph.click();
  await expect(bar).toContainText('Paragraph');
  await expect(bar.getByRole('combobox', { name: 'Text size' })).toHaveValue('m');
  const later = page.frameLocator('.preview-frame--after').getByRole('heading', { name: 'Say hello.', exact: true });
  await later.click();
  await bar.getByRole('combobox', { name: 'Heading level' }).selectOption('h3');
  await expect(later).toHaveJSProperty('tagName', 'H3');
  expect(await editor.submittedSource()).toBe(expected.replace('<h2>Say hello.</h2>', '<h3>Say hello.</h3>'));
  expect(editor.errors).toEqual([]);
});

test('paragraph typing keeps its source mapping and formatting controls', async ({ page }) => {
  const editor = await openEditor(page);
  const paragraph = page.frameLocator('.preview-frame--after').locator('section').first().locator('p');
  await paragraph.click();
  await paragraph.evaluate(element => {
    const node = element.firstChild!;
    const start = node.textContent!.indexOf('ordinary');
    getSelection()!.setBaseAndExtent(node, start, node, start + 'ordinary'.length);
  });
  await page.keyboard.type('everyday');
  await expect(paragraph).toContainText('This is an everyday Astro site.');
  await page.getByRole('combobox', { name: 'Text size' }).selectOption('l');
  const expected = originalSource
    .replace('This is an ordinary Astro site.', 'This is an everyday Astro site.');
  const sizedExpected = generatedSizeSource(expected, '<p>', 'paragraph-text', 'l');
  expect(await editor.submittedSource()).toBe(sizedExpected);
  expect(independentlyBuild(sizedExpected)).toContain('This is an everyday Astro site.');
  expect(editor.errors).toEqual([]);
});

test('Undoing paragraph formatting preserves its selection for continued typing', async ({ page }) => {
  const editor = await openEditor(page);
  const paragraph = page.frameLocator('.preview-frame--after').locator('section').first().locator('p');
  await paragraph.click();
  await paragraph.evaluate(element => {
    const node = element.firstChild!;
    const start = node.textContent!.indexOf('ordinary');
    getSelection()!.setBaseAndExtent(node, start, node, start + 'ordinary'.length);
  });
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(paragraph.locator('strong')).toHaveText('ordinary');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(paragraph.locator('strong')).toHaveCount(0);
  await expect.poll(() => paragraph.evaluate(() => getSelection()?.toString())).toBe('ordinary');
  await page.keyboard.type('everyday');
  await expect(paragraph).toContainText('This is an everyday Astro site.');
  expect(await editor.submittedSource()).toBe(originalSource.replace('This is an ordinary', 'This is an everyday'));
  expect(editor.errors).toEqual([]);
});
