import type { Locator } from "@playwright/test";

/**
 * Whether `flag`'s circle is what shows at its own spot: the page's point at the circle's centre belongs to the tag, not
 * to something drawn over it (the edit bar, a pin). `toBeVisible` cannot tell: a covered circle still has a box.
 */
export const circleOnTop = (flag: Locator) => flag.evaluate((tag) => {
  const mark = tag.querySelector(".live-caret__mark")!.getBoundingClientRect();
  const x = mark.x + mark.width / 2, y = mark.y + mark.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
  return tag.contains(tag.ownerDocument.elementFromPoint(x, y));
});
