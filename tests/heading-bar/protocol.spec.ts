import { test, expect } from '@playwright/test';
import { openEditor, originalTitle, preparePreview } from './fixture';

test.beforeAll(() => { test.setTimeout(120_000); preparePreview(); });

test('invalid paired heading ranges cannot expose an editable level control', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  const bar = page.getByRole('toolbar', { name: 'Edit bar', exact: true });
  await heading.click();
  await expect(bar).toBeVisible();
  await heading.evaluate(element => {
    const rect = element.getBoundingClientRect();
    window.parent.postMessage({
      source: 'astro-site-editor', type: 'select', path: location.pathname,
      revision: new URL(location.href).searchParams.get('astro-editor-rev'),
      loc: element.getAttribute('data-ase'), text: element.textContent, tag: 'h1',
      heading: { level: 'h1', open: element.getAttribute('data-ase-heading-open'), close: element.getAttribute('data-ase-heading-open') },
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    }, '*');
  });
  await expect(bar).toBeHidden();
  await expect(page.locator('#content .view-lines')).toContainText(`<h1>${originalTitle}</h1>`);
  expect(editor.errors).toEqual([]);
});

test('existing preview integrations can still send their legacy literal-text edits', async ({ page }) => {
  const editor = await openEditor(page);
  const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
  const saved = await heading.evaluate(element => ({ text: element.textContent, attributes: [...element.attributes].map(attribute => [attribute.name, attribute.value]) }));
  await heading.evaluate(element => {
    const loc = element.getAttribute('data-ase');
    const expected = element.textContent;
    window.parent.postMessage({ source: 'astro-site-editor', type: 'select', loc, text: expected, tag: 'h1' }, '*');
    window.parent.postMessage({ source: 'astro-site-editor', type: 'input', loc, expected, text: 'Legacy text still works' }, '*');
  });
  await expect(page.locator('#content .view-lines')).toContainText('<h1>Legacy text still works</h1>');
  await expect(page.getByRole('toolbar', { name: 'Edit bar', exact: true })).toBeHidden();
  await page.frameLocator('.preview-frame--after').locator('body').evaluate((_body, snapshot) => {
    const element = document.querySelector('h1')!;
    element.textContent = snapshot.text;
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    for (const [name, value] of snapshot.attributes) element.setAttribute(name, value);
    window.parent.postMessage({ source: 'astro-site-editor', type: 'ready', path: location.pathname }, '*');
  }, saved);
  await expect(page.frameLocator('.preview-frame--after').getByRole('heading', { name: 'Legacy text still works', exact: true })).toBeVisible();
  expect(editor.errors).toEqual([]);
});

for (const staleField of ['path', 'revision'] as const) {
  test(`a selection from an old preview ${staleField} cannot replace the current heading`, async ({ page }) => {
    const editor = await openEditor(page);
    const heading = page.frameLocator('.preview-frame--after').getByRole('heading', { name: originalTitle, exact: true });
    await heading.click();
    const level = page.getByRole('combobox', { name: 'Heading level', exact: true });
    await expect(level).toHaveValue('h1');
    await page.evaluate(field => {
      window.addEventListener('message', event => {
        if (event.data?.type === 'select' && event.data?.[field] === (field === 'path' ? '/previous-page/' : 'd'.repeat(40)))
          document.documentElement.dataset.headingMessageObserved = 'true';
      });
    }, staleField);
    await heading.evaluate((_selected, field) => {
      const element = document.querySelector('h2[data-ase]')!;
      const rect = element.getBoundingClientRect();
      const message = {
        source: 'astro-site-editor', type: 'select', path: location.pathname,
        revision: new URL(location.href).searchParams.get('astro-editor-rev'),
        loc: element.getAttribute('data-ase'), text: element.textContent, tag: 'h2',
        heading: { level: 'h2', open: element.getAttribute('data-ase-heading-open'), close: element.getAttribute('data-ase-heading-close') },
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      };
      message[field] = field === 'path' ? '/previous-page/' : 'd'.repeat(40);
      window.parent.postMessage(message, '*');
    }, staleField);
    await expect(page.locator('html')).toHaveAttribute('data-heading-message-observed', 'true');
    await expect(level).toHaveValue('h1');
    await level.selectOption('h5');
    await expect(page.frameLocator('.preview-frame--after').getByRole('heading', { level: 5, name: originalTitle, exact: true })).toBeVisible();
    await expect(page.locator('#content .view-lines')).toContainText(`<h5>${originalTitle}</h5>`);
    await expect(page.frameLocator('.preview-frame--after').getByRole('heading', { level: 2, name: 'Start with something simple.', exact: true })).toBeVisible();
    expect(editor.errors).toEqual([]);
  });
}
