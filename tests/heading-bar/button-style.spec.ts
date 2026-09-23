import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, preparePreview } from './fixture';

const buttonLine = '    <a class="button" href="/about/">Get to know this project ↗</a>';

test.beforeEach(({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
});

test('prepared button style edits only selected class token and survives related visual edits', async ({ page }) => {
  const threeButtons = originalSource.replace(buttonLine, [
    '    <a class="button" href="/about/">First button</a>',
    '  <a class="button helper" href="/about/">Second <strong>button</strong></a>',
    '    <a class="button" href="/about/">Third button</a>',
  ].join('\n'));
  preparePreview(threeButtons);
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const middle = frame.locator('a.button').nth(1);

  await middle.click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(toolbar).toContainText('Button');
  const style = toolbar.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('primary');
  mkdirSync('.scratch/heading-bar', { recursive: true });
  await middle.screenshot({ path: '.scratch/heading-bar/button-style-primary.png' });
  await page.screenshot({ path: '.scratch/heading-bar/button-style-toolbar-desktop.png', fullPage: true });
  const desktopBar = await toolbar.boundingBox();
  const desktopPane = await page.locator('.preview-pane').boundingBox();
  expect(desktopBar).not.toBeNull();
  expect(desktopPane).not.toBeNull();
  expect(desktopBar!.x).toBeGreaterThanOrEqual(desktopPane!.x);
  expect(desktopBar!.x + desktopBar!.width).toBeLessThanOrEqual(desktopPane!.x + desktopPane!.width);

  await style.selectOption('secondary');
  await expect(middle).toHaveClass(/(^| )secondary( |$)/);
  await expect(middle).toHaveClass(/(^| )helper( |$)/);
  await expect.poll(() => middle.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(0, 0, 0)');
  await expect(frame.locator('a.button').first()).not.toHaveClass(/(^| )secondary( |$)/);
  await expect(frame.locator('a.button').nth(2)).not.toHaveClass(/(^| )secondary( |$)/);
  await middle.screenshot({ path: '.scratch/heading-bar/button-style-secondary.png' });
  const textSize = toolbar.getByRole('combobox', { name: 'Text size', exact: true });
  await textSize.selectOption('l');
  await expect(textSize).toHaveValue('l');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(middle).toHaveClass(/(^| )secondary( |$)/);
  await expect(textSize).toHaveValue('m');

  await style.selectOption('outline');
  await expect(middle).toHaveClass(/(^| )ghost( |$)/);
  await page.mouse.move(12, 12);
  await expect.poll(() => middle.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await middle.screenshot({ path: '.scratch/heading-bar/button-style-outline.png' });

  await style.selectOption('link');
  await expect(middle).toHaveClass(/(^| )no-bg( |$)/);
  await page.mouse.move(12, 12);
  await expect.poll(() => middle.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
  await middle.screenshot({ path: '.scratch/heading-bar/button-style-link.png' });

  await middle.click();
  await toolbar.getByRole('button', { name: 'Link', exact: true }).click();
  const destination = page.getByRole('textbox', { name: 'Destination', exact: true });
  await expect(destination).toBeVisible();
  await destination.fill('/second/');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(middle).toHaveAttribute('href', '/second/');
  await middle.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Styled second');
  await page.keyboard.press('Enter');
  await expect(middle).toHaveText('Styled second');
  await expect(middle).toHaveClass(/(^| )no-bg( |$)/);
  expect(await editor.submittedSource()).toContain('>Styled second</a>');
  await page.reload();
  const reloadedMiddle = page.frameLocator('.preview-frame--after').locator('a.button').nth(1);
  await expect(reloadedMiddle).toHaveText('Styled second');
  await expect(reloadedMiddle).toHaveClass(/(^| )no-bg( |$)/);
  await reloadedMiddle.click();
  const reloadedStyle = page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('combobox', { name: 'Button style', exact: true });
  await expect(reloadedStyle).toHaveValue('link');

  await reloadedStyle.selectOption('primary');
  await expect(reloadedMiddle).not.toHaveClass(/(^| )(secondary|ghost|no-bg)( |$)/);
  const afterPrimary = await editor.submittedSource();
  expect(afterPrimary).toContain('<a class="button helper" href="/second/">Styled second</a>');
  expect(afterPrimary).toContain('<a class="button" href="/about/">First button</a>');
  expect(afterPrimary).toContain('<a class="button" href="/about/">Third button</a>');
  expect(independentlyBuild(afterPrimary)).toContain('Styled second');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(reloadedMiddle).toHaveClass(/(^| )no-bg( |$)/);
  await expect(reloadedStyle).toHaveValue('link');
  await reloadedStyle.selectOption('primary');
  await expect(reloadedMiddle).not.toHaveClass(/(^| )no-bg( |$)/);
  const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undoButton).toBeEnabled();
  await reloadedStyle.selectOption('primary');
  await expect(reloadedStyle).toHaveValue('primary');
  await undoButton.click();
  await expect(reloadedMiddle).toHaveClass(/(^| )no-bg( |$)/);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(reloadedMiddle).not.toHaveClass(/(^| )no-bg( |$)/);

  await page.screenshot({ path: '.scratch/heading-bar/button-style-four-states.png', fullPage: true });
  writeFileSync('.scratch/heading-bar/button-style-source.txt', afterPrimary);
  expect(editor.errors).toEqual([]);
});

test('button style is hidden without prepared literal class contract', async ({ page }) => {
  for (const replacement of [
    '  <a class:list={["button"]} href="/about/">Dynamic button</a>',
    '    <a class="button" class:list={["helper"]} href="/about/">Dynamic button</a>',
  ]) {
    const dynamic = originalSource.replace(buttonLine, replacement);
    preparePreview(dynamic);
    const editor = await openEditor(page);
    await page.frameLocator('.preview-frame--after').getByText('Dynamic button').click();
    await expect(page.getByRole('combobox', { name: 'Button style', exact: true })).toHaveCount(0);
    expect(editor.errors).toEqual([]);
  }
});

test('a prepared btn class is treated as a Button, not a generic link', async ({ page }) => {
  const btnSource = originalSource.replace(buttonLine, '  <a class="btn" href="/about/">Prepared btn</a>\n  <button class="btn" type="button">Native button</button>');
  preparePreview(btnSource);
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.locator('a.btn').click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(toolbar).toContainText('Button');
  await toolbar.getByRole('combobox', { name: 'Button style', exact: true }).selectOption('secondary');
  await expect(frame.locator('a.btn')).toHaveClass(/(^| )secondary( |$)/);
  await frame.getByRole('button', { name: 'Native button', exact: true }).click();
  await toolbar.getByRole('combobox', { name: 'Button style', exact: true }).selectOption('outline');
  await expect(frame.locator('button.btn')).toHaveClass(/(^| )ghost( |$)/);
  expect(await editor.submittedSource()).toContain('<button class="btn ghost" type="button">Native button</button>');
  expect(editor.errors).toEqual([]);
});

test('missing button style metadata keeps ordinary annotations working', async ({ page }) => {
  preparePreview(originalSource, undefined, { '.astro-editor/button-styles.json': null });
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.locator('a.button').first().click();
  await expect(page.getByRole('button', { name: 'Link', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Button style', exact: true })).toHaveCount(0);
  expect(editor.errors).toEqual([]);
});

test('button style options are disabled when the prepared CSS rule is missing', async ({ page }) => {
  const withoutLinkRule = ':root { --btn-space: .875em 1.25em; --primary: #2c5139; --secondary: #d4dfcb; --primary-l-3: #b8d8c2; }\n' +
    '.button { color: white; background: var(--primary); }\n.button.secondary { color: black; }\n.card.no-bg { color: red; }\n';
  preparePreview(originalSource, undefined, {
    'src/styles/site.css': withoutLinkRule,
  });
  const editor = await openEditor(page);
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  const style = page.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('primary');
  await expect(style.locator('option[value="secondary"]')).toBeEnabled();
  await expect.poll(() => style.locator('option[value="link"]').evaluate((option) => (option as HTMLOptionElement).disabled)).toBe(true);
  expect(editor.errors).toEqual([]);
});

test('button style toolbar fits on a narrow preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  preparePreview(originalSource);
  await openEditor(page);
  await page.frameLocator('.preview-frame--after').locator('a.button').first().click();
  const toolbar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(toolbar.getByRole('combobox', { name: 'Button style', exact: true })).toBeVisible();
  await page.screenshot({ path: '.scratch/heading-bar/button-style-toolbar-narrow.png', fullPage: true });
  const box = await toolbar.boundingBox();
  const pane = await page.locator('.preview-pane').boundingBox();
  expect(box).not.toBeNull();
  expect(pane).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(pane!.x);
  expect(box!.x + box!.width).toBeLessThanOrEqual(pane!.x + pane!.width);
});

test('restoring Primary from an authored Secondary preserves the next style edit', async ({ page }) => {
  preparePreview(originalSource.replace('class="button"', 'class="button secondary"'));
  const editor = await openEditor(page);
  const button = page.frameLocator('.preview-frame--after').locator('a.button');
  await button.click();
  const style = page.getByRole('combobox', { name: 'Button style', exact: true });
  await expect(style).toHaveValue('secondary');
  await style.selectOption('primary');
  expect(await editor.submittedSource()).toContain('class="button"');
  await page.reload();
  await expect(button).toHaveClass('button');
  await button.click();
  await expect(style).toHaveValue('primary');
  await style.selectOption('outline');
  await expect(button).toHaveClass('button ghost');
  expect(await editor.submittedSource()).toContain('class="button ghost"');
  expect(editor.errors).toEqual([]);
});
