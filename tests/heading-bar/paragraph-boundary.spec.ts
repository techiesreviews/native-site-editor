import { test, expect } from '@playwright/test';
import { openEditor, originalSource, preparePreview } from './fixture';

const text = 'A place for ideas, experiments, and things worth sharing.';
const source = originalSource.replace('<p class="lead">', '<p class="lead" style={{ color: "navy" }}>')
  .replace('<section class="media">', '<p class="mixed">Visit <a href="/about/">our story</a> today.</p>\n  <section class="media">');
test.beforeAll(() => { test.setTimeout(120_000); preparePreview(source); });

test('dynamic paragraph styling disables only size while supported links inside mixed paragraphs remain editable', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const paragraph = frame.locator('p.lead');
  await paragraph.click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('combobox', { name: 'Text size', exact: true })).toBeDisabled();
  await expect(bar.getByRole('combobox', { name: 'Heading level', exact: true })).toBeHidden();
  await paragraph.evaluate(element => {
    const node = element.firstChild!;
    getSelection()!.setBaseAndExtent(node, 12, node, 17);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await bar.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(paragraph.locator('em')).toHaveText('ideas');
  await expect(paragraph).toHaveCSS('color', 'rgb(0, 0, 128)');
  const mixed = frame.locator('p.mixed');
  await mixed.click({ position: { x: 5, y: 5 } });
  await expect(bar).toBeHidden();
  const link = mixed.getByRole('link', { name: 'our story', exact: true });
  await link.click();
  await expect(page.locator('.preview-summary')).toContainText('Editing a in src/pages/index.astro');
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Destination', exact: true }).fill('/our-story/');
  await page.getByRole('textbox', { name: 'Destination', exact: true }).press('Enter');
  await expect(link).toHaveAttribute('href', '/our-story/');
  const expected = source.replace(text, text.replace('ideas', '<em>ideas</em>'))
    .replace('href="/about/">our story', 'href="/our-story/">our story');
  expect(await editor.submittedSource()).toBe(expected);
  expect(editor.errors).toEqual([]);
});
