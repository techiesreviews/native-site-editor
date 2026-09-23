import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test, expect, type Locator } from '@playwright/test';
import { openEditor, originalSource, preparePreview } from './fixture';

const sitePath = 'src/styles/site.css';
const otherPath = 'src/styles/other.css';
const originalSite = readFileSync(`fixtures/astro-starter/${sitePath}`, 'utf8');
const source = originalSource
  .replace("import Layout from '../layouts/Layout.astro';", "import Layout from '../layouts/Layout.astro';\nimport '../styles/other.css';")
  .replace('<p>This is an ordinary Astro site.', '<p class="special">This is an ordinary Astro site.');
const otherCss = '.special { color: maroon; }\n';

async function selectText(element: Locator, wanted: string) {
  await element.evaluate((root, text) => {
    const node = root.firstChild!;
    const start = node.textContent!.indexOf(text);
    if (start < 0) throw new Error(`Text not found: ${text}`);
    getSelection()!.setBaseAndExtent(node, start, node, start + text.length);
    document.dispatchEvent(new Event('selectionchange'));
  }, wanted);
  await expect.poll(() => element.evaluate(() => getSelection()?.toString())).toBe(wanted);
}

test.beforeAll(() => {
  test.setTimeout(120_000);
  preparePreview(source, undefined, { [otherPath]: otherCss });
});

test('Undo remounts the stylesheet that owns history after another element opens a different CSS pane', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const lead = frame.locator('p.lead');
  await lead.click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  await expect(page.locator('#secondary-title')).toHaveText(sitePath);

  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xl');
  await expect(page.locator('#content-secondary .view-lines')).toContainText('font-size: var(--text-xl)');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
  await expect.poll(() => lead.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(19);

  const special = frame.locator('p.special');
  await special.click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  await expect(page.locator('#secondary-title')).toHaveText(otherPath);
  await expect(page.locator('#content-secondary .view-lines')).toContainText('.special { color: maroon; }');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#secondary-title')).toHaveText(sitePath);
  await expect(page.locator('#content-secondary .view-lines')).toContainText('font-size: 19px');
  await expect(lead).toHaveCSS('font-size', '19px');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('#secondary-title')).toHaveText(sitePath);
  await expect(page.locator('#content-secondary .view-lines')).toContainText('font-size: var(--text-xl)');
  await expect.poll(() => lead.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(19);

  const expectedSite = originalSite.replace('font-size: 19px;', 'font-size: var(--text-xl);');
  const submitted = await editor.submittedFiles();
  expect(submitted.map(({ path, content }) => ({ path, content })))
    .toEqual([{ path: sitePath, content: expectedSite }]);
  expect(editor.errors).toEqual([]);
});

test('a delayed stylesheet Undo cannot jump over a newer visual text action', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const lead = frame.locator('p.lead');
  await lead.click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xl');
  await expect.poll(() => lead.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(19);

  const special = frame.locator('p.special');
  await special.click();
  await expect(page.locator('#secondary-title')).toHaveText(otherPath);

  const siteSha = createHash('sha1').update(sitePath).digest('hex');
  let requestHeld!: () => void;
  const held = new Promise<void>(resolve => { requestHeld = resolve; });
  let releaseRead!: () => void;
  const released = new Promise<void>(resolve => { releaseRead = resolve; });
  let intercepted = false;
  await page.route('**/api/file**', async route => {
    const url = new URL(route.request().url());
    if (intercepted || url.searchParams.get('sha') !== siteSha) return route.fallback();
    intercepted = true;
    requestHeld();
    await released;
    await route.fallback();
  });

  const pendingUndo = page.getByRole('button', { name: 'Undo', exact: true }).click();
  await held;
  await special.focus();
  await selectText(special, 'ordinary');
  await page.keyboard.type('everyday');
  await expect(special).toContainText('This is an everyday Astro site.');
  releaseRead();
  await pendingUndo;

  await expect(special).toContainText('This is an everyday Astro site.');
  await expect.poll(() => lead.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(19);
  await expect(page.locator('#content .view-lines')).toContainText('This is an everyday Astro site.');
  expect(editor.errors).toEqual([]);
});
