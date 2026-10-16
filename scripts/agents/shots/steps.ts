import { expect, type Page } from "@playwright/test";
import { parseStep } from "./core";

export async function runStep(page: Page, source: string) {
  const step = parseStep(source);
  const named = (name: string) => page.getByRole("button", { name })
    .or(page.getByRole("tab", { name, exact: true }))
    .or(page.getByRole("menuitem", { name, exact: true }))
    .or(page.getByRole("menuitemradio", { name, exact: true }))
    .or(page.getByRole("link", { name, exact: true }));
  switch (step.kind) {
    case "click": await named(step.name).click(); return;
    case "type": {
      const field = step.label === "search" ? page.getByRole("searchbox") : page.getByLabel(step.label, { exact: true });
      await field.fill(step.text); return;
    }
    case "hover": {
      const tiles = page.locator(".media-library__card");
      const target = typeof step.target === "string" ? named(step.target) : step.target === -1 ? tiles.last() : tiles.nth(step.target);
      await target.hover(); return;
    }
    case "press": await page.keyboard.press(step.key); return;
    case "scroll": {
      // Scroll the pane under the pointer, including an explorer phone sheet.
      const panel = page.getByRole("region", { name: "Media", exact: true });
      if (await panel.isVisible()) await panel.hover();
      await page.mouse.wheel(0, step.direction === "down" ? 600 : -600); return;
    }
    case "wait": await expect(page.getByText(step.text, { exact: true }).first()).toBeVisible();
  }
}
