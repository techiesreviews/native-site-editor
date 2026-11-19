import { expect, test } from "@playwright/test";
import { pauseAhead } from "../support/clock";

// What tests/support/clock.ts relies on in Playwright: a pauseAt refused for a time already past still
// stops the page's clock, so a time read from it afterwards stays put.
test("a pauseAt refused for a time already past leaves the page's clock stopped; pauseAhead pauses from there", async ({ page }) => {
  await page.goto("data:text/html,<p>clock</p>");
  await page.clock.install();
  await expect(page.clock.pauseAt(await page.evaluate(() => Date.now()) - 10_000)).rejects.toThrow("Cannot fast-forward to the past");
  // Real time passes in the page (a busy loop: its timers are the fake ones), its clock does not.
  const started = performance.now();
  const stopped = await page.evaluate(() => { const before = Date.now(); for (let i = 0; i < 2e7; i++); return Date.now() - before; });
  expect(performance.now() - started, "real time passed while the page read its clock").toBeGreaterThan(2);
  expect(stopped).toBe(0);
  const frozen = await page.evaluate(() => Date.now());
  await pauseAhead(page, 100);
  expect(await page.evaluate(() => Date.now())).toBe(frozen + 100);
});
