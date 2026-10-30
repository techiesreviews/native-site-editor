import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Undo and Redo of guarded edits (sturdy-base slice 17, src/guarded-edit.ts): a range edit on
// the open page (a block from the rail) selects what was selected before and says so; a plain
// repository's Files tab renames with no file open and undoes; Undo of Make component closes
// the new component's stylesheet pane; Done while that mode still loads returns to the new component
// with its stylesheet. Default native-starter fixture group.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const status = (page: Page) => page.locator("#status");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => { expect(pageErrors).toEqual([]); });

async function openHome(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}

test("Undo of a block from the rail selects what was selected before and says so; Redo selects the block again", async ({ page, baseURL }) => {
  await openHome(page, baseURL);
  await frame(page).locator(".hero h1").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await page.getByRole("navigation", { name: "Blocks" }).getByRole("button", { name: "Paragraph", exact: true }).click();
  await expect(status(page)).toHaveText(/^Paragraph added\./);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await page.locator(".code-editor__undo").first().click();
  await expect(status(page)).toHaveText("Undid adding the Paragraph.");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(tree(page).getByRole("treeitem", { selected: true })).toHaveAccessibleName(/^Heading/);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(status(page)).toHaveText(/^Paragraph added\./);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
});

test("a plain repository renames a file in the Files tab with no file open; Undo takes it back", async ({ page, baseURL }) => {
  // Signed in on the demo site first; the plain repository then opens by a fresh load of its address.
  await openHome(page, baseURL);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { add: [{ name: "guarded-notes", kind: "no-site" }] } });
  const repos = await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json() as { id: number; name: string }[];
  const repo = repos.find((entry) => entry.name === "guarded-notes")!;
  await page.goto(`${baseURL}/#repo=${repo.id}&branch=main`);
  await page.reload();
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  const readme = explorer.getByRole("button", { name: "README.md", exact: true });
  await expect(readme).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#primary-title")).not.toHaveText("README.md");
  await readme.focus();
  await page.keyboard.press("F2");
  await explorer.getByRole("textbox", { name: "New name for README.md" }).fill("NOTES.md");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Renamed README.md to NOTES.md.");
  await expect(page.locator("#primary-title")).toHaveText("NOTES.md");
  await expect.poll(async () => (await storedDraft(page, "NOTES.md"))?.movedFrom).toBe("README.md");
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect(status(page)).toHaveText("Undid renaming README.md to NOTES.md.");
  await expect.poll(() => storedDraft(page, "NOTES.md")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "README.md")).toBeUndefined();
  await expect(page.locator("#primary-title")).toHaveText("README.md");
  // Redo from the file where it was renames it again.
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(status(page)).toHaveText("Renamed README.md to NOTES.md.");
  await expect(page.locator("#primary-title")).toHaveText("NOTES.md");
});

test("Undo of Make component closes the new component's stylesheet pane", async ({ page, baseURL }) => {
  const tag = "section-a-native-browser", cssPath = `components/${tag}/${tag}.css`;
  await openHome(page, baseURL);
  await tree(page).getByRole("treeitem", { name: "Section A native browser preview", exact: true }).first().locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", `components/${tag}/${tag}.html`);
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  // Back on the page, the new component's stylesheet still shows beside it.
  await expect(page.locator("#secondary-pane")).toBeVisible();
  await expect(page.locator("#secondary-title")).toContainText(cssPath);
  await page.locator(".code-editor__undo").first().click();
  await expect(frame(page).locator(tag)).toHaveCount(0);
  await expect.poll(() => storedDraft(page, cssPath)).toBeUndefined();
  await expect(page.locator("#secondary-pane")).toBeHidden();
});

test("Done while the new component's mode still loads returns to it on the page, its stylesheet beside it", async ({ page, baseURL }) => {
  const tag = "section-a-native-browser", cssPath = `components/${tag}/${tag}.css`;
  await openHome(page, baseURL);
  // The mode's lazily loaded view is held: Done comes before the mode is on.
  let release!: () => void, requested = false;
  const held = new Promise<void>((done) => { release = done; });
  const view = /\/edit-component-mode(?:\.ts|-[\w-]+\.js)/;
  await page.route(view, async (route) => { requested = true; await held; await route.continue().catch(() => undefined); });
  try {
    await tree(page).getByRole("treeitem", { name: "Section A native browser preview", exact: true }).first().locator(".page-structure__label").first().click();
    await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", `components/${tag}/${tag}.html`);
    await expect.poll(() => requested).toBe(true);
    await page.getByRole("button", { name: "Done editing component", exact: true }).click();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  } finally { release(); await page.unroute(view); }
  // Back on the page, the new component is selected and its stylesheet shows beside it; no mode starts late.
  await expect(tree(page).getByRole("treeitem", { selected: true })).toHaveAccessibleName(new RegExp(tag.replaceAll("-", "[- ]"), "i"));
  await expect(page.locator("#secondary-pane")).toBeVisible();
  await expect(page.locator("#secondary-title")).toContainText(cssPath);
  await expect(page.locator(".canvas-bar .edit-mode__title")).toHaveCount(0);
});
