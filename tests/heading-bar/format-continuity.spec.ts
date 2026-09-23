import { test, expect, type Locator, type Page } from '@playwright/test';
import { openEditor, originalTitle, preparePreview, sourcePath } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

async function selectText(heading: Locator, text: string) {
  await heading.evaluate((element, selected) => {
    const start = element.textContent!.indexOf(selected);
    if (start < 0) throw new Error('Selection text not found');
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let offset = 0;
    const points: { node: Node; offset: number }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent!.length;
      for (const boundary of [start, start + selected.length].slice(points.length)) {
        if (boundary <= offset + length) points.push({ node, offset: boundary - offset });
        else break;
      }
      offset += length;
      if (points.length === 2) break;
    }
    getSelection()!.setBaseAndExtent(points[0].node, points[0].offset, points[1].node, points[1].offset);
  }, text);
  await expect.poll(() => heading.evaluate(() => getSelection()?.toString())).toBe(text);
}

// Enables the draft-preview capability. A build POST is captured (and left
// pending) so any rebuild is observable; the fix means literal text/rich edits
// must not trigger one.
async function enableDraftPreview(page: Page) {
  const bodies: { files: { path: string; content: string }[] }[] = [];
  const navigations: string[] = [];
  page.on('framenavigated', frame => {
    if (frame.url().includes('draft-preview.local')) navigations.push(frame.url());
  });
  await page.route('**/api/draft-preview', route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    bodies.push(route.request().postDataJSON());
    return new Promise<void>(() => {});
  });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  return { posts: () => bodies.length, bodies, navigations };
}

test('Bold and Italic keep the toolbar and selection without a draft rebuild', async ({ page }) => {
  const editor = await openEditor(page);
  const draft = await enableDraftPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });

  await heading.click();
  await selectText(heading, 'little');
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  await expect(bar).toBeVisible();
  await expect(heading).toBeFocused();

  await selectText(heading, 'little');
  await bar.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(heading.locator('strong em')).toHaveText('little');
  await expect(bar).toBeVisible();

  // Past the 600ms build debounce: no rebuild POST, no draft iframe reload.
  await page.waitForTimeout(800);
  await expect(bar).toBeVisible();
  await expect(page.locator('.preview-summary')).not.toContainText('Building draft preview');
  expect(draft.posts()).toBe(0);
  expect(draft.navigations).toEqual([]);
  expect(editor.errors).toEqual([]);
});

test('visual typing keeps every character without a draft rebuild', async ({ page }) => {
  const editor = await openEditor(page);
  const draft = await enableDraftPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });

  await heading.click();
  await selectText(heading, 'little');
  await page.keyboard.type('several words', { delay: 40 });
  await expect(page.locator('#content .view-lines')).toContainText('several words');
  await expect(frame.getByRole('heading', { name: 'A several words space on the web, updated.', exact: true })).toBeVisible();

  await page.waitForTimeout(800);
  expect(draft.posts()).toBe(0);
  expect(draft.navigations).toEqual([]);
  await expect(page.locator('.preview-summary')).not.toContainText('Building draft preview');
  expect(editor.errors).toEqual([]);
});

test('Undo and Redo of formatting do not reload the draft preview', async ({ page }) => {
  const editor = await openEditor(page);
  const draft = await enableDraftPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });
  const code = page.locator('#content .view-lines');

  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');

  // Undo all the way back to the clean baseline: the reverting diff stays inside
  // the mapped body, so it must not reload either, and Redo must not reload.
  await page.locator('#content .view-line').filter({ hasText: '<h1>A' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(code).toContainText(`<h1>${originalTitle}</h1>`);
  await expect(heading.locator('strong, em')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(heading.locator('strong')).toHaveText('little');

  await page.waitForTimeout(800);
  expect(draft.posts()).toBe(0);
  expect(draft.navigations).toEqual([]);
  await expect(page.locator('.preview-summary')).not.toContainText('Building draft preview');
  expect(editor.errors).toEqual([]);
});

test('an unsupported Astro-expression body still rebuilds the draft preview', async ({ page }) => {
  const editor = await openEditor(page);
  const draft = await enableDraftPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });

  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  await page.waitForTimeout(800);
  expect(draft.posts()).toBe(0);

  // Replacing the heading body with an Astro expression is not representable by a
  // live patch (validTextMarkup rejects it), so it must rebuild.
  await page.locator('#content .view-line').filter({ hasText: 'space on the web' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('<h1>{"Computed heading"}</h1>');
  await expect(page.locator('#content .view-lines')).toContainText('{"Computed heading"}');
  await expect(page.locator('.preview-summary')).toContainText('Building draft preview');
  await expect.poll(() => draft.posts()).toBe(1);
  expect(editor.errors).toEqual([]);
});

test('a structural code edit still rebuilds and its snapshot carries the earlier bold', async ({ page }) => {
  const editor = await openEditor(page);
  const draft = await enableDraftPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });

  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  await page.waitForTimeout(800);
  expect(draft.posts()).toBe(0);

  // A structural edit outside any mapped text body must rebuild from the full
  // snapshot, which by now already carries the bold.
  await page.locator('#content .view-lines').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' ');
  await expect(page.locator('.preview-summary')).toContainText('Building draft preview');
  await expect.poll(() => draft.posts()).toBe(1);
  const overlay = draft.bodies[0].files.find(file => file.path === sourcePath);
  expect(overlay?.content).toContain('<strong>little</strong>');
  expect(editor.errors).toEqual([]);
});
