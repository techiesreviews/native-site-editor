import { test, expect } from '@playwright/test';
import { openEditor, originalTitle, preparePreview } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('a primary seed recolors editor chrome and the preview outline without recoloring the site', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const heading = frame.getByRole('heading', { name: originalTitle, exact: true });
  const sidebar = page.getByRole('complementary', { name: 'Page structure' });
  const monaco = page.locator('.monaco-editor-background').first();

  const siteColors = await heading.evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  await heading.click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toBeVisible();
  await expect(monaco).toBeVisible();
  const before = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector('[aria-label="Page structure"]')!).backgroundColor,
    monaco: getComputedStyle(document.querySelector('.monaco-editor-background')!).backgroundColor,
  }));

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--color-primary', 'oklch(55% 0.16 145)');
  });

  await expect.poll(async () => page.evaluate(() => {
    const pixel = (value: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].join(',');
    };
    const root = getComputedStyle(document.documentElement);
    return pixel(getComputedStyle(document.querySelector('[role="toolbar"][aria-label="Edit bar"]')!).backgroundColor)
      === pixel(root.getPropertyValue('--surface-toolbar'))
      && pixel(getComputedStyle(document.querySelector('.monaco-editor-background')!).backgroundColor)
      === pixel(root.getPropertyValue('--surface'))
      && pixel(getComputedStyle(document.querySelector('[aria-label="Page structure"]')!).backgroundColor)
      === pixel(root.getPropertyValue('--surface-subtle'));
  })).toBe(true);

  const chrome = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector('[aria-label="Page structure"]')!).backgroundColor,
    monaco: getComputedStyle(document.querySelector('.monaco-editor-background')!).backgroundColor,
  }));
  expect(chrome.sidebar).not.toBe(before.sidebar);
  expect(chrome.monaco).not.toBe(before.monaco);
  await expect(sidebar).toBeVisible();
  await expect(monaco).toBeVisible();

  const expectedFocus = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--preview-focus)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].join(',');
  });
  const outlinePixel = (element: HTMLElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = getComputedStyle(element).outlineColor;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].join(',');
  };
  await expect.poll(() => heading.evaluate(outlinePixel)).toBe(expectedFocus);
  expect(await heading.evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  })).toEqual(siteColors);

  await frame.locator('body').evaluate(() => location.reload());
  const reloadedHeading = frame.getByRole('heading', { name: originalTitle, exact: true });
  await reloadedHeading.click();
  await expect.poll(() => reloadedHeading.evaluate(outlinePixel)).toBe(expectedFocus);
  expect(await reloadedHeading.evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  })).toEqual(siteColors);

  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h2');
  await expect(frame.getByRole('heading', { level: 2, name: originalTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(frame.getByRole('heading', { level: 1, name: originalTitle, exact: true })).toBeVisible();
  expect(editor.errors).toEqual([]);
});
