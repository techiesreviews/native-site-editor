import { test, expect, type Locator } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, originalTitle, preparePreview } from './fixture';

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

test('Bold formats only selected heading text and publishes readable Astro markup', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  await expect(heading).toHaveText(originalTitle);
  await expect(heading).toBeFocused();
  await expect.poll(() => heading.evaluate(() => getSelection()?.toString())).toBe('little');
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: '.scratch/heading-bar/heading-formatting-desktop.png', animations: 'disabled' });
  const expected = originalSource.replace(originalTitle, 'A <strong>little</strong> space on the web, updated.');
  expect(await editor.submittedSource()).toBe(expected);
  expect(independentlyBuild(expected)).toContain('A <strong>little</strong> space on the web, updated.');
  expect(editor.errors).toEqual([]);
});

test('Italic toggles across a bold boundary without changing the other words or their bold formatting', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await selectText(heading, 'little space');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little space');
  await selectText(heading, 'space on');
  const italic = page.getByRole('button', { name: 'Italic', exact: true });
  await italic.click();
  await expect.poll(async () => (await heading.locator('em').allTextContents()).join('')).toBe('space on');
  await expect(italic).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => heading.evaluate(() => getSelection()?.toString())).toBe('space on');
  await italic.click();
  await expect(heading.locator('em')).toHaveCount(0);
  await expect(italic).toHaveAttribute('aria-pressed', 'false');
  await expect(heading.locator('strong')).toHaveText('little space');
  await expect(heading).toHaveText(originalTitle);
  const expected = originalSource.replace(originalTitle, 'A <strong>little space</strong> on the web, updated.');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});

test('each formatting action has one source Undo step and keeps rendered markup in sync', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(heading.locator('strong em')).toHaveText('little');
  const code = page.locator('#content .view-lines');
  await expect(code).toContainText('<h1>A <strong><em>little</em></strong> space on the web, updated.</h1>');
  await page.locator('#content .view-line').filter({ hasText: '<h1>A' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(code).toContainText('<h1>A <strong>little</strong> space on the web, updated.</h1>');
  await expect(heading.locator('em')).toHaveCount(0);
  await expect(heading.locator('strong')).toHaveText('little');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(code).toContainText(`<h1>${originalTitle}</h1>`);
  await expect(heading.locator('strong, em')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(heading.locator('strong')).toHaveText('little');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(heading.locator('strong em')).toHaveText('little');
  expect(editor.errors).toEqual([]);
});

test('formatted text survives a level change, continued typing and both reloads', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  let heading = frame.getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(heading.locator('strong')).toHaveText('little');
  const level = page.getByRole('combobox', { name: 'Heading level', exact: true });
  await level.focus();
  await level.selectOption('h3');
  heading = frame.getByRole('heading', { level: 3, name: originalTitle, exact: true });
  await expect(heading).toBeFocused();
  await expect.poll(() => heading.evaluate(() => getSelection()?.toString())).toBe('little');
  await page.keyboard.type('small');
  heading = frame.getByRole('heading', { level: 3, name: 'A small space on the web, updated.', exact: true });
  await expect(heading.locator('strong')).toHaveText('small');
  await page.keyboard.press('Enter');
  await frame.locator('body').evaluate(() => location.reload());
  await expect(heading.locator('strong')).toHaveText('small');
  await page.reload();
  await expect(heading.locator('strong')).toHaveText('small');
  await heading.click();
  await selectText(heading, 'small');
  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(heading.locator('strong em')).toHaveText('small');
  const expected = originalSource.replace(`<h1>${originalTitle}</h1>`, '<h3>A <strong><em>small</em></strong> space on the web, updated.</h3>');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});

test('formatting one heading keeps a later heading mapped through level changes and Undo', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const first = frame.getByRole('heading', { name: originalTitle, exact: true });
  await first.click();
  await selectText(first, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(first.locator('strong')).toHaveText('little');
  const later = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  await later.click();
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h4');
  await expect(frame.getByRole('heading', { level: 4, name: 'Start with something simple.', exact: true })).toBeVisible();
  await page.locator('#content .view-line').filter({ hasText: '<h4>Start' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(frame.getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true })).toBeVisible();
  await expect(first.locator('strong')).toHaveText('little');
  expect(await editor.submittedSource()).toBe(originalSource.replace(originalTitle, 'A <strong>little</strong> space on the web, updated.'));
  expect(editor.errors).toEqual([]);
});

test('an outside code change to unsupported heading content clears visual formatting without overwriting that source', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await selectText(heading, 'little');
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toBeVisible();
  const changed = originalSource.replace(`<h1>${originalTitle}</h1>`, '<h1>{"External title"}</h1>');
  await page.locator('#content .view-line').filter({ hasText: originalTitle }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('<h1>{"External title"}</h1>');
  await expect(page.locator('#content .view-lines')).toContainText('<h1>{"External title"}</h1>');
  await expect(bar).toBeHidden();
  await heading.click();
  await expect(bar).toBeHidden();
  await expect(heading).not.toHaveAttribute('contenteditable', /.*/);
  await expect(heading.locator('strong, em')).toHaveCount(0);
  expect(await editor.submittedSource()).toBe(changed);
  expect(editor.errors).toEqual([]);
});

for (const sourceKind of ['expression', 'literal'] as const) {
test(`a delayed formatting request rejected by newer ${sourceKind} source rolls back its optimistic preview`, async ({ page }) => {
  // Delay the public iframe message to reproduce a code edit arriving first.
  // Register before application listeners so the source request is truly held.
  await page.addInitScript(() => {
    const state = window as typeof window & { heldFormatting?: MessageEvent; releaseFormatting?: () => void };
    const hold = (event: MessageEvent) => {
      if (event.data?.type !== 'input' || event.data?.format !== true) return;
      event.stopImmediatePropagation();
      state.heldFormatting = event;
      document.documentElement.dataset.formattingHeld = 'true';
    };
    window.addEventListener('message', hold, true);
    state.releaseFormatting = () => {
      window.removeEventListener('message', hold, true);
      const event = state.heldFormatting!;
      window.dispatchEvent(new MessageEvent('message', { data: event.data, origin: event.origin, source: event.source }));
    };
  });
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await selectText(heading, 'little');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-formatting-held', 'true');
  await expect(heading.locator('strong')).toHaveText('little');
  await expect(page.locator('#content .view-lines')).toContainText(`<h1>${originalTitle}</h1>`);
  const externalHeading = sourceKind === 'expression' ? '<h1>{"Newer source wins"}</h1>' : '<h1>Newer source wins</h1>';
  const changed = originalSource.replace(`<h1>${originalTitle}</h1>`, externalHeading);
  await page.locator('#content .view-line').filter({ hasText: originalTitle }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText(externalHeading);
  await expect(page.locator('#content .view-lines')).toContainText(externalHeading);
  await page.evaluate(() => (window as typeof window & { releaseFormatting: () => void }).releaseFormatting());
  await expect(heading.locator('strong, em')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toBeHidden();
  expect(await editor.submittedSource()).toBe(changed);
  expect(editor.errors).toEqual([]);
});
}
