import { test, expect, type Page, type Route } from '@playwright/test';

// TD 06 limit 1 (ticket 26): a read GitHub never answers counts as failed
// after 8 s and is tried three more times, 1, 2 and 4 s apart; then the page
// leaves its loading state, and the toast says so with Try again, which
// repeats the open once GitHub answers. One test per settle-matrix row of the
// snapshot read: never answers, fails, answers after failing.
// Default fixture group: native-starter (501).

const HASH = '#repo=501&branch=main&file=index.html';
const SAID = "GitHub isn't answering. Try again in a moment.";
const toast = (page: Page) => page.locator('.editor-toast');

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
    await expect(toast(page)).toHaveCount(0);
    await page.clock.fastForward(8_000);
  }
}

async function expectFailedOpen(page: Page) {
  await expect(toast(page).locator('.editor-toast__text')).toHaveText(SAID);
  await expect(page.locator('#status')).toHaveText(SAID);
  await expect(page.locator('#content')).toContainText('Your repository could not be opened.');
  await expect(page.locator('#refresh')).toBeEnabled();
}

async function expectOpened(page: Page) {
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html', { timeout: 30_000 });
  await expect(page.locator('#status')).toContainText('Up to date with main', { timeout: 30_000 });
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
}

test('a snapshot GitHub never answers is tried four times, then the toast offers Try again, which opens the site', async ({ page, baseURL }) => {
  await page.clock.install();
  // Held reads are never answered: the editor's timeout aborts them.
  const reads = await snapshotRoute(page, () => {});
  await page.goto(`${baseURL}/${HASH}`);
  await failFourTries(page, reads);
  await expectFailedOpen(page);
  // Held under the pointer past its 6 s while the clock runs on: still four tries.
  await toast(page).hover();
  await page.clock.fastForward(10_000);

  reads.failing = false;
  await toast(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expectOpened(page);
  // Four held tries and the one Try again made: no fifth try came before it.
  expect(reads.seen).toBe(5);
});

test('a snapshot whose every try fails on the network shows the same toast; Try again opens the site', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await snapshotRoute(page, (route) => route.abort('failed'));
  await page.goto(`${baseURL}/${HASH}`);
  // Failed tries follow each other as fast as the waits are jumped.
  await expect.poll(async () => { if (reads.seen < 4) await page.clock.fastForward(1_000); return reads.seen; }, { timeout: 30_000 }).toBe(4);
  await expectFailedOpen(page);

  reads.failing = false;
  await toast(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expectOpened(page);
  expect(reads.seen).toBe(5);
});

test('a snapshot answered 503 twice opens the site on its third try, with no toast', async ({ page, baseURL }) => {
  await page.clock.install();
  const reads = await snapshotRoute(page, (route) => {
    if (reads.seen === 2) reads.failing = false;
    return route.fulfill({ status: 503, json: { error: 'Service unavailable' } });
  });
  await page.goto(`${baseURL}/${HASH}`);
  await expect.poll(async () => { if (reads.seen < 3) await page.clock.fastForward(1_000); return reads.seen; }, { timeout: 30_000 }).toBe(3);
  await expectOpened(page);
  await expect(toast(page)).toHaveCount(0);
  await expect(page.locator('#notice')).toBeHidden();
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
  await expectFailedOpen(page);

  reads.failing = false;
  await toast(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expectOpened(page);
  expect(reads.seen).toBe(opened + 5);
});

test('a remembered boot whose guessed snapshot GitHub never answers shows the toast after four tries, not eight', async ({ page, baseURL }) => {
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
  await toast(page).hover();
  await page.clock.fastForward(10_000);

  reads.failing = false;
  await toast(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expectOpened(page);
  expect(reads.seen).toBe(opened + 5);
});

test('a file GitHub never answers, opened outside an open, shows the plain notice and no toast', async ({ page, baseURL }) => {
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
  await expect(toast(page)).toHaveCount(0);
  expect(reads.seen).toBe(4);
});
