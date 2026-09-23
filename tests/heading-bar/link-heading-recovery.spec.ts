import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, originalTitle, preparePreview } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('long heading, button destination and label survive reload without losing a later heading mapping', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const title = 'A much longer title that still belongs to this page.';
  const label = 'Read the journal';
  const button = frame.locator('a.button');

  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await expect(frame.getByRole('heading', { name: title, exact: true })).toBeVisible();

  await button.click();
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  const destination = page.getByRole('textbox', { name: 'Destination', exact: true });
  await destination.fill('/journal');
  await destination.press('Enter');
  await expect(button).toHaveAttribute('href', '/journal');
  await button.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(label);
  await page.keyboard.press('Enter');
  await expect(button).toHaveText(label);
  await expect(page.locator('#content .view-lines')).toContainText('href="/journal">Read the journal</a>');

  await page.reload();
  await expect(frame.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(frame.locator('a.button')).toHaveText(label);
  await expect(frame.locator('a.button')).toHaveAttribute('href', '/journal');

  const later = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await later.click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  await expect(frame.getByRole('heading', { level: 3, name: 'Start with something simple.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(frame.getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true })).toBeVisible();

  const expected = originalSource
    .replace(originalTitle, title)
    .replace('href="/about/"', 'href="/journal"')
    .replace('Get to know this project ↗', label);
  expect(await editor.submittedSource()).toBe(expected);
  expect(independentlyBuild(expected)).toContain(`<h1>${title}</h1>`);
  expect(independentlyBuild(expected)).toContain(`href="/journal">${label}</a>`);
  expect(editor.errors).toEqual([]);
});
