import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

// TD 06 limit 1 (ticket 26): a read GitHub never answers counts as failed
// after 8 s and is tried three more times, 1, 2 and 4 s apart; then the page
// leaves its loading state, and the failed panel says so with a
// Try again button, which repeats the open once GitHub answers. One test per settle-matrix row of the
// snapshot read: never answers, fails, answers after failing.
// Default fixture group: native-starter (501).

const HASH = '#repo=501&branch=main&file=index.html';
const SAID = "GitHub isn't answering. Try again in a moment.";
const notice = (page: Page) => page.locator('#notice');
// Try again is on the failed panel (#content's message); with the explorer open, which covers that panel, it is in the notice instead.
const again = (where: Locator) => where.getByRole('button', { name: 'Try again', exact: true });
const tryAgain = (page: Page, covered = false) => again(covered ? notice(page) : page.locator('#content .empty-message'));

// Every snapshot read is counted; while `failing`, `fail` handles it, else it goes to the fake GitHub.
async function snapshotRoute(page: Page, fail: (route: Route) => unknown) {
  const reads = { seen: 0, failing: true };
  await page.route(/\/api\/snapshot\?/, (route) => {
    reads.seen++;
    return reads.failing ? fail(route) : route.continue();
  });
  return reads;
}

// The clock runs in real time; it jumps past each try's 8 s timeout, and a
// second at a time through the waits between tries until the next goes out.
async function failFourTries(page: Page, reads: { seen: number }, from = 0) {
  for (let tries = 1; tries <= 4; tries++) {
    await expect.poll(async () => { if (reads.seen < from + tries) await page.clock.fastForward(1_000); return reads.seen; }, { timeout: 30_000 }).toBe(from + tries);
    await expect(notice(page)).toBeHidden();
    await page.clock.fastForward(8_000);
  }
}

async function expectFailedOpen(page: Page, covered = false) {
  await expect(notice(page)).toContainText(SAID);
  await expect(tryAgain(page, covered)).toBeVisible();
  // The one button is where the failure shows: never also in the other place.
  await expect(tryAgain(page, !covered)).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText(SAID);
  await expect(page.locator('.editor-toast')).toHaveCount(0);
  await expect(page.locator('#content')).toContainText('Your repository could not be opened.');
  await expect(page.locator('#refresh')).toBeEnabled();
}

async function expectOpened(page: Page) {
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html', { timeout: 30_000 });
  await expect(page.locator('#status')).toContainText('Up to date with main', { timeout: 30_000 });
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
}

test('a snapshot GitHub never answers is tried four times, then the failed panel offers Try again, which opens the site', async ({ page, baseURL }) => {
  await page.clock.install();
  // Held reads are never answered: the editor's timeout aborts them.
  const reads = await snapshotRoute(page, () => {});
  await page.goto(`${baseURL}/${HASH}`);
  await failFourTries(page, reads);
  await expectFailedOpen(page);
  // The panel stays while the clock runs on, and no fifth try goes out.
  await page.clock.fastForward(10_000);

  reads.failing = false;
  await tryAgain(page).click();
  await expectOpened(page);
  // Four held tries and the one Try again made: no fifth try came before it.
  expect(reads.seen).toBe(5);
});

test('a snapshot whose every try fails on the network shows the same panel; Try again opens the site', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await snapshotRoute(page, (route) => route.abort('failed'));
  await page.goto(`${baseURL}/${HASH}`);
  // Failed tries follow each other as fast as the waits are jumped.
  await expect.poll(async () => { if (reads.seen < 4) await page.clock.fastForward(1_000); return reads.seen; }, { timeout: 30_000 }).toBe(4);
  await expectFailedOpen(page);

  reads.failing = false;
  await tryAgain(page).click();
  await expectOpened(page);
  expect(reads.seen).toBe(5);
});

test('a snapshot answered 503 twice opens the site on its third try, with no notice', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await snapshotRoute(page, (route) => {
    if (reads.seen === 2) reads.failing = false;
    return route.fulfill({ status: 503, json: { error: 'Service unavailable' } });
  });
  await page.goto(`${baseURL}/${HASH}`);
  await expect.poll(async () => { if (reads.seen < 3) await page.clock.fastForward(1_000); return reads.seen; }, { timeout: 30_000 }).toBe(3);
  await expectOpened(page);
  await expect(notice(page)).toBeHidden();
  expect(reads.seen).toBe(3);
});

test('Refresh of a shown site GitHub never answers offers Try again, which reloads it on the same page', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await snapshotRoute(page, () => {});
  reads.failing = false;
  await page.goto(`${baseURL}/${HASH}`);
  await expectOpened(page);
  const opened = reads.seen;

  reads.failing = true;
  // Refresh from GitHub sits in the repository menu's branch flyout (native-branch-menu.spec.ts opens it).
  await page.locator('#refresh').evaluate((button) => (button as HTMLButtonElement).click());
  await failFourTries(page, reads, opened);
  // The explorer is open here (Refresh sits in its menu) and covers the failed panel: the notice in it carries the button.
  await expectFailedOpen(page, true);

  reads.failing = false;
  await tryAgain(page, true).click();
  await expectOpened(page);
  expect(reads.seen).toBe(opened + 5);
});

test('a remembered boot whose guessed snapshot GitHub never answers shows the panel after four tries, not eight', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await snapshotRoute(page, () => {});
  reads.failing = false;
  // The first open writes the boot memory (src/boot-memory.ts) the reload guesses from.
  await page.goto(`${baseURL}/${HASH}`);
  await expectOpened(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ase:boot-memory:v1:501')), { timeout: 15_000 }).not.toBeNull();
  const opened = reads.seen;

  // The guessed snapshot goes out with the session and is never answered; the branch list answers.
  reads.failing = true;
  await page.reload();
  await failFourTries(page, reads, opened);
  await expectFailedOpen(page);
  // No fresh read after the failed guess: four tries in all.
  await page.clock.fastForward(10_000);

  reads.failing = false;
  await tryAgain(page).click();
  await expectOpened(page);
  expect(reads.seen).toBe(opened + 5);
});

test('a file GitHub never answers, opened outside an open, shows the plain notice and no Try again', async ({ page, baseURL }) => {
  await page.clock.install();
  const snapshot = page.waitForResponse(/\/api\/snapshot\?/);
  await page.goto(`${baseURL}/${HASH}`);
  await expectOpened(page);
  const { tree } = await (await snapshot).json() as { tree: { path: string; sha: string }[] };
  const robots = tree.find((entry) => entry.path === 'robots.txt')!.sha;
  // Reads of robots.txt (alone or in a batch) are never answered.
  const reads = { seen: 0 };
  await page.route((url) => /^\/api\/files?$/.test(url.pathname) && url.search.includes(robots), () => { reads.seen++; });

  await page.locator('#explorer-toggle').click();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.locator('.file-row[data-path="robots.txt"]').click();
  await failFourTries(page, reads);
  await expect(page.locator('#notice')).toContainText(SAID);
  await expect(page.locator('#status')).toHaveText('The last request did not complete.');
  await expect(tryAgain(page)).toHaveCount(0);
  expect(reads.seen).toBe(4);
});

test('a branch list GitHub never answers shows the panel after four tries; Try again chooses the repository again and opens the site', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = { seen: 0, failing: true };
  await page.route(/\/api\/branches\?/, (route) => { reads.seen++; if (!reads.failing) return route.continue(); });
  // The site remembered from an earlier visit, not named in the address: the open waits for the branch list.
  // A linked site's snapshot, asked by the page itself (src/boot-early.ts), proves its branch and opens it
  // without the list, as a remembered boot does.
  await page.addInitScript(() => localStorage.setItem('astro-site-editor:workspace:v1:native-demo-user', JSON.stringify({ repoId: 501, branch: 'main', path: 'index.html' })));
  await page.goto(`${baseURL}/`);
  await failFourTries(page, reads);
  await expect(notice(page)).toContainText(SAID);
  await expect(page.locator('#content')).toContainText('Branches could not be loaded.');

  reads.failing = false;
  await tryAgain(page).click();
  await expectOpened(page);
  expect(reads.seen).toBe(5);
});

// A file's blob, read from the snapshot as it passes; its reads (alone or in a batch) are never answered while `failing`.
async function holdFileReads(page: Page, path: string) {
  const reads = { seen: 0, failing: true, sha: '' };
  await page.route(/\/api\/snapshot\?/, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { tree?: { path: string; sha: string }[] };
    reads.sha ||= body.tree?.find((entry) => entry.path === path)?.sha ?? '';
    await route.fulfill({ response, json: body });
  });
  await page.route((url) => /^\/api\/files?$/.test(url.pathname) && Boolean(reads.sha) && url.search.includes(reads.sha), (route) => {
    reads.seen++;
    if (!reads.failing) return route.continue();
  });
  return reads;
}

test('the home page GitHub never answers while the site opens fails the open after four tries; Try again opens it', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await holdFileReads(page, 'index.html');
  await page.goto(`${baseURL}/${HASH}`);
  await failFourTries(page, reads);
  await expectFailedOpen(page);
  // Not read again by the file's own open: four tries in all.
  await page.clock.fastForward(10_000);
  expect(reads.seen).toBe(4);

  reads.failing = false;
  await tryAgain(page).click();
  await expectOpened(page);
});

test('the file a reopen shows, never answered, offers Try again, which reopens it', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await holdFileReads(page, 'robots.txt');
  await page.goto(`${baseURL}/#repo=501&branch=main&file=robots.txt`);
  await failFourTries(page, reads);
  // The file-read failure panel (the source pane's own message) carries the button; the notice keeps the words only.
  await expect(page.locator('#content .empty-message')).toContainText(SAID);
  await expect(notice(page)).toContainText(SAID);
  await expect(tryAgain(page)).toBeVisible();
  await expect(tryAgain(page, true)).toHaveCount(0);

  reads.failing = false;
  await tryAgain(page).click();
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'robots.txt', { timeout: 30_000 });
  await expect(page.locator('#status')).toContainText('Up to date with main', { timeout: 30_000 });
  await expect(page.locator('#content')).not.toContainText(SAID);
});

test('at 390 px a long Worker message and Try again both fit without clipping', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.clock.install();
  const reads = await snapshotRoute(page, (route) => route.fulfill({ status: 503, json: { error: 'GitHub is unavailable. '.repeat(8).trim() } }));
  await page.goto(`${baseURL}/${HASH}`);
  // Every try answers 503; the waits are jumped until the failure shows.
  await expect.poll(async () => { await page.clock.fastForward(1_000); return notice(page).isVisible(); }, { timeout: 30_000 }).toBe(true);
  await expect(notice(page)).toContainText('GitHub is unavailable.');
  const button = tryAgain(page);
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const noticeBox = await notice(page).boundingBox();
  expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(390);
  reads.failing = false;
  await button.click();
  await expectOpened(page);
});
