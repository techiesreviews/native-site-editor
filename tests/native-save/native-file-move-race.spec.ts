import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

// A folder rename plans its link changes from the site as it is before the
// confirmation dialog. An edit made while the dialog is open (here, in
// another tab) must refuse the rename, never be written over.
test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const item = "work/lifecycle/index.html";
const photo = "/work/lifecycle/photo.svg";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>';
const itemSource = `<!doctype html><html><head><title>Lifecycle</title><meta property="og:image" content="photo.svg"></head><body><main><h1>Lifecycle</h1><img src="photo.svg" alt=""></main></body></html>`;
const about = `<!doctype html><html><head><title>About</title><meta name="twitter:image" content="${photo}"></head><body><main><p><a href="/work/lifecycle/">Read</a></p></main></body></html>`;
const css = `.hero { background: url("${photo}"); }\n`;

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [["about/index.html", about], [item, itemSource], ["work/lifecycle/photo.svg", svg], ["styles/extra.css", css]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  // The stylesheet is open, so about/index.html is read from its draft, not a mounted editor.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent("styles/extra.css")}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/extra.css");
  await page.locator("#explorer-toggle").click();
  const explorer = page.locator("#explorer");
  await explorer.getByRole("tab", { name: "Files", exact: true }).click();
  const work = explorer.getByRole("button", { name: "work", exact: true });
  if (await work.getAttribute("aria-expanded") === "false") await work.click();
  await explorer.getByRole("button", { name: "lifecycle", exact: true }).focus();
  await page.keyboard.press("F2");
  await explorer.getByRole("textbox", { name: "New name for work/lifecycle" }).fill("renamed");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /^Rename work\/lifecycle to work\/renamed/ });
  await expect(dialog).toBeVisible();
  const keep = dialog.getByRole("checkbox");
  if (await keep.count() && await keep.isChecked()) await keep.uncheck();
  return dialog;
}

test("an edit made in another tab while the Rename dialog is open refuses the rename and is kept", async ({ page, baseURL, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const dialog = await seed(page, baseURL);
  const other = await context.newPage();
  await other.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent("about/index.html")}`);
  await expect(other.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  const edited = about.replace("</main>", "<p>other tab</p></main>");
  await other.evaluate((text) => navigator.clipboard.writeText(text), edited);
  await other.locator('#content [role="textbox"]').first().evaluate((el) => (el as HTMLElement).focus());
  await other.keyboard.press("ControlOrMeta+A");
  await other.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => (await storedDraft(other, "about/index.html"))?.content).toBe(edited);
  await other.close();
  // This tab has the other tab's draft before Rename is pressed.
  await expect.poll(() => page.evaluate(async () => {
    const store = (await import("/src/drafts.ts")).draftStore() as unknown as { memory: Map<string, { path: string; content: string }> };
    return [...store.memory.values()].some((d) => d.path === "about/index.html" && d.content.includes("other tab"));
  })).toBe(true);
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("#explorer")).toContainText("The site changed while the Rename dialog was open, so nothing was renamed. Try again to see the latest links.");
  // The other tab's edit is the only draft; nothing moved, no link or file reference rewritten.
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["about/index.html"]);
  expect((await storedDraft(page, "about/index.html"))?.content).toBe(edited);
  expect(await storedDraft(page, "work/renamed/photo.svg")).toBeUndefined();
  expect(await storedDraft(page, "work/lifecycle/photo.svg")).toBeUndefined();
});

test("without an edit in between, the same rename goes through as one change", async ({ page, baseURL }) => {
  const dialog = await seed(page, baseURL);
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Renamed the folder work/lifecycle to work/renamed");
  await expect.poll(async () => (await storedDraft(page, "about/index.html"))?.content).toBe(
    about.replace('href="/work/lifecycle/"', 'href="/work/renamed/"').replace(photo, "/work/renamed/photo.svg"));
  expect((await storedDraft(page, "styles/extra.css"))?.content).toBe(css.replace(photo, "/work/renamed/photo.svg"));
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
});
