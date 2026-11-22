import { test, expect } from '@playwright/test';

test('a new browser distinguishes a pending and failed list from an empty account @smoke', async ({ page, baseURL }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/repositories*', async route => {
    await held;
    await route.fulfill({ status: 500, json: { error: 'GitHub is unavailable' } });
  });
  try {
    await page.goto(`${baseURL}/`);
    await expect(page.getByText('Checking GitHub…', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add from GitHub', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No sites in your list', exact: true })).toHaveCount(0);
    release();
    await expect(page.getByRole('button', { name: 'Reload repositories', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No sites in your list', exact: true })).toHaveCount(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.getByRole('button', { name: 'Reload repositories', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible();
  } finally { release(); }
});

test('the root opens projects without loading a site, then opens only the clicked site @smoke', async ({ page, baseURL }) => {
  const siteReads: string[] = [];
  page.on('request', request => {
    if (/\/api\/(branches|snapshot|files?|blob)\?/.test(request.url())) siteReads.push(request.url());
  });
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible();
  expect(siteReads).toEqual([]);
  await expect(page.locator('#explorer-toggle')).toBeHidden();
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('.project-overview')).toHaveAttribute('data-view', 'grid');
  await page.getByRole('searchbox', { name: 'Search projects', exact: true }).fill('no-such-project');
  await expect(page.getByText('No match for “no-such-project”', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.locator('.project-overview [data-open]').first().click();
  await expect(page.frameLocator('.native-preview-frame').locator('body')).toBeVisible();
  await expect(page.locator('#explorer-toggle')).toBeVisible();
  expect(siteReads.some(url => url.includes('/snapshot?'))).toBe(true);
  await page.locator('.repository-menu__trigger').click();
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
  await expect(page.locator('.native-preview-frame')).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
});

test('a returning root visit keeps the project list usable while GitHub is slow @smoke', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/repositories*', async route => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await expect(page.locator('.project-overview')).toHaveAttribute('data-view', 'grid');
  } finally { release(); }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  let releaseSnapshot!: () => void;
  let snapshotRequests = 0;
  const snapshotHeld = new Promise<void>(resolve => { releaseSnapshot = resolve; });
  await page.route(/\/api\/snapshot\?/, async route => {
    snapshotRequests++;
    await snapshotHeld;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  try {
    await page.locator('.project-overview [data-open]').first().click({ timeout: 5000 });
    await expect.poll(() => snapshotRequests).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Back to projects', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to projects', exact: true }).click({ timeout: 5000 });
    await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
  } finally { releaseSnapshot(); }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await expect(page.locator('.native-preview-frame')).toBeHidden();
});
