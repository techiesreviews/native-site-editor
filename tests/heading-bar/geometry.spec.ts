import { test, expect } from '@playwright/test';
import { openEditor, originalTitle, preparePreview } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('heading bar retains the approved A control styling in light and dark themes', async ({ page }) => {
  const editor = await openEditor(page);
  await page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true }).click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect.poll(() => bar.evaluate(element => {
      const style = getComputedStyle(element);
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--surface-toolbar)';
      document.body.append(probe);
      const expectedBackground = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { gap: style.gap, padding: style.padding, radius: style.borderRadius, backgroundMatches: style.backgroundColor === expectedBackground };
    })).toEqual({ gap: '2px', padding: '4px', radius: '8px', backgroundMatches: true });
    await expect(bar.getByText('Heading', { exact: true })).toBeVisible();
    await expect(bar.getByRole('combobox', { name: 'Heading level' }).locator('option')).toHaveText(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    for (const [label, text, weight, style] of [['Bold', 'B', '700', 'normal'], ['Italic', 'I', '400', 'italic']]) {
      const control = bar.getByRole('button', { name: label, exact: true });
      await expect(control).toHaveText(text);
      expect(await control.evaluate(element => {
        const css = getComputedStyle(element);
        return { size: css.fontSize, weight: css.fontWeight, style: css.fontStyle, radius: css.borderRadius, padding: css.padding };
      })).toEqual({ size: '11px', weight, style, radius: '7px', padding: '6px 8px' });
    }
    const kind = await bar.getByText('Heading', { exact: true }).boundingBox();
    const level = await bar.getByRole('combobox', { name: 'Heading level' }).boundingBox();
    expect(kind && level && level.x >= kind.x + kind.width && Math.abs(level.y + level.height / 2 - kind.y - kind.height / 2) <= 1).toBe(true);
  }
  expect(editor.errors).toEqual([]);
});

test('heading bar follows iframe scrolling, hides offscreen, and stays within the resized canvas', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await heading.click();
  await expect(bar).toBeVisible();
  const aboveGap = async () => {
    const target = await heading.boundingBox();
    const bounds = await bar.boundingBox();
    return target && bounds ? Math.abs(target.y - bounds.y - bounds.height - 8) : Infinity;
  };
  await expect.poll(aboveGap).toBeLessThanOrEqual(2);
  await heading.evaluate(() => window.scrollBy(0, 80));
  await expect.poll(aboveGap).toBeLessThanOrEqual(2);
  await heading.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(bar).toBeHidden();
  await heading.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const bounds = await bar.boundingBox();
    const canvas = await page.locator('.preview-frame--after').boundingBox();
    return !!bounds && !!canvas && bounds.x >= canvas.x && bounds.x + bounds.width <= canvas.x + canvas.width + 1;
  }).toBe(true);
  await page.screenshot({ path: '.scratch/heading-bar/heading-bar-mobile.png', animations: 'disabled' });
  expect(editor.errors).toEqual([]);
});
