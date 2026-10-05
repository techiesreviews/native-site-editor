import { openPageSettingsFromPages } from "./settings-entry";
import { expect, test, type Page } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { storedDrafts, storedDraft } from './drafts';
import { fixtureKind } from './fixture-contract';

const side = '.editor/page-builder.json';
const seed = { version: 1, pages: { 'index.html': { fields: { mood: 'Original mood', keep: 'Keep this' } } }, collections: {}, futureKey: { keep: true } };
async function open(page: Page, baseURL: string | undefined, branch = 'main') {
  await page.goto(`${baseURL}/#repo=501&branch=${branch}&file=index.html`);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html');
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
}
async function settings(page: Page) {
  if (!await page.locator('#explorer').isVisible()) await page.locator('#explorer-toggle').click();
  await page.getByRole('tab', { name: 'Pages', exact: true }).click();
  await openPageSettingsFromPages(page);
  const dialog = page.getByRole('dialog', { name: 'Page settings', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
const errors: string[] = [];
test.beforeEach(({ page }) => { expect(fixtureKind()).toBe('default'); errors.length = 0; page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test('a foreign MCP Fields edit refuses both stale Applies, and reopening preserves it on the next GUI Apply', async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: side, content: JSON.stringify(seed, null, 2) + '\n' } });
  await open(page, baseURL);
  await page.locator('.repository-menu__trigger').click();
  await page.getByRole('button', { name: 'Connect with MCP', exact: true }).click();
  await expect(page.locator('.agent-menu__hint')).toContainText('Paste it into Claude, Codex');
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server: `(\S+)`/.exec(prompt)![1];
  const token = /Authorization: `Bearer (ase_[a-f0-9]{64})`/.exec(prompt)![1];
  const client = new Client({ name: 'settings-fields-proof', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    await page.keyboard.press('Escape');
    const dialog = await settings(page);
    await dialog.getByRole('tab', { name: 'Fields', exact: true }).click();
    await expect(dialog.getByLabel('Mood', { exact: true })).toHaveValue('Original mood');
    await dialog.getByLabel('Date', { exact: true }).fill('2027-05-01');
    const foreign = structuredClone(seed);
    foreign.pages['index.html'].fields.mood = 'Foreign mood';
    const read = await client.callTool({ name: 'read_file', arguments: { path: side } });
    expect(read.isError).toBeFalsy();
    const current = JSON.parse((read.content[0] as { text: string }).text);
    const written = await client.callTool({ name: 'write_file', arguments: { path: side, expectedHash: current.hash, content: JSON.stringify(foreign, null, 2) + '\n' } });
    expect(written.isError, JSON.stringify(written)).toBeFalsy();
    await expect.poll(async () => JSON.parse((await storedDraft(page, side))?.content ?? '{}').pages?.['index.html']?.fields?.mood).toBe('Foreign mood');
    const foreignBytes = (await storedDraft(page, side))!.content;
    for (let attempt = 0; attempt < 2; attempt++) {
      await dialog.getByRole('button', { name: 'Apply page settings', exact: true }).click();
      await expect(dialog.getByRole('status')).toHaveText('The repository or source changed meanwhile. Reopen settings and try again.');
      expect((await storedDraft(page, side))!.content).toBe(foreignBytes);
      expect(await storedDraft(page, 'index.html')).toBeUndefined();
    }
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const reopened = await settings(page);
    await reopened.getByRole('tab', { name: 'Fields', exact: true }).click();
    await expect(reopened.getByLabel('Mood', { exact: true })).toHaveValue('Foreign mood');
    await reopened.getByLabel('Date', { exact: true }).fill('2027-05-01');
    await reopened.getByRole('button', { name: 'Apply page settings', exact: true }).click();
    await expect(reopened).toBeHidden();
    expect(JSON.parse((await storedDraft(page, side))!.content)).toEqual(foreign);
    expect((await storedDraft(page, 'index.html'))!.content).toContain('<meta name="date" content="2027-05-01">');
  } finally { await client.close(); }
});

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

// Hold the controller's Apply at the success boundary: the remount must read
// the newly authoritative Fields, carrying only typing made after submit.
test('successful Fields rebase preserves foreign values and only carries newer local typing', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.evaluate(async () => {
    const { createSiteSettings } = await import('/src/components/site-settings.ts');
    let values = { Mood: 'Original mood', Keep: 'Keep this' };
    const controller = createSiteSettings({
      applyPage: async () => { values = { Mood: 'Foreign mood', Keep: 'Applied keep' }; },
      pageFields: host => {
        const root = document.createElement('section'); root.className = 'collections-panel';
        for (const [name, value] of Object.entries(values)) {
          const label = document.createElement('label'); const span = document.createElement('span'); span.textContent = name;
          const input = document.createElement('input'); input.value = value; label.append(span, input); root.append(label);
        }
        host.append(root);
        return { update() {}, openGrid() {}, dirty: () => false, pageFieldsDirty: () => false,
          pageFieldsStamp: () => [...root.querySelectorAll('input')].map(input => input.value).join('|'),
          pageFieldSource: source => source, pageFieldDocument: sidecar => sidecar, destroy: () => root.remove() };
      },
      planUrl: () => ({ ok: false, error: 'unused' }), applyUrl: async () => undefined,
      applySite: async () => undefined, open404: async () => undefined, applyNavigation: async () => undefined,
      uploadImage: async () => undefined, imageUrl: async () => undefined,
    });
    controller.page({ path: 'index.html', source: '<!doctype html><html><head><title>Home</title></head><body></body></html>', route: '/', images: [] });
    const dialog = [...document.querySelectorAll('dialog')].find(item => item.open)!;
    [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Fields')!.click();
    [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Apply page settings')!.click();
    const keep = [...dialog.querySelectorAll('.collections-panel label')].find(label => label.querySelector('span')?.textContent === 'Keep')!.querySelector('input')!;
    keep.focus(); keep.value = 'Newer local keep'; keep.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const dialog = page.getByRole('dialog', { name: 'Page settings', exact: true });
  await expect(dialog.getByRole('status')).toContainText('Your newer changes are not applied yet');
  await expect(dialog.getByLabel('Mood', { exact: true })).toHaveValue('Foreign mood');
  await expect(dialog.getByLabel('Keep', { exact: true })).toHaveValue('Newer local keep');
  await expect(dialog.getByLabel('Keep', { exact: true })).toBeFocused();
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
