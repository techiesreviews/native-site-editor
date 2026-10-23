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
    // The first text shown, as laid out: a slot shows the text given to it, else its own fallback.
    const firstLine = (node: Node): DOMRect | undefined => {
      if (node.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).find((r) => r.width > 0 && r.height > 0);
      }
      const assigned = node instanceof HTMLSlotElement ? node.assignedNodes({ flatten: true }) : [];
      for (const child of assigned.length ? assigned : Array.from(node.childNodes)) {
        const line = firstLine(child);
        if (line) return line;
      }
      return undefined;
    };
    const line = firstLine(el);
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
