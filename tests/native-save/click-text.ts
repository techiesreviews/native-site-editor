import { expect, type Locator } from "@playwright/test";

/**
 * One click on the element's own text (just inside its first line), as a
 * user starts typing there (slice 28): a click on text types at once, while
 * a click beside it, such as an element's centre past a short line, only
 * selects.
 */
export async function clickOnText(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const position = await target.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const line = Array.from(range.getClientRects()).find((r) => r.width > 0 && r.height > 0);
    if (!line) throw new Error(`no text in ${el.outerHTML.slice(0, 80)}`);
    const box = el.getBoundingClientRect();
    return { x: line.left - box.left + Math.min(6, line.width / 2), y: line.top - box.top + line.height / 2 };
  });
  await target.click({ position });
}

/** Selects editable text as the block it is, not typed in: a click on its text types, Escape ends that. */
export async function selectText(target: Locator) {
  await clickOnText(target);
  await expect(target).toHaveAttribute("contenteditable", /.+/);
  await target.press("Escape");
  await expect(target).not.toHaveAttribute("contenteditable", /.+/);
}
