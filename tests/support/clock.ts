/** What pauseAhead uses of a Playwright page. */
export interface ClockPage {
  evaluate(read: () => number): Promise<number>;
  clock: { pauseAt(time: number): Promise<void> };
}

/**
 * Stops the page's installed clock `ahead` ms from where it stands. `pauseAt` needs a time still ahead of the
 * page's clock when the call lands, and a time read from the page and sent back can be passed already on a slow
 * runner ("Cannot fast-forward to the past"). The clock stops before that check, so after such a refusal it
 * stands still, and a time read from it again is ahead for sure. `ahead` is at least 1 ms: a pause at the very time
 * read back (0 ms ahead) was refused on every try in a real run (native-structure-inplace.spec.ts, TOOLS-355).
 */
export async function pauseAhead(page: ClockPage, ahead: number) {
  if (!(ahead >= 1)) throw new Error("pauseAhead needs at least 1 ms ahead.");
  for (let tries = 1; ; tries++) {
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + ahead);
      return;
    } catch (error) {
      if (tries >= 3 || !(error instanceof Error && error.message.includes("Cannot fast-forward to the past"))) throw error;
    }
  }
}
