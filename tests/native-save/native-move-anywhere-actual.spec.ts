import { expect, test, type Page } from "@playwright/test";

// In Edit component mode any part of the template moves anywhere in it as
// HTML allows (slice 82): on the canvas a part pressed and moved, a named slot
// moving with its element; in Page Structure a template row dragged, and a
// rail block dropped there; each one undo step on the template. On the page
// the component's parts stay closed.
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_MOVE_SHOTS=<dir> saves screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const structure = (page: Page) => page.getByRole("complementary", { name: "Page structure" });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const shots = process.env.ASE_MOVE_SHOTS;
const TEMPLATE = "components/section-hero/section-hero.html";
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");
const mounted = (page: Page, path: string) => page.evaluate(async (file) => (await import("/src/components/code-editor.ts")).getMountedSource(file), path);
async function undo(page: Page) {
  const accepted = await page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), TEMPLATE);
  expect(accepted, await page.locator("#status").textContent() ?? "undo status").toBe(true);
}

test.use({ viewport: { width: 1400, height: 1100 } });

async function enterMode(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-hero h1:visible").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  await structure(page).getByRole("treeitem", { name: /^Section hero/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section hero component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
}
/** A point in the edited template (a part's box, `fx`/`fy` across it, plus `dy` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dy = 0) {
  const target = frame(page).locator("section-hero").first().locator(selector).filter({ visible: true }).first();
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await target.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx, y: box.y + r.top + r.height * fy + dy };
}
async function pressAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}
const rowPoint = async (page: Page, name: RegExp, fy: number) => {
  const b = (await structure(page).getByRole("treeitem", { name }).first().locator(".page-structure__label").boundingBox())!;
  return { x: b.x + 12, y: b.y + b.height * fy };
};

test("on the page a component's parts stay closed; in Edit component mode its parts move on the canvas and in Structure", { tag: "@actual" }, async ({ page, baseURL }) => {
  await enterMode(page, baseURL);
  const original = await mounted(page, TEMPLATE);

  // The lead, pressed on the canvas, after the actions Div (its slot moving with it), one undo step.
  await pressAndMove(page, await pointIn(page, "p.lead", 0.3), await pointIn(page, ".actions", 0.5, 1, -3));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Div");
  if (shots) await page.screenshot({ path: `${shots}/canvas-move.png` });
  await page.mouse.up();
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain('</div><slot name="lead"><p class="lead">One or two sentences that say who this is for and what they get.</p></slot></section>');
  // Over a named slot's text a part goes beside it, never into it.
  await pressAndMove(page, await pointIn(page, "p.eyebrow", 0.3), await pointIn(page, "h1", 0.5, 0.7));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after “title” slot");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await undo(page);
  await expect.poll(() => mounted(page, TEMPLATE)).toBe(original);

  // In Structure: the eyebrow's row dragged below the title's row moves its slot after the title's.
  const eyebrow = structure(page).getByRole("treeitem", { name: /^Paragraph Larkspur Studio/ }).first();
  await expect(eyebrow).toBeVisible();
  const from = (await eyebrow.locator(".page-structure__label").boundingBox())!;
  await pressAndMove(page, { x: from.x + 20, y: from.y + from.height / 2 }, await rowPoint(page, /^Heading A short, clear headline/, 0.8));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after “title” slot");
  await expect(structure(page).locator(".page-structure__drop")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/structure-move.png` });
  await page.mouse.up();
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain('</h1></slot><slot name="eyebrow"><p class="eyebrow">Larkspur Studio</p></slot><slot name="lead">');
  await undo(page);
  await expect.poll(() => mounted(page, TEMPLATE)).toBe(original);

  // A rail block dropped in Structure goes into the template there.
  const button = (await rail(page).getByRole("button", { name: "Paragraph", exact: true }).boundingBox())!;
  await pressAndMove(page, { x: button.x + button.width / 2, y: button.y + button.height / 2 }, await rowPoint(page, /^Paragraph One or two sentences/, 0.8));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after “lead” slot");
  await page.mouse.up();
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain('</p></slot><p>Text</p><div class="actions">');
  await undo(page);
  await expect.poll(() => mounted(page, TEMPLATE)).toBe(original);

  // Alt+arrows on the canvas and on Structure rows move the template's parts by the same rules.
  await frame(page).locator("section-hero").first().locator("p.eyebrow").filter({ visible: true }).first().click();
  await expect(toolbar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain('</h1></slot><slot name="eyebrow"><p class="eyebrow">Larkspur Studio</p></slot><slot name="lead">');
  await expect(toolbar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await undo(page);
  await expect.poll(() => mounted(page, TEMPLATE)).toBe(original);
  const lead = structure(page).getByRole("treeitem", { name: /^Paragraph One or two sentences/ }).first();
  await lead.locator(".page-structure__label").click();
  await lead.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(async () => flat(await mounted(page, TEMPLATE))).toContain('<slot name="eyebrow"><p class="eyebrow">Larkspur Studio</p></slot><slot name="lead">');
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator("#status")).toHaveText(/The “eyebrow” slot is filled on each page/);
  await undo(page);
  await expect.poll(() => mounted(page, TEMPLATE)).toBe(original);
});
