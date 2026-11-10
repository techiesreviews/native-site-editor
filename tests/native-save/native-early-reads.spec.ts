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

const SAID = "GitHub isn't answering. Try again in a moment.";
const toast = (page: Page) => page.locator('.editor-toast');

// The clock runs in real time; it jumps past each try's 8 s timeout, and a second at a time through the waits
// between tries until the next goes out (as native-github-silent.spec.ts).
async function failFourTries(page: Page, reads: { seen: number }) {
  for (let tries = 1; tries <= 4; tries++) {
    await expect.poll(async () => { if (reads.seen < tries) await page.clock.fastForward(1_000); return reads.seen; }, { timeout: 30_000 }).toBe(tries);
    await expect(toast(page)).toHaveCount(0);
    await page.clock.fastForward(8_000);
  }
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
// the site opens, as a remembered (repeat) visit already did. The selector stays on the linked branch, disabled
// until the list answers; one GitHub never answers says so with the toast once its four tries are spent.
test('a first visit whose branch list GitHub never answers shows the linked site, then the toast; Try again fills the selector', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = { seen: 0, failing: true };
  await page.route(/\/api\/branches\?/, (route) => { reads.seen++; if (!reads.failing) return route.continue(); });
  await page.goto(`${baseURL}/${HASH}`);
  await expectShown(page);
  await expect(page.locator('#branch')).toHaveValue('main');
  await expect(page.locator('#branch')).toBeDisabled();
  await expect(page.locator('#branch option')).toHaveCount(1);
  await failFourTries(page, reads);
  await expect(toast(page).locator('.editor-toast__text')).toHaveText(SAID);
  await expect(preview(page).locator('.hero h1')).toBeVisible();
  await expect(page.locator('#branch')).toBeDisabled();

  reads.failing = false;
  await toast(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#branch')).toBeEnabled();
  await expect(page.locator('#branch')).toHaveValue('main');
  await expect(page.locator('#notice')).toBeHidden();
  expect(reads.seen).toBe(5);
});

test('a session GitHub never answers is tried four times in all (the page\'s own try first), then the sign-in card offers Retry', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = { seen: 0 };
  await page.route('**/api/session', () => { reads.seen++; });
  await page.goto(`${baseURL}/${HASH}`, { waitUntil: 'commit' });
  await failFourTries(page, reads);
  await expect(page.locator('.login-card[data-mode="error"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry connection', exact: true })).toBeVisible();
  await expect(page.locator('#notice')).toHaveText(SAID);
  expect(reads.seen).toBe(4);
});

test('a repository list GitHub never answers at first asks no early snapshot; the boot\'s next try lists and opens the site', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = { seen: 0 };
  await page.route(/\/api\/repositories$/, (route) => { reads.seen++; if (reads.seen > 1) return route.continue(); });
  const snapshots = count(page, /^\/api\/snapshot$/);
  await page.goto(`${baseURL}/${HASH}`, { waitUntil: 'commit' });
  await expect.poll(async () => { if (reads.seen < 2) await page.clock.fastForward(1_000); return reads.seen; }, { timeout: 30_000 }).toBe(2);
  await expectShown(page);
  await expect(toast(page)).toHaveCount(0);
  expect(snapshots).toHaveLength(1);
});

test('a repository list answered 401 asks no snapshot; the sign-in card offers Continue with GitHub', async ({ page, baseURL }) => {
  await page.route(/\/api\/repositories$/, (route) => route.fulfill({ status: 401, json: { error: 'Connect GitHub to continue.' } }));
  const snapshots = count(page, /^\/api\/snapshot$/);
  await page.goto(`${baseURL}/${HASH}`);
  await expect(page.locator('.login-card[data-mode="expired"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Continue with GitHub', exact: true })).toBeVisible();
  expect(snapshots).toEqual([]);
});

test('an early snapshot GitHub refuses (403) is read afresh by the boot: the page shows from the second read', async ({ page, baseURL }) => {
  let refused = false;
  await page.route(/\/api\/snapshot\?/, async (route) => {
    if (refused) return route.continue();
    refused = true;
    await route.fulfill({ status: 403, json: { error: 'This repository is not selected for this GitHub connection.' } });
  });
  const snapshots = count(page, /^\/api\/snapshot$/);
  await page.goto(`${baseURL}/${HASH}`);
  await expectShown(page);
  expect(snapshots).toHaveLength(2);
  await expect(page.locator('#notice')).toBeHidden();
  await expect(page.locator('#branch')).toBeEnabled();
});

test('an early snapshot GitHub never answers is given up after the read timeout, and the next try opens the site', async ({ page, baseURL }) => {
  let held = false;
  await page.route(/\/api\/snapshot\?/, (route) => {
    if (held) return route.continue();
    held = true;
    return new Promise<void>(() => { /* never answered */ });
  });
  const snapshots = count(page, /^\/api\/snapshot$/);
  await page.goto(`${baseURL}/${HASH}`);
  // The first try counts as failed after 8 s; the next follows 1 s later (src/read-retry.ts).
  await expect.poll(() => snapshots.length, { timeout: 20_000 }).toBe(2);
  await expectShown(page);
  await expect(page.locator('.editor-toast')).toHaveCount(0);
  expect(snapshots).toHaveLength(2);
});

test('the address changed before the boot: the early snapshot of the first address is thrown away and the new address opens', async ({ page, baseURL }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  // The editor's script is held; the early script asks for the first address's snapshot meanwhile.
  await page.route(/\/src\/main\.ts(\?|$)/, async (route) => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
  const snapshots = count(page, /^\/api\/snapshot$/);
  // The held module script holds DOMContentLoaded as well as load.
  await page.goto(`${baseURL}/${HASH}`, { waitUntil: 'commit' });
  try {
    await expect.poll(() => snapshots, { timeout: 30_000 }).toEqual([expect.stringContaining('native-demo&branch=main')]);
    await page.evaluate(() => history.replaceState(null, '', '#repo=530&branch=main'));
  } finally { release(); }
  await expect(preview(page).locator('h1')).toContainText('Routed by folders', { timeout: 30_000 });
  await expect(page.locator('#status')).toContainText('Up to date with main', { timeout: 30_000 });
  await expect(page.locator('#branch')).toHaveValue('main');
  expect(snapshots.filter((read) => read.includes('native-routing'))).toHaveLength(1);
  expect(snapshots.filter((read) => read.includes('native-demo&'))).toHaveLength(1);
});
