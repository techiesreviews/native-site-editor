import { expect, test, type Page } from '@playwright/test';
import { makeCollectionTarget } from '../../src/page-builder/page-builder-document';
import { storedDraft, storedDrafts } from './drafts';

test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const side = '.editor/page-builder.json';
const item = 'work/lifecycle/index.html';
const card = '<article><a href="/work/lifecycle/">Lifecycle</a><p>Original description</p><img src="/images/studio-desk.svg" alt="Lifecycle"></article>';
const home = `<!doctype html><html><head><title>Collection proof</title></head><body><main><div id="proof-cards">${card}</div></main></body></html>`;
const source = '<!doctype html><html><head><title>Lifecycle</title><meta name="description" content="Original description"><meta property="og:image" content="/images/studio-desk.svg"></head><body><main><h1>Lifecycle</h1></main></body></html>';
const recipe = JSON.stringify({ version: 1, pages: { [item]: { fields: { keep: 'yes' } } }, futureKey: { keep: true }, collections: { proof: { pagePath: 'index.html', target: makeCollectionTarget(home, home.indexOf('<div')), folders: ['/work/'], sort: 'title', filter: '', limit: 500, template: '<article><a href="{url}">{title}</a><p>{description}</p><img src="{image}" alt="{title}" data-if="image"></article>', fields: [], overrides: {}, outputFingerprint: card } } }, null, 2) + '\n';
const mounted = (page: Page, path: string) => page.evaluate(async path => (await import('/src/components/code-editor.ts')).getMountedSource(path), path);
async function open(page: Page, baseURL: string | undefined, path = 'index.html') {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', path);
  await expect(page.locator('.native-preview-frame')).toBeVisible();
}
async function seed(page: Page, baseURL: string | undefined, asset = 'studio-desk.svg') {
  await page.goto(baseURL!);
  for (const [path, content] of [['index.html', home], [item, source], [side, recipe]]) {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content: content.replaceAll('studio-desk.svg', asset) } })).status()).toBe(204);
  }
  await open(page, baseURL);
  await expect(page.frameLocator('.native-preview-frame').locator('#proof-cards a')).toHaveText('Lifecycle');
  expect(await storedDrafts(page)).toEqual([]);
}
async function saveUnchangedCollection(page: Page) {
  await page.frameLocator('.native-preview-frame').locator('#proof-cards article').click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole('separator', { name: 'Resize Style panel', exact: true });
  if (await grip.getAttribute('aria-valuenow') === '0') await grip.click();
  const details = page.locator('.selected-collection');
  if (await details.getAttribute('open') === null) await details.locator('> summary').click();
  await page.getByRole('region', { name: 'Collection settings', exact: true }).getByRole('button', { name: 'Save collection', exact: true }).click();
}
test('unchanged collection Save refreshes persisted Code metadata and Undo preserves the source edit', async ({ page, baseURL, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page, baseURL);
  await open(page, baseURL, item);
  const changed = source.replace('<title>Lifecycle</title>', '<title>Code title</title>').replace('Original description', 'Code description');
  const editor = page.locator('#content .monaco-editor');
  await expect(editor).toBeVisible();
  await page.evaluate(text => navigator.clipboard.writeText(text), changed);
  await page.locator('#content [role="textbox"]').first().evaluate(el => (el as HTMLElement).focus());
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
  await expect.poll(() => mounted(page, item)).toBe(changed);
  await expect.poll(async () => (await storedDraft(page, item))?.content).toBe(changed);
  await open(page, baseURL);
  // Code defers baking. Save the unchanged recipe using the current persisted source.
  expect(await mounted(page, 'index.html')).toBe(home);
  expect(await storedDraft(page, side)).toBeUndefined();
  await saveUnchangedCollection(page);
  await test.info().attach('code-refresh-drafts.json', { body: JSON.stringify(await storedDrafts(page), null, 2), contentType: 'application/json' });
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toContain('>Code title</a>');
  const afterHome = (await storedDraft(page, 'index.html'))!.content;
  const afterJson = (await storedDraft(page, side))!.content;
  expect(afterHome).toContain('<p>Code description</p>');
  expect(afterHome).not.toMatch(/<template|data-each|data-if|\{title\}/);
  const document = JSON.parse(afterJson);
  expect(document.futureKey).toEqual({ keep: true });
  expect(document.pages).toEqual(JSON.parse(recipe).pages);
  expect(document.collections.proof.target).toEqual(JSON.parse(recipe).collections.proof.target);
  expect(document.collections.proof.outputFingerprint).toContain('>Code title</a>');
  expect(document.collections.proof.outputFingerprint).toContain('<p>Code description</p>');
  expect(afterHome).toContain(document.collections.proof.outputFingerprint);
  expect((await storedDraft(page, item))!.content).toBe(changed);
  expect((await storedDrafts(page)).map(draft => draft.path)).toEqual([side, 'index.html', item]);
  await expect(page.frameLocator('.native-preview-frame').locator('#proof-cards a')).toHaveText('Code title');
  await expect(page.frameLocator('.native-preview-frame').locator('#proof-cards p')).toHaveText('Code description');
  // Refresh is one history step. Undo leaves the earlier Code edit as its own draft.
  await page.locator('.code-editor__undo').first().click();
  await expect.poll(async () => (await storedDrafts(page)).map(draft => draft.path)).toEqual([item]);
  expect((await storedDraft(page, item))!.content).toBe(changed);
  expect(await mounted(page, 'index.html')).toBe(home);
  await page.locator('.code-editor__redo').first().click();
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toBe(afterHome);
  expect((await storedDraft(page, side))!.content).toBe(afterJson);
  expect((await storedDraft(page, item))!.content).toBe(changed);
});
