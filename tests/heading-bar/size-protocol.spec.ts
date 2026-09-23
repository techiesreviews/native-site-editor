import { test, expect } from '@playwright/test';
import { openEditor, originalSource, originalTitle, preparePreview, revision, sourcePath } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('a size range outside the selected heading cannot replace other source', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await expect(page.locator('.preview-summary')).toContainText('Editing h1 in src/pages/index.astro');
  const body = originalSource.indexOf(originalTitle);
  const open = originalSource.lastIndexOf('h1', body);
  const close = body + originalTitle.length + 2;
  await page.evaluate(({ body, open, close, text, path, revision }) => {
    const frame = document.querySelector<HTMLIFrameElement>('.preview-frame--after')!;
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: { source: 'astro-site-editor', type: 'select', path: '/', revision,
        loc: `${path}:${body}:${body + text.length}`, tag: 'h1', text,
        heading: { level: 'h1', open: `${path}:${open}:${open + 2}`, close: `${path}:${close}:${close + 2}`,
          size: { editable: true, value: 'default', insert: `${path}:0:0`, available: ['xs'] } },
      },
    }));
  }, { body, open, close, text: originalTitle, path: sourcePath, revision });
  const size = page.getByRole('combobox', { name: 'Text size', exact: true });
  // The boundary may reject the message outright or reject its attempted edit.
  if (await size.isEnabled()) {
    const option = size.locator('option[value="xs"]');
    if (!(await option.isDisabled())) {
      await size.selectOption('xs');
      await expect(page.locator('.preview-summary')).toContainText('The text style changed.');
    }
  }
  await heading.click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h2');
  await expect(page.frameLocator('.preview-frame--after').getByRole('heading', { level: 2, name: originalTitle, exact: true })).toBeVisible();
  expect(await editor.submittedSource()).toBe(originalSource.replace(`<h1>${originalTitle}</h1>`, `<h2>${originalTitle}</h2>`));
  expect(editor.errors).toEqual([]);
});
