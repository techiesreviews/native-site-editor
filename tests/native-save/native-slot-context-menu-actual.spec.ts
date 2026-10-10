import { readFileSync } from "node:fs";
import { effectiveSource } from "./drafts";
import { expect, test, type Page } from "@playwright/test";

// Slice 66: canvas and Structure menus share the slot chip actions.
// Recent work has a title slot, fixed lede and unnamed items slot.
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const chip = (page: Page) => page.locator(".edit-bar__label > .slot-chip");
const TEMPLATE = "components/section-work/section-work.html";
const LEDE = "A few of the sites we made this year.";

const workTemplate = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <p class="lede">${LEDE}</p>
  <div class="cards">
    <slot>
      <card-project></card-project>
    </slot>
  </div>
</section>
`;
const workCss = `:host {
  display: block;
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

h2 {
  margin: 0;
}
`;
function homeWithWork() {
  const home = readFileSync(`${process.env.ASE_NATIVE_SAVE_FIXTURE}/index.html`, "utf8");
  const start = home.indexOf(`<section class="flow" id="work">`);
  const end = home.indexOf("</section>", start) + "</section>".length;
  expect(start).toBeGreaterThan(0);
  const cards = home.slice(start, end).match(/<card-project>[\s\S]*?<\/card-project>/g)!;
  expect(cards).toHaveLength(3);
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${cards.join("\n      ")}
    </section-work>${home.slice(end)}`;
}

async function openMode(page: Page, baseURL: string | undefined, template = workTemplate) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, template], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork()]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
}

const menu = (page: Page) => page.getByRole("menu");
const outline = (page: Page) => page.locator(".page-structure__component-outline");
const ledeRow = (page: Page) => outline(page).getByRole("treeitem", { name: `Paragraph ${LEDE}`, exact: true });
const badge = (page: Page) => ledeRow(page).locator(":scope > .slot-chip");

for (const entry of ["canvas", "Structure right-click", "Structure button", "Shift+F10", "ContextMenu"]) {
  test(`${entry} offers slot actions and renames in a visible chip, each one undo step`, { tag: "@actual" }, async ({ page, baseURL }) => {
    await openMode(page, baseURL);
    const source = () => effectiveSource(page, baseURL, TEMPLATE);
    const undo = () => page.getByRole("button", { name: "Undo", exact: true }).click();
    const open = async () => {
      if (entry === "canvas") {
        await expect(async () => {
          await frame(page).locator("section-work").getByText(LEDE, { exact: true }).click({ button: "right" });
          await expect(menu(page)).toBeVisible({ timeout: 1000 });
        }).toPass();
      } else if (entry === "Structure right-click") await ledeRow(page).click({ button: "right" });
      else if (entry === "Structure button") {
        await ledeRow(page).hover();
        await ledeRow(page).getByRole("button", { name: `Actions for Paragraph ${LEDE}`, exact: true }).click();
      } else { await ledeRow(page).focus(); await ledeRow(page).press(entry); }
      await expect(menu(page)).toBeVisible();
    };
    const labels = () => menu(page).getByRole("menuitem");
    await open();
    await expect(labels()).toHaveText(["Make slot"]);
    await labels().click();
    const slotted = workTemplate.replace(`<p class="lede">${LEDE}</p>`, `<slot name="text"><p class="lede">${LEDE}</p></slot>`);
    await expect.poll(source).toBe(slotted);
    await expect(badge(page)).toHaveClass(/slot-chip--slot/);
    await undo();
    await expect.poll(source).toBe(workTemplate);
    await open();
    await labels().click();
    await expect.poll(source).toBe(slotted);

    await open();
    await expect(labels()).toHaveText(["Rename slot", "Remove slot"]);
    await menu(page).getByRole("menuitem", { name: "Rename slot", exact: true }).click();
    const name = (entry === "canvas" ? chip(page) : badge(page)).locator(".slot-chip__name");
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("contenteditable", /plaintext-only|true/);
    await page.keyboard.type("Lead Text");
    await page.keyboard.press("Enter");
    await expect.poll(source).toBe(slotted.replace('name="text"', 'name="lead-text"'));
    await undo();
    await expect.poll(source).toBe(slotted);

    await open();
    await menu(page).getByRole("menuitem", { name: "Remove slot", exact: true }).click();
    await expect.poll(source).toBe(workTemplate);
    await expect(badge(page)).toHaveClass(/slot-chip--fixed/);
    await undo();
    await expect.poll(source).toBe(slotted);
  });
}

test("roots, nested component contents and outer rows offer no slot menu; items slots do", { tag: "@actual" }, async ({ page, baseURL }) => {
  await openMode(page, baseURL, workTemplate.replace("<card-project></card-project>", '<card-project><p slot="body">Nested fill</p></card-project>')
    .replace("<h2>Section title</h2></slot>", "<h2>Section title</h2><p>More title</p></slot>"));
  // A second part of a slot's fallback has no badge in Structure, so no menu there; the canvas uses the label chip.
  const more = outline(page).getByRole("treeitem", { name: "Paragraph More title", exact: true });
  await expect(more.locator(":scope > .slot-chip")).toHaveCount(0);
  await more.click({ button: "right" });
  await expect(menu(page)).toHaveCount(0);
  await expect(async () => {
    await frame(page).locator("section-work").getByText("More title", { exact: true }).click({ button: "right" });
    await expect(menu(page).getByRole("menuitem")).toHaveText(["Rename slot", "Remove slot"], { timeout: 1000 });
  }).toPass();
  await menu(page).getByRole("menuitem", { name: "Rename slot", exact: true }).click();
  await expect(chip(page).locator(".slot-chip__name")).toBeFocused();
  await page.keyboard.press("Escape");
  const root = outline(page).getByRole("treeitem").first();
  // The root selected again, as the mode opened: the edit bar sits clear of the part below.
  await root.locator(".page-structure__label").click();
  await expect(root.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  await root.click({ button: "right" });
  await expect(menu(page)).toHaveCount(0);
  const section = frame(page).locator("section-work section");
  await section.scrollIntoViewIfNeeded();
  const position = await section.evaluate(el => {
    const box = el.getBoundingClientRect();
    const root = el.getRootNode() as ShadowRoot;
    for (let y = 2; y < box.height; y += 4) for (const x of [4, box.width - 4]) {
      if (root.elementFromPoint(box.left + x, box.top + y) === el) return { x, y };
    }
    throw new Error("No point of the component root's own");
  });
  await section.click({ button: "right", position });
  await expect(menu(page)).toHaveCount(0);
  const card = outline(page).getByRole("treeitem", { name: "Card project Untitled project", exact: true });
  await card.click({ button: "right" });
  await expect(menu(page).getByRole("menuitem")).toHaveText(["Rename slot", "Remove slot"]);
  await page.keyboard.press("Escape");
  await frame(page).locator("section-work").getByText("Nested fill", { exact: true }).click({ button: "right" });
  await expect(menu(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
  await card.hover();
  await card.getByRole("button", { name: "Open Card project component" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/card-project/card-project.html");
  // A slot declared inside a nested instance belongs to the template edited.
  // Its badge is on that instance's row, and its menu targets the same slot.
  const note = outline(page).getByRole("treeitem", { name: "Card note Project", exact: true });
  await note.click({ button: "right" });
  await expect(menu(page).getByRole("menuitem")).toHaveText(["Rename slot", "Remove slot"]);
  await menu(page).getByRole("menuitem", { name: "Rename slot", exact: true }).click();
  await expect(note.locator(":scope > .slot-chip .slot-chip__name")).toBeFocused();
  await page.keyboard.press("Escape");
  const outer = page.getByRole("treeitem", { name: "Heading Section title", exact: true });
  await expect(outer).toHaveClass(/page-structure__row--outer/);
  await expect(outer.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  await outer.click({ button: "right" });
  await expect(menu(page)).toHaveCount(0);
});
