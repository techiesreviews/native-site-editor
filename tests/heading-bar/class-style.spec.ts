import { readFileSync } from 'node:fs';
import { test, expect, type Locator } from '@playwright/test';
import { openEditor, originalSource, preparePreview, sourcePath } from './fixture';

const cssPath = 'src/styles/site.css';
const originalCss = readFileSync(`fixtures/astro-starter/${cssPath}`, 'utf8');
const source = originalSource.replace(
  '<p>This is an ordinary Astro site.',
  '<p class="lead">This is an ordinary Astro site.',
);

async function selectText(element: Locator, wanted: string) {
  await element.evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(text) ?? -1;
      if (start < 0) continue;
      getSelection()!.setBaseAndExtent(node, start, node, start + text.length);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error(`Text not found: ${text}`);
  }, wanted);
  await expect.poll(() => element.evaluate(() => getSelection()?.toString())).toBe(wanted);
}

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(source); });

test('one literal class rule sizes every matching paragraph and shares header history with Astro formatting', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const paragraphs = frame.locator('p.lead');
  const first = paragraphs.first();
  await expect(paragraphs).toHaveCount(2);

  await first.click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  await selectText(first, 'ideas');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(first.locator('strong')).toHaveText('ideas');

  const size = page.getByRole('combobox', { name: 'Text size', exact: true });
  await size.selectOption('xl');
  for (const paragraph of await paragraphs.all()) {
    await expect(paragraph).not.toHaveAttribute('style', /font-size/);
    await expect.poll(() => paragraph.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(19);
  }
  await expect.poll(async () => paragraphs.evaluateAll(elements => {
    const sizes = elements.map(element => getComputedStyle(element).fontSize);
    return sizes[0] === sizes[1];
  })).toBe(true);

  const expectedSource = source.replace('A place for ideas,', 'A place for <strong>ideas</strong>,');
  const expectedCss = originalCss.replace('font-size: 19px;', 'font-size: var(--text-xl);');
  let submitted = await editor.submittedFiles();
  expect(submitted.find(file => file.path === sourcePath)?.content).toBe(expectedSource);
  expect(submitted.find(file => file.path === cssPath)?.content).toBe(expectedCss);
  expect(submitted).toHaveLength(2);

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await undo.click();
  await expect(size).toHaveValue('custom');
  await expect(first.locator('strong')).toHaveText('ideas');
  for (const paragraph of await paragraphs.all())
    await expect(paragraph).toHaveCSS('font-size', '19px');
  await undo.click();
  await expect(first.locator('strong')).toHaveCount(0);

  await redo.click();
  await expect(first.locator('strong')).toHaveText('ideas');
  await redo.click();
  await expect(size).toHaveValue('xl');
  for (const paragraph of await paragraphs.all())
    await expect(paragraph).not.toHaveAttribute('style', /font-size/);

  await page.reload();
  const reloaded = page.frameLocator('.preview-frame--after').locator('p.lead');
  await expect(reloaded).toHaveCount(2);
  await expect(reloaded.first().locator('strong')).toHaveText('ideas');
  for (const paragraph of await reloaded.all()) {
    await expect(paragraph).not.toHaveAttribute('style', /font-size/);
    await expect.poll(() => paragraph.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(19);
  }

  await reloaded.first().click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('xl');
  submitted = await editor.submittedFiles();
  expect(submitted.find(file => file.path === sourcePath)?.content).toBe(expectedSource);
  expect(submitted.find(file => file.path === cssPath)?.content).toBe(expectedCss);
  expect(editor.errors).toEqual([]);
});
