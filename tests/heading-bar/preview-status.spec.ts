import { test, expect } from '@playwright/test';
import { openEditor, originalSource, preparePreview, previewFile, previewHost, rebuildPreview, sourcePath } from './fixture';

test.setTimeout(80_000);
test.beforeEach(() => { preparePreview(); });

const draftOrigin = 'https://draft-preview-status-heading-starter.lexvd.workers.dev';

// The compact topbar preview-status read-out follows the real draft-preview
// build lifecycle: waiting → building → ready. A live-patched (covered)
// style-only edit never enters a build, so the status stays "Preview ready".
test('topbar preview status shows waiting → building → ready and stays ready for a covered edit', async ({ page }) => {
  const status = page.locator('.preview-status');
  const revisionChecks = new Map<string, number>();
  let postCount = 0;
  let activeRevision = '';

  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    postCount++;
    activeRevision = String(postCount).padStart(40, '0');
    const files = request.postDataJSON().files as { path: string; content: string }[];
    rebuildPreview(files[0]?.content ?? originalSource);
    return route.fulfill({
      status: 202,
      json: {
        status: 'building',
        revision: activeRevision,
        previewUrl: `${draftOrigin}/`,
        revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
        sources: files.length ? { [sourcePath]: files[0].content } : {},
      },
    });
  });
  await page.route(`${draftOrigin}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const checks = (revisionChecks.get(activeRevision) ?? 0) + 1;
      revisionChecks.set(activeRevision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-status' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    return file ? route.fulfill(file) : route.fulfill({ status: 404, body: 'Not found' });
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  // A supported, matching branch preview shows a persistent ready read-out.
  await expect(status).toContainText('Preview ready');

  // A whole-source structural edit is uncovered and forces a real rebuild.
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(originalSource.replace('class="button"', 'class="button secondary"').replace('</Layout>', '<div>Draft build marker</div>\n</Layout>'));

  // Debounce window (10s in github-actions mode) surfaces the waiting state.
  await expect(status).toContainText('Waiting to rebuild…');
  await expect(status).toContainText('Building preview…', { timeout: 12_000 });
  const button = page.frameLocator('.preview-frame--after').locator('a.button').first();
  await expect(button).toHaveClass(/(^| )secondary( |$)/, { timeout: 30_000 });
  await expect(status).toContainText('Preview ready');
  expect(postCount).toBe(1);

  // A covered button-style swap is applied live: no build, status stays ready.
  await button.click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  const style = toolbar.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('secondary');
  await style.selectOption('outline');
  await expect(button).toHaveClass(/(^| )ghost( |$)/);
  // A covered edit schedules no build timer, so it never enters waiting/building.
  // Cross the full github-actions debounce window before claiming no extra POST.
  await page.waitForTimeout(11_000);
  expect(postCount).toBe(1);
  await expect(status).toContainText('Preview ready');
  expect(editor.errors).toEqual([]);
});

test('topbar preview status waits for the draft iframe handshake before ready', async ({ page }) => {
  const status = page.locator('.preview-status');
  const revisionChecks = new Map<string, number>();
  let postCount = 0;
  let activeRevision = '';
  let releaseHtml!: () => void;
  let htmlRequested = false;
  const htmlGate = new Promise<void>(resolve => { releaseHtml = resolve; });

  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    postCount++;
    activeRevision = String(postCount).padStart(40, '0');
    const files = request.postDataJSON().files as { path: string; content: string }[];
    rebuildPreview(files[0]?.content ?? originalSource);
    return route.fulfill({ status: 202, json: {
      status: 'building',
      revision: activeRevision,
      previewUrl: `${draftOrigin}/`,
      revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
      sources: files.length ? { [sourcePath]: files[0].content } : {},
    } });
  });
  await page.route(`${draftOrigin}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const checks = (revisionChecks.get(activeRevision) ?? 0) + 1;
      revisionChecks.set(activeRevision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-status' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    if (file && file.contentType.includes('text/html')) {
      htmlRequested = true;
      await htmlGate;
    }
    return file ? route.fulfill(file) : route.fulfill({ status: 404, body: 'Not found' });
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(originalSource.replace('class="button"', 'class="button secondary"').replace('</Layout>', '<div>Draft build marker</div>\n</Layout>'));

  await expect(status).toContainText('Loading preview…', { timeout: 30_000 });
  await expect.poll(() => htmlRequested).toBe(true);
  await expect(status).not.toContainText('Preview ready', { timeout: 1_000 });
  releaseHtml();
  await expect(status).toContainText('Preview ready', { timeout: 10_000 });
  expect(editor.errors).toEqual([]);
});

test('topbar preview status shows a failure with a retry that rebuilds and recovers', async ({ page }) => {
  const status = page.locator('.preview-status');
  let postCount = 0;
  let activeRevision = '';

  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    postCount++;
    if (postCount === 1) return route.fulfill({ status: 500, json: { error: 'Boom while building' } });
    activeRevision = String(postCount).padStart(40, '0');
    const files = request.postDataJSON().files as { path: string; content: string }[];
    rebuildPreview(files[0]?.content ?? originalSource);
    return route.fulfill({ status: 202, json: {
      status: 'building',
      revision: activeRevision,
      previewUrl: `${draftOrigin}/`,
      revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
      sources: files.length ? { [sourcePath]: files[0].content } : {},
    } });
  });
  await page.route(`${draftOrigin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json')
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-status' }, headers: { 'access-control-allow-origin': '*' } });
    const file = previewFile(url.pathname);
    return file ? route.fulfill(file) : route.fulfill({ status: 404, body: 'Not found' });
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');

  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(originalSource.replace('</Layout>', '<div>Draft build marker</div>\n</Layout>'));

  await expect(status).toContainText('Preview failed', { timeout: 15_000 });
  const retry = status.getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeVisible();
  expect(postCount).toBe(1);
  await retry.click();
  await expect.poll(() => postCount, { timeout: 10_000 }).toBeGreaterThan(1);
  await expect(status).toContainText('Preview ready', { timeout: 30_000 });
  expect(editor.errors).toEqual([]);
});

test('branch preview failure has no Retry and current-revision recheck stays ready', async ({ page }) => {
  const status = page.locator('.preview-status');
  const editor = await openEditor(page);

  await expect(status).toContainText('Preview ready');
  await page.locator('#refresh').evaluate((button) => (button as HTMLButtonElement).click());
  await expect(status).toContainText('Preview ready', { timeout: 15_000 });

  await page.route(`${previewHost}/.astro-editor/revision.json**`, route =>
    route.fulfill({ status: 500, body: 'Broken revision', headers: { 'access-control-allow-origin': '*' } }));
  await page.reload();
  await expect(status).toContainText('Preview failed', { timeout: 15_000 });
  await expect(status.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  expect(editor.errors).toEqual([]);
});
