import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Drag to reorder sections: a page structure row dragged onto another gap
// among its siblings, and a selected section dragged in the canvas. Both
// are one undo step, keep the section selected, and cancel cleanly.
const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  // The page's source must be mounted before a move can be written.
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
});

async function editorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string) => tree(page).getByRole("treeitem", { name, exact: true });
const sections = (page: Page) => tree(page).locator("[role='treeitem'][aria-level='2']");
const status = (page: Page) => page.locator("#status");
const sectionOrder = (page: Page) => frame(page).locator("main > section").evaluateAll((els) => els.map((el) => el.className));
const select = (page: Page, selector: string) => frame(page).locator(selector).evaluate((el) => (el as HTMLElement).click());
const clearStatus = (page: Page) => status(page).evaluate((el) => { el.textContent = ""; });
async function undo(page: Page) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
}
const centre = async (page: Page, selector: ReturnType<Page["locator"]>) => {
  const box = (await selector.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: box.y, bottom: box.y + box.height };
};

test("a sidebar row dragged onto a sibling gap reorders the page as one undo step", async ({ page }) => {
  await expect(page.locator(".page-structure__hint")).toHaveText("Drag to reorder within a page or slot. Alt + ↑/↓ moves sections.");
  const cards = row(page, "Section");
  const from = await centre(page, cards);
  const hero = await centre(page, row(page, "Section A native browser preview"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 20, { steps: 4 });
  await expect(cards).toHaveClass(/is-drag-source/);
  await expect(page.locator(".page-structure__tree")).toHaveClass(/is-dragging/);
  // The indicator sits on the gap above the hero row.
  await page.mouse.move(hero.x, hero.top + 3, { steps: 4 });
  const drop = page.locator(".page-structure__drop");
  await expect(drop).toBeVisible();
  expect(Math.abs((await drop.boundingBox())!.y - hero.top)).toBeLessThan(3);
  await page.mouse.up();
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  await expect(status(page)).toHaveText("Section moved");
  await expect(sections(page)).toHaveText(["Section", "Section A native browser preview", "Section Scroll to verify"]);
  await expect(sections(page).first()).toHaveAttribute("aria-selected", "true");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: "Move up" })).toBeDisabled();
  await expect(cards).not.toHaveClass(/is-drag-source/);
  await expect(drop).toBeHidden();
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // Dropping below the last sibling's subtree (its last child row) puts it at the end.
  const last = await centre(page, tree(page).getByRole("treeitem", { name: /^Paragraph Paragraph five/ }));
  const from2 = await centre(page, row(page, "Section"));
  await page.mouse.move(from2.x, from2.y);
  await page.mouse.down();
  await page.mouse.move(last.x, last.bottom - 2, { steps: 6 });
  await expect(drop).toBeVisible();
  expect(Math.abs((await drop.boundingBox())!.y - last.bottom)).toBeLessThan(3);
  await page.mouse.up();
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Section moved");
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("6 px is a click, 7 px is a drag; Escape, a same-position release and a drop outside the siblings change nothing", async ({ page }) => {
  const cards = row(page, "Section");
  const from = await centre(page, cards);
  // 6 px: no drag; the release still selects the row.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 6, { steps: 3 });
  await expect(page.locator(".page-structure__tree")).not.toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(cards).toHaveAttribute("aria-selected", "true");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await clearStatus(page);

  // 7 px: a drag, cancelled with Escape.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 7, { steps: 3 });
  await expect(page.locator(".page-structure__tree")).toHaveClass(/is-dragging/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".page-structure__tree")).not.toHaveClass(/is-dragging/);
  await expect(cards).not.toHaveClass(/is-drag-source/);
  await expect(status(page)).toHaveText("Section drag cancelled");
  await page.mouse.up();
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);

  // Released on its own gap: nothing happens and nothing is recorded.
  await clearStatus(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 40, { steps: 4 });
  await page.mouse.move(from.x, from.y + 2, { steps: 4 });
  await page.mouse.up();
  await expect(status(page)).toHaveText("Section stayed in place");
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);

  // A heading row is not a section: it does not drag.
  const heading = await centre(page, row(page, "Heading A native browser preview"));
  await page.mouse.move(heading.x, heading.y);
  await page.mouse.down();
  await page.mouse.move(heading.x, heading.y + 60, { steps: 4 });
  await expect(page.locator(".page-structure__tree")).not.toHaveClass(/is-dragging/);
  await page.mouse.up();

  // Dropped on another parent's row (the footer, outside main's group): nothing.
  await clearStatus(page);
  const footer = await centre(page, row(page, "Site footer"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(footer.x, footer.y, { steps: 6 });
  await expect(page.locator(".page-structure__drop")).toBeHidden();
  await page.mouse.up();
  await expect(status(page)).toHaveText("Section drag cancelled");
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);
  await expect(tree(page).locator("[role='treeitem'][aria-level='1']")).toHaveText(["Site header", "Main", "Site footer"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});
