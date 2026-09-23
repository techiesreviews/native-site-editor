import { test, expect, type Locator, type Page } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, preparePreview } from './fixture';

const richButton = '<a class="button" href="/about/"><strong>Get</strong> to know this project ↗</a>';
const nativeButton = '<button>Native action</button>';
const source = originalSource
  .replace('<a class="button" href="/about/">Get to know this project ↗</a>', richButton)
  .replace('</Layout>', `  ${nativeButton}\n</Layout>`);

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(source); });

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
      if (points.length === 2) break;
    }
    getSelection()!.setBaseAndExtent(points[0].node, points[0].offset, points[1].node, points[1].offset);
    document.dispatchEvent(new Event('selectionchange'));
  }, wanted);
  await expect.poll(() => element.evaluate(() => getSelection()?.getRangeAt(0).toString())).toBe(wanted);
}

async function focusPrimarySourceLine(page: Page, text: string) {
  await page.locator('#content .view-line').filter({ hasText: text }).click();
  await expect.poll(() => page.evaluate(() => ({
    role: document.activeElement?.getAttribute('role'),
    label: document.activeElement?.getAttribute('aria-label'),
    className: (document.activeElement as HTMLElement | null)?.className,
  }))).toMatchObject({ role: 'textbox', label: 'File source' });
}

test('button text supports formatting, size, href recovery, Undo, Redo and reload', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.getByRole('link', { name: 'Get to know this project ↗', exact: true });
  await button.click();

  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toContainText('Button');
  await expect(page.getByRole('combobox', { name: 'Heading level', exact: true })).toBeHidden();
  await expect(button.locator('strong')).toHaveText('Get');

  await selectText(button, 'know');
  await bar.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(button.locator('em')).toHaveText('know');
  await expect(page.locator('#content .view-lines')).toContainText('<strong>Get</strong> to <em>know</em> this project ↗');
  await focusPrimarySourceLine(page, '<a class="button"');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(button.locator('em')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(button.locator('em')).toHaveText('know');

  await button.click();
  await selectText(button, 'Get to know this project ↗');
  await bar.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect.poll(async () => (await button.locator('strong').allTextContents()).join('')).toBe('Get to know this project ↗');
  await expect(button.locator('strong em')).toHaveText('know');
  await expect(page.locator('#content .view-lines')).toContainText('<strong>Get to </strong><strong><em>know</em></strong><strong> this project ↗</strong>');
  await focusPrimarySourceLine(page, '<a class="button"');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(button.locator('strong')).toHaveText('Get');
  await expect(button.locator('em')).toHaveText('know');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => (await button.locator('strong').allTextContents()).join('')).toBe('Get to know this project ↗');

  const paddingBefore = await button.evaluate(element => {
    const style = getComputedStyle(element);
    return { top: parseFloat(style.paddingTop), left: parseFloat(style.paddingLeft) };
  });
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('4xl');
  await expect.poll(() => button.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);
  const paddingAfter = await button.evaluate(element => {
    const style = getComputedStyle(element);
    const font = parseFloat(style.fontSize);
    return { top: parseFloat(style.paddingTop), left: parseFloat(style.paddingLeft), font };
  });
  expect(paddingAfter.top).toBeGreaterThan(paddingBefore.top * 2);
  expect(paddingAfter.left).toBeGreaterThan(paddingBefore.left * 2);
  expect(Math.abs(paddingAfter.top / paddingAfter.font - 0.875)).toBeLessThan(0.02);
  expect(Math.abs(paddingAfter.left / paddingAfter.font - 1.25)).toBeLessThan(0.02);

  await page.locator('#content-secondary .view-line').filter({ hasText: 'font-size: var(--text-4xl)' }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('File source');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => button.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(30);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => button.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(60);

  await bar.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Destination', exact: true }).fill('/journal/');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(button).toHaveAttribute('href', '/journal/');

  await focusPrimarySourceLine(page, '<a class="button"');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(button).toHaveAttribute('href', '/about/');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(button).toHaveAttribute('href', '/journal/');

  await frame.locator('body').evaluate(() => location.reload());
  await expect(frame.getByRole('link', { name: 'Get to know this project ↗', exact: true }).locator('strong em')).toHaveText('know');
  await page.reload();
  const reloaded = page.frameLocator('.preview-frame--after').getByRole('link', { name: 'Get to know this project ↗', exact: true });
  await expect(reloaded).toHaveAttribute('href', '/journal/');
  await reloaded.click();
  await selectText(reloaded, 'project');
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(reloaded.locator('em')).toHaveText(['know', 'project']);
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Destination', exact: true }).fill('mailto:hello@example.test');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(reloaded).toHaveAttribute('href', 'mailto:hello@example.test');

  const files = await editor.submittedFiles();
  const astro = files.find(file => file.path === 'src/pages/index.astro')!.content;
  const css = files.find(file => file.path === 'src/styles/site.css')!.content;
  expect(astro).toContain('<a class="button" href="mailto:hello@example.test"><strong>Get to </strong><strong><em>know</em></strong><strong> this </strong><strong><em>project</em></strong><strong> ↗</strong></a>');
  expect(css).toContain('.button');
  expect(css).toContain('font-size: var(--text-4xl);');
  const built = independentlyBuild(astro);
  expect(built).toContain('href="mailto:hello@example.test"');
  expect(built).toContain('<em>know</em>');
  expect(built).toContain('<em>project</em>');
  expect(editor.errors).toEqual([]);
});

test('native classless button gets a readable generated class', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const action = frame.getByRole('button', { name: 'Native action', exact: true });
  await action.click();
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toContainText('Button');
  await expect(page.getByRole('combobox', { name: 'Heading level', exact: true })).toBeHidden();
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xl');
  await expect(action).toHaveClass('button-text');
  await expect(page.locator('#secondary-rules')).toContainText('.button-text');
  await page.locator('#content .view-line').filter({ hasText: '<button class="button-text">' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(action).not.toHaveClass(/button-text/);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(action).toHaveClass('button-text');
  const astro = await editor.submittedSource();
  expect(astro).toContain('<button class="button-text">Native action</button>');
  expect(astro).toContain('.button-text { font-size: var(--text-xl); }');
  expect(independentlyBuild(astro)).toContain('class="button-text"');
  expect(editor.errors).toEqual([]);
});
