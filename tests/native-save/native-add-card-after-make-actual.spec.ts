import { expect, test } from "@playwright/test";
import { requireActualFixture } from "./fixture-contract";

requireActualFixture();

// The bug appears only with a short preview frame: 1440 × 1000 hides it.
test.use({ viewport: { width: 1440, height: 900 } });

test("Add card works immediately after Make component on Recent work", { tag: "@actual" }, async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("#work .cards > card-project")).toHaveCount(3);
  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: /^Section Recent work/ }).locator(".page-structure__label").first().click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/section-recent-work/section-recent-work.html");
  await expect(frame.locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  await expect(frame.locator("section-recent-work slot > card-project h3")).toHaveText("Untitled project");
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");

  const cards = frame.locator("section-recent-work > card-project");
  await expect(cards).toHaveCount(3);
  await cards.last().hover();
  const add = page.locator(".card-ghost__add");
  await expect(add).toBeVisible();
  // Wholly inside the preview frame, and not under the code pane.
  await expect.poll(() => add.evaluate(button => {
    const box = button.getBoundingClientRect();
    const view = document.querySelector(".native-preview-frame")!.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.top >= view.top && box.bottom <= view.bottom && (hit === button || button.contains(hit));
  })).toBe(true);
  await add.click();
  await expect(cards).toHaveCount(4);
  await expect.poll(() => cards.last().evaluate(element => element.assignedSlot?.assignedElements().length)).toBe(4);
  await expect(page.getByRole("combobox", { name: "Link to a page" })).toBeFocused();
});
