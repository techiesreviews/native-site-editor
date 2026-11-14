import { test, expect, type Locator } from "@playwright/test";
import { openEditor, openMedia } from "../support/scenarios";

// A selected Media tile draws its selection ring; keyboard focus on it adds a second ring,
// so tabbing between two selected tiles shows which one has the focus (PR 361 second look, TOOLS-234).
const ring = (card: Locator) => card.evaluate(element => {
  const style = getComputedStyle(element, "::after");
  return `${style.outlineStyle} ${style.outlineColor} ${style.outlineOffset} | ${style.boxShadow}`;
});

test("tabbing between two selected Media tiles shows a distinct focus ring on the focused one", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, baseURL);
  const library = await openMedia(page);
  const cards = library.locator(".media-library__card");
  const [first, second] = [cards.nth(0), cards.nth(1)];
  await first.locator(".media-library__select input").check();
  await second.locator(".media-library__select input").check();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  const selectedOnly = await ring(first);
  expect(await ring(second)).toBe(selectedOnly);

  // Keyboard focus comes from Tab, so :focus-visible matches as it does for a person.
  await library.getByLabel("Search media", { exact: true }).focus();
  const firstThumbnail = first.locator(".media-library__thumbnail"), secondThumbnail = second.locator(".media-library__thumbnail");
  for (let presses = 0; presses < 12 && !(await firstThumbnail.evaluate(element => element === document.activeElement)); presses++) await page.keyboard.press("Tab");
  await expect(firstThumbnail).toBeFocused();
  const focusedSelected = await ring(first);
  expect(focusedSelected).not.toBe(selectedOnly);
  expect(await ring(second)).toBe(selectedOnly);

  for (let presses = 0; presses < 6 && !(await secondThumbnail.evaluate(element => element === document.activeElement)); presses++) await page.keyboard.press("Tab");
  await expect(secondThumbnail).toBeFocused();
  expect(await ring(second)).toBe(focusedSelected);
  expect(await ring(first)).toBe(selectedOnly);
});
