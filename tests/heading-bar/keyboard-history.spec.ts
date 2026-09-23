import { test, expect } from '@playwright/test';
import { openEditor, originalSource, originalTitle, preparePreview } from './fixture';
import type { Locator } from '@playwright/test';

async function selectText(element: Locator, text: string) {
  await element.evaluate((host, wanted) => {
    const node = [...host.childNodes].find(child => child.textContent?.includes(wanted));
    if (!node) throw new Error('Text not found');
    const start = node.textContent!.indexOf(wanted);
    const range = document.createRange();
    range.setStart(node, start); range.setEnd(node, start + wanted.length);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, text);
}

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('canvas history shortcuts use the active source model', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  let heading = frame.getByRole('heading', { level: 3, name: originalTitle, exact: true });
  await heading.click();

  await page.keyboard.press('Control+z');
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeFocused();
  await page.keyboard.press('Control+Shift+z');
  heading = frame.getByRole('heading', { level: 3, name: originalTitle, exact: true });
  await expect(heading).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeFocused();
  await page.keyboard.press('Control+y');
  await expect(heading).toBeFocused();
  await page.keyboard.press('Meta+z');
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeFocused();
  await page.keyboard.press('Meta+Shift+z');
  await expect(heading).toBeFocused();

  expect(await editor.submittedSource()).toBe(originalSource.replace(`<h1>${originalTitle}</h1>`, `<h3>${originalTitle}</h3>`));
  expect(editor.errors).toEqual([]);
});

test('toolbar shortcuts use history while a native input keeps its own Undo', async ({ page }) => {
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  const level = page.getByRole('combobox', { name: 'Heading level', exact: true });
  await level.selectOption('h4');
  await page.keyboard.press('Control+z');
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(frame.getByRole('heading', { level: 4, name: originalTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).focus();
  await page.keyboard.press('Control+z');
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(frame.getByRole('heading', { level: 4, name: originalTitle, exact: true })).toBeVisible();

  await frame.getByRole('link', { name: 'Get to know this project', exact: false }).click();
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  const link = page.getByRole('textbox', { name: 'Destination', exact: true });
  await link.fill('/draft-target/');
  await page.keyboard.press('Control+z');
  await expect(frame.getByRole('heading', { level: 4, name: originalTitle, exact: true })).toBeVisible();
});

test('a canvas shortcut waits for queued typing and undoes the whole typing group', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').locator('h1');
  await heading.click();
  await selectText(heading, 'little');
  await page.keyboard.type('tiny');
  await page.keyboard.press('Control+z');
  await expect(heading).toHaveText(originalTitle);
  await page.keyboard.press('Control+Shift+z');
  await expect(heading).toHaveText('A tiny space on the web, updated.');
  expect(await editor.submittedSource()).toBe(originalSource.replace('A little space', 'A tiny space'));
  expect(editor.errors).toEqual([]);
});
