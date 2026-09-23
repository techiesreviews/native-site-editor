import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { openEditor, originalSource, preparePreview, previewFile, rebuildPreview, sourcePath } from './fixture';

const cssPath = 'src/styles/site.css';
const originalCss = readFileSync(`fixtures/astro-starter/${cssPath}`, 'utf8');

test.setTimeout(60_000);
test.beforeEach(() => { preparePreview(); });

// Wires the mocked github-actions draft-preview endpoint. `state.allowed` caps
// permitted POSTs; an extra one returns 500 so an unexpected rebuild fails the
// test. github-actions rebuilds debounce 10s, so the immediate freeze signal is
// the summary dropping to "Building draft preview…" and the toolbar hiding — a
// covered live edit must instead keep "Draft preview ready".
async function adoptDraft(page: Page, draftOrigin: string) {
  const draftRevision = '8'.repeat(40);
  const revisionChecks = new Map<string, number>();
  const state = { posts: 0, allowed: 1, bodies: [] as { path: string; content: string }[][] };

  await page.route('**/api/draft-preview**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: true, mode: 'github-actions' } });
    state.posts++;
    const files = request.postDataJSON().files as { path: string; content: string }[];
    state.bodies.push(files);
    if (state.posts > state.allowed) return route.fulfill({ status: 500, json: { error: 'Unexpected draft rebuild' } });
    rebuildPreview(files.find(file => file.path === sourcePath)?.content ?? originalSource,
      Object.fromEntries(files.filter(file => file.path !== sourcePath).map(file => [file.path, file.content])));
    return route.fulfill({
      status: 202,
      json: {
        status: 'building',
        revision: draftRevision,
        previewUrl: `${draftOrigin}/`,
        revisionUrl: `${draftOrigin}/.astro-editor/revision.json`,
        sources: Object.fromEntries(files.map(file => [file.path, file.content])),
      },
    });
  });
  await page.route(`${draftOrigin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') {
      const checks = (revisionChecks.get(draftRevision) ?? 0) + 1;
      revisionChecks.set(draftRevision, checks);
      if (checks === 1) return route.fulfill({ status: 404, body: 'Not built yet', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ json: { sha: draftRevision, ref: 'refs/heads/editor/draft-button-size', builtAt: '2026-09-23T10:00:00Z' }, headers: { 'access-control-allow-origin': '*' } });
    }
    const file = previewFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill(file);
  });

  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');

  // Adopt a draft build with an unrelated structural edit.
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  await page.locator('#content .view-line').filter({ hasText: '<a class="button"' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(originalSource.replace('</Layout>', '<div>Draft build marker</div>\n</Layout>'));
  await expect(page.locator('.preview-summary')).toContainText('Building draft preview', { timeout: 12_000 });
  await expect(page.locator('.preview-summary')).toContainText('Draft preview ready 8888888', { timeout: 30_000 });
  expect(state.posts).toBe(1);
  return state;
}

// A class-rule font-size edit is applied live by syncClassStyles, so repeated
// size changes, their Undo/Redo, and a post-reload edit must keep the preview
// "ready" — never dropping to a pending rebuild (the freeze) — and issue no
// extra draft-preview POST.
test('repeated button text sizes stay live without a pending rebuild, across reload', async ({ page }) => {
  const draftOrigin = 'https://draft-button-size-repeat-heading-starter.lexvd.workers.dev';
  const editor = await openEditor(page);
  const state = await adoptDraft(page, draftOrigin);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.locator('a.button').first();
  const summary = page.locator('.preview-summary');
  const adoptedFrame = await page.locator('.preview-frame--after').getAttribute('src');

  await button.click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  const size = toolbar.getByRole('combobox', { name: 'Text size', exact: true });
  const font = () => button.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const baseFont = await font();

  // Three successive size changes; each is a live class-style patch that leaves
  // the preview ready and the toolbar usable.
  for (const [option, floor] of [['4xl', baseFont + 10], ['2xl', baseFont + 4], ['xl', baseFont + 2]] as const) {
    await size.selectOption(option);
    await expect.poll(font).toBeGreaterThan(floor);
    await expect(size).toHaveValue(option);
    // A pending rebuild would hide the toolbar and show "Building draft preview".
    await expect(toolbar).toBeVisible();
    await expect(summary).not.toContainText('Building draft preview');
  }

  // Undo/Redo of the last change stay live.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(size).toHaveValue('2xl');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(size).toHaveValue('xl');

  // No pending rebuild ever appeared and no POST was issued.
  await page.waitForTimeout(2000);
  await expect(toolbar).toBeVisible();
  await expect(summary).not.toContainText('Building draft preview');
  expect(state.posts).toBe(1);
  await expect(page.locator('.preview-frame--after')).toHaveAttribute('src', adoptedFrame!);
  await expect(page.locator('#content-secondary .view-lines')).toContainText('font-size: var(--text-xl)');

  // Reloading the isolated Playwright page restores the browser draft and
  // rebuilds it (an expected context-change rebuild). A further size edit on the
  // restored draft stays live: ready, no additional POST.
  state.allowed = 10;
  await page.reload();
  await expect(summary).toContainText('Draft preview ready 8888888', { timeout: 30_000 });
  const postsAfterReload = state.posts;
  const restoredButton = page.frameLocator('.preview-frame--after').locator('a.button').first();
  await restoredButton.click();
  const restoredSize = page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('combobox', { name: 'Text size', exact: true });
  await expect(restoredSize).toHaveValue('xl');
  await restoredSize.selectOption('4xl');
  await expect.poll(() => restoredButton.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(baseFont + 10);
  await expect(restoredSize).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toBeVisible();
  await expect(summary).not.toContainText('Building draft preview');
  expect(state.posts).toBe(postsAfterReload);
  expect(editor.errors).toEqual([]);
});

// The covered path is confined to class-rule font-size values. A coincident
// non-font-size CSS change is not represented by the live patch and must fall
// back to a full draft rebuild (pending state, then a new POST whose snapshot
// carries the change).
test('a non-font-size CSS edit after a draft-adopted size change still rebuilds', async ({ page }) => {
  const draftOrigin = 'https://draft-button-size-fallback-heading-starter.lexvd.workers.dev';
  const editor = await openEditor(page);
  const state = await adoptDraft(page, draftOrigin);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.locator('a.button').first();
  const summary = page.locator('.preview-summary');
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });

  await button.click();
  const size = toolbar.getByRole('combobox', { name: 'Text size', exact: true });
  const baseFont = await button.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await size.selectOption('4xl');
  await expect.poll(() => button.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(baseFont + 10);
  await expect(toolbar).toBeVisible();
  await expect(summary).not.toContainText('Building draft preview');
  expect(state.posts).toBe(1);

  // Replace the stylesheet with a non-font-size declaration change (keeping the
  // current 4xl size). This is not a covered class font-size edit, so it must
  // drop to a pending rebuild and issue a new POST.
  state.allowed = 2;
  const nextCss = originalCss
    .replace('font-size: var(--text-m);', 'font-size: var(--text-4xl);')
    .replace('color: white;', 'color: black;');
  expect(nextCss).not.toBe(originalCss);
  await page.locator('#content-secondary .view-line').filter({ hasText: 'font-size: var(--text-4xl)' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(nextCss);
  await expect(summary).toContainText('Building draft preview', { timeout: 12_000 });
  await expect(toolbar).toBeHidden();
  await expect.poll(() => state.posts, { timeout: 15_000 }).toBe(2);
  await expect(summary).toContainText('Draft preview ready 8888888', { timeout: 30_000 });
  // The rebuild's full snapshot carries the non-font-size change.
  const rebuiltCss = state.bodies[1].find(file => file.path === cssPath)?.content;
  expect(rebuiltCss).toContain('color: black;');
  expect(rebuiltCss).toContain('font-size: var(--text-4xl);');
  expect(editor.errors).toEqual([]);
});
