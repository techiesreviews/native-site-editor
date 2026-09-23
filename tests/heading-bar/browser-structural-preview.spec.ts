import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, originalTitle, preparePreview, previewFile, rebuildPreview } from './fixture';
import { generatedSizeSource } from './expected-size';

test.beforeEach(() => { test.setTimeout(120_000); preparePreview(); });

const sourcePath = 'src/pages/index.astro';
const buttonLine = '    <a class="button" href="/about/">Get to know this project ↗</a>';
const firstSection = '<section><h2>Start with something simple.</h2><p>This is an ordinary Astro site. Its pages, layout, and styles are yours to change.</p></section>';

type StructuralResult = { ok?: boolean; id?: string };

function bodyStart(source: string, body: string, occurrence = 0) {
  let start = -1;
  for (let index = 0; index <= occurrence; index++) {
    start = source.indexOf(body, start + 1);
    expect(start).toBeGreaterThanOrEqual(0);
  }
  return start;
}

function bodyLoc(source: string, body: string, occurrence = 0) {
  const start = bodyStart(source, body, occurrence);
  return `${sourcePath}:${start}:${start + body.length}`;
}

async function expectBodyMapping(locator: Locator, source: string, body: string, occurrence = 0) {
  const start = bodyStart(source, body, occurrence);
  const loc = `${sourcePath}:${start}:${start + body.length}`;
  await expect(locator).toHaveAttribute('data-ase', loc);
  const mapped = await locator.evaluate((element) => {
    const match = element.getAttribute('data-ase')?.match(/^(.+):(\d+):(\d+)$/);
    return match ? { start: Number(match[2]), end: Number(match[3]), text: element.textContent } : undefined;
  });
  expect(mapped).toEqual({ start, end: start + body.length, text: body });
  expect(source.slice(mapped!.start, mapped!.end)).toBe(body);
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

async function setSource(page: Page, source: string, visibleText: string) {
  if (await page.locator('#content .view-lines').count() === 0) {
    await page.frameLocator('.preview-frame--after').locator('h1').click();
    await expect(page.locator('#content .view-lines')).toContainText(originalTitle);
  }
  await page.locator('#content .view-lines').click();
  await replaceFocusedSource(page, source, visibleText);
}

async function replaceFocusedSource(page: Page, source: string, visibleText: string) {
  await page.keyboard.press('ControlOrMeta+A');
  await page.evaluate((text) => navigator.clipboard.writeText(text), source);
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.locator('#content .view-lines')).toContainText(visibleText);
}

async function enableLocalStructuralPreview(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5181' });
  let draftPosts = 0;
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'POST') draftPosts++;
    return route.fulfill({ json: { available: true, mode: 'local' } });
  });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  await page.evaluate(() => {
    const target = window as typeof window & {
      __structuralResults?: StructuralResult[];
    };
    target.__structuralResults = [];
    window.addEventListener('message', (event) => {
      const data = event.data as ({ source?: string; type?: string } & StructuralResult) | null;
      if (data?.source === 'astro-site-editor' && data.type === 'structural-preview-result')
        target.__structuralResults!.push(data);
    });
  });
  return {
    draftPosts: () => draftPosts,
    async resultCount() {
      return page.evaluate(() =>
        (window as typeof window & { __structuralResults?: StructuralResult[] }).__structuralResults?.length ?? 0,
      );
    },
    async expectNextStructuralResult(previousCount: number, ok: boolean) {
      await expect.poll(() => page.evaluate(({ count, expected }) => {
        const results = (window as typeof window & { __structuralResults?: StructuralResult[] }).__structuralResults ?? [];
        return results.length > count && results.at(-1)?.ok === expected;
      }, { count: previousCount, expected: ok })).toBe(true);
    },
  };
}

async function frameNonce(page: Page) {
  return page.frameLocator('.preview-frame--after').locator('html').evaluate((element) => {
    const target = element as HTMLElement & { dataset: DOMStringMap & { structuralNonce?: string } };
    target.dataset.structuralNonce ??= crypto.randomUUID();
    return target.dataset.structuralNonce;
  });
}

async function expectFrameUnchangedAndNoDraftBuild(page: Page, local: Awaited<ReturnType<typeof enableLocalStructuralPreview>>, nonce: string) {
  await page.waitForTimeout(800);
  expect(local.draftPosts()).toBe(0);
  await expect.poll(() => frameNonce(page)).toBe(nonce);
}

test('supported literal add/delete/move updates DOM, mappings, source and Publish without draft build', async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await openEditor(page);
  const local = await enableLocalStructuralPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const frameElement = page.locator('.preview-frame--after');
  const initialFrameSrc = (await frameElement.getAttribute('src')) ?? '';
  const initialNonce = await frameNonce(page);

  const withDuplicate = originalSource.replace(buttonLine, `${buttonLine}\n    <a class="button" href="/about/">Get to know this project ↗</a>`);
  let resultCount = await local.resultCount();
  const duplicateStarted = performance.now();
  await setSource(page, withDuplicate, 'Get to know this project');
  await local.expectNextStructuralResult(resultCount, true);
  const duplicateLatency = performance.now() - duplicateStarted;
  await expect(frame.locator('a.button')).toHaveCount(2);
  await expectBodyMapping(frame.locator('a.button').nth(1), withDuplicate, 'Get to know this project ↗', 1);
  await expectBodyMapping(frame.getByRole('heading', { name: 'Start with something simple.', exact: true }), withDuplicate, 'Start with something simple.');
  await frame.locator('a.button').nth(1).click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toContainText('Button');

  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByLabel('Destination').fill('/second/');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(frame.locator('a.button').nth(1)).toHaveAttribute('href', '/second/');
  const afterHref = withDuplicate.replace(`${buttonLine}\n    <a class="button" href="/about/">Get to know this project ↗</a>`, `${buttonLine}\n    <a class="button" href="/second/">Get to know this project ↗</a>`);
  await expectBodyMapping(frame.getByRole('heading', { name: 'Start with something simple.', exact: true }), afterHref, 'Start with something simple.');
  await frame.locator('a.button').nth(1).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Read second');
  await page.keyboard.press('Enter');
  await expect(frame.locator('a.button').nth(1)).toHaveText('Read second');
  await expect(frame.locator('a.button').first()).toHaveText('Get to know this project ↗');
  const afterButtonEdits = afterHref.replace(
    '<a class="button" href="/second/">Get to know this project ↗</a>',
    '<a class="button" href="/second/">Read second</a>',
  );

  const withParagraph = afterButtonEdits.replace(firstSection,
    '<section><h2>Start with something simple.</h2><p>Another paragraph</p><p>This is an ordinary Astro site. Its pages, layout, and styles are yours to change.</p></section>');
  resultCount = await local.resultCount();
  const paragraphStarted = performance.now();
  await setSource(page, withParagraph, 'Another paragraph');
  await local.expectNextStructuralResult(resultCount, true);
  const paragraphLatency = performance.now() - paragraphStarted;
  const originalParagraph = 'This is an ordinary Astro site. Its pages, layout, and styles are yours to change.';
  await expectBodyMapping(
    frame.locator('section').first().locator('p', { hasText: originalParagraph }),
    withParagraph,
    originalParagraph,
  );
  const sameLengthParagraph = 'B'.repeat(originalParagraph.length);
  const withSameLengthMiddleParagraph = withParagraph.replace(
    `<p>Another paragraph</p><p>${originalParagraph}</p>`,
    `<p>Another paragraph</p><p>${sameLengthParagraph}</p><p>${originalParagraph}</p>`,
  );
  resultCount = await local.resultCount();
  await setSource(page, withSameLengthMiddleParagraph, sameLengthParagraph);
  await local.expectNextStructuralResult(resultCount, true);
  await expectBodyMapping(
    frame.locator('section').first().locator('p', { hasText: originalParagraph }),
    withSameLengthMiddleParagraph,
    originalParagraph,
  );
  const removedSameLengthMiddleParagraph = withSameLengthMiddleParagraph.replace(`<p>${sameLengthParagraph}</p>`, '');
  resultCount = await local.resultCount();
  await setSource(page, removedSameLengthMiddleParagraph, originalParagraph);
  await local.expectNextStructuralResult(resultCount, true);
  const laterHeading = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await laterHeading.scrollIntoViewIfNeeded();
  await laterHeading.click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h3');
  await expect(frame.getByRole('heading', { level: 3, name: 'Start with something simple.', exact: true })).toBeVisible();
  const insertedParagraph = frame.locator('section').first().locator('p', { hasText: 'Another paragraph' });
  await insertedParagraph.scrollIntoViewIfNeeded();
  await insertedParagraph.click();
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xs');
  await expect(frame.locator('section').first().locator('p', { hasText: 'Another paragraph' })).toHaveClass('paragraph-text');
  const withHeadingLevel = withParagraph.replace('<h2>Start with something simple.</h2>', '<h3>Start with something simple.</h3>');
  const withParagraphSize = generatedSizeSource(withHeadingLevel, '<p>', 'paragraph-text', 'xs');

  const moved = withParagraphSize.replace(
    '<p class="eyebrow">A WORK IN PROGRESS</p>\n  <h1>A little space on the web, updated.</h1>\n  <p class="lead">A place for ideas, experiments, and things worth sharing.</p>',
    '<h1>A little space on the web, updated.</h1>\n  <p class="eyebrow">A WORK IN PROGRESS</p>\n  <p class="lead">A place for ideas, experiments, and things worth sharing.</p>',
  );
  resultCount = await local.resultCount();
  await setSource(page, moved, 'Read second');
  await local.expectNextStructuralResult(resultCount, true);
  await expect(frame.locator('h1')).toHaveAttribute('data-ase', bodyLoc(moved, originalTitle));

  const deleted = moved.replace('\n    <a class="button" href="/about/">Get to know this project ↗</a>', '');
  resultCount = await local.resultCount();
  await setSource(page, deleted, 'Read second');
  await local.expectNextStructuralResult(resultCount, true);
  await expect(frame.locator('a.button')).toHaveCount(1);
  await expect(frame.locator('a.button')).toHaveText('Read second');
  await expectBodyMapping(frame.getByRole('heading', { name: 'Start with something simple.', exact: true }), deleted, 'Start with something simple.');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(frame.locator('a.button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(frame.locator('a.button')).toHaveCount(1);

  const expected = deleted;
  expect(await frameElement.getAttribute('src')).toBe(initialFrameSrc);
  await expectFrameUnchangedAndNoDraftBuild(page, local, initialNonce);
  expect(await editor.submittedSource()).toBe(expected);
  expect(independentlyBuild(expected)).toContain('Read second');
  mkdirSync('.scratch/browser-structural-preview', { recursive: true });
  writeFileSync('.scratch/browser-structural-preview/latency.json', JSON.stringify({
    samplesMs: [duplicateLatency, paragraphLatency],
    note: 'Measured from code source replacement to structural ack plus visible/selectable preview in Playwright.',
  }, null, 2));
  expect(editor.errors).toEqual([]);
});

test('button insertion control is absent even for valid explicit slot metadata', async ({ page }) => {
  const editor = await openEditor(page);
  await enableLocalStructuralPreview(page);
  const frame = page.frameLocator('.preview-frame--after');

  await frame.locator('a.button').first().click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar.getByRole('button', { name: 'Link', exact: true })).toBeVisible();
  await expect(bar.getByRole('combobox', { name: 'Button style', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Add another button', exact: true })).toHaveCount(0);
  await expect(frame.locator('.button-wrapper a')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  expect(editor.errors).toEqual([]);
});

test('button insertion control stays hidden without valid explicit slot metadata', async ({ page }) => {
  preparePreview(originalSource, undefined, { '.astro-editor/button-slots.json': null });
  const editor = await openEditor(page);
  await enableLocalStructuralPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.locator('a.button').first().click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar.getByRole('button', { name: 'Add another button', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  expect(editor.errors).toEqual([]);
});

test('rapid supported source edits settle on newest DOM', async ({ page }) => {
  const editor = await openEditor(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5181' });
  let draftPosts = 0;
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    draftPosts++;
    const files = route.request().postDataJSON().files as { path: string; content: string }[];
    const source = files.find(file => file.path === sourcePath)?.content ?? '';
    rebuildPreview(source);
    return route.fulfill({ json: {
      revision: `rapid-${draftPosts}`,
      previewUrl: `https://draft-preview.local/drafts/session/rapid-${draftPosts}/`,
      sources: { [sourcePath]: source },
    } });
  });
  await page.route('https://draft-preview.local/**', route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/drafts\/session\/rapid-\d+/, '') || '/';
    const served = previewFile(pathname);
    return served ? route.fulfill(served) : route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const frame = page.frameLocator('.preview-frame--after');
  const one = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Warm one</button>`);
  const two = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Warm two</button>\n    <p>Newest paragraph</p>`);

  await setSource(page, one, 'Warm one');
  await setSource(page, two, 'Newest paragraph');
  await expect(frame.getByRole('button', { name: 'Warm two', exact: true })).toBeVisible();
  await expect(frame.getByText('Newest paragraph', { exact: true })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Warm one', exact: true })).toHaveCount(0);
  expect(await editor.submittedSource()).toBe(two);
  expect(editor.errors).toEqual([]);
});

test('supported heading paragraph and native button add move delete stay local and selectable', async ({ page }) => {
  test.setTimeout(120_000);
  const editor = await openEditor(page);
  const local = await enableLocalStructuralPreview(page);
  const frame = page.frameLocator('.preview-frame--after');
  const frameElement = page.locator('.preview-frame--after');
  const initialFrameSrc = (await frameElement.getAttribute('src')) ?? '';
  const initialNonce = await frameNonce(page);
  const samplesMs: number[] = [];

  async function apply(source: string, visible: string, rendered: Locator) {
    const count = await local.resultCount();
    if (await page.locator('#content .view-lines').count() === 0) {
      await frame.locator('h1').click();
      await expect(page.locator('#content .view-lines')).toContainText(originalTitle);
    }
    await page.locator('#content .view-lines').click();
    const started = performance.now();
    await replaceFocusedSource(page, source, visible);
    await local.expectNextStructuralResult(count, true);
    await expect(rendered).toBeVisible();
    await expect.poll(() => frame.locator('html').evaluate((element) =>
      element.hasAttribute('data-ase-readonly'),
    )).toBe(false);
    samplesMs.push(performance.now() - started);
  }

  const withHeading = originalSource.replace(
    '<h1>A little space on the web, updated.</h1>',
    '<h1>A little space on the web, updated.</h1>\n  <h4>Fresh heading</h4>',
  );
  await apply(withHeading, 'Fresh heading', frame.getByRole('heading', { name: 'Fresh heading', exact: true }));
  await expectBodyMapping(frame.getByRole('heading', { name: 'Fresh heading', exact: true }), withHeading, 'Fresh heading');
  await frame.getByRole('heading', { name: 'Fresh heading', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toContainText('Heading');

  const movedHeading = withHeading.replace(
    '  <p class="eyebrow">A WORK IN PROGRESS</p>\n  <h1>A little space on the web, updated.</h1>\n  <h4>Fresh heading</h4>',
    '  <h4>Fresh heading</h4>\n  <p class="eyebrow">A WORK IN PROGRESS</p>\n  <h1>A little space on the web, updated.</h1>',
  );
  await apply(movedHeading, 'Fresh heading', frame.getByRole('heading', { name: 'Fresh heading', exact: true }));
  await expectBodyMapping(frame.getByRole('heading', { name: 'Fresh heading', exact: true }), movedHeading, 'Fresh heading');

  const withoutHeading = movedHeading.replace('  <h4>Fresh heading</h4>\n', '');
  await apply(withoutHeading, 'A WORK IN PROGRESS', frame.locator('p.eyebrow'));
  await expect(frame.getByRole('heading', { name: 'Fresh heading', exact: true })).toHaveCount(0);

  const withParagraph = withoutHeading.replace(buttonLine, `${buttonLine}\n    <p>Fresh paragraph</p>`);
  await apply(withParagraph, 'Fresh paragraph', frame.getByText('Fresh paragraph', { exact: true }));
  await expectBodyMapping(frame.getByText('Fresh paragraph', { exact: true }), withParagraph, 'Fresh paragraph');
  await frame.getByText('Fresh paragraph', { exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toContainText('Paragraph');

  const movedParagraph = withParagraph.replace(
    `${buttonLine}\n    <p>Fresh paragraph</p>`,
    `    <p>Fresh paragraph</p>\n${buttonLine}`,
  );
  await apply(movedParagraph, 'Fresh paragraph', frame.getByText('Fresh paragraph', { exact: true }));
  await expectBodyMapping(frame.getByText('Fresh paragraph', { exact: true }), movedParagraph, 'Fresh paragraph');

  const withoutParagraph = movedParagraph.replace('    <p>Fresh paragraph</p>\n', '');
  await apply(withoutParagraph, 'Get to know this project', frame.locator('a.button').first());
  await expect(frame.getByText('Fresh paragraph', { exact: true })).toHaveCount(0);

  const withButton = withoutParagraph.replace(buttonLine, `${buttonLine}\n    <button>Native action</button>`);
  await apply(withButton, 'Native action', frame.getByRole('button', { name: 'Native action', exact: true }));
  await expectBodyMapping(frame.getByRole('button', { name: 'Native action', exact: true }), withButton, 'Native action');
  await frame.getByRole('button', { name: 'Native action', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toContainText('Button');

  const movedButton = withButton.replace(
    `${buttonLine}\n    <button>Native action</button>`,
    `    <button>Native action</button>\n${buttonLine}`,
  );
  await apply(movedButton, 'Native action', frame.getByRole('button', { name: 'Native action', exact: true }));
  await expectBodyMapping(frame.getByRole('button', { name: 'Native action', exact: true }), movedButton, 'Native action');

  const withoutButton = movedButton.replace('    <button>Native action</button>\n', '');
  await apply(withoutButton, 'Get to know this project', frame.locator('a.button').first());
  await expect(frame.getByRole('button', { name: 'Native action', exact: true })).toHaveCount(0);

  expect(await frameElement.getAttribute('src')).toBe(initialFrameSrc);
  await expectFrameUnchangedAndNoDraftBuild(page, local, initialNonce);
  expect(withoutButton).toBe(originalSource);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  mkdirSync('.scratch/browser-structural-preview', { recursive: true });
  writeFileSync('.scratch/browser-structural-preview/latency.json', JSON.stringify({
    samplesMs: samplesMs.slice(0, 5),
    allSamplesMs: samplesMs,
    note: 'Measured after the code pane is focused, from Monaco source replacement start to fresh structural ack, visible rendered target, and readonly cleared; old ack count is captured before each replacement.',
  }, null, 2));
  expect(editor.errors).toEqual([]);
});

test('stale delayed structural ack cannot unlock editing after Undo restores original source', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as typeof window & { __heldStructuralAck?: { data: unknown; origin: string } };
    window.addEventListener('message', (event) => {
      const data = event.data as { source?: string; type?: string } | null;
      if (data?.source === 'astro-site-editor' && data.type === 'structural-preview-result' && !target.__heldStructuralAck) {
        target.__heldStructuralAck = { data, origin: event.origin };
        event.stopImmediatePropagation();
      }
    }, true);
  });
  const editor = await openEditor(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5181' });
  const frame = page.frameLocator('.preview-frame--after');

  const withButton = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Stale ack button</button>`);
  await setSource(page, withButton, 'Stale ack button');
  await expect(frame.getByRole('button', { name: 'Stale ack button', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    Boolean((window as typeof window & { __heldStructuralAck?: unknown }).__heldStructuralAck),
  )).toBe(true);
  await expect.poll(() => frame.locator('html').evaluate((element) => element.hasAttribute('data-ase-readonly'))).toBe(true);
  await page.locator('#content .view-lines').click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('#content .view-lines')).not.toContainText('Stale ack button');

  await page.evaluate(() => {
    const target = window as typeof window & { __heldStructuralAck?: { data: unknown; origin: string } };
    const held = target.__heldStructuralAck;
    const source = document.querySelector<HTMLIFrameElement>('.preview-frame--after')?.contentWindow;
    if (!held || !source) throw new Error('No held structural ack');
    window.dispatchEvent(new MessageEvent('message', { data: held.data, origin: held.origin, source }));
  });
  await frame.getByRole('button', { name: 'Stale ack button', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toBeHidden();
  await expect.poll(() => frame.locator('html').evaluate((element) => element.hasAttribute('data-ase-readonly'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  expect(editor.errors).toEqual([]);
});

test('unsupported elements keep DOM identity and unsupported source edits fall back read-only', async ({ page }) => {
  const editor = await openEditor(page);
  let draftPosts = 0;
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    draftPosts++;
    return route.fulfill({ status: 422, json: { error: 'CompilerError: unsupported proof fallback' } });
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5181' });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const frame = page.frameLocator('.preview-frame--after');
  await frame.locator('section.media img').first().evaluate((element) => ((element as HTMLElement).dataset.identity = 'kept'));
  const withButton = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Safe button</button>`);
  await setSource(page, withButton, 'Safe button');
  await expect(frame.getByRole('button', { name: 'Safe button', exact: true })).toBeVisible();
  await expect.poll(() => frame.locator('section.media img').first().evaluate((element) => (element as HTMLElement).dataset.identity)).toBe('kept');

  const unsupported = withButton.replace('<Image src={gradient} alt="A soft gradient" width={64} height={40} />', '<Image src={gradient} alt="Changed gradient" width={64} height={40} />');
  await setSource(page, unsupported, 'Changed gradient');
  await expect(page.locator('.preview-summary')).toContainText('Draft preview failed');
  await expect(page.locator('#notice')).toContainText('unsupported proof fallback');
  await frame.getByRole('button', { name: 'Safe button', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toBeHidden();
  expect(draftPosts).toBe(1);
  expect(editor.errors).toEqual([]);
});

test('fallback rebuild recovers after invalid source', async ({ page }) => {
  const editor = await openEditor(page);
  let draftPosts = 0;
  await page.route('**/api/draft-preview**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, previewOrigin: 'https://draft-preview.local' } });
    draftPosts++;
    const files = route.request().postDataJSON().files as { path: string; content: string }[];
    const source = files.find(file => file.path === sourcePath)?.content ?? '';
    if (source.includes('<p>{broken}</p>'))
      return route.fulfill({ status: 422, json: { error: 'CompilerError: broken expression' } });
    rebuildPreview(source);
    return route.fulfill({ json: {
      revision: `draft-${draftPosts}`,
      previewUrl: `https://draft-preview.local/drafts/session/draft-${draftPosts}/`,
      sources: { [sourcePath]: source },
    } });
  });
  await page.route('https://draft-preview.local/**', route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/drafts\/session\/draft-\d+/, '') || '/';
    const served = previewFile(pathname);
    return served ? route.fulfill(served) : route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5181' });
  await page.reload();
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  const invalid = originalSource.replace('<p class="lead">A place for ideas, experiments, and things worth sharing.</p>', '<p>{broken}</p>');
  await setSource(page, invalid, '{broken}');
  await expect(page.locator('.preview-summary')).toContainText('Draft preview failed');
  const recovered = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Recovered build</button>`);
  await setSource(page, recovered, 'Recovered build');
  await expect(page.frameLocator('.preview-frame--after').getByRole('button', { name: 'Recovered build', exact: true })).toBeVisible();
  expect(draftPosts).toBeGreaterThanOrEqual(2);
  expect(await editor.submittedSource()).toBe(recovered);
  expect(editor.errors).toEqual([]);
});
