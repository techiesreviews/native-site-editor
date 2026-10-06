import { expect, test, type Page } from '@playwright/test';
import { storedDrafts, storedDraft, editorMounted } from './drafts';
import { fixtureKind } from './fixture-contract';

async function open(page: Page, baseURL: string | undefined, branch = 'main') {
  await page.goto(`${baseURL}/#repo=501&branch=${branch}&file=index.html`);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html');
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  await editorMounted(page);
}
const errors: string[] = [];
test.beforeEach(({ page }) => { expect(fixtureKind()).toBe('default'); errors.length = 0; page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test('Files Delete waiting for the real text index cannot write into a newly selected branch', async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: 'proof-unread.css', content: '/* Unimported stylesheet: only the background text index reads this. */\n' } });
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: 'feature', path: 'proof-unread.css', content: '/* Feature branch unimported stylesheet. */\n' } });
  const snapshot = await (await page.request.get(`${baseURL}/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=main`)).json();
  const featureBefore = await (await page.request.get(`${baseURL}/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=feature`)).json();
  const unread = snapshot.tree.find((entry: { path: string }) => entry.path === 'proof-unread.css');
  expect(unread).toBeTruthy();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let captured = false;
  await page.route('**/api/files?*', async route => {
    const url = new URL(route.request().url());
    if (!captured && (url.searchParams.get('shas') ?? '').split(',').includes(unread.sha)) {
      captured = true; await held;
    }
    await route.continue();
  });
  try {
    await open(page, baseURL);
    await expect.poll(() => captured).toBe(true);
    await page.locator('#explorer-toggle').click();
    await page.getByRole('tab', { name: 'Files', exact: true }).click();
    await page.locator('#explorer').getByRole('button', { name: 'about', exact: true }).focus();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog', { name: /^Delete/ })).toHaveCount(0);
    await page.goto(`${baseURL}/#repo=501&branch=feature&file=index.html`);
    await expect(page.locator('#status')).toContainText('Up to date with feature');
    release();
    await expect(page.locator('#status')).toHaveText(/^(?:The repository changed meanwhile\. Try again\.|The last request did not complete\.)$/);
    expect(await storedDrafts(page)).toEqual([]);
    await expect(page.getByRole('dialog', { name: /^Delete/ })).toHaveCount(0);
    const feature = await (await page.request.get(`${baseURL}/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=feature`)).json();
    expect(feature).toEqual(featureBefore);
    expect(feature.tree.some((entry: { path: string }) => entry.path === 'about/index.html')).toBe(true);
    const main = await (await page.request.get(`${baseURL}/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=main`)).json();
    expect(main).toEqual(snapshot);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

for (const tab of ['Pages', 'Files'] as const) {
  test(`${tab} Delete waiting for the index refuses a newer target edit before opening confirmation`, async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: 'proof-target-unread.css', content: '/* Hold deletion before its source proof. */\n' } });
    const snapshot = await (await page.request.get(`${baseURL}/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=main`)).json();
    const unread = snapshot.tree.find((entry: { path: string }) => entry.path === 'proof-target-unread.css');
    let release!: () => void; let captured = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/files?*', async route => {
      if (!captured && (new URL(route.request().url()).searchParams.get('shas') ?? '').split(',').includes(unread.sha)) { captured = true; await held; }
      await route.continue();
    });
    try {
      await page.goto(`${baseURL}/#repo=501&branch=main&file=about/index.html`);
      await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'about/index.html');
      await expect.poll(() => captured).toBe(true);
      await editorMounted(page, 'about/index.html');
      await page.locator('#explorer-toggle').click();
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const row = tab === 'Pages' ? page.locator('#explorer').getByRole('treeitem', { name: /^About/, exact: false })
        : page.locator('#explorer').getByRole('button', { name: 'about', exact: true });
      await row.focus(); await page.keyboard.press('Delete');
      await expect(page.getByRole('dialog', { name: /^Delete/ })).toHaveCount(0);
      const edited = await page.evaluate(async () => {
        const { getMountedSource, replaceActiveRange } = await import('/src/components/code-editor.ts');
        const source = getMountedSource('about/index.html')!;
        replaceActiveRange({ path: 'about/index.html', start: source.length, end: source.length, expected: '', text: '\n<!-- Newer target edit -->' });
        return getMountedSource('about/index.html');
      });
      await expect.poll(async () => (await storedDraft(page, 'about/index.html'))?.content).toBe(edited);
      release();
      await expect(page.locator('#notice')).toContainText('repository or source changed meanwhile');
      await expect(page.getByRole('dialog', { name: /^Delete/ })).toHaveCount(0);
      expect((await storedDraft(page, 'about/index.html'))?.content).toBe(edited);
      expect((await storedDrafts(page)).map(draft => [draft.path, draft.deleted ?? false])).toEqual([['about/index.html', false]]);
      // A new request after the index has loaded is valid, rather than permanently blocked.
      await row.focus(); await page.keyboard.press('Delete');
      const dialog = page.getByRole('dialog', { name: /^Delete/ });
      await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
  });
}

for (const [tab, change] of [['Pages', 'branch'], ['Pages', 'resync'], ['Files', 'resync']] as const) {
  test(`${tab} pending Delete refuses ${change} before the held index completes`, async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: 'proof-scope-unread.css', content: '/* Pending delete scope proof. */\n' } });
    await page.request.post(`${baseURL}/__demo/branch`, { data: { name: 'feature', path: 'proof-scope-unread.css', content: '/* Feature. */\n' } });
    const snapshot = await (await page.request.get(`${baseURL}/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=main`)).json();
    const unread = snapshot.tree.find((entry: { path: string }) => entry.path === 'proof-scope-unread.css');
    let release!: () => void; let captured = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/files?*', async route => {
      if (!captured && (new URL(route.request().url()).searchParams.get('shas') ?? '').split(',').includes(unread.sha)) { captured = true; await held; }
      await route.continue();
    });
    try {
      await open(page, baseURL); await expect.poll(() => captured).toBe(true);
      await page.locator('#explorer-toggle').click(); await page.getByRole('tab', { name: tab, exact: true }).click();
      const row = tab === 'Pages' ? page.locator('#explorer').getByRole('treeitem', { name: /^About/, exact: false })
        : page.locator('#explorer').getByRole('button', { name: 'about', exact: true });
      await row.focus(); await page.keyboard.press('Delete');
      await expect(page.getByRole('dialog', { name: /^Delete/ })).toHaveCount(0);
      if (change === 'branch') {
        await open(page, baseURL, 'feature');
        await expect(page.locator('#status')).toContainText('Up to date with feature');
      } else {
        await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: 'proof-scope-unread.css', content: '/* New commit while deletion waited. */\n' } });
        const reloaded = page.waitForResponse(response => response.url().includes('/api/snapshot?') && response.status() === 200);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await reloaded;
        await expect(page.locator('#status')).toContainText('Up to date with main');
      }
      release();
      await expect(page.locator('#notice')).toContainText('repository or source changed meanwhile');
      await expect(page.getByRole('dialog', { name: /^Delete/ })).toHaveCount(0);
      expect(await storedDrafts(page)).toEqual([]);
    } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
  });
}
