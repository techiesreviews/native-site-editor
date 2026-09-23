import { test, expect } from '@playwright/test';
import { openEditor, originalSource, originalTitle, preparePreview } from './fixture';
import type { Locator } from '@playwright/test';
import { generatedDefaultSource, generatedSizeSource } from './expected-size';

async function selectText(heading: Locator, text: string) {
  await heading.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(wanted) ?? -1;
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + wanted.length);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
  }, text);
}

const sizedSource = originalSource
  .replace(`<h1>${originalTitle}</h1>`, `<h1 id="hero" style="color: navy; font-size: 2.25rem; line-height: var(--leading, 1.1)">${originalTitle}</h1>`)
  .replace('<h2>Start with something simple.</h2>', '<h2 data-note="a > b">Start with something simple.</h2>')
  .replace('<h2>Say hello.</h2>', `<h2 style={{ fontSize: '2rem' }}>Say hello.</h2>`);

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(sizedSource); });

test('a custom literal size can become a preset and Default removes only font-size', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  const size = page.getByRole('combobox', { name: 'Text size', exact: true });
  await expect(size).toHaveValue('custom');
  await size.selectOption('l');
  await expect(size).toHaveValue('l');
  await expect(page.locator('#content .view-lines')).toContainText('class="heading-title"');
  await expect(heading).toHaveClass('heading-title');
  await expect(heading).not.toHaveAttribute('style', /font-size/);
  await expect.poll(() => heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(18);
  await size.selectOption('default');
  await expect(page.locator('#content .view-lines')).toContainText('style="color: navy; line-height: var(--leading, 1.1)"');
  const withoutInlineSize = sizedSource.replace(
    'style="color: navy; font-size: 2.25rem; line-height: var(--leading, 1.1)"',
    'style="color: navy; line-height: var(--leading, 1.1)"',
  );
  const withClassSize = generatedSizeSource(
    withoutInlineSize,
    '<h1 id="hero" style="color: navy; line-height: var(--leading, 1.1)">',
    'heading-title',
    'l',
  );
  const expected = generatedDefaultSource(withClassSize, 'heading-title', 'l');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});

test('adding a size is one Undo step and survives level, formatting, Redo and reload', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  let heading = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await heading.click();
  const size = page.getByRole('combobox', { name: 'Text size', exact: true });
  await expect(size).toHaveValue('default');
  await size.selectOption('4xl');
  await expect.poll(() => heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h4');
  heading = frame.getByRole('heading', { level: 4, name: 'Start with something simple.', exact: true });
  await expect.poll(() => heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);
  await page.locator('#content .view-line').filter({ hasText: 'Start with something simple.' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => frame.getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => frame.getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(40);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => frame.getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);
  await frame.locator('body').evaluate(() => location.reload());
  await expect.poll(() => frame.getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);
  await page.reload();
  const reloaded = page.frameLocator('.preview-frame--after').getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true });
  await expect.poll(() => reloaded.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);
  await reloaded.click();
  await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('4xl');
  await expect(reloaded).toHaveClass('heading-title');
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xs');
  await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('xs');
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('default');
  await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('default');
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  const finalHeading = page.frameLocator('.preview-frame--after').getByRole('heading', { level: 3, name: 'Start with something simple.', exact: true });
  await selectText(finalHeading, 'simple');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(finalHeading.locator('strong')).toHaveText('simple');
  const sized = generatedDefaultSource(
    generatedSizeSource(sizedSource, '<h2 data-note="a > b">', 'heading-title', '4xl'),
    'heading-title',
    '4xl',
  );
  const expected = sized.replace('<h2 data-note="a > b" class="heading-title">Start with something simple.</h2>', '<h3 data-note="a > b" class="heading-title">Start with something <strong>simple</strong>.</h3>');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});

test('dynamic style leaves only Text size unavailable', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: 'Say hello.', exact: true });
  await heading.click();
  await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Heading level', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeEnabled();
  await expect(page.locator('#content .view-lines')).toContainText(`style={{ fontSize: '2rem' }}`);
  expect(editor.errors).toEqual([]);
});

test('an external token edit preserves code and later heading mappings', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const first = frame.getByRole('heading', { name: originalTitle, exact: true });
  await first.click();
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('l');
  const before = '.heading-title { font-size: var(--text-l); }';
  const after = '.heading-title { font-size: var(--text-xl); }';
  await page.locator('#content .view-line').filter({ hasText: originalTitle }).click();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(page.locator('#content .view-lines')).toContainText(before);
  await page.locator('#content .view-line').filter({ hasText: '.heading-title' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText(after);
  await expect(page.locator('#content .view-lines')).toContainText(after);

  const later = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  const migrated = generatedSizeSource(
    sizedSource.replace('style="color: navy; font-size: 2.25rem; line-height: var(--leading, 1.1)"', 'style="color: navy; line-height: var(--leading, 1.1)"'),
    '<h1 id="hero" style="color: navy; line-height: var(--leading, 1.1)">', 'heading-title', 'l',
  );
  const externalSource = migrated.replace(before, after);
  const laterStart = externalSource.indexOf('Start with something simple.');
  await expect(later).toHaveAttribute('data-ase', `src/pages/index.astro:${laterStart}:${laterStart + 'Start with something simple.'.length}`);
  await later.click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h5');
  await expect(frame.getByRole('heading', { level: 5, name: 'Start with something simple.', exact: true })).toBeVisible();
  const expected = externalSource
    .replace('<h2 data-note="a > b">Start with something simple.</h2>', '<h5 data-note="a > b">Start with something simple.</h5>');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});
