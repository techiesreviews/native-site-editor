import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, preparePreview } from './fixture';
import { generatedDefaultSource, generatedSizeSource } from './expected-size';

test.describe('a classless heading', () => {
  test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

  test('gets a readable page class as one undoable edit and Default keeps the class', async ({ page }) => {
    const editor = await openEditor(page);
    const heading = page.frameLocator('.preview-frame--after')
      .getByRole('heading', { name: 'Start with something simple.', exact: true });
    await heading.click();
    await expect(page.locator('.preview-summary')).toContainText('Editing h2 in src/pages/index.astro');
    await expect(heading).toHaveAttribute('contenteditable', 'true');
    const size = page.getByRole('combobox', { name: 'Text size', exact: true });
    await expect(size).toBeEnabled();
    await expect(size).toHaveValue('default');
    await size.selectOption('xl');
    await expect(heading).toHaveClass('heading-title');
    await expect(heading).not.toHaveAttribute('style', /font-size/);

    const expected = generatedSizeSource(
      originalSource,
      '<h2>',
      'heading-title',
      'xl',
    );
    expect(await editor.submittedSource()).toBe(expected);
    const built = independentlyBuild(expected);
    expect(built).toContain('class="heading-title"');
    expect(built).toContain('font-size:var(--text-xl)');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(heading).not.toHaveAttribute('class', /heading-title/);
    await expect(page.locator('#content .view-lines')).toContainText('<h2>Start with something simple.</h2>');
    await expect(page.locator('#content .view-lines')).not.toContainText('.heading-title');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(heading).toHaveClass('heading-title');
    await heading.click();
    await expect(size).toHaveValue('xl');

    await size.selectOption('default');
    await expect(heading).toHaveClass('heading-title');
    await expect(heading).not.toHaveAttribute('style', /font-size/);
    const withoutDeclaration = generatedDefaultSource(expected, 'heading-title', 'xl');
    expect(await editor.submittedSource()).toBe(withoutDeclaration);
    expect(editor.errors).toEqual([]);
  });
});

test.describe('a classless paragraph with a generated-name collision', () => {
  const source = originalSource.replace('<Layout>', '<!-- paragraph-text -->\n<Layout>');

  test.beforeAll(() => { test.setTimeout(120_000); preparePreview(source); });

  test('gets the next unique readable class and remains a paragraph after reload', async ({ page }) => {
    const editor = await openEditor(page);
    let paragraph = page.frameLocator('.preview-frame--after').locator('section').first().locator('p');
    await paragraph.click();
    await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
    await expect(paragraph).toHaveAttribute('contenteditable', 'true');
    await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('m');
    await expect(paragraph).toHaveClass('paragraph-text-2');
    await expect(paragraph).not.toHaveAttribute('style', /font-size/);
    await expect(paragraph).toHaveJSProperty('tagName', 'P');

    const expected = generatedSizeSource(source, '<p>', 'paragraph-text-2', 'm');
    expect(await editor.submittedSource()).toBe(expected);
    const built = independentlyBuild(expected);
    expect(built).toContain('class="paragraph-text-2"');
    expect(built).toContain('font-size:var(--text-m)');

    await page.reload();
    paragraph = page.frameLocator('.preview-frame--after').locator('p.paragraph-text-2');
    await expect(paragraph).toHaveJSProperty('tagName', 'P');
    await paragraph.click();
    await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('m');
    expect(editor.errors).toEqual([]);
  });
});
