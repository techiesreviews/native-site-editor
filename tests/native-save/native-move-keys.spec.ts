import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { editorMounted } from "./drafts";
import { expect, test, type Page } from "@playwright/test";

// Alt+Up and Alt+Down move the selected section one sibling position from
// the preview, the edit bar and the page structure sidebar: one undo step,
// nothing at the ends. Other blocks move among their own siblings too.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
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
const status = (page: Page) => page.locator("#status");
const sectionOrder = (page: Page) => frame(page).locator("main > section").evaluateAll((els) => els.map((el) => el.className));
const select = (page: Page, selector: string) => frame(page).locator(selector).evaluate((el) => (el as HTMLElement).click());
async function undo(page: Page) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
}

test("Alt+Up/Down in the preview moves the selected section as one undo step and stops at the ends", async ({ page }) => {
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  await expect(status(page)).toHaveText("Moved up");
  await expect(bar(page).getByRole("button", { name: "Move up" })).toBeDisabled();
  // First already: nothing happens, and nothing to undo but the one move.
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  await expect(status(page)).toHaveText("");
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  await select(page, "section.cards");
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(bar(page).getByRole("button", { name: "Move down" })).toBeDisabled();
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // While typing, Alt+arrows retain their text meaning.
  await frame(page).locator(".hero h1").dblclick();
  await expect(frame(page).locator(".hero h1")).toHaveAttribute("contenteditable", /.+/);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(frame(page).locator("section.hero > h1:first-child")).toHaveCount(1);
  await expect(status(page)).toHaveText("");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("Alt+Up/Down with focus in the edit bar moves the section and keeps focus on the same button", async ({ page }) => {
  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "Duplicate" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(bar(page).getByRole("button", { name: "Duplicate" })).toBeFocused();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect(status(page)).toHaveText("Moved up");
  await expect(bar(page).getByRole("button", { name: "Duplicate" })).toBeFocused();
  // Two moves, two undo steps.
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // Paragraphs keep no move buttons; sibling keys still work from the bar.
  await select(page, "section.filler p:nth-of-type(2)");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  for (const name of ["Move up", "Move down", "Move to"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await status(page).evaluate((el) => { el.textContent = ""; });
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(status(page)).toHaveText("Moved up in Section");
  await expect.poll(() => frame(page).locator("section.filler > p").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-key")))).toEqual(["filler-2", "filler-1", "filler-3", "filler-4", "filler-5"]);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("Alt+Up/Down on a page structure row moves the section and keeps its row focused", async ({ page }) => {
  const sections = tree(page).locator("[role='treeitem'][aria-level='2']");
  await row(page, "Section").click();
  await expect(row(page, "Section")).toBeFocused();
  // The bar shows once the page's source is mounted, which the move needs.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(sections).toHaveText(["Section A native browser preview", "Section Scroll to verify", "Section"]);
  await expect(row(page, "Section")).toBeFocused();
  await expect(row(page, "Section")).toHaveAttribute("aria-selected", "true");
  // Last already: nothing happens and focus stays put.
  const edgeSource = await editorText(page, "#content");
  await row(page, "Section").focus();
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("");
  await expect(row(page, "Section")).toBeFocused();
  await expect.poll(() => editorText(page, "#content")).toBe(edgeSource);
  // Source inspection changes focus; restore it only to start the next move.
  await row(page, "Section").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect(status(page)).toHaveText("Moved up");
  await expect(row(page, "Section")).toBeFocused();
  await undo(page);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // Ordinary heading moves consume the key and preserve the selected row.
  await row(page, "Section A native browser preview").locator(".page-structure__toggle").click();
  await row(page, "Heading A native browser preview").click();
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.keyboard.press("Alt+ArrowDown");
  await expect(status(page)).toHaveText("Moved down in Section");
  await expect(row(page, "Heading A native browser preview")).toBeFocused();
  await expect(frame(page).locator("section.hero > p:first-child + h1")).toHaveCount(1);
  const heading = indexSource.match(/    <h1[^>]*>[^<]*<\/h1>\n/)![0];
  const paragraph = indexSource.match(/    <p[^>]*class="lead"[^>]*>[^<]*<\/p>\n/)![0];
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource.replace(heading + paragraph, paragraph + heading));
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("Alt+Down on a page structure row while a component file is open opens the page first, then moves the section", async ({ page }) => {
  // Shared parts open their template only after explicit Edit component intent.
  await row(page, "Section").locator(".page-structure__toggle").click();
  await tree(page).getByRole("treeitem", { name: /^Project card Reusable cards$/ }).locator(".page-structure__label").click();
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await frame(page).locator("project-card article").first().click({position:{x:5,y:5}});
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await expect(tree(page)).toBeVisible();
  // Focus the section's row without clicking it (a click would open the page by itself).
  await row(page, "Section").evaluate((el) => (el as HTMLElement).focus());
  await expect(row(page, "Section")).toBeFocused();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(row(page, "Section")).toBeFocused();
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

// Opens the Project card's template in Edit component mode (the page's rows stay in Structure).
async function editProjectCard(page: Page) {
  await row(page, "Section").locator(".page-structure__toggle").click();
  await tree(page).getByRole("treeitem", { name: /^Project card Reusable cards$/ }).locator(".page-structure__label").click();
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await frame(page).locator("project-card article").first().click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", CARD);
  await expect(tree(page)).toBeVisible();
}
const CARD = "components/project-card/project-card.html";
const mountedSource = (page: Page, path: string) => page.evaluate(async file => (await import("/src/components/code-editor.ts")).getMountedSource(file), path);

test("Alt+Down on a heading row while a component file is open opens the page first, moves the heading, and its row keeps focus", async ({ page }) => {
  await editProjectCard(page);
  await row(page, "Section A native browser preview").locator(".page-structure__toggle").click();
  const heading = row(page, "Heading A native browser preview");
  await expect(heading).toHaveAttribute("data-node", "1.0.0");
  await heading.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("Alt+ArrowDown");
  await expect(frame(page).locator("section.hero > p:first-child + h1")).toHaveCount(1);
  await expect(status(page)).toHaveText("Moved down in Section");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  // Focus follows the moved heading to its row at its new place.
  await expect(heading).toHaveAttribute("data-node", "1.0.1");
  await expect(heading).toBeFocused();
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("in Edit component mode a template Section a named slot holds alone moves with its slot from the bar as from its row", async ({ page }) => {
  await editProjectCard(page);
  const original = (await mountedSource(page, CARD))!;
  const made = original.replace('  <p class="project-card__body"', '  <slot name="extra"><section class="card-extra" style="padding: 12px"><p>Extra</p></section></slot>\n  <p class="project-card__body"');
  await page.evaluate(async ({ path, before, text }) => {
    (await import("/src/components/code-editor.ts")).replaceActiveRange({ path, start: 0, end: before.length, expected: before, text });
  }, { path: CARD, before: original, text: made });
  const extra = frame(page).locator("project-card section.card-extra").first();
  await expect(extra).toBeVisible();
  await extra.click({ position: { x: 3, y: 3 } });
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  // The template's rules: the slot moves with the Section it holds alone, above the title.
  const up = made.replace('  <h3 class="project-card__title" data-key="card-title"><slot name="title">Untitled project</slot></h3>\n  <slot name="extra"><section class="card-extra" style="padding: 12px"><p>Extra</p></section></slot>\n',
    '  <slot name="extra"><section class="card-extra" style="padding: 12px"><p>Extra</p></section></slot>\n  <h3 class="project-card__title" data-key="card-title"><slot name="title">Untitled project</slot></h3>\n');
  expect(up).not.toBe(made);
  await expect(bar(page).getByRole("button", { name: "Move up", exact: true })).toBeEnabled();
  await bar(page).getByRole("button", { name: "Move up", exact: true }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => mountedSource(page, CARD)).toBe(up);
  // First in the template's element now: Move up is off.
  await expect(bar(page).getByRole("button", { name: "Move up", exact: true })).toBeDisabled();
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), CARD)).toBe(true);
  await expect.poll(() => mountedSource(page, CARD)).toBe(made);
  // Its row's Alt+Up writes the same bytes.
  const selected = tree(page).locator("[role='treeitem'][data-template-path][aria-selected='true']");
  await expect(selected).toHaveCount(1);
  await selected.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => mountedSource(page, CARD)).toBe(up);
  await expect(selected).toBeFocused();
});

// Default fixture group: native-cards, Section > Div > card-project instances.
const cardsSource = async (page: Page) => {
  await editorMounted(page);
  return page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
};
async function openCards(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards > card-project")).toHaveCount(2);
  await editorMounted(page);
}
async function cardsUndo(page: Page) {
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
}
const movedCard = (page: Page) => tree(page).getByRole("treeitem", { name: /^Card project Harbour Lane Pottery$/ });

test("Alt+Left/Right in Structure moves a card across its Div, retains focus, and refuses headings and Sections", async ({ page, baseURL }) => {
  await openCards(page, baseURL);
  const original = await cardsSource(page);
  await tree(page).getByRole("treeitem", { name: /^Section Recent work$/ }).locator(".page-structure__toggle").click();
  await tree(page).getByRole("treeitem", { name: /^Block/ }).locator(".page-structure__toggle").click();
  await movedCard(page).click();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(frame(page).locator("#work > div + card-project")).toHaveCount(1);
  await expect(status(page)).toHaveText("Moved out of Div (grid) into Section");
  await expect(movedCard(page)).toBeFocused();
  await expect(movedCard(page)).toHaveAttribute("aria-level", "3");
  const outside = await cardsSource(page);
  // Into a folded Div: its row unfolds so the moved row keeps focus.
  await tree(page).getByRole("treeitem", { name: /^Block/ }).locator(".page-structure__toggle").click();
  await expect(tree(page).getByRole("treeitem", { name: /^Block/ })).toHaveAttribute("aria-expanded", "false");
  await movedCard(page).focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(frame(page).locator("#work .cards > card-project")).toHaveCount(2);
  await expect(status(page)).toHaveText("Moved into Div (grid)");
  await expect(tree(page).getByRole("treeitem", { name: /^Block/ })).toHaveAttribute("aria-expanded", "true");
  await expect(movedCard(page)).toBeFocused();
  await expect(movedCard(page)).toHaveAttribute("aria-level", "4");
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(outside);
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(original);

  await row(page, "Heading Recent work").click();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(status(page)).toHaveText("Alt+→ moves a block into the Section or Div just above it; there is none.");
  await expect(row(page, "Heading Recent work")).toBeFocused();
  expect(await cardsSource(page)).toBe(original);
  await tree(page).getByRole("treeitem", { name: /^Section Recent work$/ }).click();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(status(page)).toHaveText("A Section goes only between page bands.");
  expect(await cardsSource(page)).toBe(original);
});

test("Alt+Left/Right on the canvas moves a whole card out and back, one undo step each", async ({ page, baseURL }) => {
  await openCards(page, baseURL);
  const original = await cardsSource(page);
  await select(page, "#work .cards > card-project:nth-child(2)");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(frame(page).locator("#work > div + card-project")).toHaveCount(1);
  await expect(status(page)).toHaveText("Moved out of Div (grid) into Section");
  const outside = await cardsSource(page);
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(frame(page).locator("#work .cards > card-project")).toHaveCount(2);
  await expect(status(page)).toHaveText("Moved into Div (grid)");
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(outside);
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(original);
});


test("Alt+Up/Down on a canvas Paragraph moves among siblings, stays selected, and undoes each press", async ({ page }) => {
  await editorMounted(page);
  const original = await cardsSource(page);
  const order = () => frame(page).locator("section.filler > p").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-key")));
  await frame(page).locator('section.filler p[data-key="filler-2"]').click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(order).toEqual(["filler-2", "filler-1", "filler-3", "filler-4", "filler-5"]);
  await expect(status(page)).toHaveText("Moved up in Section");
  const up = await cardsSource(page);
  // No re-selection: Down acts on the same Paragraph at its new path.
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(order).toEqual(["filler-1", "filler-2", "filler-3", "filler-4", "filler-5"]);
  await expect(status(page)).toHaveText("Moved down in Section");
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(up);
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(original);
});

test("Alt+Up/Down on a canvas card moves among its section component's items, one undo per press", async ({ page, baseURL }) => {
  await openCards(page, baseURL);
  const edit = async (path: string, content: string) => {
    const response = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path, content } });
    expect(response.ok()).toBe(true);
  };
  await edit("components/section-work/section-work.html", '<section class="flow">\n  <slot name="title"><h2>Recent work</h2></slot>\n  <div class="cards"><slot><card-project></card-project></slot></div>\n</section>\n');
  await edit("components/section-work/section-work.css", ":host { display: block; }\n.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }\n");
  const home = (await cardsSource(page))!;
  const made = home.replace('<section class="flow" id="work">', '<section-work id="work">').replace('<h2>Recent work</h2>\n      <div class="cards">', '<h2 slot="title">Recent work</h2>')
    .replace(/<\/card-project>\n      <\/div>\n    <\/section>/, "</card-project>\n    </section-work>");
  expect(made).toContain('</card-project>\n    </section-work>');
  await edit("index.html", made);
  await page.reload();
  const titles = frame(page).locator('section-work > card-project > h3[slot="title"]');
  await expect(titles).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  const original = await cardsSource(page);
  await select(page, "section-work > card-project:nth-of-type(2)");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  for (const name of ["Move up", "Move down"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(titles).toHaveText(["Harbour Lane Pottery", "Fern & Kettle"]);
  await expect(status(page)).toHaveText("Moved up in Section work");
  const up = await cardsSource(page);
  // First in its items slot: the title is not a sibling item and no history is added.
  await status(page).evaluate(el => { el.textContent = ""; });
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(status(page)).toHaveText("");
  expect(await cardsSource(page)).toBe(up);
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(titles).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  await expect(status(page)).toHaveText("Moved down in Section work");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(up);
  await cardsUndo(page);
  await expect.poll(() => cardsSource(page)).toBe(original);
});

test("Alt+Down on a select in a heading's bar is the select's, not a move", async ({ page }) => {
  await select(page, ".hero h1");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await bar(page).getByRole("combobox", { name: "Heading level" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await expect(frame(page).locator("section.hero > h1:first-child")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});
