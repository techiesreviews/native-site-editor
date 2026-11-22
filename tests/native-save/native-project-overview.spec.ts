import { test, expect, type Page } from '@playwright/test';

test('a confirmed empty account shows the approved empty state without search controls @smoke', async ({ page, baseURL }) => {
  await page.route('**/api/repositories*', route => route.fulfill({ json: [] }));
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole('heading', { name: 'No sites in your list', exact: true })).toBeVisible();
  await expect(page.locator('.project-overview__bar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add from GitHub', exact: true })).toBeVisible();
});

test('Continue editing has a 44 px target on portrait and landscape touch screens @smoke', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/`);
    const open = page.getByRole('button', { name: 'Continue editing', exact: true });
    for (const width of [320, 390, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      await expect(open).toBeVisible();
      expect((await open.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  } finally { await context.close(); }
});

test('Remove from list hides only the card and keeps the repository available @smoke', async ({ page, baseURL }) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto(`${baseURL}/`);
  const card = page.locator('.project-card').first();
  const id = await card.locator('[data-open]').getAttribute('data-open');
  const name = await card.locator('h1').innerText();
  await card.getByRole('button', { name: /^Options for / }).click();
  await page.getByRole('menuitem', { name: 'Remove from list', exact: true }).click({ timeout: 5000 });
  await expect(page.locator(`.project-overview [data-open="${id}"]`)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
  await expect(page.locator(`.project-overview [data-open="${id}"]`)).toHaveCount(0);
  await expect(page.locator(`#repository option[value="${id}"]`)).toHaveCount(1);
  expect(writes).toEqual([]);
  await page.locator('.repository-menu__trigger').click();
  const exactName = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  await page.locator('.repository-menu__repo').filter({ has: page.locator('.repository-menu__repo-name').filter({ hasText: exactName }) }).click();
  await expect(page.frameLocator('.native-preview-frame').locator('body')).toBeVisible();
  await page.locator('.repository-menu__trigger').click();
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await expect(page.locator(`.project-overview [data-open="${id}"]`)).toHaveCount(1);
});

test('removing a project in one tab keeps it hidden when another tab returns to projects @smoke', async ({ page, context, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const other = await context.newPage();
  try {
    await other.goto(`${baseURL}/`);
    await other.locator('.project-overview [data-open="501"]').click();
    await expect(other.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
    await page.getByRole('button', { name: 'Options for native-demo', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remove from list', exact: true }).click();
    await expect(page.locator('.project-overview [data-open="501"]')).toHaveCount(0);
    const hidden = () => other.evaluate(() => {
      const projects = JSON.parse(localStorage.getItem('native-site-editor:projects:v1:native-demo-user') ?? '[]');
      return projects.find((project: { repo: { id: number }; hidden?: boolean }) => project.repo.id === 501)?.hidden;
    });
    expect(await hidden()).toBe(true);
    await other.locator('.repository-menu__trigger').click();
    await other.locator('#repository-actions').getByRole('button', { name: 'All projects', exact: true }).click();
    await expect(other.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
    expect(await hidden()).toBe(true);
    await expect(other.locator('.project-overview [data-open="501"]')).toHaveCount(0);
  } finally { await other.close(); }
});

declare global {
  interface Window { projectPictureGate: { held: boolean; release(): void } }
}

async function hearSignOut(page: Page) {
  await page.evaluate(async () => {
    const { onWarmCopyForgotten } = await import('/src/warm-copy.ts');
    onWarmCopyForgotten(() => { document.documentElement.dataset.projectSignout = 'heard'; });
  });
}

test('an older picture cannot replace another tab’s newer branch or opening time @smoke', async ({ page, context, baseURL }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    if (window !== window.top) return;
    let held: MessageEvent | undefined, waiting = true;
    window.projectPictureGate = { held: false, release() {
      waiting = false;
      if (held) window.dispatchEvent(new MessageEvent('message', { data: held.data, source: held.source, origin: held.origin }));
    } };
    window.addEventListener('message', event => {
      if (!waiting || event.data?.type !== 'picture-result') return;
      event.stopImmediatePropagation();
      held = event;
      window.projectPictureGate.held = true;
    }, true);
  });
  const other = await context.newPage();
  const choice = () => other.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('native-site-editor:projects:v1:native-demo-user') ?? '[]') as {
      repo: { id: number }; branch: string; opened?: number;
    }[];
    const project = projects.find(project => project.repo.id === 501);
    return { branch: project?.branch, opened: project?.opened };
  });
  try {
    await page.goto(`${baseURL}/`);
    const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
    const branch = await page.request.post(`${baseURL}/__demo/branch`, { data: { name: 'release-preview', path: 'index.html', content: home } });
    expect(branch.ok()).toBe(true);
    await page.locator('.project-overview [data-open="501"]').click();
    await expect.poll(() => page.evaluate(() => window.projectPictureGate.held)).toBe(true);
    await other.goto(`${baseURL}/#repo=501&branch=release-preview`);
    await expect(other.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
    await expect.poll(async () => (await choice()).branch).toBe('release-preview');
    const newer = await choice();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.evaluate(() => window.projectPictureGate.release());
    await page.clock.runFor(50);
    expect(await choice()).toEqual(newer);
    await other.locator('.repository-menu__trigger').click();
    await other.locator('#repository-actions').getByRole('button', { name: 'All projects', exact: true }).click();
    await other.locator('.project-overview [data-open="501"]').click();
    await expect(other).toHaveURL(/branch=release-preview/);
  } finally { await other.close(); }
});

test('sign-out in another tab blocks a held thumbnail from recreating project memory @smoke', async ({ page, context, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const other = await context.newPage();
  await other.clock.install();
  await other.addInitScript(() => {
    if (window !== window.top) return;
    let held: MessageEvent | undefined, waiting = true;
    window.projectPictureGate = { held: false, release() {
      waiting = false;
      if (held) window.dispatchEvent(new MessageEvent('message', { data: held.data, source: held.source, origin: held.origin }));
    } };
    window.addEventListener('message', event => {
      if (!waiting || event.data?.type !== 'picture-result') return;
      event.stopImmediatePropagation();
      held = event;
      window.projectPictureGate.held = true;
    }, true);
  });
  const memory = () => other.evaluate(() => localStorage.getItem('native-site-editor:projects:v1:native-demo-user'));
  try {
    await other.goto(`${baseURL}/`);
    await hearSignOut(other);
    await other.locator('.project-overview [data-open="501"]').click();
    await expect.poll(() => other.evaluate(() => window.projectPictureGate.held)).toBe(true);
    // Keep the picture's timeout paused while the other tab completes sign-out.
    await other.clock.pauseAt(await other.evaluate(() => Date.now() + 1000));
    await page.route('**/api/session', route => route.fulfill({ json: { configured: true, user: null, installUrl: null } }));
    await page.route('**/auth/login*', route => route.abort());
    await page.locator('.repository-menu__trigger').click();
    await page.getByRole('button', { name: 'Sign out of native-demo-user', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to open your sites', exact: true })).toBeVisible();
    await expect.poll(memory).toBeNull();
    await expect(other.locator('html')).toHaveAttribute('data-project-signout', 'heard');
    await other.evaluate(() => window.projectPictureGate.release());
    // Settle the released frame reply with the controlled clock, without reaching its timeout.
    await other.clock.runFor(50);
    expect(await memory()).toBeNull();
  } finally { await other.close(); }
});

test('signing out of another account preserves this account’s removed cards and future caching @smoke', async ({ page, context, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const other = await context.newPage();
  const memory = () => other.evaluate(() => JSON.parse(localStorage.getItem('native-site-editor:projects:v1:other-user') ?? '[]') as {
    repo: { id: number }; hidden?: boolean; opened?: number;
  }[]);
  try {
    await other.route('**/api/session', async route => {
      const response = await route.fetch();
      const session = await response.json();
      session.user.login = 'other-user';
      await route.fulfill({ response, json: session });
    });
    await other.goto(`${baseURL}/`);
    await hearSignOut(other);
    await other.getByRole('button', { name: 'Options for native-demo', exact: true }).click();
    await other.getByRole('menuitem', { name: 'Remove from list', exact: true }).click();
    expect((await memory()).find(project => project.repo.id === 501)?.hidden).toBe(true);
    await page.route('**/auth/logout', route => route.fulfill({ status: 200, body: '' }));
    await page.route('**/api/session', route => route.fulfill({ json: { configured: true, user: null, installUrl: null } }));
    await page.route('**/auth/login*', route => route.abort());
    await page.locator('.repository-menu__trigger').click();
    await page.getByRole('button', { name: 'Sign out of native-demo-user', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to open your sites', exact: true })).toBeVisible();
    await expect(other.locator('html')).toHaveAttribute('data-project-signout', 'heard');
    expect((await memory()).find(project => project.repo.id === 501)?.hidden).toBe(true);
    const kept = other.locator('.project-overview [data-open]').first();
    const id = Number(await kept.getAttribute('data-open'));
    await kept.click();
    await expect(other.frameLocator('.native-preview-frame').locator('body')).toBeVisible();
    await other.locator('.repository-menu__trigger').click();
    await other.locator('#repository-actions').getByRole('button', { name: 'All projects', exact: true }).click();
    await expect(other.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
    await expect(other.locator('.project-overview [data-open="501"]')).toHaveCount(0);
    await expect.poll(async () => (await memory()).find(project => project.repo.id === id)?.opened).toBeGreaterThan(0);
  } finally { await other.close(); }
});

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
  await page.reload();
  await expect(page.locator('.project-overview')).toHaveAttribute('data-view', 'grid');
  await page.locator('.project-card--grid').first().hover();
  const gridName = page.locator('.project-card--grid .project-card__open').first();
  await expect.poll(() => gridName.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return element === hit || element.contains(hit);
  })).toBe(true);
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

test('one cached-project click survives recovery of a failed listing @smoke', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible();
  await page.route('**/api/repositories*', route => route.fulfill({ status: 500, json: { error: 'GitHub is unavailable' } }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reload repositories', exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/repositories*', async route => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
    release();
    await expect(page.frameLocator('.native-preview-frame').locator('body')).toBeVisible();
    await expect(page.locator('.repository-menu__trigger')).toBeFocused();
  } finally { release(); }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('Back to projects stays available while site files load and cancels their late reply @smoke', async ({ page, baseURL }) => {
  let release!: () => void, fileRequests = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/files\?/, async route => {
    fileRequests++;
    await held;
    await route.fulfill({ response: await route.fetch() });
  });
  try {
    await page.goto(`${baseURL}/`);
    await page.locator('.project-overview [data-open="501"]').click();
    await expect.poll(() => fileRequests).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Opening native-demo…', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to projects', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
    const response = page.waitForResponse(/\/api\/files\?/);
    release();
    await (await response).finished();
  } finally { release(); }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await expect(page.locator('.native-preview-frame')).toBeHidden();
  await expect(page).not.toHaveURL(/#repo=/);
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeVisible();
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
