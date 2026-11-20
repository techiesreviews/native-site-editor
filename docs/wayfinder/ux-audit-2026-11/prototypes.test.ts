import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const root = new URL('./prototypes/', import.meta.url);
let browser: Browser | undefined;
after(async () => browser?.close());
const checks: [string, (page: Page) => Promise<void>][] = [
  ['01-row-menu', async p => {
    await p.getByRole('button', { name: 'Recent work menu', exact: true }).click();
    assert.equal(await p.getByRole('button', { name: 'Duplicate', exact: true }).count(), 0);
    await p.keyboard.press('Escape');
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Site header menu', exact: true }).click();
    await p.keyboard.press('Escape');
    assert.match(await p.locator('#preview .selection').innerText(), /Site header/);
    assert.ok(await p.getByRole('button', { name: 'Move element up', exact: true }).isDisabled());
    await p.getByRole('button', { name: 'Recent work menu', exact: true }).click();
    await p.getByRole('button', { name: 'Duplicate', exact: true }).click();
    assert.equal(await p.locator('[data-node]').count(), 4);
    assert.ok(await p.evaluate(() => document.activeElement !== document.body));
    await p.getByRole('button', { name: 'Recent work copy menu', exact: true }).click();
    await p.getByRole('button', { name: 'Move up', exact: true }).click();
    assert.match(await p.locator('[data-node]').nth(1).innerText(), /copy/);
    await p.getByRole('button', { name: 'Recent work copy menu', exact: true }).click();
    await p.getByRole('button', { name: 'Remove', exact: true }).click();
    await p.getByRole('button', { name: 'Remove element', exact: true }).click();
    assert.equal(await p.locator('[data-node]').count(), 3);
    assert.ok(await p.evaluate(() => document.activeElement?.hasAttribute('data-select')));
  }],
  ['02-link-popup', async p => {
    await p.getByRole('button', { name: 'Link selected words', exact: true }).click();
    const todayWords = await p.locator('#words').boundingBox(), todayPopup = await p.locator('#link-popup').boundingBox();
    assert.ok(todayWords && todayPopup && todayPopup.y < todayWords.y + todayWords.height);
    await p.keyboard.press('Escape');
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Link selected words', exact: true }).click();
    const a = await p.locator('#words').boundingBox(), b = await p.locator('#link-popup').boundingBox();
    assert.ok(a && b && (b.y >= a.y + a.height || b.y + b.height <= a.y));
    await p.getByLabel('Address', { exact: true }).fill('/about/');
    await p.getByLabel('Address', { exact: true }).press('Enter');
    assert.equal(await p.locator('#words a').getAttribute('href'), '/about/');
  }],
  ['03-canvas-page', async p => {
    await p.getByRole('button', { name: 'About', exact: true }).click({ modifiers: ['Control'] });
    assert.equal(await p.locator('#page-name').textContent(), 'Home');
    assert.match(await p.locator('#page-heading').textContent() ?? '', /About/);
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'About', exact: true }).click({ modifiers: ['Control'] });
    assert.equal(await p.locator('#page-name').textContent(), 'About');
    assert.match(await p.locator('#source').textContent() ?? '', /index.html/);
    assert.match(await p.locator('#page-heading').textContent() ?? '', /About/);
  }],
  ['04-media-details', async p => {
    await p.getByRole('button', { name: 'Open Studio desk', exact: true }).click();
    await p.getByLabel('Description', { exact: true }).fill('Unfinished description');
    await p.getByRole('button', { name: 'Back to media', exact: true }).click();
    await p.getByRole('button', { name: 'Open Studio desk', exact: true }).click();
    assert.equal(await p.getByLabel('Description', { exact: true }).inputValue(), 'Saved desk illustration');
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Open Studio desk', exact: true }).click();
    await p.getByLabel('Description', { exact: true }).fill('Unfinished description');
    await p.getByRole('button', { name: 'Back to media', exact: true }).click();
    await p.getByRole('button', { name: 'Open Studio desk', exact: true }).click();
    assert.equal(await p.getByLabel('Description', { exact: true }).inputValue(), 'Unfinished description');
    await p.getByRole('button', { name: 'Discard', exact: true }).click();
    assert.equal(await p.getByLabel('Description', { exact: true }).inputValue(), 'Saved desk illustration');
    await p.getByLabel('Description', { exact: true }).fill('New saved description');
    await p.getByRole('button', { name: 'Save details', exact: true }).click();
    await p.getByRole('button', { name: 'Back to media', exact: true }).click();
    await p.getByRole('button', { name: 'Open Studio desk', exact: true }).click();
    assert.equal(await p.getByLabel('Description', { exact: true }).inputValue(), 'New saved description');
    await p.getByLabel('Collection', { exact: true }).selectOption('Work');
    await p.getByRole('button', { name: 'Back to media', exact: true }).click();
    await p.getByRole('button', { name: 'Open Studio desk', exact: true }).click();
    assert.equal(await p.getByLabel('Collection', { exact: true }).inputValue(), 'Work');
    await p.getByRole('button', { name: 'Save details', exact: true }).click();
    await p.getByRole('button', { name: 'Back to media', exact: true }).click();
    await p.getByRole('button', { name: 'Open Studio desk', exact: true }).click();
    assert.equal(await p.getByLabel('Collection', { exact: true }).inputValue(), 'Work');
  }],
  ['05-clean-paste', async p => {
    await p.getByRole('button', { name: 'Paste sample', exact: true }).click();
    assert.equal(await p.locator('#copy p,#copy li,#copy a').count(), 0);
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Paste sample', exact: true }).click();
    assert.equal(await p.locator('#copy p').count(), 2);
    assert.equal(await p.locator('#copy li').count(), 2);
    assert.equal(await p.locator('#copy a').getAttribute('href'), '/work/');
    assert.equal(await p.locator('#copy [style]').count(), 0);
    await p.getByRole('button', { name: 'Undo paste', exact: true }).click();
    assert.equal(await p.locator('#copy').innerText(), 'A small studio with a thoughtful approach.');
    await p.locator('#copy').focus();
    await p.locator('#copy').evaluate(node => {
      const selection = getSelection(), range = document.createRange();
      range.selectNodeContents(node.querySelector('p')!); range.collapse(false);
      selection!.removeAllRanges(); selection!.addRange(range);
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', '<p style="font-family:serif">New <strong>paragraph</strong></p><ul><li>One</li><li>Two</li></ul>');
      clipboardData.setData('text/plain', 'New paragraph One Two');
      node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    });
    assert.match(await p.locator('#copy').innerText(), /A small studio with a thoughtful approach/);
    assert.equal(await p.locator('#copy > p').count(), 2);
    assert.equal(await p.locator('#copy li').count(), 2);
    await p.locator('#copy').press('Control+z');
    assert.equal(await p.locator('#copy').innerText(), 'A small studio with a thoughtful approach.');
    await p.getByRole('button', { name: 'Paste sample', exact: true }).click();
  }],
  ['06-unique-anchors', async p => {
    await p.getByRole('button', { name: 'Duplicate section', exact: true }).click();
    assert.deepEqual(await p.locator('[data-anchor]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-anchor'))), ['work', 'work']);
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Duplicate section', exact: true }).click();
    await p.getByRole('button', { name: 'Duplicate section', exact: true }).click();
    const anchors = await p.locator('[data-anchor]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-anchor')));
    assert.deepEqual(anchors, ['work', 'work-2', 'work-3']);
    assert.equal(await p.locator('[data-anchor="work-3"] a').getAttribute('href'), '#work-3');
  }],
  ['07-multi-select', async p => {
    await p.getByRole('button', { name: 'Tree: Heading', exact: true }).click();
    await p.getByRole('button', { name: 'Tree: Button', exact: true }).click({ modifiers: ['Shift'] });
    assert.equal(await p.locator('[data-tree][aria-pressed="true"]').count(), 1);
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Tree: Heading', exact: true }).click();
    await p.getByRole('button', { name: 'Tree: Button', exact: true }).click({ modifiers: ['Shift'] });
    assert.ok(await p.getByRole('button', { name: 'Wrap', exact: true }).isDisabled());
    await p.getByRole('button', { name: 'Tree: Heading', exact: true }).click();
    await p.getByRole('button', { name: 'Canvas: Paragraph', exact: true }).click({ modifiers: ['Shift'] });
    assert.equal(await p.locator('[data-tree][aria-pressed="true"]').count(), 2);
    await p.getByRole('button', { name: 'Wrap', exact: true }).click();
    assert.equal(await p.locator('[data-wrapper]').count(), 1);
    await p.getByRole('button', { name: 'Unwrap', exact: true }).click();
    assert.equal(await p.locator('[data-wrapper]').count(), 0);
    await p.getByRole('button', { name: 'Copy elements', exact: true }).click();
    await p.keyboard.press('Control+v');
    assert.equal(await p.locator('[data-tree]').count(), 5);
  }],
  ['08-command-search', async p => {
    await p.keyboard.press('Control+k');
    await p.getByLabel('Search commands', { exact: true }).fill('heading');
    await p.getByLabel('Search commands', { exact: true }).press('Enter');
    assert.equal(await p.locator('[data-element]').count(), 4);
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.keyboard.press('Control+k');
    await p.getByLabel('Search commands', { exact: true }).fill('heading');
    await p.getByLabel('Search commands', { exact: true }).press('Enter');
    assert.equal(await p.locator('[data-element]').count(), 4);
    await p.keyboard.press('Control+k');
    await p.getByLabel('Search commands', { exact: true }).fill('find recent');
    await p.keyboard.press('Enter');
    assert.match(await p.locator('[data-element][aria-pressed="true"]').innerText(), /Recent work/);
    assert.ok(await p.evaluate(() => document.activeElement?.hasAttribute('data-element')));
    await p.keyboard.press('Control+k');
    await p.getByLabel('Search commands', { exact: true }).fill('duplicate');
    await p.keyboard.press('Enter');
    assert.equal(await p.locator('[data-element]').count(), 5);
  }],
  ['09-shared-change', async p => {
    assert.equal(await p.getByRole('button', { name: 'Saved on both pages', exact: true }).count(), 0);
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByLabel('Brand name', { exact: true }).fill('Audit Studio');
    await p.getByRole('button', { name: 'Save shared change', exact: true }).click();
    await p.getByRole('button', { name: 'Open About', exact: true }).click();
    assert.equal(await p.locator('#page-name').textContent(), 'About');
    assert.equal(await p.locator('#shared-brand').textContent(), 'Audit Studio');
    await p.getByRole('button', { name: 'Save on both pages', exact: true }).click();
    assert.equal(await p.getByRole('button', { name: 'Saved on both pages', exact: true }).count(), 1);
    await p.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.ok(await p.getByRole('button', { name: 'Save shared change', exact: true }).isEnabled());
    await p.getByRole('button', { name: 'Save shared change', exact: true }).click();
  }],
  ['10-client-bar', async p => {
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Preview as client', exact: true }).click();
    await p.getByRole('button', { name: 'Edit approved heading', exact: true }).click();
    await p.getByLabel('Heading', { exact: true }).fill('A new client heading');
    assert.equal(await p.locator('#client-heading').textContent(), 'A new client heading');
    assert.equal(await p.getByRole('button', { name: 'Designer permissions', exact: true }).count(), 0);
    await p.getByRole('button', { name: 'Edit approved image', exact: true }).click();
    await p.getByRole('button', { name: 'Choose Garden', exact: true }).click();
    assert.equal(await p.locator('#client-picture').getAttribute('aria-label'), 'Garden');
  }],
  ['11-style-source', async p => {
    await p.getByRole('button', { name: 'After', exact: true }).click();
    await p.getByRole('button', { name: 'Padding source', exact: true }).click();
    assert.match(await p.locator('#sources').innerText(), /Site token/);
    await p.getByRole('button', { name: 'Reset this screen width', exact: true }).click();
    assert.equal(await p.locator('#padding-value').textContent(), '32 px');
    await p.getByRole('button', { name: 'Reset this element', exact: true }).click();
    assert.equal(await p.locator('#padding-value').textContent(), '24 px');
    await p.getByRole('button', { name: 'Undo reset', exact: true }).click();
    assert.equal(await p.locator('#padding-value').textContent(), '32 px');
  }],
];
for (const [name, check] of checks) {
  test(name, async () => {
    const file = new URL(`${name}.html`, root);
    assert.ok(existsSync(file), `${name}: standalone page exists`);
    browser ??= await chromium.launch({ headless: true });
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const remote: string[] = [];
      await page.route(/^https?:/, route => { remote.push(route.request().url()); return route.abort(); });
      try {
        await page.goto(file.href);
        await check(page);
        assert.deepEqual(errors, []);
        assert.deepEqual(remote, [], `${name}: no remote requests`);
        for (const colorScheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow at ${width}`);
          if (process.env.ASE_PROTO_SHOTS === '1') {
            const folder = new URL('./shots/', import.meta.url);
            mkdirSync(folder, { recursive: true });
            await page.screenshot({ path: new URL(`${name}-${width}-${colorScheme}.png`, folder).pathname, fullPage: true });
          }
        }
      } finally { await page.close(); }
    }
  });
}
test('index links all eleven standalone pages', async () => {
  const index = new URL('index.html', root);
  assert.ok(existsSync(index));
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(index, 'utf8');
  for (const [name] of checks) assert.ok(html.includes(`${name}.html`));
});
