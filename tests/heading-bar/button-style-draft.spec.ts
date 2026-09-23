import { test, expect } from '@playwright/test';
import { openEditor, originalSource, preparePreview, previewFile, rebuildPreview, sourcePath } from './fixture';

test.setTimeout(45_000);
test.beforeEach(() => { preparePreview(); });

test('draft-adopted button style stays selectable without another draft preview POST', async ({ page }) => {
  const editor = await openEditor(page);
  const draftRevision = '8'.repeat(40);
  const draftOrigin = 'https://draft-button-style-heading-starter.lexvd.workers.dev';
  const revisionChecks = new Map<string, number>();
  let postCount = 0;
  const activeRevision = draftRevision;

  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    }
    postCount++;
    const files = request.postDataJSON().files as { path: string; content: string }[];
    if (postCount > 1) return route.fulfill({ status: 500, json: { error: 'Unexpected rebuild after a live button edit' } });
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
  await page.route(`${draftOrigin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const checks = (revisionChecks.get(activeRevision) ?? 0) + 1;
      revisionChecks.set(activeRevision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-button-style', builtAt: '2026-09-23T10:00:00Z' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill(file);
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(originalSource.replace('class="button"', 'class="button secondary"').replace('</Layout>', '<div>Draft build marker</div>\n</Layout>'));
  await expect(page.locator('.preview-summary')).toContainText('Building draft preview', { timeout: 12_000 });
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.locator('a.button').first();
  await expect(button).toHaveClass(/(^| )secondary( |$)/, { timeout: 30_000 });
  await expect(page.locator('.preview-summary')).toContainText('Draft preview ready 8888888');
  expect(postCount).toBe(1);

  const adoptedFrame = await page.locator('.preview-frame--after').getAttribute('src');
  await button.click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  const style = toolbar.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('secondary');
  await style.selectOption('outline');
  await expect(button).toHaveClass(/(^| )ghost( |$)/);
  await expect(style).toBeVisible();
  await style.selectOption('link');
  await expect(button).toHaveClass(/(^| )no-bg( |$)/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(button).toHaveClass(/(^| )ghost( |$)/);
  await expect(style).toHaveValue('outline');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(button).toHaveClass(/(^| )no-bg( |$)/);
  await expect(style).toHaveValue('link');
  await style.selectOption('primary');
  await expect(button).toHaveClass('button');
  await style.selectOption('secondary');
  await expect(button).toHaveClass('button secondary');
  await style.selectOption('outline');
  await expect(button).toHaveClass('button ghost');
  // Cross the controller's debounce window: immediate-only assertions miss
  // rebuilds queued after the iframe class patch has already succeeded.
  await page.waitForTimeout(2500);
  expect(postCount).toBe(1);
  await expect(style).toBeVisible();
  await expect(page.locator('.preview-frame--after')).toHaveAttribute('src', adoptedFrame!);
  await expect(page.locator('#content .view-lines')).toContainText('class="button ghost"');
  expect(editor.errors).toEqual([]);
});

// The covered live-patch path is narrowed to a button-style class swap that may
// carry only a trailing end-of-file whitespace trim. Any other coincident source
// change — here a visible edit to the button label — must still fall through to a
// full draft rebuild, so a second draft-preview POST is issued and the toolbar
// drops to read-only while it builds.
test('a visible source change after a draft-adopted button edit still rebuilds', async ({ page }) => {
  const editor = await openEditor(page);
  const draftOrigin = 'https://draft-button-visible-heading-starter.lexvd.workers.dev';
  const revisions = ['8'.repeat(40), '9'.repeat(40)];
  const revisionChecks = new Map<string, number>();
  let postCount = 0;

  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    const files = request.postDataJSON().files as { path: string; content: string }[];
    const revision = revisions[Math.min(postCount, revisions.length - 1)];
    postCount++;
    if (postCount > 2) return route.fulfill({ status: 500, json: { error: 'Unexpected third rebuild' } });
    rebuildPreview(files[0]?.content ?? originalSource);
    return route.fulfill({
      status: 202,
      json: {
        status: 'building',
        revision,
        previewUrl: `${draftOrigin}/`,
        revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
        sources: files.length ? { [sourcePath]: files[0].content } : {},
      },
    });
  });
  await page.route(`${draftOrigin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const revision = revisions[Math.min(postCount, revisions.length) - 1];
      const checks = (revisionChecks.get(revision) ?? 0) + 1;
      revisionChecks.set(revision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: revision, ref: 'refs/heads/editor/draft-button-visible', builtAt: '2026-09-23T10:00:00Z' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill(file);
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(originalSource.replace('class="button"', 'class="button secondary"').replace('</Layout>', '<div>Draft build marker</div>\n</Layout>'));
  await expect(page.locator('.preview-summary')).toContainText('Building draft preview', { timeout: 12_000 });
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.locator('a.button').first();
  await expect(button).toHaveClass(/(^| )secondary( |$)/, { timeout: 30_000 });
  await expect(page.locator('.preview-summary')).toContainText('Draft preview ready 8888888');
  expect(postCount).toBe(1);

  // A covered button-style switch keeps the single build.
  await button.click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  const style = toolbar.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('secondary');
  await style.selectOption('outline');
  await expect(button).toHaveClass(/(^| )ghost( |$)/);
  await expect(style).toBeVisible();
  expect(postCount).toBe(1);

  // A visible label edit in the code pane is not a covered class swap: it must
  // rebuild, hiding the toolbar until the new draft build is ready.
  await page.locator('#content .view-line').filter({ hasText: 'class="button ghost"' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(
    originalSource
      .replace('class="button"', 'class="button ghost"')
      .replace('Get to know this project', 'Get to know this project now')
      .replace('</Layout>', '<div>Draft build marker</div>\n</Layout>'),
  );
  await expect(page.locator('.preview-summary')).toContainText('Building draft preview', { timeout: 12_000 });
  await expect(toolbar).toBeHidden();
  await expect(page.locator('.preview-summary')).toContainText('Draft preview ready 9999999', { timeout: 30_000 });
  await expect(frame.locator('a.button').first()).toContainText('Get to know this project now');
  expect(postCount).toBe(2);
  expect(editor.errors).toEqual([]);
});
