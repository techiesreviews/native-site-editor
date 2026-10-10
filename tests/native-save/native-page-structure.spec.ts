import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The page structure sidebar: the rendered page's elements as a tree that
// follows the preview's selection, selects in the preview, folds, and keeps
// up with route changes and structural edits.
const indexPath = "index.html";
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole("treeitem", {
  name,
  exact: typeof name === "string",
});
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const unfold = (page: Page, name: string) => row(page, name).locator(".page-structure__toggle").click();
const select = (page: Page, selector: string) =>
  page.frameLocator(".native-preview-frame").locator(selector).evaluate((el) => (el as HTMLElement).click());

test("the sidebar lists the page's elements and marks the one selected in the preview", { tag: "@smoke" }, async ({ page }) => {
  // Top level: the header component, main, the footer component.
  const top = tree(page).locator("[role='treeitem'][aria-level='1']");
  await expect(top.locator(":scope > .page-structure__label")).toHaveText(["Site header", "Main", "Site footer"]);
  // Sections are named by their first heading; one without a heading by its kind alone.
  const sections = tree(page).locator("[role='treeitem'][aria-level='2']");
  await expect(sections).toHaveText(["Section A native browser preview", "Section", "Section Scroll to verify"]);
  // Everything inside <main> starts folded, so the page reads as its sections.
  for (const section of await sections.all()) await expect(section).toHaveAttribute("aria-expanded", "false");
  const card = tree(page).getByRole("treeitem", {name:/^Project card Reusable cards$/});
  await expect(card).toHaveCount(0);
  await unfold(page, "Section");
  // A component instance is named by the heading in its shadow root, with the page's slotted text.
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("aria-level", "3");
  await card.locator(".page-structure__toggle").click();
  const slots = card.locator("+ [role='group'] > [role=treeitem]");
  await expect(slots.locator(".page-structure__slot-badge")).toHaveText(["Title", "Body", "Content", "Link"]);
  const title = slots.filter({ has: page.locator(".page-structure__slot-badge").filter({hasText:/^Title$/}) });
  await title.locator(".page-structure__label").click();
  await expect(title).toHaveAttribute("aria-selected", "true");
  await expect(bar(page).locator('.edit-bar__kind')).toHaveText('Text');
  await expect(bar(page).getByRole('button',{name:'In the title slot of Project card: select the instance',exact:true})).toBeVisible();
  await title.press("F2");
  await expect(tree(page).getByRole('textbox',{name:'Title: Text',exact:true})).toHaveValue('Reusable cards');
  await tree(page).locator(".page-structure__slot-badge").filter({hasText:/^Body$/}).first().press("Enter");
  await expect(tree(page).getByRole('textbox',{name:'Body: Text',exact:true})).toHaveValue(/^This card/);
  await expect(page.frameLocator('.native-preview-frame').locator('project-card [slot=title]').first()).toHaveText('Reusable cards');
  await unfold(page, "Section A native browser preview");
  await expect(row(page, /^Image/)).toHaveAttribute("aria-level", "3");

  // A preview selection inside a folded row unfolds the rows above it.
  await select(page, ".hero h1");
  await expect(row(page, "Section A native browser preview")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "Heading A native browser preview")).toHaveAttribute("aria-selected", "true");
  await expect(tree(page).locator("[aria-selected='true']")).toHaveCount(1);
  await select(page, "section.filler p:nth-of-type(2)");
  await expect(row(page, /^Paragraph Paragraph two of filler/)).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Heading A native browser preview")).toHaveAttribute("aria-selected", "false");
});

test("a row selects its element in the preview, brings it into view and opens its controls", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const filler = frame.locator("section.filler");
  // The filler section starts below the first screen of the frame.
  expect((await filler.boundingBox())!.y).toBeGreaterThan(frameBox.y + frameBox.height);

  await row(page, "Section Scroll to verify").click();
  await expect(row(page, "Section Scroll to verify")).toHaveAttribute("aria-selected", "true");
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: "Move down" })).toBeDisabled();
  await expect.poll(async () => {
    const box = (await filler.boundingBox())!;
    return box.y < frameBox.y + frameBox.height && box.y + box.height > frameBox.y;
  }).toBe(true);
  // Arrow keys walk the visible rows (Right unfolds); Space selects (Enter on a text row edits its text, slice 102).
  await expect(row(page, "Section Scroll to verify")).toBeFocused();
  await expect(row(page, "Section Scroll to verify")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Heading Scroll to verify")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(row(page, "Heading Scroll to verify")).toHaveAttribute("aria-selected", "true");
  // Left goes to the parent; Left again folds it, Right unfolds.
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Section Scroll to verify")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Section Scroll to verify")).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "Heading Scroll to verify")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "Heading Scroll to verify")).toBeVisible();
  // The chevron unfolds without selecting.
  await unfold(page, "Section A native browser preview");
  await expect(row(page, "Section A native browser preview")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "Section A native browser preview")).toHaveAttribute("aria-selected", "false");
});

test("the tree follows the preview route and structural edits", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(frame.locator("section.cards")).toHaveCount(2);
  await expect(tree(page).locator("[role='treeitem'][aria-level='2']")).toHaveText([
    "Section A native browser preview", "Section", "Section", "Section Scroll to verify",
  ]);
  // The copy is selected, so its row is marked.
  await expect(tree(page).locator("[role='treeitem'][aria-level='2']").nth(2)).toHaveAttribute("aria-selected", "true");

  // Ctrl/⌘+click follows the link in the preview; the open file stays.
  await frame.locator("site-header a", { hasText: "About" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(row(page, "Section About this project")).toBeVisible();
  await expect(row(page, "Section Scroll to verify")).toHaveCount(0);
  await expect(tree(page).locator("[aria-selected='true']")).toHaveCount(0);
  // A row on the About page opens that file and selects there.
  await unfold(page, "Section About this project");
  await row(page, "Heading About this project").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(row(page, "Heading About this project")).toHaveAttribute("aria-selected", "true");
});

test("a section component names itself, not <main>; formatting inside a line of text is no row of its own", async ({ page }) => {
  const source = readFileSync(resolve("fixtures/native-starter/index.html"), "utf8");
  const textbox = page.locator("#content [role='textbox']").first();
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source
    // A section component first in <main>, its heading slotted in by the page.
    .replace(`<main class="page" data-key="main">\n`, `<main class="page" data-key="main">\n  <feature-block data-key="feature">\n    <h2 slot="title">Slotted feature</h2>\n  </feature-block>\n`)
    .replace(`This section adds enough height`, `This section adds <strong>enough</strong> <a href="/about/">height</a>`));
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");

  await expect(row(page, "Feature block Slotted feature")).toBeVisible();
  const top = tree(page).locator("[role='treeitem'][aria-level='1']");
  await expect(top.locator(":scope > .page-structure__label")).toHaveText(["Site header", "Main", "Site footer"]);
  // The paragraph is summed up by all its text, bold and link included, with no rows inside.
  await unfold(page, "Section Scroll to verify");
  const paragraph = row(page, /^Paragraph This section adds enough height/);
  await expect(paragraph).toBeVisible();
  await expect(paragraph).not.toHaveAttribute("aria-expanded", /.*/);
  await expect(row(page, /^Bold/)).toHaveCount(0);
  await expect(row(page, /^Link/)).toHaveCount(0);
  // Selecting the bold word names it, and marks its paragraph's row.
  await page.frameLocator(".native-preview-frame").locator("section.filler p strong").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await select(page, "section.filler p strong");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Bold");
  await expect(paragraph).toHaveAttribute("aria-selected", "true");
  // A section component's edit bar says its name, as the structure does.
  await page.frameLocator(".native-preview-frame").locator("feature-block").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await select(page, "feature-block");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Feature block");
});
