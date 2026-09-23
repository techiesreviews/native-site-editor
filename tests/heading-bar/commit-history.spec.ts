import { test, expect } from '@playwright/test';
import { openEditor, originalTitle, preparePreview, revision, sourcePath } from './fixture';

const older = 'd'.repeat(40);
const oldest = 'e'.repeat(40);
const commit = (sha: string, message: string) => ({ sha, message, author: 'Lex', date: '2026-09-19T12:00:00Z', url: `https://github.com/lex/heading-starter/commit/${sha}` });
test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('History stays inside a narrow viewport and its restore controls remain clickable after resize', async ({ page }) => {
  await openEditor(page);
  await page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.route('**/api/history?*', route => route.fulfill({ json: { head: revision, commits: [commit(revision, 'Current heading'), commit(older, 'Previous copy')], nextPage: null } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'History', exact: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 600 });
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      return Boolean(box && box.x >= 15 && box.x + box.width <= width - 15 && box.y >= 15 && box.y + box.height <= 585);
    }).toBe(true);
    await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Restore this file?', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('History lists commits for only the open file and paginates from the same head', async ({ page }) => {
  await openEditor(page);
  await page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true }).click();
  const requests: URL[] = [];
  await page.route('**/api/history?*', route => {
    const url = new URL(route.request().url()); requests.push(url);
    return route.fulfill({ json: { head: revision, commits: url.searchParams.get('page') === '2'
      ? [commit(oldest, 'Create homepage')] : [commit('b'.repeat(40), 'Update heading'), commit(older, 'Previous copy')],
      nextPage: url.searchParams.get('page') === '2' ? null : 2 } });
  });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.locator('.commit-history')).toContainText(sourcePath);
  await expect(page.locator('.commit-history')).toContainText('Previous copy');
  await expect(page.getByRole('button', { name: 'Current version', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Load older commits', exact: true }).click();
  await expect(page.locator('.commit-history')).toContainText('Create homepage');
  expect(requests[0].searchParams.get('path')).toBe(sourcePath);
  expect(requests[1].searchParams.get('head')).toBe(revision);
  expect(requests[1].searchParams.get('page')).toBe('2');
  await page.getByRole('button', { name: 'Restore this version', exact: true }).nth(1).click();
  await expect(page.getByRole('heading', { name: 'Restore this file?', exact: true })).toBeVisible();
  await expect(page.locator('.commit-history')).toContainText('Other files stay unchanged');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.commit-history')).toContainText('Previous copy');
});

test('History preserves a draft, and a rejected restore never replaces its file', async ({ page }) => {
  const editor = await openEditor(page);
  await page.route('**/api/history?*', route => route.fulfill({ json: { head: revision, commits: [commit(revision, 'Current heading'), commit(older, 'Previous copy')], nextPage: null } }));
  const writes: unknown[] = [];
  await page.route('**/api/restore?*', route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { error: 'The branch changed. Refresh history and try again.' } });
  });
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h2');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore this version', exact: true })).toBeDisabled();
  await expect(page.locator('.commit-history')).toContainText('Publish or discard');
  expect(writes).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
  await page.getByRole('button', { name: 'Restore file', exact: true }).click();
  await expect(page.locator('.commit-history')).toContainText('The branch changed');
  expect(writes).toEqual([{ branch: 'main', path: sourcePath, target: older, expectedHead: revision }]);
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeVisible();
  expect(editor.errors).toEqual([]);
});

test('restoring the open file refreshes its source and keeps a stylesheet draft', async ({ page }) => {
  const trees = new Map<string, any>();
  let snapshot: any;
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.pathname === '/api/snapshot') snapshot = await response.json();
    if (url.pathname === '/api/tree') trees.set(url.searchParams.get('sha')!, await response.json());
  });
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.locator('p.lead').click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xl');
  await expect(page.locator('#content-secondary .view-lines')).toContainText('var(--text-xl)');
  const beforeSnapshot = structuredClone(snapshot);
  const src = structuredClone(trees.get(beforeSnapshot.entries.find((entry: any) => entry.path === 'src').sha));
  const pages = structuredClone(trees.get(src.entries.find((entry: any) => entry.path === 'pages').sha));
  const next = 'f'.repeat(40), srcSha = '9'.repeat(40), pagesSha = '8'.repeat(40), blob = '7'.repeat(40);
  beforeSnapshot.commit = next;
  beforeSnapshot.entries.find((entry: any) => entry.path === 'src').sha = srcSha;
  src.entries.find((entry: any) => entry.path === 'pages').sha = pagesSha;
  pages.entries.find((entry: any) => entry.path === 'index.astro').sha = blob;
  let restored = false;
  let body: unknown;
  const { originalSource } = await import('./fixture');
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/history') return route.fulfill({ json: { head: revision, commits: [commit(revision, 'Current heading'), commit(older, 'Earlier heading')], nextPage: null } });
    if (url.pathname === '/api/restore') {
      restored = true; body = route.request().postDataJSON();
      return route.fulfill({ json: { commit: next, branch: 'main', url: `https://github.com/lex/heading-starter/commit/${next}`, unchanged: false } });
    }
    if (restored && url.pathname === '/api/snapshot') return route.fulfill({ json: beforeSnapshot });
    const sha = url.searchParams.get('sha');
    if (restored && url.pathname === '/api/tree' && sha === srcSha) return route.fulfill({ json: src });
    if (restored && url.pathname === '/api/tree' && sha === pagesSha) return route.fulfill({ json: pages });
    if (restored && url.pathname === '/api/file' && sha === blob) return route.fulfill({ json: { content: originalSource.replace(originalTitle, 'Earlier saved heading') } });
    return route.fallback();
  });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
  await page.getByRole('button', { name: 'Restore file', exact: true }).click();
  await expect.poll(() => body).toEqual({ branch: 'main', path: sourcePath, target: older, expectedHead: revision });
  await expect(page.locator('#content .view-lines')).toContainText('Earlier saved heading');
  await expect(page.locator('#content-secondary .view-lines')).toContainText('var(--text-xl)');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
  const drafts = await editor.submittedFiles();
  expect(drafts.map(file => file.path)).toEqual(['src/styles/site.css']);
  expect(drafts[0].content).toContain('font-size: var(--text-xl)');
  expect(editor.errors).toEqual([]);
});
