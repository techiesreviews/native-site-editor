/** A frame as pauseAhead reads its clock. */
export interface ClockFrame {
  evaluate(read: () => number): Promise<number>;
}
/** What pauseAhead uses of a Playwright page. */
export interface ClockPage {
  frames(): ClockFrame[];
  clock: { pauseAt(time: number): Promise<void> };
}

/** The latest time any of the page's frames reads (each frame keeps its own clock). A child frame gone meanwhile is
 * left out; the main frame's own error stands. One page per browser context: `pauseAt` pauses every page's frames. */
async function latest(page: ClockPage) {
  const [main, ...children] = page.frames();
  const times = await Promise.all([main.evaluate(() => Date.now()), ...children.map(frame => frame.evaluate(() => Date.now()).catch(() => undefined))]);
  return Math.max(...times.filter((time): time is number => time !== undefined));
}

/**
 * Stops the page's installed clock, in every frame, `ahead` ms from where the latest frame's clock stands. `pauseAt`
 * needs a time still ahead of each frame's clock when the call lands; a time read and sent back can be passed already
 * on a slow runner ("Cannot fast-forward to the past"), and a frame (the preview) can run a little ahead of the page.
 * Each frame's clock stops before that check, so after such a refusal they all stand still, and the latest time read
 * from them again is ahead of every one. `ahead` is at least 1 ms: 0 ms was refused on every try while only the
 * page's own clock was read (native-structure-inplace.spec.ts, TOOLS-355).
 */
export async function pauseAhead(page: ClockPage, ahead: number) {
  if (!(ahead >= 1)) throw new Error("pauseAhead needs at least 1 ms ahead.");
  for (let tries = 1; ; tries++) {
    try {
      await page.clock.pauseAt(await latest(page) + ahead);
      return;
    } catch (error) {
      if (tries >= 3 || !(error instanceof Error && error.message.includes("Cannot fast-forward to the past"))) throw error;
    }
  }
}
