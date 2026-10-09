import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Fixed parts are locked on the page (build slice 48, ticket 14 §7): the
// starter's Recent work made a section component with a fixed paragraph.
// Slice 90 removes the hint: outside Edit component mode a paragraph click
// selects the instance and shows its normal edit bar with its usual component
// action. Fixed parts take no text editing or drops; Structure lists only
// the instance's slots. ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const canvasBar = (page: Page) => page.locator(".canvas-bar");
const shots = process.env.ASE_LOCKED_SHOTS;
const TEMPLATE = "components/section-work/section-work.html";

// A title slot, a fixed paragraph, and the items slot (the unnamed one) whose fallback is one card-project.
const workTemplate = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <p class="lede">Selected projects.</p>
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

h2, p {
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
  const items = cards.join("\n      ");
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${items}
    </section-work>${home.slice(end)}`;
}

async function seed(page: Page, baseURL: string | undefined, template = workTemplate) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, template], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork()]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
}
const mountedPage = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));

async function expectInstanceBar(page: Page) {
  await expect(toolbar(page).locator(".edit-bar__kind")).toHaveText("Section work");
  await expect(toolbar(page).locator(".edit-bar__locked")).toHaveCount(0);
  await expect(toolbar(page)).not.toContainText("fixed in");
  const edit = toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true });
  await expect(edit).toHaveCount(1);
  await expect(edit).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "Edit component", exact: true })).toHaveCount(0);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
}

test("Fixed parts select the page instance with its normal edit bar and stay locked", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const work = frame(page).locator("section-work");
  const paragraph = work.locator("p.lede");
  await paragraph.click();
  await expectInstanceBar(page);
  if (shots) await page.screenshot({ path: `${shots}/90-instance-bar.png` });

  // Fixed source never becomes an editable text surface, even on double-click and typing.
  await paragraph.dblclick();
  await page.keyboard.type("Cannot change");
  await expect(paragraph).not.toHaveAttribute("contenteditable", /.+/);
  await expect(paragraph).toHaveText("Selected projects.");
  expect(await mountedPage(page)).not.toContain("Cannot change");

  // Structure lists the instance's slots only: its title and its cards, not the fixed paragraph.
  const row = page.getByRole("treeitem", { name: /^Section work/ }).first();
  if (await row.getAttribute("aria-expanded") === "false") await row.locator(".page-structure__toggle").click();
  const slots = row.locator("xpath=following-sibling::*[1]");
  await expect(slots.getByRole("treeitem", { name: /Recent work/ })).toBeVisible();
  await expect(slots.getByRole("treeitem", { name: /^Card project/ })).toHaveCount(3);
  await expect(slots.getByRole("treeitem", { name: /Selected projects/ })).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/48-structure-slots.png` });

  // The instance's usual action still opens its shared component template.
  await paragraph.click();
  await expectInstanceBar(page);
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-work>");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(toolbar(page).locator(".edit-bar__locked")).toHaveCount(0);
});

test("Fixed template parts refuse block drops; click-insert targets only the instance's items slot", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const paragraph = frame(page).locator("section-work p.lede");
  await paragraph.click();
  const before = await mountedPage(page);
  const railParagraph = page.getByRole("navigation", { name: "Blocks" }).getByRole("button", { name: "Paragraph", exact: true });
  const from = (await railParagraph.boundingBox())!;
  const to = (await paragraph.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 2 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(page.locator(".pb-drag-ghost__where")).toContainText("fixed in the component's template");
  await expect(page.locator(".pb-drag-ghost")).toHaveClass(/is-refused/);
  if (shots) await page.screenshot({ path: `${shots}/48-drop-refused.png` });
  await page.mouse.up();
  await expect(page.locator(".pb-drag-ghost")).toHaveCount(0);
  expect(await mountedPage(page)).toBe(before);
  await paragraph.click();
  await railParagraph.click();
  await expect(frame(page).locator("section-work > p")).toHaveText("Text");
  await expect(paragraph).toHaveText("Selected projects.");
  await expect.poll(() => mountedPage(page)).toContain("<p>Text</p>");
});

test("Clicking another fixed Paragraph keeps the normal instance bar and refuses text editing", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL, workTemplate.replace('<p class="lede">Selected projects.</p>', '<p class="lede">Selected projects.</p><p class="note">More projects soon.</p>'));
  const work = frame(page).locator("section-work");
  await work.locator("p.lede").click();
  await expectInstanceBar(page);
  const note = work.locator("p.note");
  await note.click();
  await expectInstanceBar(page);
  await note.dblclick();
  await page.keyboard.type("Cannot change");
  await expect(note).not.toHaveAttribute("contenteditable", /.+/);
  await expect(note).toHaveText("More projects soon.");
  expect(await mountedPage(page)).not.toContain("Cannot change");
  await expectInstanceBar(page);
});
