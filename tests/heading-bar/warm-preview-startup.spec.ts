import { test, expect } from '@playwright/test';
import { openEditor, preparePreview } from './fixture';

test.setTimeout(60_000);
test.beforeEach(() => { preparePreview(); });

test('warm startup failure is visible and has no dead Retry button', async ({ page }) => {
  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET') return route.fulfill({
      status: 503,
      json: { available: false, mode: 'warm', error: 'Astro dev server exited.' },
    });
    return route.fulfill({ status: 500, json: { error: 'Unexpected POST' } });
  });

  await page.reload();
  await expect(page.locator('.preview-status')).toContainText('Preview failed', { timeout: 15_000 });
  await expect(page.locator('.preview-status')).toContainText('Warm draft preview failed. Astro dev server exited. Fix the local checkout, then reload the editor. Restart npm run dev:ui if the runtime still fails.');
  await expect(page.locator('.preview-status').getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  await expect(page.locator('#notice')).toBeVisible();
  expect(editor.errors).toEqual([]);
});

test('ordinary unavailable draft-preview probe keeps committed preview path quiet', async ({ page }) => {
  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 404, json: { available: false, reason: 'not configured' } });
    return route.fulfill({ status: 500, json: { error: 'Unexpected POST' } });
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  await expect(page.locator('.preview-status')).toContainText('Preview ready');
  await expect(page.locator('.preview-status')).not.toContainText('Preview failed');
  expect(editor.errors).toEqual([]);
});
