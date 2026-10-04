import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

// Runs on a copy of the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const inspector = (page: Page) => page.getByRole("region", { name: "Collection settings", exact: true });
const work = ["fern-and-kettle", "harbour-lane-pottery", "meadow-row-allotments"];
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text();

async function open(page: Page, baseURL: string | undefined, extra: [string, string][] = []) {
  await page.goto(baseURL!);
  for (const [path, content] of extra) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const before = await mounted(page);
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const summary = page.locator(".selected-collection > summary");
  await expect(summary).toBeVisible();
  await expect(page.locator(".selected-collection")).not.toHaveAttribute("open", "");
  await summary.click();
  await expect(inspector(page).getByRole("heading", { name: "Choose pages for this grid" })).toBeVisible();
  // Opening the section and changing folders writes nothing.
  expect(await mounted(page)).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
  return before;
}
const folders = ["services", "portfolio", "articles", "videos"];
const extraPages = folders.map((folder): [string, string] => [`${folder}/one/index.html`,
  `<!doctype html><html><head><title>New ${folder} · Larkspur Studio</title><meta name="description" content="About ${folder}."></head><body><main><h1>New ${folder}</h1></main></body></html>`]);

test("Recent work cards become a five-folder page list, unchanged, in one Undo/Redo", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const seo = await Promise.all(work.map((slug) => file(page, baseURL, `work/${slug}/index.html`)));
  const before = await open(page, baseURL, extraPages);
  const panel = inspector(page);
  await expect(panel.getByRole("checkbox", { name: "/work/", exact: true })).toBeChecked();
  for (const folder of folders) await panel.getByRole("checkbox", { name: `/${folder}/`, exact: true }).check();
  await expect(panel.getByRole("status").first()).toContainText("7 pages will show, including all 3 current cards");
  expect(await storedDrafts(page)).toEqual([]);
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  const titles = frame(page).locator('.cards > card-project > h3[slot="title"]');
  await expect(titles).toHaveCount(7);
  // Folder records follow page order; every current card is still there.
  await expect(titles).toContainText(["New articles", "New portfolio", "New services", "New videos", "Fern & Kettle", "Harbour Lane Pottery", "Meadow Row Allotments"]);
  await expect(frame(page).locator(".cards card-project").filter({ hasText: "New services" }).locator('a[slot="link"]')).toHaveText("Read about New services");
  await expect(frame(page).locator(".cards card-project").filter({ hasText: "New services" })).toContainText("About services.");
  const home = (await storedDraft(page, "index.html"))!.content;
  expect(home).toMatch(/<div class="cards" data-each="\/work\/ \/articles\/ \/portfolio\/ \/services\/ \/videos\/" data-collection-id="g[0-9a-z]{5}" data-fields="[a-z0-9_ -]+"><template>/);
  for (const text of ["Cafe · Identity and site · 2025", "A one-page site with a menu the owners change themselves before opening each morning.", 'href="/work/meadow-row-allotments/"', "Read about Harbour Lane Pottery"])
    expect(home.split("</template>")[1]).toContain(text);
  for (const [index, slug] of work.entries()) {
    const draft = (await storedDraft(page, `work/${slug}/index.html`))!.content;
    // SEO head lines are untouched; only a grid field is added.
    for (const line of seo[index].split("\n").filter((line) => /<title>|name="description"|og:description/.test(line))) expect(draft).toContain(line);
  }
  const pageDrafts = await Promise.all(work.map(async (slug) => (await storedDraft(page, `work/${slug}/index.html`))!.content));
  const sort = panel.getByRole("combobox", { name: "Sort by", exact: true });
  await expect(sort).toBeVisible();
  const labels = await sort.locator("option").allTextContents();
  expect(labels).toContain("Card note");
  expect(labels.some((label) => /^G[0-9a-z]{5}-/.test(label))).toBe(false);
  const components = await storedDrafts(page);
  expect(components.some((draft) => draft.path.startsWith("components/") || draft.path.startsWith("styles/"))).toBe(false);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  await expect(titles).toHaveCount(3);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home);
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(4);
  for (const [index, slug] of work.entries()) expect((await storedDraft(page, `work/${slug}/index.html`))!.content).toBe(pageDrafts[index]);
  await expect(titles).toHaveCount(7);
});

test("a foreign edit after opening refuses Apply and keeps the foreign source", async ({ page, baseURL }) => {
  await open(page, baseURL, extraPages);
  const panel = inspector(page);
  // Unsubmitted input pins the form to the sources it was planned from.
  await panel.getByRole("checkbox", { name: "/services/", exact: true }).check();
  await expect(panel.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    editor.replaceActiveRange({ path: "index.html", start: 0, end: 0, expected: "", text: "<!-- foreign native edit -->\n" });
  });
  const foreign = await mounted(page);
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(panel).toContainText("changed");
  expect(await mounted(page)).toBe(foreign);
  expect(foreign).not.toContain("data-each");
  await expect(panel.getByRole("checkbox", { name: "/services/", exact: true })).toBeChecked();
  for (const slug of work) expect(await storedDraft(page, `work/${slug}/index.html`)).toBeUndefined();
});

test("a card with rich text is refused with a reason and nothing changes", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const home = await file(page, baseURL, "index.html");
  expect(home).toContain("A quiet portfolio for a working potter");
  const rich = home.replace("A quiet portfolio for a working potter", "A <em>quiet</em> portfolio for a working potter");
  const before = await open(page, baseURL, [["index.html", rich]]);
  const panel = inspector(page);
  await expect(panel).toContainText("Only plain text parts can be kept");
  await expect(panel.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
  expect(await mounted(page)).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
});

test("cards in a custom order are refused with a reason and nothing changes", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const home = await file(page, baseURL, "index.html");
  const cards = [...home.matchAll(/<card-project>[\s\S]*?<\/card-project>/g)].map((match) => match[0]);
  expect(cards).toHaveLength(3);
  const reversed = home.replace(cards.join("\n        "), [...cards].reverse().join("\n        "));
  expect(reversed).not.toBe(home);
  const before = await open(page, baseURL, [["index.html", reversed], ...extraPages]);
  const panel = inspector(page);
  await expect(panel).toContainText("These cards use a custom order. Choosing pages would reorder them, so nothing was changed.");
  await expect(panel.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  await panel.getByRole("checkbox", { name: "/services/", exact: true }).check();
  await expect(panel).toContainText("These cards use a custom order.");
  await expect(panel.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  expect(await mounted(page)).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
});
