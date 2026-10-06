import { expect, test, type Page } from '@playwright/test';
import { storedDrafts } from './drafts';
import { fixtureKind } from './fixture-contract';

async function open(page: Page, baseURL: string | undefined, branch = 'main') {
  await page.goto(`${baseURL}/#repo=501&branch=${branch}&file=index.html`);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html');
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
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
