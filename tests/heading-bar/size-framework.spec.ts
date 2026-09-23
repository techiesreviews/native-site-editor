import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, originalTitle, preparePreview } from './fixture';

const source = originalSource
  .replace('<h1>', '<h1 style="font-size: var(--text-4xl)">')
  .replace('<h2>Start with something simple.', '<h2 style="font-size: var(--text-4xl)">Start with something simple.');
const framework = readFileSync('fixtures/astro-starter/src/styles/framework.css', 'utf8');

test.describe('the supplied fluid framework', () => {
  test.beforeAll(() => { test.setTimeout(120_000); preparePreview(source); });
  test('a size token follows the supplied clamp at desktop and mobile canvas widths', async ({ page }) => {
    const editor = await openEditor(page);
    const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
    await heading.click();
    await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('4xl');
    const sizes: number[] = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(async () => heading.evaluate(element => {
        // Independent numeric form of Lex's 4XL clamp, with the fixture's 16px root.
        const expected = Math.max(28.832, Math.min(15.4256 + 0.041897 * innerWidth, 75.7568));
        return Math.abs(parseFloat(getComputedStyle(element).fontSize) - expected);
      })).toBeLessThan(0.005);
      sizes.push(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize)));
    }
    expect(sizes[1]).toBeLessThan(sizes[0]);
    expect(editor.errors).toEqual([]);
  });
});

test.describe('editing a framework variable in the Astro stylesheet', () => {
  test.beforeAll(() => {
    test.setTimeout(120_000);
    preparePreview(source, framework.replace(/--text-4xl: [^;]+;/, '--text-4xl: 3.3125rem;'));
  });
  test('one stylesheet value reaches both headings in a real Astro build', async ({ page }) => {
    const editor = await openEditor(page);
    const frame = page.frameLocator('.preview-frame--after');
    for (const name of [originalTitle, 'Start with something simple.']) {
      const heading = frame.getByRole('heading', { name, exact: true });
      await expect(heading).toHaveCSS('font-size', '53px');
      await heading.click();
      await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveValue('4xl');
    }
    expect(independentlyBuild(source).match(/font-size: var\(--text-4xl\)/g)).toHaveLength(2);
    expect(editor.errors).toEqual([]);
  });
});
