import { test, expect } from '@playwright/test';
import { openEditor, originalSource, preparePreview, previewFile, rebuildPreview, revision, sourcePath } from './fixture';

test.setTimeout(120_000);
test.beforeEach(() => { preparePreview(); });

test('GitHub Actions draft preview adopts pending build and maps duplicated button, heading and paragraph', async ({ page }) => {
  const editor = await openEditor(page);
  const draftRevision = 'd'.repeat(40);
  const draftOrigin = 'https://draft-dddddd-heading-starter.lexvd.workers.dev';
  let posts = 0;
  const revisionChecks = new Map<string, number>();
  let postedUrl = '';
  let postedFiles: { path: string; content: string }[] = [];
  const postedSnapshots: { path: string; content: string }[][] = [];
  let activeRevision = draftRevision;

  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      expect(url.searchParams.get('repo')).toBe('lex/heading-starter');
      expect(url.searchParams.get('branch')).toBe('main');
      expect(url.searchParams.get('baseCommit')).toBe(revision);
      return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    }
    posts++;
    postedUrl = request.url();
    postedFiles = request.postDataJSON().files;
    postedSnapshots.push(postedFiles);
    activeRevision = draftRevision;
    rebuildPreview(postedFiles[0].content);
    return route.fulfill({
      status: 202,
      json: {
        status: 'building',
        revision: activeRevision,
        previewUrl: `${draftOrigin}/`,
        revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
        sources: postedFiles.length ? { [sourcePath]: postedFiles[0].content } : {},
      },
    });
  });
  await page.route(`${draftOrigin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const checks = (revisionChecks.get(activeRevision) ?? 0) + 1;
      revisionChecks.set(activeRevision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-dddddd', builtAt: '2026-09-22T10:00:00Z' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill(file);
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const frame = page.frameLocator('.preview-frame--after');
  await frame.locator('a.button').first().click();
  await expect(page.locator('#content .view-lines')).toContainText('<a class="button"');
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n  <a class="button" href="/about/">Second button</a>');
  await expect(page.locator('.preview-summary')).toContainText('Building draft preview', { timeout: 12_000 });
  await expect(page.frameLocator('.preview-frame--after').locator('a.button')).toHaveCount(2, { timeout: 30_000 });
  expect(posts).toBe(1);
  expect(new URL(postedUrl).searchParams.get('repo')).toBe('lex/heading-starter');
  expect(postedSnapshots[0][0].path).toBe(sourcePath);
  expect(postedSnapshots[0][0].content).toContain('<a class="button" href="/about/">Second button</a>');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Draft changes', exact: true }).click();
  await page.getByRole('button', { name: 'Show old and new page side by side', exact: true }).click();
  await expect.poll(async () =>
    page.frameLocator('.preview-frame--before').locator('html').evaluate(html => html.hasAttribute('data-ase-readonly')).catch(() => false),
  ).toBe(true);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Draft changes', exact: true }).click();
  await page.getByRole('button', { name: 'Show the current page only', exact: true }).click();

  const secondButton = frame.locator('a.button').nth(1);
  await expect(secondButton).toHaveText('Second button');
  await secondButton.click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toContainText('Button');
  await bar.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByLabel('Destination').fill('/second/');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(secondButton).toHaveAttribute('href', '/second/');

  const heading = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await heading.click();
  await bar.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  await expect(frame.getByRole('heading', { level: 3, name: 'Start with something simple.', exact: true })).toBeVisible();

  const paragraph = frame.locator('section').first().locator('p');
  await paragraph.click();
  await expect(bar).toContainText('Paragraph');
  await bar.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('m');
  await expect(paragraph).toHaveClass('paragraph-text');

  const submitted = await editor.submittedSource();
  expect(submitted).toContain('<a class="button" href="/second/">Second button</a>');
  expect(submitted).toContain('<h3>Start with something simple.</h3>');
  expect(submitted).toContain('class="paragraph-text"');
  expect(editor.errors).toEqual([]);
});

test('GitHub Actions draft preview rebuilds clean overlay after deleting duplicated source', async ({ page }) => {
  const editor = await openEditor(page);
  const draftRevision = '1'.repeat(40);
  const cleanRevision = '2'.repeat(40);
  const draftOrigin = 'https://draft-clean-heading-starter.lexvd.workers.dev';
  let activeRevision = draftRevision;
  const revisionChecks = new Map<string, number>();
  const postedSnapshots: { path: string; content: string }[][] = [];

  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET')
      return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    const files = request.postDataJSON().files as { path: string; content: string }[];
    postedSnapshots.push(files);
    if (files.length) {
      activeRevision = draftRevision;
      rebuildPreview(files[0].content);
    } else {
      activeRevision = cleanRevision;
      rebuildPreview(originalSource);
    }
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
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-clean', builtAt: '2026-09-22T10:00:00Z' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill(file);
  });

  await page.reload();
  const frame = page.frameLocator('.preview-frame--after');
  await frame.locator('a.button').first().click();
  await expect(page.locator('#content .view-lines')).toContainText('<a class="button"');
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n  <a class="button" href="/about/">Second button</a>');
  await expect(frame.locator('a.button')).toHaveCount(2, { timeout: 30_000 });
  await page.locator('#content .view-line').filter({ hasText: 'Second button' }).click();
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await expect(frame.locator('a.button')).toHaveCount(1, { timeout: 30_000 });

  expect(postedSnapshots[0][0].content).toContain('Second button');
  expect(postedSnapshots[1]).toEqual([]);
  await frame.locator('a.button').first().click();
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByLabel('Destination')).toHaveValue('/about/');
  expect(editor.errors).toEqual([]);
});
