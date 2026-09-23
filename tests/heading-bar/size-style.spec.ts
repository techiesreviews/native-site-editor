import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, originalTitle, preparePreview } from './fixture';
import { generatedSizeSource } from './expected-size';

const source = originalSource.replace(`<h1>${originalTitle}</h1>`, `<h1 id="styled" style="color: navy ">${originalTitle}</h1>`);
test.beforeAll(() => { test.setTimeout(120_000); preparePreview(source); });

test('adding a size preserves an existing declaration without a trailing semicolon', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('xs');
  await expect.poll(() => heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(12.6416, 3);
  await expect(heading).toHaveCSS('color', 'rgb(0, 0, 128)');
  const submitted = await editor.submittedSource();
  const expected = generatedSizeSource(source, '<h1 id="styled" style="color: navy ">', 'heading-title', 'xs');
  expect(submitted).toBe(expected);
  await expect(heading).toHaveClass('heading-title');
  await expect(heading).toHaveAttribute('style', 'color: navy ');
  const html = independentlyBuild(submitted);
  expect(html).toContain('var(--text-xs)');
  expect(html).toContain('color: navy');
  // Render the ordinary build with the project's actual token stylesheet.
  await page.setContent(html);
  await page.addStyleTag({ content: readFileSync('fixtures/astro-starter/src/styles/framework.css', 'utf8') });
  const rebuilt = page.getByRole('heading', { name: originalTitle, exact: true });
  await expect.poll(() => rebuilt.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(12.6416, 3);
  await expect(rebuilt).toHaveCSS('color', 'rgb(0, 0, 128)');
  expect(editor.errors).toEqual([]);
});

test('returning to a heading updates its existing size instead of inserting another style attribute', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: 'Start with something simple.', exact: true });
  const other = frame.getByRole('heading', { name: originalTitle, exact: true });
  const size = page.getByRole('combobox', { name: 'Text size', exact: true });
  await heading.click();
  await size.selectOption('xs');
  await expect(heading).toHaveClass('heading-title');
  await expect(heading).not.toHaveAttribute('style', /font-size/);
  await other.click();
  await heading.click();
  await expect(size).toHaveValue('xs');
  await size.selectOption('4xl');
  await expect(heading).toHaveClass('heading-title');
  await size.selectOption('default');
  await expect(heading).toHaveClass('heading-title');
  await other.click();
  await heading.click();
  await size.selectOption('m');
  await expect(heading).toHaveClass('heading-title');
  const submitted = await editor.submittedSource();
  expect(submitted).toBe(generatedSizeSource(source, '<h2>', 'heading-title', 'm'));
  expect(independentlyBuild(submitted)).toContain('var(--text-m)');
  expect(editor.errors).toEqual([]);
});
