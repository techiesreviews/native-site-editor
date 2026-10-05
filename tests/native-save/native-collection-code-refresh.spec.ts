import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { makeCollectionTarget } from '../../src/page-builder/page-builder-document';
import { storedDraft, storedDrafts } from './drafts';
import { publishButton, showPublish } from './publish';

test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const side = '.editor/page-builder.json';
const item = 'work/lifecycle/index.html';
const card = '<article><a href="/work/lifecycle/">Lifecycle</a><p>Original description</p><img src="/images/studio-desk.svg" alt="Lifecycle"></article>';
const home = `<!doctype html><html><head><title>Collection proof</title></head><body><main><div id="proof-cards">${card}</div></main></body></html>`;
const source = '<!doctype html><html><head><title>Lifecycle</title><meta name="description" content="Original description"><meta property="og:image" content="/images/studio-desk.svg"></head><body><main><h1>Lifecycle</h1></main></body></html>';
const recipe = JSON.stringify({ version: 1, pages: { [item]: { fields: { keep: 'yes' } } }, futureKey: { keep: true }, collections: { proof: { pagePath: 'index.html', target: makeCollectionTarget(home, home.indexOf('<div')), folders: ['/work/'], sort: 'title', filter: '', limit: 500, template: '<article><a href="{url}">{title}</a><p>{description}</p><img src="{image}" alt="{title}" data-if="image"></article>', fields: [], overrides: {}, outputFingerprint: card } } }, null, 2) + '\n';
const changed = source.replace('<title>Lifecycle</title>', '<title>Code title</title>').replace('Original description', 'Code description');
const mounted = (page: Page, path: string) => page.evaluate(async path => (await import('/src/components/code-editor.ts')).getMountedSource(path), path);
const frame = (page: Page) => page.frameLocator('.native-preview-frame');
const paths = async (page: Page) => (await storedDrafts(page)).map(draft => draft.path);
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
  await expect(frame(page).locator('#proof-cards a')).toHaveText('Lifecycle');
  expect(await storedDrafts(page)).toEqual([]);
}
async function saveUnchangedCollection(page: Page) {
  await frame(page).locator('#proof-cards article').click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole('separator', { name: 'Resize Style panel', exact: true });
  if (await grip.getAttribute('aria-valuenow') === '0') await grip.click();
  const details = page.locator('.selected-collection');
  if (await details.getAttribute('open') === null) await details.locator('> summary').click();
  await page.getByRole('region', { name: 'Collection settings', exact: true }).getByRole('button', { name: 'Save collection', exact: true }).click();
}
/** Replaces the whole Code source with one paste: one typing group. */
async function pasteSource(page: Page, text: string) {
  await expect(page.locator('#content .monaco-editor')).toBeVisible();
  await page.evaluate(text => navigator.clipboard.writeText(text), text);
  await page.locator('#content [role="textbox"]').first().evaluate(el => (el as HTMLElement).focus());
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}
/** Selects `expected` (first occurrence) in the mounted Code source, then focuses the editor. */
async function selectInCode(page: Page, path: string, expected: string) {
  const text = await mounted(page, path);
  const start = text!.indexOf(expected);
  await page.evaluate(async ({ path, start, expected }) => (await import('/src/components/code-editor.ts')).selectActiveRange({ path, start, end: start + expected.length, expected }), { path, start, expected });
  await page.locator('#content [role="textbox"]').first().evaluate(el => (el as HTMLElement).focus());
}
const undo = (page: Page) => page.locator('.code-editor__undo').first().click();
const redo = (page: Page) => page.locator('.code-editor__redo').first().click();
/** Holds the network read of the editor's JSON (by its Git blob SHA) until released. */
async function holdSidecarRead(page: Page, content: string) {
  const bytes = Buffer.from(content);
  const sha = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
  let release!: () => void, asked = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname.startsWith('/api/file') && decodeURIComponent(url.search).includes(sha), async route => { asked++; await held; await route.fallback(); });
  return { release, asked: () => asked };
}

test('a title and description pasted in Code rebuild the cards once typing settles, undone and redone with the paste', async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, item);
  await pasteSource(page, changed);
  await expect.poll(async () => (await storedDraft(page, item))?.content).toBe(changed);
  // Not on the keystroke: the cards wait for the typing group to settle.
  expect(await storedDraft(page, 'index.html')).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content ?? '').toContain('>Code title</a>');
  await expect(page.locator('#status')).toHaveText(`Updated the cards that list ${item}.`);
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
  expect(await paths(page)).toEqual([side, 'index.html', item]);

  // One Undo takes back the paste and the cards together; one Redo writes all three again.
  await undo(page);
  await expect.poll(() => paths(page)).toEqual([]);
  expect(await mounted(page, item)).toBe(source);
  await redo(page);
  await expect.poll(() => paths(page)).toEqual([side, 'index.html', item]);
  expect((await storedDraft(page, 'index.html'))!.content).toBe(afterHome);
  expect((await storedDraft(page, side))!.content).toBe(afterJson);
  expect((await storedDraft(page, item))!.content).toBe(changed);

  // The preview shows the rebuilt cards; Save collection stays available and finds nothing more to change.
  await open(page, baseURL);
  expect(await mounted(page, 'index.html')).toBe(afterHome);
  await expect(frame(page).locator('#proof-cards a')).toHaveText('Code title');
  await expect(frame(page).locator('#proof-cards p')).toHaveText('Code description');
  await saveUnchangedCollection(page);
  await expect(page.locator('#status')).toHaveText('Collection saved');
  expect((await storedDraft(page, 'index.html'))!.content).toBe(afterHome);
  expect((await storedDraft(page, side))!.content).toBe(afterJson);

  // Save to GitHub commits exactly the rebuilt cards and their recorded output.
  await showPublish(page);
  await publishButton(page).click();
  await expect(page.locator('.publish-menu__message')).toContainText('Saved to GitHub', { timeout: 30_000 });
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text()).toBe(afterHome);
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(side)}`)).text()).toBe(afterJson);
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(item)}`)).text()).toBe(changed);
});

test('typing a title key by key rebuilds the cards only after the typing settles', async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, item);
  await selectInCode(page, item, 'Lifecycle</title>');
  await page.keyboard.type('Typed</title>', { delay: 60 });
  await expect.poll(() => mounted(page, item)).toBe(source.replace('Lifecycle</title>', 'Typed</title>'));
  // Every key restarts the wait: nothing is rebuilt while typing goes on.
  expect(await storedDraft(page, 'index.html')).toBeUndefined();
  expect(await storedDraft(page, side)).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content ?? '').toContain('<a href="/work/lifecycle/">Typed</a>');
  const json = JSON.parse((await storedDraft(page, side))!.content);
  expect(json.collections.proof.outputFingerprint).toContain('>Typed</a>');
  expect(json.collections.proof.outputFingerprint).not.toMatch(/>(T|Ty|Typ|Type)<\/a>/);
  // Undoing the typing group back to where it began takes the cards back with it.
  for (let step = 0; step < 4 && await mounted(page, item) !== source; step++) await undo(page);
  expect(await mounted(page, item)).toBe(source);
  await expect.poll(() => paths(page)).toEqual([]);
});

test('an edit undone while the pages were still loading rebuilds nothing; the next settled edit does', async ({ page, baseURL }) => {
  const sidecar = await holdSidecarRead(page, recipe);
  await page.goto(baseURL!);
  for (const [path, content] of [['index.html', home], [item, source], [side, recipe]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await open(page, baseURL, item);
  await pasteSource(page, changed);
  await expect.poll(async () => (await storedDraft(page, item))?.content).toBe(changed);
  // The rebuild waits for the editor's JSON, still being read.
  await expect.poll(() => sidecar.asked()).toBeGreaterThan(0);
  await page.waitForTimeout(1_200);
  expect(await storedDraft(page, 'index.html')).toBeUndefined();
  await undo(page);
  await expect.poll(() => storedDraft(page, item)).toBeUndefined();
  sidecar.release();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_000);
  // Planned for text that is no longer there: refused, nothing written anywhere.
  expect(await storedDrafts(page)).toEqual([]);
  expect(await mounted(page, item)).toBe(source);
  // A new edit settles and rebuilds from the page as it is now.
  await pasteSource(page, changed);
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content ?? '').toContain('>Code title</a>');
  expect(await paths(page)).toEqual([side, 'index.html', item]);
});

test('after the listing page was opened, the paired Undo and Redo rebuild the cards from the page instead', async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, item);
  await pasteSource(page, changed);
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content ?? '').toContain('>Code title</a>');
  const afterHome = (await storedDraft(page, 'index.html'))!.content;
  const pagesRow = async (name: string) => {
    if (!await page.locator('#explorer').evaluate(el => el.matches(':popover-open'))) await page.locator('#explorer-toggle').click();
    await page.getByRole('tab', { name: 'Pages', exact: true }).click();
    const work = page.locator('#explorer').getByRole('treeitem', { name: 'Work', exact: true });
    if (name !== 'Home' && await work.getAttribute('aria-expanded') !== 'true') await work.locator('.pages-label').first().click();
    await page.locator('#explorer').getByRole('treeitem', { name, exact: true }).locator('.pages-label').first().click();
  };
  // Opening Home gives its cards a new editor model: the paired step can no longer restore them exactly.
  await pagesRow('Home');
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html');
  await expect(frame(page).locator('#proof-cards a')).toHaveText('Code title');
  await pagesRow('Code title');
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', item);
  await undo(page);
  // The page goes back, and its cards are rebuilt from it through the same guards.
  await expect.poll(() => paths(page)).toEqual([side]);
  expect(await mounted(page, item)).toBe(source);
  expect(JSON.parse((await storedDraft(page, side))!.content)).toEqual(JSON.parse(recipe));
  await expect(page.locator('#status')).toHaveText(`Updated the cards that list ${item}.`);
  await redo(page);
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toBe(afterHome);
  expect((await storedDraft(page, item))!.content).toBe(changed);
});

test('hand-edited cards are kept: a Code title edit does not replace them and says why', async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await selectInCode(page, 'index.html', 'Original description</p>');
  await page.keyboard.type('Mine</p>');
  const edited = home.replace('Original description</p>', 'Mine</p>');
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toBe(edited);
  await open(page, baseURL, item);
  await pasteSource(page, changed);
  await expect(page.locator('#status')).toContainText(`The cards that list ${item} were not updated: The cards in index.html were edited by hand`);
  expect((await storedDraft(page, 'index.html'))!.content).toBe(edited);
  expect(await storedDraft(page, side)).toBeUndefined();
  expect((await storedDraft(page, item))!.content).toBe(changed);
});
