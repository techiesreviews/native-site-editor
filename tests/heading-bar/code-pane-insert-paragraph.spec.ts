import { test, expect, type Page } from '@playwright/test';
import { openEditor, originalSource, originalTitle, preparePreview } from './fixture';

const buttonLine = '    <a class="button" href="/about/">Get to know this project ↗</a>';
const inserted = '<p>Fast inserted paragraph</p>';

test.setTimeout(60_000);
test.skip(process.env.VITE_BROWSER_STRUCTURAL_PREVIEW !== '1', 'Requires browser structural preview');
test.beforeEach(() => { preparePreview(); });

async function replaceFocusedSource(page: Page, source: string, visibleText: string) {
  await page.keyboard.press('ControlOrMeta+A');
  await page.evaluate((text) => navigator.clipboard.writeText(text), source);
  const started = performance.now();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.locator('#content .view-lines')).toContainText(visibleText);
  return started;
}

async function setSource(page: Page, source: string, visibleText: string) {
  const frame = page.frameLocator('.preview-frame--after');
  if (await page.locator('#content .view-lines').count() === 0) {
    await frame.locator('h1').click();
    await expect(page.locator('#content .view-lines')).toContainText(originalTitle);
  }
  await page.locator('#content .view-lines').click();
  return replaceFocusedSource(page, source, visibleText);
}

test('code-pane inserted paragraph updates current iframe without rebuild navigation or scroll jump', async ({ page }) => {
  const editor = await openEditor(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5180' });
  let draftPosts = 0;
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'POST') {
      draftPosts++;
      return route.fulfill({ status: 422, json: { error: 'Unexpected draft rebuild for structural fast path.' } });
    }
    return route.fulfill({ json: { available: true, mode: 'local', previewOrigin: 'https://draft-preview.local' } });
  });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');

  const frame = page.frameLocator('.preview-frame--after');
  const frameElement = page.locator('.preview-frame--after');
  await expect(frame.getByRole('heading', { name: originalTitle, exact: true })).toBeVisible();
  const initialFrameSrc = await frameElement.getAttribute('src');
  let iframeNavigations = 0;
  page.on('framenavigated', (navigated) => {
    if (navigated.parentFrame() === page.mainFrame()) iframeNavigations++;
  });
  await frame.locator('body').evaluate(() => scrollTo(0, 120));
  const beforeScrollY = await frame.locator('body').evaluate(() => scrollY);
  expect(beforeScrollY).toBeGreaterThan(0);

  const source = originalSource.replace(buttonLine, `${buttonLine}\n    ${inserted}`);
  const started = await setSource(page, source, 'Fast inserted paragraph');
  await expect(frame.getByText('Fast inserted paragraph', { exact: true })).toBeVisible({ timeout: 2_000 });
  const inputToVisibleMs = performance.now() - started;
  await page.waitForTimeout(500);

  const afterFrameSrc = await frameElement.getAttribute('src');
  const afterScrollY = await frame.locator('body').evaluate(() => scrollY);
  expect(draftPosts).toBe(0);
  expect(iframeNavigations).toBe(0);
  expect(afterFrameSrc).toBe(initialFrameSrc);
  expect(Math.abs(afterScrollY - beforeScrollY)).toBeLessThanOrEqual(2);
  console.log(JSON.stringify({ inputToVisibleMs, draftPosts, iframeNavigations, beforeScrollY, afterScrollY, frameSrc: afterFrameSrc }));
  expect(editor.errors).toEqual([]);
});
