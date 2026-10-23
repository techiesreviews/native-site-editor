import { test, expect, type Page } from '@playwright/test';

// TD 06 limit 1 (ticket 26): a read GitHub never answers counts as failed
// after 8 s and is tried three more times, 1, 2 and 4 s apart; then the page
// leaves its loading state, and the toast says so with Try again, which opens
// the site once GitHub answers. Default fixture group: native-starter (501).

const toast = (page: Page) => page.locator('.editor-toast');
const SAID = "GitHub isn't answering. Try again in a moment.";

test('a snapshot GitHub never answers is tried four times, then the toast offers Try again, which opens the site', async ({ page, baseURL }) => {
  // The clock runs in real time; it jumps past each try's 8 s timeout.
  await page.clock.install();
  let held = 0, silent = true;
  // Held reads are never answered: the editor's timeout aborts them.
  await page.route(/\/api\/snapshot\?/, (route) => { if (silent) held++; else return route.continue(); });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  for (let tries = 1; tries <= 4; tries++) {
    // Waits between tries are jumped too, a second at a time, until the next try goes out.
    await expect.poll(async () => { if (held < tries) await page.clock.fastForward(1_000); return held; }, { timeout: 30_000 }).toBe(tries);
    await expect(toast(page)).toHaveCount(0);
    await page.clock.fastForward(8_000);
  }

  await expect(toast(page).locator('.editor-toast__text')).toHaveText(SAID);
  await expect(page.locator('#status')).toHaveText(SAID);
  await expect(page.locator('#content')).toContainText('Your repository could not be opened.');
  await expect(page.locator('#refresh')).toBeEnabled();
  // No fifth try. The toast is held under the pointer meanwhile, past its 6 s.
  await toast(page).hover();
  await page.clock.fastForward(10_000);
  expect(held).toBe(4);

  silent = false;
  await toast(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html', { timeout: 30_000 });
  await expect(page.locator('#status')).toContainText('Up to date with main', { timeout: 30_000 });
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
});
