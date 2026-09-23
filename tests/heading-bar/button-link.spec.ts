import { test, expect } from '@playwright/test';
import { independentlyBuild, openEditor, originalSource, preparePreview } from './fixture';

const secondLink = '<a href="https://example.test/elsewhere">A separate link</a>';
const dynamicLink = '<a {...{ href: "/dynamic/" }}>A dynamic destination</a>';
const source = originalSource.replace('</Layout>', `  ${secondLink}\n  ${dynamicLink}\n</Layout>`);

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(source); });

test('a mapped Button edits only its label and literal destination through the contextual bar', async ({ page }) => {
  test.setTimeout(90_000);
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.getByRole('link', { name: 'Get to know this project ↗', exact: true });
  const buttonElement = frame.locator('a.button');
  const other = frame.getByRole('link', { name: 'A separate link', exact: true });

  await button.click();
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await expect(bar).toContainText('Button');
  const linkAction = bar.getByRole('button', { name: 'Link', exact: true });
  await linkAction.click();
  const destination = page.getByRole('textbox', { name: 'Destination', exact: true });
  await expect(page.locator('.preview-summary')).toContainText('Editing a in src/pages/index.astro');
  await expect(page.locator('#content .view-lines')).toBeVisible();
  await page.screenshot({ path: '.scratch/heading-bar/button-local-desktop.png' });
  await expect(destination).toBeFocused();
  await expect(destination).toHaveValue('/about/');
  await destination.fill('/journal#latest');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(button).toHaveAttribute('href', '/journal#latest');
  await expect(other).toHaveAttribute('href', 'https://example.test/elsewhere');
  await expect(linkAction).toBeFocused();

  await button.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Read the journal');
  await page.keyboard.press('Enter');
  await expect(buttonElement).toHaveText('Read the journal');
  await expect(other).toHaveText('A separate link');

  await buttonElement.click();
  await linkAction.click();
  await destination.fill('mailto:hello@example.test');
  await destination.press('Enter');
  await expect(buttonElement).toHaveAttribute('href', 'mailto:hello@example.test');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(buttonElement).toHaveAttribute('href', '/journal#latest');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(buttonElement).toHaveAttribute('href', 'mailto:hello@example.test');
  await other.click();
  await expect(bar).toContainText('Link');
  await linkAction.click();
  await destination.fill('https://example.test/updated');
  await destination.press('Enter');
  await expect(other).toHaveAttribute('href', 'https://example.test/updated');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(other).toHaveAttribute('href', 'https://example.test/elsewhere');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(other).toHaveAttribute('href', 'https://example.test/updated');
  await page.reload();
  await expect(frame.locator('a.button')).toHaveText('Read the journal');
  await expect(frame.locator('a.button')).toHaveAttribute('href', 'mailto:hello@example.test');

  const expected = source.replace('Get to know this project ↗', 'Read the journal')
    .replace('href="/about/"', 'href="mailto:hello@example.test"')
    .replace('https://example.test/elsewhere', 'https://example.test/updated');
  expect(await editor.submittedSource()).toBe(expected);
  expect(independentlyBuild(expected)).toContain('href="mailto:hello@example.test"');
  expect(editor.errors).toEqual([]);
});

test('link panel cancels and rejects unsafe or non-representable destinations without history', async ({ page }) => {
  const editor = await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.getByRole('link', { name: 'Get to know this project ↗', exact: true });
  await button.click();
  const linkAction = page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true });
  await linkAction.click();
  const destination = page.getByRole('textbox', { name: 'Destination', exact: true });
  await destination.fill('/discarded');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(button).toHaveAttribute('href', '/about/');
  await expect(linkAction).toBeFocused();

  await linkAction.click();
  await destination.press('Enter');
  await expect(button).toHaveAttribute('href', '/about/');
  await linkAction.click();
  await destination.fill('javascript:alert(1)');
  await destination.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit link', exact: true }).getByRole('alert')).toContainText('safe');
  await expect(button).toHaveAttribute('href', '/about/');
  await destination.fill('javascript&colon;alert(1)');
  await destination.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit link', exact: true }).getByRole('alert')).toContainText('safe');
  await destination.fill('&#106avascript:alert(1)');
  await destination.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit link', exact: true }).getByRole('alert')).toContainText('safe');
  await destination.press('Escape');
  await expect(linkAction).toBeFocused();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.locator('#content .view-lines')).toContainText('href="/about/"');
  expect(editor.errors).toEqual([]);
});

test('the anchored link panel stays within a narrow preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('link', { name: 'Get to know this project ↗', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.locator('.preview-summary')).toContainText('Editing a in src/pages/index.astro');
  await expect(page.locator('#content .view-lines')).toBeVisible();
  await page.screenshot({ path: '.scratch/heading-bar/button-local-mobile.png' });
  const box = await page.getByRole('dialog', { name: 'Edit link', exact: true }).boundingBox();
  const bar = await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).boundingBox();
  const pane = await page.locator('.preview-pane').boundingBox();
  expect(box).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(pane).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  for (const rect of [bar!, box!]) {
    expect(rect.x).toBeGreaterThanOrEqual(pane!.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(pane!.x + pane!.width);
    expect(rect.y).toBeGreaterThanOrEqual(pane!.y);
    expect(rect.y + rect.height).toBeLessThanOrEqual(pane!.y + pane!.height);
  }
});

test('a spread destination stays visible but has no Link action', async ({ page }) => {
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const dynamic = frame.getByRole('link', { name: 'A dynamic destination', exact: true });
  await dynamic.click();
  await expect(dynamic).toHaveAttribute('href', '/dynamic/');
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toBeHidden();
  await expect(page.locator('#content .view-lines')).toContainText(dynamicLink);
});

test('changing selection dismisses an unfinished destination without applying it', async ({ page }) => {
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.locator('a.button');
  const other = frame.getByRole('link', { name: 'A separate link', exact: true });
  await button.click();
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Destination', exact: true }).fill('/unfinished');
  await other.click();
  await expect(page.getByRole('dialog', { name: 'Edit link', exact: true })).toBeHidden();
  await expect(button).toHaveAttribute('href', '/about/');
  await expect(other).toHaveAttribute('href', 'https://example.test/elsewhere');
});

test('empty destinations and button labels each retain one Undo and Redo step', async ({ page }) => {
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  const button = frame.locator('a.button');
  await button.click();
  await page.getByRole('toolbar', { name: 'Edit bar', exact: true }).getByRole('button', { name: 'Link', exact: true }).click();
  const destination = page.getByRole('textbox', { name: 'Destination', exact: true });
  await destination.fill('');
  await destination.press('Enter');
  await expect(button).toHaveAttribute('href', '');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(button).toHaveAttribute('href', '/about/');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(button).toHaveAttribute('href', '');
  await button.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Empty link');
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Empty link');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(button).toHaveText('Get to know this project ↗');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(button).toHaveText('Empty link');
});
