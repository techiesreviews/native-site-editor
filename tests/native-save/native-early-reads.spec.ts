import { test, expect, type Page, type Route } from '@playwright/test';

// The page's own first reads (src/boot-early.ts), on a first visit (no boot
// memory): the page asks for the session and the repository list itself, and
// the early script asks for the linked repository's snapshot as soon as the
// list names it. The boot takes each once and checks it as its own reads
// (src/boot-reads.ts, src/workspace-boot.ts). One test per settle-matrix row
// (ticket docs/work/faster-opening/issues/01-fewer-server-waits.md, Done).
// Default fixture group: native-starter (501).

const HASH = '#repo=501&branch=main';
const preview = (page: Page) => page.frameLocator('.native-preview-frame');

/** Every request to `pattern`, counted as the browser sends it (preloads included, whoever answers it). */
function count(page: Page, pattern: RegExp) {
  const seen: string[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (pattern.test(url.pathname)) seen.push(url.pathname + url.search); });
  return seen;
}

async function expectShown(page: Page) {
  await expect(preview(page).locator('.hero h1')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#status')).toContainText('Up to date with main', { timeout: 30_000 });
}

test('the page asks for the session and the list once each, and its preloads are used', async ({ page, baseURL }) => {
  const session = count(page, /^\/api\/session$/);
  const list = count(page, /^\/api\/repositories$/);
  const preloadMessages: string[] = [];
  page.on('console', (message) => { if (/preload/i.test(message.text())) preloadMessages.push(message.text()); });
  await page.goto(`${baseURL}/${HASH}`);
  await expectShown(page);
  // Chrome says an unused preload a few seconds after the page's load.
  await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
  // fixed-wait: Chrome's unused-preload message comes on a timer after load; nothing to wait for if it never comes.
  await page.waitForTimeout(4_000);
  expect(session).toHaveLength(1);
  expect(list).toHaveLength(1);
  expect(preloadMessages).toEqual([]);
});

test('the snapshot is asked while the session is still unanswered; the page shows from that one read', async ({ page, baseURL }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/session', async (route) => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
  const snapshots = count(page, /^\/api\/snapshot$/);
  await page.goto(`${baseURL}/${HASH}`);
  try {
    await expect.poll(() => snapshots.length, { timeout: 30_000 }).toBe(1);
  } finally { release(); }
  await expectShown(page);
  expect(snapshots).toHaveLength(1);
});

test('an early snapshot answered under another session tag is thrown away: the page shows from a fresh read', async ({ page, baseURL }) => {
  let first = true;
  await page.route(/\/api\/snapshot\?/, async (route: Route) => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'x-editor-session': 'another-session' } });
  });
  const snapshots = count(page, /^\/api\/snapshot$/);
  await page.goto(`${baseURL}/${HASH}`);
  await expectShown(page);
  expect(snapshots).toHaveLength(2);
});

test('a list that does not name the linked repository asks no early snapshot: the plain message shows', async ({ page, baseURL }) => {
  await page.route(/\/api\/repositories$/, async (route) => {
    const response = await route.fetch();
    const list = await response.json() as { id: number }[];
    await route.fulfill({ response, json: list.filter((repo) => repo.id !== 501) });
  });
  const snapshots = count(page, /^\/api\/snapshot$/);
  await page.goto(`${baseURL}/${HASH}`);
  await expect(page.locator('#notice')).toContainText('The linked repository is not available to this GitHub account.', { timeout: 30_000 });
  expect(snapshots).toEqual([]);
});

test('the boot first (the early script held until the page shows): it asks for itself, once each, and the early script asks nothing', async ({ page, baseURL }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/boot-early/, async (route) => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
  const session = count(page, /^\/api\/session$/);
  const snapshots = count(page, /^\/api\/snapshot$/);
  // The held async script holds the page's load event, not its DOMContentLoaded.
  await page.goto(`${baseURL}/${HASH}`, { waitUntil: 'domcontentloaded' });
  try {
    await expectShown(page);
  } finally { release(); }
  await page.waitForResponse(/boot-early/);
  // The released script runs as its own task: one turn of the page's event loop later it has run.
  // fixed-wait: a claimed early script changes nothing to observe; this proves it ran and asked nothing.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(await page.evaluate(() => Object.keys((globalThis as { aseEarlyReads?: object }).aseEarlyReads ?? { unclaimed: true }))).toEqual([]);
  expect(session).toHaveLength(1);
  expect(snapshots).toHaveLength(1);
});

// Changed by this ticket, open for Lex's OK (ticket Done): before, a first visit waited for the branch list,
// so one GitHub never answers stopped the opening with the toast. Now the early snapshot proves the branch and
// the site opens, as a remembered (repeat) visit already did; the branch selector keeps the linked branch.
test('a first visit whose branch list GitHub never answers still shows the linked site, on the linked branch', async ({ page, baseURL }) => {
  await page.route(/\/api\/branches\?/, () => { /* never answered */ });
  await page.goto(`${baseURL}/${HASH}`);
  await expectShown(page);
  await expect(page.locator('#branch')).toHaveValue('main');
  await expect(page.locator('#branch')).toBeEnabled();
});
