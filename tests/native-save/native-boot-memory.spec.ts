import { test, expect, type Page, type Route } from '@playwright/test';

// Remember last boot (src/boot-memory.ts): a reload asks for the remembered
// snapshot and files before the session is known, and shows them only once
// the session, the listing and the fresh snapshot prove them.

const HASH = '#repo=501&branch=main&file=index.html';
const KEY = 'ase:boot-memory:v1:501';
const REPO = 'native-demo-user/native-demo';
const preview = (page: Page) => page.frameLocator('.native-preview-frame');
type Memory = { login: string; fullName: string; files: { path: string; sha: string }[] };

async function firstBoot(page: Page, baseURL?: string) {
  await page.goto(`${baseURL}/${HASH}`);
  await expect(preview(page).locator('.hero h1')).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KEY), { timeout: 15_000 }).not.toBeNull();
  return JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY))!) as Memory;
}
const editMemory = (page: Page, edit: (memory: Memory) => void, memory: Memory) => {
  edit(memory);
  return page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, JSON.stringify(memory)] as const);
};
const sha = (memory: Memory, path: string) => memory.files.find((file) => file.path === path)!.sha;

// Guessed reads go out while the session is held; their file contents are
// marked (`data-guess` on the page's first h1), so a marked page proves the
// guess was used.
async function watchGuesses(page: Page, options: { hold?: boolean; snapshotFrom?: string } = {}) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const state = { sessionDone: false, early: [] as string[], late: [] as string[] };
  await page.route('**/api/session', async (route) => {
    const response = await route.fetch();
    if (options.hold) await gate;
    await route.fulfill({ response });
    state.sessionDone = true;
  });
  const reads = async (route: Route) => {
    const url = new URL(route.request().url());
    (state.sessionDone ? state.late : state.early).push(url.pathname + url.search);
    if (state.sessionDone) return route.continue();
    if (url.pathname === '/api/snapshot' && options.snapshotFrom) {
      const real = await route.fetch({ url: url.toString().replace(encodeURIComponent(options.snapshotFrom), encodeURIComponent(REPO)) });
      return route.fulfill({ response: real });
    }
    if (url.pathname !== '/api/files') return route.continue();
    const real = options.snapshotFrom
      ? await route.fetch({ url: url.toString().replace(encodeURIComponent(options.snapshotFrom), encodeURIComponent(REPO)) })
      : await route.fetch();
    const body = await real.json() as { files: Record<string, string> };
    for (const key of Object.keys(body.files)) body.files[key] = body.files[key].replace('<h1', '<h1 data-guess="1"');
    return route.fulfill({ response: real, json: body });
  };
  await page.route(/\/api\/(snapshot|files?)\?/, reads);
  return { state, release };
}

test('a warm reload reads the remembered snapshot and files with the session and paints them once proven', async ({ page, baseURL }) => {
  const memory = await firstBoot(page, baseURL);
  expect(memory.fullName).toBe(REPO);
  expect(memory.files.map((file) => file.path)).toContain('index.html');
  const { state, release } = await watchGuesses(page, { hold: true });
  await page.reload();
  try {
    await expect.poll(() => state.early.map((read) => read.split('?')[0]).sort()).toEqual(['/api/files', '/api/snapshot']);
  } finally { release(); }

  await expect(preview(page).locator('.hero h1[data-guess]')).toBeVisible();
  await expect(page.locator('#status')).toContainText('Up to date with main');
  expect(state.late.filter((read) => read.startsWith('/api/snapshot')), 'no second snapshot').toEqual([]);
  expect(state.late.filter((read) => read.includes(sha(memory, 'index.html'))), 'the page is not read again').toEqual([]);
  // The branch list still fills the selector.
  await expect(page.locator('#branch option')).not.toHaveCount(0);
});

test('a file whose SHA moved is not shown from the guess; the fresh content paints', async ({ page, baseURL }) => {
  const memory = await firstBoot(page, baseURL);
  // The remembered index.html is another blob (about/ is not in the memory: use a stylesheet's).
  await editMemory(page, (m) => { m.files.find((file) => file.path === 'index.html')!.sha = sha(m, 'styles/site.css'); }, memory);
  const { state } = await watchGuesses(page);
  await page.reload();
  await expect(preview(page).locator('.hero h1')).toBeVisible();
  expect(state.early.some((read) => read.startsWith('/api/files'))).toBe(true);
  await expect(preview(page).locator('[data-guess]')).toHaveCount(0);
  await expect.poll(async () => sha(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY))!), 'index.html')).not.toBe(sha(memory, 'styles/site.css'));
});

test("another account's memory is not used", async ({ page, baseURL }) => {
  const memory = await firstBoot(page, baseURL);
  await editMemory(page, (m) => { m.login = 'someone-else'; }, memory);
  await watchGuesses(page);
  await page.reload();
  await expect(preview(page).locator('.hero h1')).toBeVisible();
  await expect(page.locator('#status')).toContainText('Up to date with main');
  await expect(preview(page).locator('[data-guess]')).toHaveCount(0);
  await expect.poll(async () => JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY))!).login).toBe('native-demo-user');
});

test('a renamed repository (same id, new name) falls back and the memory takes the new name', async ({ page, baseURL }) => {
  const memory = await firstBoot(page, baseURL);
  const old = 'native-demo-user/old-name';
  await editMemory(page, (m) => { m.fullName = old; }, memory);
  const { state } = await watchGuesses(page, { snapshotFrom: old });
  await page.reload();
  await expect(preview(page).locator('.hero h1')).toBeVisible();
  await expect(page.locator('#status')).toContainText('Up to date with main');
  expect(state.early.some((read) => read.includes(encodeURIComponent(old)))).toBe(true);
  await expect(preview(page).locator('[data-guess]')).toHaveCount(0);
  await expect.poll(async () => JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY))!).fullName).toBe(REPO);
});

test('a draft of the page wins over the remembered base', async ({ page, baseURL }) => {
  const memory = await firstBoot(page, baseURL);
  const original = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.evaluate(([original, baseSha]) => {
    const scope = { account: 'native-demo-user', repoId: 501, repo: 'native-demo-user/native-demo', branch: 'main' };
    const key = 'astro-site-editor:draft:v1:' + JSON.stringify([scope.account, scope.repoId, scope.branch, 'index.html']);
    localStorage.setItem(key, JSON.stringify({ ...scope, version: 1, path: 'index.html', baseSha, original, content: original.replace('<h1', '<h1 data-draft="1"'), updatedAt: Date.now() }));
  }, [original, sha(memory, 'index.html')] as const);
  await watchGuesses(page);
  await page.reload();
  await expect(preview(page).locator('.hero h1[data-draft]')).toBeVisible();
  await expect(preview(page).locator('[data-guess]')).toHaveCount(0);
});

test('a deleted remembered branch takes the normal path: its message, and another branch can be picked', async ({ page, baseURL }) => {
  const memory = await firstBoot(page, baseURL);
  await editMemory(page, (m) => { (m as Memory & { branch: string }).branch = 'gone'; }, memory);
  const { state } = await watchGuesses(page);
  await page.goto(`${baseURL}/#repo=501&branch=gone&file=index.html`);
  await page.reload();
  await expect(page.locator('#content')).toContainText('The linked branch is no longer available. Choose a branch from Pages & files.');
  expect(state.early.some((read) => read.startsWith('/api/snapshot') && read.includes('branch=gone'))).toBe(true);
  await expect(page.locator('#notice')).not.toContainText('could not be opened');
  await expect(page.locator('#branch option[value="main"]')).toBeAttached();
  await expect(page.locator('#branch')).toBeEnabled();
  await page.locator('#branch').selectOption('main', { force: true });
  await expect(preview(page).locator('.hero h1')).toBeVisible();
});

test('a failed branch list on the remembered path still paints, on the remembered branch', async ({ page, baseURL }) => {
  await firstBoot(page, baseURL);
  await watchGuesses(page);
  await page.route(/\/api\/branches\?/, (route) => route.fulfill({ status: 500, json: { error: 'down' } }));
  await page.reload();
  await expect(preview(page).locator('.hero h1[data-guess]')).toBeVisible();
  await expect(page.locator('#branch')).toHaveValue('main');
  await expect(page.locator('#branch')).toBeEnabled();
});

test('a stalled guessed snapshot does not hold the branch picker once the branch list is in', async ({ page, baseURL }) => {
  await firstBoot(page, baseURL);
  let sessionDone = false;
  await page.route('**/api/session', async (route) => { const response = await route.fetch(); await route.fulfill({ response }); sessionDone = true; });
  await page.route(/\/api\/snapshot\?/, (route) => (sessionDone ? route.continue() : undefined));
  await page.reload();
  await expect(page.locator('#branch')).toBeEnabled();
  await expect(page.locator('#branch option[value="main"]')).toBeAttached();
  await expect(page.locator('#branch option')).not.toHaveCount(0);
});

test('a branch list that fails before the guessed snapshot lands does not drop the proven guess', async ({ page, baseURL }) => {
  await firstBoot(page, baseURL);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let failed = false;
  await watchGuesses(page);
  await page.route(/\/api\/snapshot\?/, async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await page.route(/\/api\/branches\?/, async (route) => { await route.fulfill({ status: 500, json: { error: 'down' } }); failed = true; });
  await page.reload();
  await expect.poll(() => failed).toBe(true);
  await expect(page.locator('#branch option')).toHaveText(['Loading branches…']);
  await expect(page.locator('#branch')).toBeDisabled();
  release();
  await expect(preview(page).locator('.hero h1[data-guess]')).toBeVisible();
  await expect(page.locator('#branch')).toBeEnabled();
  await expect(page.locator('#branch')).toHaveValue('main');
});

test('a failed branch list and a guess that never lands show the branch failure within the bound', async ({ page, baseURL }) => {
  await firstBoot(page, baseURL);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/api\/snapshot\?/, async (route) => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
  await page.route(/\/api\/branches\?/, (route) => route.fulfill({ status: 500, json: { error: 'down' } }));
  await page.reload();
  await expect(page.locator('#branch option')).toHaveText(['Branches unavailable'], { timeout: 8_000 });
  await expect(page.locator('#content')).toContainText('Branches could not be loaded. Reload repositories to retry.');
  // The guess arriving late neither opens nor paints.
  release();
  await page.waitForTimeout(1500);
  await expect(page.locator('#branch option')).toHaveText(['Branches unavailable']);
  await expect(preview(page).locator('.hero h1')).toHaveCount(0);
});

test('a failed branch list and a failed guess take the normal error path', async ({ page, baseURL }) => {
  await firstBoot(page, baseURL);
  await page.route(/\/api\/snapshot\?/, (route) => route.fulfill({ status: 404, json: { error: 'Branch not found.' } }));
  await page.route(/\/api\/branches\?/, (route) => route.fulfill({ status: 500, json: { error: 'down' } }));
  await page.reload();
  await expect(page.locator('#branch option')).toHaveText(['Branches unavailable']);
  await expect(page.locator('#content')).toContainText('Branches could not be loaded. Reload repositories to retry.');
});
