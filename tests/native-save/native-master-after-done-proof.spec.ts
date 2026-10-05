import { expect, test } from '@playwright/test';
import { storedDrafts } from './drafts';
import { fixtureKind } from './fixture-contract';

test('creating a saved-section master then Done keeps one-step Undo and Redo valid without Code typing', async ({ page, baseURL }) => {
  test.skip(process.env.STATIC_SECTIONS_FIXTURE !== 'native', 'Runs on the native static starter (STATIC_SECTIONS_FIXTURE=native).');
  expect(fixtureKind()).toBe('native-static');
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html');
  await expect(page.locator('#status')).toContainText('Up to date with main');
  expect(await storedDrafts(page)).toEqual([]);
  // No selected element: the Add picker naturally appends the Intro to main.
  await page.getByRole('complementary', { name: 'Page structure' }).getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add to the page' }).getByRole('option', { name: /^Intro HTML$/ }).click();
  await expect(page.locator('#status')).toContainText('Added Intro');
  const afterAdd = await storedDrafts(page);
  expect(afterAdd.map(draft => draft.path)).toEqual(['.editor/page-builder.json', 'index.html', 'styles/sections.css']);
  await page.getByRole('dialog', { name: 'Add to the page' }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add to the page' })).toBeHidden();
  const structure = page.getByRole('complementary', { name: 'Page structure' });
  await structure.getByRole('treeitem', { name: /^Section Section heading/ }).locator('.page-structure__label').click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar' });
  await expect(bar.locator('.edit-bar__label')).toContainText('Intro');
  const grip = page.getByRole('separator', { name: 'Resize code pane', exact: true });
  if (await grip.getAttribute('aria-valuenow') !== '0') await grip.click();
  await expect(grip).toHaveAttribute('aria-valuetext', 'Code hidden');
  await bar.getByRole('button', { name: 'Edit Intro component', exact: true }).click();
  const banner = page.getByRole('region', { name: 'Saved section master' });
  await expect(banner).toBeVisible();
  await expect(page.locator('#primary-title')).toHaveText('.editor/sections/intro.html');
  const afterMake = await storedDrafts(page);
  expect(afterMake.map(draft => draft.path)).toEqual(['.editor/page-builder.json', '.editor/sections/intro.html', 'index.html', 'styles/sections.css']);
  // Opening and closing are the only master interactions: no Code mutation.
  await banner.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#primary-title')).toHaveText('index.html');
  await expect(grip).toHaveAttribute('aria-valuetext', 'Code hidden');
  expect(await storedDrafts(page)).toEqual(afterMake);
  await page.locator('.code-editor__undo').first().click();
  await test.info().attach('after-Done-Undo.json', { body: JSON.stringify({ status: await page.locator('#status').textContent(), drafts: await storedDrafts(page), afterAdd, afterMake }, null, 2), contentType: 'application/json' });
  await expect.poll(() => storedDrafts(page)).toEqual(afterAdd);
  await page.locator('.code-editor__redo').first().click();
  await expect.poll(() => storedDrafts(page)).toEqual(afterMake);
  // Creation and Add remain two independent compound history steps.
  await page.locator('.code-editor__undo').first().click();
  await expect.poll(() => storedDrafts(page)).toEqual(afterAdd);
  await page.locator('.code-editor__undo').first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  await page.locator('.code-editor__redo').first().click();
  await expect.poll(() => storedDrafts(page)).toEqual(afterAdd);
  await page.locator('.code-editor__redo').first().click();
  await expect.poll(() => storedDrafts(page)).toEqual(afterMake);
  expect(errors).toEqual([]);
});
