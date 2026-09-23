import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, originalTitle, preparePreview } from './fixture';

const richSource = originalSource
  .replace(`<h1>${originalTitle}</h1>`, '<h1 class="lead" id="intro">\n  <strong>👋 little</strong> &amp; the web.\n</h1>')
  .replace('<h2>Say hello.</h2>', '<h2>{"Computed heading"}</h2>');

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(richSource); });

test('a freshly built rich heading supports backward Unicode selections and preserves attributes and unsupported neighbors', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: '👋 little & the web.', exact: true });
  await heading.locator('strong').click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toBeVisible();
  await heading.evaluate(element => {
    const node = element.querySelector('strong')!.firstChild!;
    getSelection()!.setBaseAndExtent(node, 9, node, 3);
  });
  await expect.poll(() => heading.evaluate(() => getSelection()?.toString())).toBe('little');
  await bar.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(heading.locator('em')).toHaveText('little');
  await expect(heading).toHaveText('👋 little & the web.');
  await expect.poll(() => heading.evaluate(element => {
    const selection = getSelection()!;
    const offset = (node: Node, end: number) => {
      const range = document.createRange(); range.setStart(element, 0); range.setEnd(node, end); return range.toString().length;
    };
    return [offset(selection.anchorNode!, selection.anchorOffset), offset(selection.focusNode!, selection.focusOffset)];
  })).toEqual([9, 3]);
  await frame.getByRole('heading', { name: 'Computed heading', exact: true }).click();
  await expect(bar).toBeHidden();
  const result = await editor.submittedSource();
  expect(result).toContain('class="lead" id="intro"');
  expect(result).toContain('id="intro">\n  ');
  expect(result).toContain(' the web.\n</h1>');
  expect(result).toContain('&amp; the web.');
  expect(result).toContain('<h2>{"Computed heading"}</h2>');
  expect(result?.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '<heading/>')).toBe(richSource.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '<heading/>'));
  const html = independentlyBuild(result!);
  expect(html).toContain('<em>little</em>');
  expect(html).toContain('👋');
  expect(editor.errors).toEqual([]);
});
