import { test, expect } from '@playwright/test';
import { openEditor, originalSource, originalTitle, preparePreview } from './fixture';
import type { Locator } from '@playwright/test';

async function selectText(heading: Locator, text: string) {
  await heading.evaluate((element, wanted) => {
    const node = [...element.childNodes].find(child => child.textContent?.includes(wanted));
    if (!node) throw new Error('Text not found');
    const start = node.textContent!.indexOf(wanted);
    const range = document.createRange();
    range.setStart(node, start); range.setEnd(node, start + wanted.length);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, text);
}

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('header Undo and Redo apply one heading-level edit without moving focus into the code pane', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  let heading = frame.getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  heading = frame.getByRole('heading', { level: 3, name: originalTitle, exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeVisible();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await frame.locator('p.lead').click();
  await expect(frame.locator('[contenteditable]')).toHaveCount(1);
  await expect(frame.locator('p.lead')).toBeFocused();
  expect(await editor.submittedSource()).toBe(originalSource.replace(`<h1>${originalTitle}</h1>`, `<h3>${originalTitle}</h3>`));
  expect(editor.errors).toEqual([]);
});

test('each visual size and formatting action is one header Undo step', async ({ page }) => {
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xs');
  await expect(heading).toHaveClass('heading-title');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading).not.toHaveAttribute('class', /heading-title/);
  await heading.click();
  await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('default');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(heading).toHaveClass('heading-title');
  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading.locator('strong')).toHaveCount(0);
  await expect(heading).toHaveClass('heading-title');
});

test('reload keeps the draft but starts with no claimed Undo or Redo history', async ({ page }) => {
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h4');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.locator('#explorer-toggle').click();
  await page.getByRole('button', { name: 'src', exact: true }).click();
  await page.getByRole('button', { name: 'pages', exact: true }).click();
  await page.getByRole('button', { name: 'about.astro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.locator('#explorer-toggle').click();
  await page.getByRole('button', { name: 'index.astro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.reload();
  await expect(frame.getByRole('heading', { level: 4, name: originalTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
});

test('Undoing Bold from the header preserves the canvas selection for continued typing', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { level: 1 });
  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading.locator('strong')).toHaveCount(0);
  await expect(heading).toBeFocused();
  await expect.poll(() => heading.evaluate(() => getSelection()?.toString())).toBe('little');
  await page.keyboard.type('tiny');
  await expect(heading).toHaveText('A tiny space on the web, updated.');
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
  expect(await editor.submittedSource()).toBe(originalSource.replace('A little space', 'A tiny space'));
  expect(editor.errors).toEqual([]);
});
