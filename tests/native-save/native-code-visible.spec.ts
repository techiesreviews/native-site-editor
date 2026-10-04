import { test, expect, type Page } from '@playwright/test';
import { storedDraft } from './drafts';

const hash = '#repo=501&branch=main&file=index.html';
const grip = (page: Page) => page.getByRole('separator', { name: 'Resize code pane', exact: true });
async function load(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/${hash}`);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  // Monaco mounts even when persisted collapse keeps its surface hidden.
  await expect(page.locator('#content .monaco-editor')).toBeAttached();
  await expect(grip(page)).toBeVisible();
}
async function sourceViewport(page: Page) {
  const editor = page.locator('#content .monaco-editor');
  await expect(editor).toBeVisible();
  expect((await editor.boundingBox())!.height).toBeGreaterThan(0);
  await expect(page.locator('#content .view-line').first()).toBeVisible();
  await expect(page.locator('#code-split > .code-pane').first()).not.toHaveAttribute('aria-hidden');
  expect(await page.locator('#code-split > .code-pane').first().evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await expect(grip(page)).toHaveAttribute('aria-valuetext', /^Code shown,/);
}
async function hiddenSource(page: Page) {
  await expect(grip(page)).toHaveAttribute('aria-valuetext', 'Code hidden');
  await expect(grip(page)).toHaveAttribute('aria-valuemin', '0');
  await expect(grip(page)).toHaveAttribute('aria-valuenow', '0');
  await expect(grip(page)).toBeVisible();
  await expect(page.locator('#content .monaco-editor')).toBeAttached();
  await expect(page.locator('#content .monaco-editor')).toBeHidden();
  await expect(page.locator('#code-split > .code-pane').first()).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#code-split > .code-pane').first().evaluate(el => (el as HTMLElement).inert)).toBe(true);
  expect((await page.locator('#code-split').boundingBox())!.height).toBe(0);
}
async function moveGrip(page: Page, dy: number) {
  const b = (await grip(page).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

test('old collapsed persistence hides source completely and remembers the prior height', async ({ page, baseURL }) => {
  await page.addInitScript(() => { localStorage.setItem('astro-editor.code-height', JSON.stringify({ height: 0.35, collapsed: true })); });
  await load(page, baseURL);
  await hiddenSource(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('astro-editor.code-height')!))).toEqual({ height: 0.35, collapsed: true });
  const mainHeight = await page.locator('#main').evaluate(el => el.clientHeight);
  const maximum = Number(await grip(page).getAttribute('aria-valuemax'));
  await grip(page).click();
  await expect(grip(page)).toHaveAttribute('aria-valuenow', String(Math.round(Math.min(maximum, Math.max(Math.min(96, mainHeight), mainHeight * 0.35)))));
  await sourceViewport(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('astro-editor.code-height')!))).toEqual({ height: 0.35, collapsed: false });
});

test('drag below minimum and Home hide source; Enter and Space restore the remembered height', async ({ page, baseURL }) => {
  await load(page, baseURL);
  await grip(page).focus();
  await page.keyboard.press('Shift+ArrowUp');
  const before = await grip(page).getAttribute('aria-valuenow');
  await moveGrip(page, 600);
  await hiddenSource(page);
  await grip(page).focus();
  await page.keyboard.press('Enter');
  await expect(grip(page)).toHaveAttribute('aria-valuenow', before!);
  await sourceViewport(page);
  await page.keyboard.press('Home');
  await hiddenSource(page);
  await page.keyboard.press(' ');
  await expect(grip(page)).toHaveAttribute('aria-valuenow', before!);
  await sourceViewport(page);
});

test('hiding retains the real Monaco model, cursor, draft and Undo/Redo', async ({ page, baseURL }) => {
  await load(page, baseURL);
  const before = await page.evaluate(async () => {
    const api = await import('/src/components/code-editor.ts');
    const { monaco } = await import('/src/components/monaco.ts');
    const model = monaco.editor.getModels().find(m => m.uri.path.endsWith('/index.html'))!;
    const editor = monaco.editor.getEditors().find(e => e.getModel() === model)!;
    const original = model.getValue();
    const at = original.indexOf('A native browser preview');
    if (at < 0) throw new Error('Expected fixture heading in the mounted model.');
    api.replaceActiveRange({ path: 'index.html', start: at, end: at + 24, expected: original.slice(at, at + 24), text: 'Visible source survives' });
    editor.setPosition(model.getPositionAt(at + 5));
    const saved = { uri: model.uri.toString(), version: model.getAlternativeVersionId(), position: editor.getPosition(), text: model.getValue(), original };
    Object.assign(window, { visibleCode: { api, model, editor, saved } });
    return saved;
  });
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toHaveText('Visible source survives');
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toBe(before.text);
  await grip(page).click();
  await hiddenSource(page);
  const after = await page.evaluate(() => {
    const h = (window as any).visibleCode;
    return { uri: h.model.uri.toString(), version: h.model.getAlternativeVersionId(), position: h.editor.getPosition(), text: h.model.getValue(), mounted: h.editor.getModel() === h.model, disposed: h.model.isDisposed() };
  });
  expect(after).toEqual({ uri: before.uri, version: before.version, position: before.position, text: before.text, mounted: true, disposed: false });
  expect(await page.evaluate(() => (window as any).visibleCode.api.runVisualHistory('undo', 'index.html'))).toBe(true);
  expect(await page.evaluate(() => (window as any).visibleCode.model.getValue())).toBe(before.original);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toHaveText('A native browser preview');
  expect(await page.evaluate(() => (window as any).visibleCode.api.runVisualHistory('redo', 'index.html'))).toBe(true);
  expect(await page.evaluate(() => (window as any).visibleCode.model.getValue())).toBe(before.text);
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toBe(before.text);
  await hiddenSource(page);
  await grip(page).click();
  await sourceViewport(page);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toHaveText('Visible source survives');
});

test('palette code actions hide completely and restore source', async ({ page, baseURL }) => {
  await load(page, baseURL);
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await page.keyboard.press('ControlOrMeta+K');
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Hide code');
  await expect(palette.getByRole('option', { name: /Hide code/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await hiddenSource(page);
  await page.keyboard.press('ControlOrMeta+K');
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Show code');
  await expect(palette.getByRole('option', { name: /Show code/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await sourceViewport(page);
});

test('narrow short viewport hides source, preserves canvas and restores both source surfaces', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await load(page, baseURL);
  await grip(page).click();
  await hiddenSource(page);
  expect((await page.locator('.native-preview-frame').boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await grip(page).click();
  await sourceViewport(page);
  const width = page.locator('.code-width-resize');
  await expect(width).toBeVisible();
  await width.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#content-secondary .monaco-editor')).toBeVisible();
  expect((await page.locator('#content-secondary .monaco-editor').boundingBox())!.width).toBeGreaterThan(20);
  await expect(width).toHaveAttribute('aria-valuetext', /Side-by-side pane minimized/);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  for (const selector of ['#content .monaco-editor', '#content-secondary .monaco-editor']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  }
  await sourceViewport(page);
});

for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }, { width: 844, height: 180 }]) {
  test(`landscape ${viewport.width}x${viewport.height} hides source with truthful resize bounds and restores it`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    await load(page, baseURL);
    const before = await grip(page).getAttribute('aria-valuenow');
    const source = await page.evaluate(async () => (await import('/src/components/code-editor.ts')).getMountedSource('index.html'));
    expect(source).toContain('A native browser preview');
    const zeroLayout = viewport.width === 568 && viewport.height === 320;
    if (zeroLayout) {
      expect(await page.locator('#main').evaluate(el => el.clientHeight)).toBe(0);
      await expect(grip(page)).toHaveAttribute('aria-valuemin', '0');
      await expect(grip(page)).toHaveAttribute('aria-valuemax', '0');
      await expect(grip(page)).toHaveAttribute('aria-valuenow', '0');
    }
    await grip(page).focus();
    await page.keyboard.press('Home');
    await hiddenSource(page);
    const remembered = await page.evaluate(() => JSON.parse(localStorage.getItem('astro-editor.code-height')!).height as number);
    if (zeroLayout) {
      // Toggle state even without layout space; a shown zero-height pane does not claim visible source.
      await page.keyboard.press('Enter');
      await expect(grip(page)).toHaveAttribute('aria-valuetext', 'Code shown, 0 pixels');
      await expect(grip(page)).toHaveAttribute('aria-valuenow', '0');
      await expect(page.locator('#content .monaco-editor')).toBeAttached();
      expect((await page.locator('#code-split').boundingBox())!.height).toBe(0);
      await expect(page.locator('#code-split > .code-pane').first()).not.toHaveAttribute('aria-hidden');
      expect(await page.locator('#code-split > .code-pane').first().evaluate(el => (el as HTMLElement).inert)).toBe(false);
      await page.keyboard.press('Home');
      await hiddenSource(page);
      // The real sidebar control frees space without replacing the mounted source.
      await page.getByRole('separator', { name: 'Resize page structure sidebar' }).press('Enter');
      await expect.poll(() => page.locator('#main').evaluate(el => el.clientHeight)).toBeGreaterThan(0);
      await hiddenSource(page);
    }
    const maximum = Number(await grip(page).getAttribute('aria-valuemax'));
    expect(maximum).toBeGreaterThanOrEqual(0);
    await grip(page).press('Enter');
    await sourceViewport(page);
    const restored = Number(await grip(page).getAttribute('aria-valuenow'));
    if (zeroLayout) {
      const mainHeight = await page.locator('#main').evaluate(el => el.clientHeight);
      expect(restored).toBe(Math.round(Math.max(Math.min(96, mainHeight), Math.min(maximum, remembered * mainHeight))));
    } else await expect(grip(page)).toHaveAttribute('aria-valuenow', before!);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('astro-editor.code-height')!).height)).toBe(remembered);
    expect(await page.evaluate(async () => (await import('/src/components/code-editor.ts')).getMountedSource('index.html'))).toBe(source);
    expect(restored).toBeGreaterThan(0);
    expect(restored).toBeLessThanOrEqual(maximum);
    expect((await page.locator('#code-split').boundingBox())!.height).toBeCloseTo(restored, 0);
    await page.keyboard.press('Enter');
    await hiddenSource(page);
    await page.keyboard.press('Enter');
    await sourceViewport(page);
    await expect(grip(page)).toHaveAttribute('aria-valuenow', String(restored));
  });
}
