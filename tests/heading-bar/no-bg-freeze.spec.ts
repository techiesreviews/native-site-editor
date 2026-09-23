import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { openEditor, preparePreview, previewFile, rebuildPreview, sourcePath } from './fixture';

// The exact live draft the user hit (read-only capture): two same-label buttons
// in a .button-wrapper (draft: secondary + no-bg), and the shared `.btn,.button`
// rule with its font-size declaration removed in the draft. See
// .scratch/no-bg-status/progress.md (Root evidence).
const live = JSON.parse(readFileSync(resolve('tests/heading-bar/data/no-bg-live-draft.json'), 'utf8')) as {
  'src/pages/index.astro': { content: string; original: string };
  'src/styles/site.css': { content: string; original: string };
};
const pageOriginal = live['src/pages/index.astro'].original;
const pageDraft = live['src/pages/index.astro'].content;
const cssPath = 'src/styles/site.css';
const cssDraft = live['src/styles/site.css'].content;
const cssOriginal = live['src/styles/site.css'].original;

test.setTimeout(90_000);
test.beforeEach(() => { preparePreview(pageOriginal, undefined, { [cssPath]: cssOriginal }); });

const draftOrigin = 'https://draft-no-bg-heading-starter.lexvd.workers.dev';

test('captured 2-button draft: edit-bar secondary→Link (no-bg) stays a covered live patch', async ({ page }) => {
  preparePreview(pageDraft, undefined, { [cssPath]: cssDraft });
  let postCount = 0;
  let activeRevision = '';
  const revisionChecks = new Map<string, number>();

  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    postCount++;
    activeRevision = String(postCount).padStart(40, '0');
    const files = request.postDataJSON().files as { path: string; content: string }[];
    const pageFile = files.find(f => f.path === sourcePath)?.content ?? pageOriginal;
    const cssFile = files.find(f => f.path === cssPath)?.content;
    rebuildPreview(pageFile, cssFile ? { [cssPath]: cssFile } : {});
    return route.fulfill({
      status: 202,
      json: {
        status: 'building',
        revision: activeRevision,
        previewUrl: `${draftOrigin}/`,
        revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
        sources: Object.fromEntries(files.map(f => [f.path, f.content])),
      },
    });
  });
  await page.route(`${draftOrigin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const checks = (revisionChecks.get(activeRevision) ?? 0) + 1;
      revisionChecks.set(activeRevision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-no-bg' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    return file ? route.fulfill(file) : route.fulfill({ status: 404, body: 'Not found' });
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');

  const frame = page.frameLocator('.preview-frame--after');
  const buttons = frame.locator('.button-wrapper a');
  await expect(buttons.nth(0)).toHaveClass(/(^| )secondary( |$)/, { timeout: 30_000 });
  await expect(buttons.nth(1)).toHaveClass(/(^| )no-bg( |$)/);
  const exactDraftPosts = postCount;
  const exactDraftSrc = await page.locator('.preview-frame--after').getAttribute('src');

  // The claimed action: select the FIRST button (secondary) and switch it to Link
  // (→ no-bg) in the edit bar. This must be a covered live patch, not a rebuild.
  await buttons.nth(0).click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  const style = toolbar.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('secondary');
  await style.selectOption('link');
  await expect(buttons.nth(0)).toHaveClass(/(^| )no-bg( |$)/);

  // Cross the full github-actions debounce window; a covered edit schedules no build.
  await page.waitForTimeout(11_000);
  expect(postCount).toBe(exactDraftPosts);
  await expect(style).toBeVisible();
  await expect(page.locator('.preview-frame--after')).toHaveAttribute('src', exactDraftSrc!);
  await expect(page.locator('#content .view-lines')).toContainText('class="button no-bg"');

  await buttons.nth(1).click();
  await expect(style).toHaveValue('link');
  await expect(buttons.nth(1)).toHaveClass(/(^| )no-bg( |$)/);

  await frame.getByRole('heading', { name: 'Start with something simple.', exact: true }).click();
  await expect(toolbar.getByRole('combobox', { name: 'Heading level', exact: true })).toHaveValue('h2');
  expect(editor.errors).toEqual([]);
});

// The freeze: setting a button's size to Default removes the `font-size`
// declaration from the shared `.btn,.button` class rule. That removal is already
// applied live by the class-style patch, but classFontSizeEditCovered only
// recognised value CHANGES (equal declaration counts), so a removal (or later
// re-addition) fell through to a full draft rebuild — the toolbar drop + iframe
// reload the user saw. A covered removal must keep the single adopted build.
test('adopted draft: button size Default → XL → Link stays covered with Undo/Redo', async ({ page }) => {
  preparePreview(pageDraft, undefined, { [cssPath]: cssOriginal });
  let postCount = 0;
  let activeRevision = '';
  const revisionChecks = new Map<string, number>();

  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    postCount++;
    activeRevision = String(postCount).padStart(40, '0');
    const files = request.postDataJSON().files as { path: string; content: string }[];
    const pageFile = files.find(f => f.path === sourcePath)?.content ?? pageOriginal;
    const cssFile = files.find(f => f.path === cssPath)?.content;
    rebuildPreview(pageFile, cssFile ? { [cssPath]: cssFile } : {});
    return route.fulfill({
      status: 202,
      json: {
        status: 'building',
        revision: activeRevision,
        previewUrl: `${draftOrigin}/`,
        revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
        sources: Object.fromEntries(files.map(f => [f.path, f.content])),
      },
    });
  });
  await page.route(`${draftOrigin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const checks = (revisionChecks.get(activeRevision) ?? 0) + 1;
      revisionChecks.set(activeRevision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: activeRevision, ref: 'refs/heads/editor/draft-no-bg' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    return file ? route.fulfill(file) : route.fulfill({ status: 404, body: 'Not found' });
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');

  const frame = page.frameLocator('.preview-frame--after');
  const buttons = frame.locator('.button-wrapper a');
  await expect(buttons.nth(0)).toHaveClass(/(^| )secondary( |$)/, { timeout: 30_000 });
  const adoptPosts = postCount;
  const adoptedSrc = await page.locator('.preview-frame--after').getAttribute('src');

  // Select the first button and set its size to Default; this removes the shared
  // `.btn,.button { font-size: var(--text-m) }` declaration.
  await buttons.nth(0).click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  const size = toolbar.getByRole('combobox', { name: 'Text size', exact: true });
  await expect(size).toHaveValue('m');
  await size.selectOption('default');

  // The class-style patch removes it live; no rebuild should be scheduled.
  await page.waitForTimeout(11_000);
  expect(postCount).toBe(adoptPosts);
  await expect(size).toBeVisible();
  await expect(page.locator('.preview-frame--after')).toHaveAttribute('src', adoptedSrc!);
  await expect(page.locator('#content-secondary .view-lines, #content .view-lines').first()).not.toContainText('font-size: var(--text-m)');

  await size.selectOption('xl');
  await expect.poll(() => buttons.nth(0).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(20);
  await page.waitForTimeout(11_000);
  expect(postCount).toBe(adoptPosts);
  await expect(page.locator('.preview-frame--after')).toHaveAttribute('src', adoptedSrc!);

  const style = toolbar.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('secondary');
  await style.selectOption('link');
  await expect(buttons.nth(0)).toHaveClass(/(^| )no-bg( |$)/);
  await page.waitForTimeout(11_000);
  expect(postCount).toBe(adoptPosts);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(buttons.nth(0)).toHaveClass(/(^| )secondary( |$)/);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(buttons.nth(0)).toHaveClass(/(^| )no-bg( |$)/);
  await page.waitForTimeout(11_000);
  expect(postCount).toBe(adoptPosts);
  await expect(page.locator('.preview-frame--after')).toHaveAttribute('src', adoptedSrc!);

  await buttons.nth(1).click();
  await expect(style).toHaveValue('link');
  await buttons.nth(0).click();
  await expect(style).toHaveValue('link');

  const laterHeading = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await laterHeading.click();
  const headingLevel = toolbar.getByRole('combobox', { name: 'Heading level', exact: true });
  await expect(headingLevel).toHaveValue('h2');
  await headingLevel.selectOption('h3');
  await expect(frame.getByRole('heading', { level: 3, name: 'Start with something simple.', exact: true })).toBeVisible();

  const files = await editor.submittedFiles();
  expect(files.find(file => file.path === cssPath)?.content).toContain('font-size: var(--text-xl);');
  expect(files.find(file => file.path === sourcePath)?.content).toContain('class="button no-bg"');
  expect(files.find(file => file.path === sourcePath)?.content).toContain('<h3>Start with something simple.</h3>');
  expect(editor.errors).toEqual([]);
});
