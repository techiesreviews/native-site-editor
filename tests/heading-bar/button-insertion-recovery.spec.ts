import { mkdirSync } from 'node:fs';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, preparePreview, previewFile, rebuildPreview, sourcePath } from './fixture';

const buttonLine = '    <a class="button" href="/about/">Get to know this project ↗</a>';

type StructuralResult = { ok?: boolean; id?: string };
type PreviewMessage = { type?: string; reason?: string; tag?: string; text?: string; loc?: string };

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5182' });
});

async function enableLocalStructuralPreview(page: Page) {
  let draftPosts = 0;
  await page.addInitScript(() => {
    const target = window as typeof window & { __structuralResults?: StructuralResult[]; __previewMessages?: PreviewMessage[] };
    target.__structuralResults = [];
    target.__previewMessages = [];
    window.addEventListener('message', (event) => {
      const data = event.data as ({ source?: string; type?: string } & StructuralResult) | null;
      if (data?.source !== 'astro-site-editor') return;
      if (data.type === 'structural-preview-result') target.__structuralResults!.push(data);
      if (data.type === 'select' || data.type === 'reject')
        target.__previewMessages!.push({
          type: data.type,
          reason: (data as PreviewMessage).reason,
          tag: (data as PreviewMessage).tag,
          text: (data as PreviewMessage).text,
          loc: (data as PreviewMessage).loc,
        });
    });
  });
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    draftPosts++;
    const files = route.request().postDataJSON().files as { path: string; content: string }[];
    const source = files.find(file => file.path === sourcePath)?.content ?? originalSource;
    rebuildPreview(source);
    return route.fulfill({ json: {
      revision: `button-edit-${draftPosts}`,
      previewUrl: `https://draft-preview.local/drafts/session/button-edit-${draftPosts}/`,
      sources: { [sourcePath]: source },
    } });
  });
  await page.route('https://draft-preview.local/**', route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/drafts\/session\/button-edit-\d+/, '') || '/';
    const served = previewFile(pathname);
    return served ? route.fulfill(served) : route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  return {
    draftPosts: () => draftPosts,
    async previewMessages() {
      return page.evaluate(() =>
        (window as typeof window & { __previewMessages?: PreviewMessage[] }).__previewMessages ?? [],
      );
    },
  };
}

async function selectText(element: Locator, wanted: string) {
  await element.evaluate((root, text) => {
    const start = root.textContent!.indexOf(text);
    if (start < 0) throw new Error('Selection text not found');
    const end = start + text.length;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    const points: { node: Node; offset: number }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent!.length;
      for (const boundary of [start, end].slice(points.length)) {
        if (boundary <= offset + length) points.push({ node, offset: boundary - offset });
        else break;
      }
      offset += length;
    }
    if (points.length !== 2) throw new Error('Selection range not found');
    const selection = getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.setStart(points[0].node, points[0].offset);
    range.setEnd(points[1].node, points[1].offset);
    selection?.addRange(range);
  }, wanted);
}

async function expectNoAdditionalDraftBuild(page: Page, local: Awaited<ReturnType<typeof enableLocalStructuralPreview>>, baselinePosts: number) {
  await page.waitForTimeout(800);
  expect(local.draftPosts()).toBe(baselinePosts);
}

test('existing prepared button remains editable without quick-add control', async ({ page }) => {
  preparePreview();
  const editor = await openEditor(page);
  const local = await enableLocalStructuralPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.locator('.button-wrapper a').first();

  await button.click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar.getByRole('button', { name: 'Add another button', exact: true })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Link', exact: true })).toBeVisible();
  await expect(bar.getByRole('combobox', { name: 'Button style', exact: true })).toBeVisible();

  await selectText(button, 'Get to know this project ↗');
  await page.keyboard.type('Contact us');
  await page.keyboard.press('Enter');
  await button.click();
  await bar.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByLabel('Destination').fill('/contact/');
  await page.getByRole('button', { name: 'Apply', exact: true }).click({ noWaitAfter: true });
  await bar.getByRole('combobox', { name: 'Button style', exact: true }).selectOption('outline');

  await expect(button).toHaveText('Contact us');
  await expect(button).toHaveAttribute('href', '/contact/');
  await expect(button).toHaveClass(/(^| )ghost( |$)/);
  await expect(frame.locator('.button-wrapper a')).toHaveCount(1);
  await expectNoAdditionalDraftBuild(page, local, 0);
  const submitted = await editor.submittedSource();
  expect(submitted).toContain('<a class="button ghost" href="/contact/">Contact us</a>');
  expect(independentlyBuild(submitted)).toContain('Contact us');
  expect(editor.errors).toEqual([]);
});

test('quick-add control is absent for metadata and unsupported source shapes', async ({ page }) => {
  const cases: { name: string; source: string; files?: Record<string, string | null>; target: string }[] = [
    { name: 'valid-metadata', source: originalSource, target: 'Get to know this project ↗' },
    { name: 'missing-slot-metadata', source: originalSource, files: { '.astro-editor/button-slots.json': null }, target: 'Get to know this project ↗' },
    { name: 'missing-style-metadata', source: originalSource, files: { '.astro-editor/button-styles.json': null }, target: 'Get to know this project ↗' },
    { name: 'invalid-style-metadata', source: originalSource, files: { '.astro-editor/button-styles.json': '{' }, target: 'Get to know this project ↗' },
    {
      name: 'ambiguous-parent',
      source: originalSource.replace(
        '<div class="button-wrapper">',
        '<div class="button-wrapper"></div>\n  <div class="button-wrapper">',
      ),
      target: 'Get to know this project ↗',
    },
    {
      name: 'dynamic-parent',
      source: originalSource.replace('<div class="button-wrapper">', '<div class:list={["button-wrapper"]}>'),
      target: 'Get to know this project ↗',
    },
    {
      name: 'dynamic-child',
      source: originalSource.replace(buttonLine, '    <a {...{ class: "button", href: "/about/" }}>Dynamic button</a>'),
      target: 'Dynamic button',
    },
  ];

  for (const item of cases) {
    await test.step(item.name, async () => {
      preparePreview(item.source, undefined, item.files ?? {});
      const editor = await openEditor(page);
      await enableLocalStructuralPreview(page);
      await page.frameLocator('.preview-frame--after').getByText(item.target, { exact: true }).click();
      const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
      await expect(bar.getByRole('button', { name: 'Add another button', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
      expect(editor.errors).toEqual([]);
    });
  }
});

test('button toolbar stays inside a 390px preview without quick-add control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  preparePreview();
  const editor = await openEditor(page);
  await enableLocalStructuralPreview(page);
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(toolbar.getByRole('button', { name: 'Add another button', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Link', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('combobox', { name: 'Button style', exact: true })).toBeVisible();
  const box = await toolbar.boundingBox();
  const pane = await page.locator('.preview-pane').boundingBox();
  expect(box).not.toBeNull();
  expect(pane).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(pane!.x);
  expect(box!.x + box!.width).toBeLessThanOrEqual(pane!.x + pane!.width);
  mkdirSync('.scratch/button-insertion-recovery', { recursive: true });
  await page.screenshot({ path: '.scratch/button-insertion-recovery/toolbar-390-no-add-button.png', fullPage: true });
  expect(editor.errors).toEqual([]);
});
