import type { Locator } from "@playwright/test";

/**
 * Whether `flag`'s circle is what shows at its own spot: what is painted at the circle's centre belongs to the tag, not to
 * something drawn over it (the edit bar, a pin). `toBeVisible` cannot tell: a covered circle still has a box. A circle over
 * the edit bar's controls takes no press (so the control answers), which hit testing would skip: the circle is asked for
 * presses for the moment, so the answer is about paint order alone. False while the circle is outside the window.
 */
export const circleOnTop = (flag: Locator) => flag.evaluate((tag) => {
  const mark = tag.querySelector<HTMLElement>(".live-caret__mark")!;
  const box = mark.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
  mark.style.setProperty("pointer-events", "auto", "important");
  try { return tag.contains(tag.ownerDocument.elementFromPoint(x, y)); } finally { mark.style.removeProperty("pointer-events"); }
});
