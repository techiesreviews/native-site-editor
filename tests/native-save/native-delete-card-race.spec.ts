import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Deleting a page with its card: the card's edit to Home is computed when the
// confirm dialog opens. A write to Home while it is open (an editor or agent
// edit) must refuse the delete, never be overwritten by the older card edit.
const status = (page: Page) => page.locator("#status");
const explorer = (page: Page) => page.locator("#explorer");
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });
const FERN = "work/fern-and-kettle/index.html";
const FOREIGN = "<!-- written while the dialog was open -->";

async function openPages(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}
async function askDelete(page: Page) {
  await openPages(page);
  const work = item(page, "Work");
  if ((await work.getAttribute("aria-expanded")) === "false") await work.press("ArrowRight");
  await item(page, "Fern & Kettle · Larkspur Studio").focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", { name: `Delete the page Fern & Kettle · Larkspur Studio (${FERN})?` });
  await expect(dialog.getByRole("checkbox", { name: "Also remove its card from “Recent work” on Home" })).toBeChecked();
  return dialog;
}
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));

test("a Home edit while the delete-with-card dialog is open refuses the delete and keeps the edit; a fresh retry deletes both, one Undo/Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
  const original = (await mounted(page))!;
  expect(original).toContain('href="/work/fern-and-kettle/"');

  const dialog = await askDelete(page);
  // Write to Home through the real editor while the dialog waits.
  await page.evaluate(async (text) => {
    const { getMountedSource, replaceActiveRange } = await import("/src/components/code-editor.ts");
    const at = getMountedSource("index.html")!.indexOf("</main>");
    replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text });
  }, FOREIGN);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain(FOREIGN);
  const edited = (await storedDraft(page, "index.html"))!.content;
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#notice")).toContainText(/Source changed: index\.html|changed meanwhile/);
  expect((await storedDraft(page, "index.html"))?.content).toBe(edited);
  expect(await storedDraft(page, FERN)).toBeUndefined();
  expect(await mounted(page)).toBe(edited);

  // A fresh Delete plans from the edited Home: the edit stays, the card goes.
  const again = await askDelete(page);
  await again.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the page Fern & Kettle · Larkspur Studio and its card.");
  const after = (await storedDraft(page, "index.html"))!.content;
  expect(after).toContain(FOREIGN);
  expect(after).not.toContain("fern-and-kettle");
  expect((await storedDraft(page, FERN))?.deleted).toBe(true);

  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(edited);
  await expect.poll(async () => (await storedDraft(page, FERN))?.deleted ?? false).toBe(false);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(after);
  await expect.poll(async () => (await storedDraft(page, FERN))?.deleted).toBe(true);
});
