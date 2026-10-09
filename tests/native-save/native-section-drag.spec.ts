import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Drag to reorder sections: a page structure row dragged onto another gap
// among its siblings, and a section dragged in the canvas by its name in the
// edit bar or pressed in the page (the one drag of blocks, between page
// bands for a Section). Both are one undo step, keep the section selected,
// and cancel cleanly.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
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
const centre = async (selector: ReturnType<Page["locator"]>) => {
  const box = (await selector.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: box.y, bottom: box.y + box.height };
};

test("a sidebar row dragged onto a sibling gap reorders the page as one undo step", async ({ page }) => {
  await expect(page.locator(".page-structure__hint")).toHaveCount(0);
  const cards = row(page, "Section");
  const from = await centre(cards);
  const hero = await centre(row(page, "Section A native browser preview"));
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
  await row(page, "Section Scroll to verify").locator(".page-structure__toggle").click();
  const last = await centre(tree(page).getByRole("treeitem", { name: /^Paragraph Paragraph five/ }));
  const from2 = await centre(row(page, "Section"));
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
  await row(page, "Section A native browser preview").locator(".page-structure__toggle").click();
  const cards = row(page, "Section");
  const from = await centre(cards);
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
  const heading = await centre(row(page, "Heading A native browser preview"));
  await page.mouse.move(heading.x, heading.y);
  await page.mouse.down();
  await page.mouse.move(heading.x, heading.y + 60, { steps: 4 });
  await expect(page.locator(".page-structure__tree")).not.toHaveClass(/is-dragging/);
  await page.mouse.up();

  // Dropped on another parent's row (the footer, outside main's group): nothing.
  await clearStatus(page);
  const footer = await centre(row(page, "Site footer"));
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

// A point on the selected cards section's own background: the gap between
// its first two cards (side by side, or stacked in a narrow frame).
async function sectionPoint(page: Page) {
  const first = (await frame(page).locator(".cards project-card").nth(0).boundingBox())!;
  const second = (await frame(page).locator(".cards project-card").nth(1).boundingBox())!;
  return second.y > first.y + first.height - 1
    ? { x: first.x + 10, y: (first.y + first.height + second.y) / 2 }
    : { x: (first.x + first.width + second.x) / 2, y: first.y + 20 };
}
const frameScroll = async (page: Page) => {
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  return child!.evaluate(() => window.scrollY);
};
const frameSelection = async (page: Page) => {
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  return child!.evaluate(() => document.getSelection()?.toString() ?? "");
};
const handle = (page: Page) => bar(page).locator(".edit-bar__handle");
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const where = (page: Page) => page.locator(".pb-drag-ghost__where");
// Presses the selected section's name in the bar; returns where it was pressed.
async function pressHandle(page: Page) {
  const at = await centre(handle(page));
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  return at;
}

test("the name in the edit bar drags a selected section between page bands, one undo step", async ({ page }) => {
  await select(page, "section.cards");
  // The name is the handle: no grip dots, named by the block, titled.
  await expect(handle(page)).toHaveText("Section");
  await expect(handle(page)).toHaveAccessibleName("Section");
  await expect(handle(page)).toHaveAttribute("title", "Drag to move");
  await expect(handle(page).locator("svg")).toHaveCount(0);
  const hero = (await frame(page).locator("section.hero").boundingBox())!;
  const heading = (await frame(page).locator(".hero h1").boundingBox())!;
  const from = await pressHandle(page);
  await page.mouse.move(from.x, from.y - 20, { steps: 4 });
  await expect(ghost(page)).toBeVisible();
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Section");
  expect(await page.evaluate(() => document.documentElement.classList.contains("pb-is-dragging"))).toBe(true);
  // Across the hero's heading text, then onto its upper half: the gap above it.
  await page.mouse.move(heading.x + heading.width - 4, heading.y + heading.height / 2, { steps: 6 });
  await page.mouse.move(heading.x + 4, heading.y + 4, { steps: 6 });
  await page.mouse.move(hero.x + hero.width / 2, hero.y + 8, { steps: 4 });
  await expect(where(page)).toHaveText("Between page bands › before Section");
  const line = page.locator(".pb-drop__line");
  await expect(line).toBeVisible();
  expect(Math.abs((await line.boundingBox())!.y - hero.y)).toBeLessThan(8);
  await page.mouse.up();
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  await expect(status(page)).toHaveText("Section moved. Between page bands › before Section");
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator(".pb-drop")).toHaveCount(0);
  // No text was selected in the page.
  expect(await frameSelection(page)).toBe("");
  expect(await page.evaluate(() => document.getSelection()?.toString() ?? "")).toBe("");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: "Move up" })).toBeDisabled();
  await expect(sections(page).first()).toHaveAttribute("aria-selected", "true");
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("a drag by the name needs 7 px, cancels on Escape and records nothing for a same-place release", async ({ page }) => {
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  // 6 px: no drag.
  await clearStatus(page);
  let from = await pressHandle(page);
  await page.mouse.move(from.x, from.y + 6, { steps: 3 });
  await page.waitForTimeout(100);
  await expect(ghost(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(status(page)).toHaveText("");

  // 7 px: a drag; Escape cancels it and everything is cleaned up.
  from = await pressHandle(page);
  await page.mouse.move(from.x, from.y + 7, { steps: 3 });
  await expect(ghost(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("Section was not moved");
  await page.mouse.up();
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  expect(await page.evaluate(() => document.documentElement.classList.contains("pb-is-dragging"))).toBe(false);

  // Released on the gap it already fills (the top half of itself): nothing recorded.
  await clearStatus(page);
  const cards = (await frame(page).locator("section.cards").boundingBox())!;
  from = await pressHandle(page);
  await page.mouse.move(from.x, from.y - 30, { steps: 4 });
  await page.mouse.move(cards.x + cards.width / 2, cards.y + 10, { steps: 4 });
  await expect(where(page)).toHaveText("Stays where it is");
  await expect(page.locator(".pb-drop__line")).toHaveCount(0);
  await page.mouse.up();
  await expect(status(page)).toHaveText("Section stayed in place");
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);

  // Released outside the frame: cancelled.
  await clearStatus(page);
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  from = await pressHandle(page);
  await page.mouse.move(from.x, from.y - 30, { steps: 4 });
  await page.mouse.move(frameBox.x + frameBox.width + 40, from.y, { steps: 4 });
  await expect(where(page)).toHaveText("Release to cancel");
  await page.mouse.up();
  await expect(status(page)).toHaveText("Section was not moved");
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("a press and move inside the selected section drags the section itself", async ({ page }) => {
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await clearStatus(page);
  // On a card inside the selection: the selection moves, not the card.
  const card = (await frame(page).locator(".cards project-card").first().boundingBox())!;
  const hero = (await frame(page).locator("section.hero").boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2 - 20, { steps: 4 });
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Section");
  await page.mouse.move(hero.x + hero.width / 2, hero.y + 8, { steps: 6 });
  await expect(where(page)).toHaveText("Between page bands › before Section");
  await page.mouse.up();
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  // The release is not a click: the moved section stays selected.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  expect(await frameSelection(page)).toBe("");
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);

  // On the section's own background, moved less than 7 px: a click that selects it.
  const from = await sectionPoint(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 5, { steps: 3 });
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("the name moves the section with Up/Down and Alt+Up/Down while focused", async ({ page }) => {
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await handle(page).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  await expect(status(page)).toHaveText("Moved up");
  await expect(handle(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(handle(page)).toBeFocused();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("a drag by the name near the bottom edge scrolls the frame", async ({ page }) => {
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  expect(await frameScroll(page)).toBe(0);
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const from = await pressHandle(page);
  await page.mouse.move(from.x, from.y + 20, { steps: 4 });
  await expect(ghost(page)).toBeVisible();
  // Inside the edge band the frame scrolls on its own, with the pointer still.
  await page.mouse.move(from.x, frameBox.y + frameBox.height - 10, { steps: 4 });
  await expect.poll(() => frameScroll(page)).toBeGreaterThan(40);
  const scrolled = await frameScroll(page);
  // Out of the band it stops.
  await page.mouse.move(from.x, frameBox.y + frameBox.height / 2, { steps: 4 });
  await page.waitForTimeout(200);
  const settled = await frameScroll(page);
  await page.waitForTimeout(200);
  expect(await frameScroll(page)).toBe(settled);
  expect(settled).toBeGreaterThanOrEqual(scrolled);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(status(page)).toHaveText("Section was not moved");
  await expect(sectionOrder(page)).resolves.toEqual(["hero", "cards", "filler"]);
  expect(await frameSelection(page)).toBe("");
});
