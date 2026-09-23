import { test, expect } from '@playwright/test';
import { openEditor, originalTitle, preparePreview } from './fixture';
import type { Locator } from '@playwright/test';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

async function selectText(element: Locator, text: string) {
  await element.evaluate((host, wanted) => {
    const node = [...host.childNodes].find(child => child.textContent?.includes(wanted));
    if (!node) throw new Error('Text not found');
    const start = node.textContent!.indexOf(wanted);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + wanted.length);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, text);
}

test('no draft-preview capability keeps visual editing enabled after source edits', async ({ page }) => {
  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', route => route.fulfill({ status: 404, json: { error: 'not available' } }));
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await page.frameLocator('.preview-frame--after').locator('h1').click();
  await page.keyboard.type(' No capability');
  await expect(page.locator('#content .view-lines')).toContainText('No capability');
  await page.frameLocator('.preview-frame--after').locator('h1').click();
  await expect(page.locator('.preview-summary')).toContainText('Editing h1 in src/pages/index.astro');
  expect(editor.errors).toEqual([]);
});

test('moving the caret in a dirty source does not request another draft preview', async ({ page }) => {
  const editor = await openEditor(page);
  let posts = 0;
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    posts++;
    return route.fulfill({ status: 422, json: { error: '[CompilerError] Expected `}` but found `Identifier`\n  Location:\n    /project/src/pages/index.astro:9:9\nbwrap noisy command omitted' } });
  });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await page.locator('#content .view-lines').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await expect(page.locator('.preview-summary')).toContainText('Draft preview failed');
  await expect(page.locator('#notice')).toContainText('Expected `}` but found `Identifier`');
  await expect(page.locator('#notice')).toContainText('src/pages/index.astro:9:9');
  await expect(page.locator('#notice')).not.toContainText('bwrap');
  expect(posts).toBe(1);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(800);
  expect(posts).toBe(1);
  expect(editor.errors).toEqual([]);
});

test('visible draft build errors clear after the next successful draft build', async ({ page }) => {
  const editor = await openEditor(page);
  let posts = 0;
  await page.route('**/api/draft-preview**', async route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    posts++;
    if (posts === 1)
      return route.fulfill({ status: 422, json: { error: 'CompilerError: Unexpected token\nLocation: src/pages/index.astro:9:5\nbwrap --unshare-all astro build' } });
    return route.fulfill({ json: {
      revision: 'draft-success',
      previewUrl: 'https://draft-preview.local/drafts/session/draft-success/',
      sources: { 'src/pages/index.astro': '<h1>Recovered</h1>' },
    } });
  });
  await page.route('https://draft-preview.local/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><h1>Recovered</h1><script>parent.postMessage({source:"astro-site-editor",type:"ready",path:location.pathname,revision:"draft-success",headings:[],links:[]},"*")</script>',
  }));
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await page.locator('#content .view-lines').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await expect(page.locator('#notice')).toContainText('Unexpected token');
  await page.keyboard.type('x');
  await expect(page.locator('#notice')).toBeHidden();
  expect(editor.errors).toEqual([]);
});

test('visual typing keeps accepting characters until the draft build starts', async ({ page }) => {
  const editor = await openEditor(page);
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    return new Promise<void>(() => {});
  });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const heading = page.frameLocator('.preview-frame--after').locator('h1');
  await heading.click();
  await selectText(heading, 'little');
  await page.keyboard.type('several words', { delay: 50 });
  await expect(page.locator('#content .view-lines')).toContainText('several words');
  expect(editor.errors).toEqual([]);
});

for (const result of ['pending', 'error'] as const) {
  test(`stale visual input cannot mutate source while draft preview is ${result}`, async ({ page }) => {
    const editor = await openEditor(page);
    let buildResolve: ((value: unknown) => void) | undefined;
    await page.route('**/api/draft-preview**', async route => {
      if (route.request().method() === 'GET')
        return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
      if (result === 'pending')
        return new Promise<void>(resolve => { buildResolve = resolve; });
      return route.fulfill({ status: 422, json: { error: 'Build failed' } });
    });
    await page.reload();
    await expect(page.locator('.preview-summary')).toContainText('same as main');
    const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
    await heading.click();
    const stale = await heading.evaluate(element => ({
      loc: element.getAttribute('data-ase'),
      expected: element.textContent,
      path: location.pathname,
      revision: new URL(location.href).searchParams.get('astro-editor-rev'),
    }));
    await page.locator('#content .view-lines').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ');
    await expect(page.locator('.preview-summary')).toContainText(result === 'pending' ? 'Building draft preview' : 'Draft preview failed');
    await heading.evaluate((_element, message) => {
      window.parent.postMessage({
        source: 'astro-site-editor',
        type: 'input',
        path: message.path,
        revision: message.revision,
        loc: message.loc,
        expected: message.expected,
        text: 'STALE INPUT APPLIED',
        tag: 'h1',
      }, '*');
    }, stale);
    await page.waitForTimeout(150);
    await expect(page.locator('#content .view-lines')).not.toContainText('STALE INPUT APPLIED');
    buildResolve?.(undefined);
    expect(editor.errors).toEqual([]);
  });
}
