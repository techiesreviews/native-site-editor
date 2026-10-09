import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Edit component mode builds with the block rail (slice 43): a click inserts
// by the selection in the template, a drag shows the line and the label on
// the template's parts, each insert one undo step on the template; a Section
// is refused with its reason; an items slot's new placeholder is what a new
// instance starts with.
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_EDIT_MODE_SHOTS=<dir> saves screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const canvasBar = (page: Page) => page.locator(".canvas-bar");
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const where = (page: Page) => page.locator(".pb-drag-ghost__where");
const shots = process.env.ASE_EDIT_MODE_SHOTS;
const TEMPLATE = "components/section-work/section-work.html";
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");

// Recent work as a section component: a title slot, and the items slot (the unnamed one) whose fallback is one card-project.
const workTemplate = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
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
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${cards.join("\n      ")}
    </section-work>${home.slice(end)}`;
}

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, workTemplate], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork()]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  await expect(rail(page)).toBeVisible();
}
const mounted = (page: Page, path: string) => page.evaluate(async (file) => (await import("/src/components/code-editor.ts")).getMountedSource(file), path);
async function undo(page: Page) {
  const accepted = await page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), TEMPLATE);
  expect(accepted, await page.locator("#status").textContent() ?? "undo status").toBe(true);
}
async function enterMode(page: Page) {
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
}
/** A point in the edited template (a part's box, `fx`/`fy` across it, plus `dx`/`dy` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dx = 0, dy = 0) {
  const target = frame(page).locator("section-work").first().locator(selector).filter({ visible: true }).first();
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  // Centred, away from the frame's edges, where a drag scrolls the page.
  const r = await target.evaluate(el => { el.scrollIntoView({ block: "center" }); const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx + dx, y: box.y + r.top + r.height * fy + dy };
}
/** Presses a rail block and drags it past the 7 px threshold to `to`. */
async function dragFromRail(page: Page, name: string, to: { x: number; y: number }) {
  const button = rail(page).getByRole("button", { name, exact: true });
  const b = (await button.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 12, b.y + b.height / 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(ghost(page)).toBeVisible();
}

test("the rail builds in the template: a Paragraph clicked into the items slot, a Heading dragged in; a Section refused; a new instance starts with it", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const srcdoc = await page.locator(".native-preview-frame").getAttribute("srcdoc");
  await enterMode(page);
  const work = frame(page).locator("section-work").first();

  // The fallback card selected: a Paragraph clicked goes after it, in the items slot's placeholder.
  await work.getByText("Untitled project", { exact: true }).filter({ visible: true }).click();
  await expect(toolbar(page).getByRole("button", { name: "Open Card project component", exact: true })).toBeVisible();
  await rail(page).getByRole("button", { name: "Paragraph", exact: true }).click();
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain("<slot><card-project></card-project><p>Text</p></slot>");
  await expect(work.locator(".cards > slot > p").filter({ visible: true })).toHaveText("Text");
  await expect(toolbar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(page.locator(".pb-flash")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Paragraph added. Into Section work › items › after Card project");
  // The page itself is untouched: its own cards are its content, not the template's.
  expect(flat(await mounted(page, TEMPLATE))).not.toContain("slot=");
  if (shots) await page.screenshot({ path: `${shots}/click-paragraph.png` });

  // A Heading dragged just above the cards: the line and its label, into the template's section after the title.
  await dragFromRail(page, "Heading", await pointIn(page, ".cards", 0.5, 0, 0, -4));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after “title” slot");
  await expect(page.locator(".pb-drop__line")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/drag-heading.png` });
  await page.mouse.up();
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain(`</slot><h2>Heading</h2><div class="cards">`);
  await expect(work.locator("section > h2").filter({ visible: true })).toHaveText("Heading");
  // An Image dragged into the items slot, after the new paragraph; one undo takes it out again.
  await dragFromRail(page, "Image", await pointIn(page, ".cards > slot > p", 0.8, 0.9));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section work › items › after Paragraph");
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain(`<p>Text</p><img src="/images/placeholder.svg"`);
  await undo(page);
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).not.toContain("<img");
  expect(flat(await mounted(page, TEMPLATE))).toContain("<h2>Heading</h2>");

  // A named slot refuses a drop with its reason.
  await dragFromRail(page, "Paragraph", await pointIn(page, "h2"));
  await expect(where(page)).toHaveText(/The “title” slot is filled on each page/);
  await expect(page.locator(".pb-drop__refused")).toBeVisible();
  await page.mouse.up();

  // A Section is refused inside a template, clicked or dragged, with its reason.
  const before = await mounted(page, TEMPLATE);
  await rail(page).getByRole("button", { name: "Section", exact: true }).click();
  await expect(page.locator(".pb-flash-label.is-refused")).toContainText("not inside a component's template");
  await dragFromRail(page, "Section", await pointIn(page, ".cards > slot > p"));
  await expect(where(page)).toContainText("not inside a component's template");
  await expect(page.locator(".pb-drop__refused")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/section-refused.png` });
  await page.mouse.up();
  expect(await mounted(page, TEMPLATE)).toBe(before);

  // Each insert is one undo step on the template; redo brings the heading back.
  await undo(page);
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).not.toContain("<h2>Heading</h2>");
  expect(flat(await mounted(page, TEMPLATE))).toContain("<card-project></card-project><p>Text</p>");
  expect(await page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).runVisualHistory("redo", path), TEMPLATE)).toBe(true);
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain("<h2>Heading</h2>");

  // Done; the frame was never reloaded.
  await canvasBar(page).getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  expect(await page.locator(".native-preview-frame").getAttribute("srcdoc")).toBe(srcdoc);
  // This page fills the items slot with its own cards: the new placeholder paragraph is not among them.
  await expect(work.locator(".cards > slot > p").filter({ visible: true })).toHaveCount(0);

  // A new instance from the Add panel starts with the items slot's placeholder, the new paragraph in it.
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Add to the page", exact: true });
  await panel.getByRole("option", { name: /^Work <section-work>/ }).click();
  const added = frame(page).locator("section-work").nth(1);
  await expect(added).toBeAttached();
  await expect.poll(async () => flat(await mounted(page, "index.html"))).toContain(`<section-work><h2 slot="title">Section title</h2><card-project></card-project><p>Text</p></section-work>`);
  await expect(added.getByText("Text", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(added.getByText("Untitled project", { exact: true }).filter({ visible: true })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/new-instance.png` });
});
