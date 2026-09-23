import { test, expect } from '@playwright/test';
import { openEditor, originalSource, originalTitle, preparePreview } from './fixture';

test.beforeAll(() => {
  test.setTimeout(120_000);
  preparePreview(originalSource.replace('<p>This is an ordinary Astro site.', '<p class="lead">This is an ordinary Astro site.'));
});

test('Publish follows draft state without opening while disabled', async ({ page }) => {
  await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  const panel = page.locator('#publish-files');
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });

  await expect(publish).toBeDisabled();
  await publish.hover();
  await expect(panel).not.toBeVisible();

  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h2');
  await expect(publish).toBeEnabled();
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
  await undo.click();
  await expect(publish).toBeDisabled();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
});

test('a stylesheet-only draft enables Publish', async ({ page }) => {
  await openEditor(page);
  const frame = page.frameLocator('.preview-frame--after');
  await frame.getByRole('heading', { name: originalTitle, exact: true }).click();
  await frame.locator('p.lead').nth(1).click();
  await expect(page.locator('.preview-summary')).toContainText('Editing p in src/pages/index.astro');
  const size = page.getByRole('combobox', { name: 'Text size', exact: true });
  await expect(size).toHaveValue('custom');
  await size.selectOption('xl');
  await expect(page.locator('#content-secondary .view-lines')).toContainText('font-size: var(--text-xl)');
  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  await publish.hover();
  await expect(publish).toBeEnabled();
});

test('successful publishing disables Publish and ignores a second submit while pending', async ({ page }) => {
  await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  await heading.click();
  await page.getByRole('combobox', { name: 'Heading level', exact: true }).selectOption('h2');

  let requests = 0;
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/publish?*', async route => {
    requests += 1;
    await gate;
    await route.fulfill({ json: {
      commit: 'f'.repeat(40), branch: 'main',
      url: `https://github.com/lex/heading-starter/commit/${'f'.repeat(40)}`,
      files: [{ path: 'src/pages/index.astro', sha: 'e'.repeat(40) }], unchanged: false,
    } });
  });

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const submit = page.getByRole('button', { name: 'Publish selected files', exact: true });
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  await submit.evaluate(button => (button as HTMLButtonElement).click());
  expect(requests).toBe(1);
  finish();
  await expect(page.locator('.publish-menu__message')).toContainText('Saved to GitHub');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
});
