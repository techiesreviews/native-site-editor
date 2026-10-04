import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const inspector = (page: Page) => page.getByRole("region", { name: "Collection settings", exact: true });
const listing = `<section class="collection-grid" data-key="mixed-list" data-each="/work/" data-sort="-date"><template><article><a href="{url}">{title}</a></article></template><article><a href="/work/one/">Work</a></article></section>`;

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const source = home.replace("</head>", `<style>.collection-grid { padding: 30px; display: grid; gap: 12px; background: #eee; }</style></head>`)
    .replace("</main>", `${listing}</main>`);
  for (const [path, content] of [
    ["index.html", source],
    ...["work", "services", "portfolio", "articles", "videos"].flatMap((folder, i) => [
      [`${folder}/index.html`, `<html><head><title>Folder index</title></head><body><main></main></body></html>`],
      [`${folder}/one/index.html`, `<html><head><title>${folder === "work" ? "Work" : folder}</title><meta name="date" content="2026-01-0${i + 1}"><meta name="field:category" content="${folder === "videos" ? "Other" : "Featured"}"></head><body><main><h1>${folder}</h1></main></body></html>`],
    ]),
  ]) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  return source;
}
async function selectGrid(page: Page) {
  await frame(page).locator('[data-key="mixed-list"]').click({ position: { x: 5, y: 5 } });
  await page.getByRole("button", { name: "section.collection-grid", exact: true }).click();
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  await page.locator(".selected-collection > summary").click();
  await expect(inspector(page).getByRole("checkbox", { name: "/work/", exact: true })).toBeChecked();
}

test("selected collection mixes five page folders, filters and sorts native cards in one Undo/Redo", async ({ page, baseURL }) => {
  const before = await seed(page, baseURL);
  await selectGrid(page);
  const panel = inspector(page);
  await expect(panel.getByLabel("Card template HTML")).not.toBeVisible();
  for (const folder of ["services", "portfolio", "articles", "videos"])
    await panel.getByRole("checkbox", { name: `/${folder}/`, exact: true }).check();
  await panel.getByLabel("Sort by", { exact: true }).selectOption("date");
  await panel.getByLabel("Order", { exact: true }).selectOption("descending");
  await panel.getByLabel("Maximum items (1–500)").fill("5");
  await panel.getByRole("button", { name: "Save collection", exact: true }).click();
  const links = frame(page).locator('[data-key="mixed-list"] article a');
  await expect(links).toHaveText(["videos", "articles", "portfolio", "services", "Work"]);
  const union = (await storedDraft(page, "index.html"))!.content;
  expect(union).toContain('data-each="/work/ /services/ /portfolio/ /articles/ /videos/"');
  expect(union).toContain('<template><article><a href="{url}">{title}</a></article></template>');
  expect(union).not.toContain(">Folder index</a>");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  await expect(links).toHaveText(["Work"]);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(union);
  await expect(links).toHaveCount(5);
  await panel.getByLabel("Filter by", { exact: true }).selectOption("category");
  await panel.getByLabel("Matches exactly").fill("Featured");
  await panel.getByLabel("Maximum items (1–500)").fill("2");
  await panel.getByRole("button", { name: "Save collection", exact: true }).click();
  await expect(links).toHaveText(["articles", "portfolio"]);
  expect((await storedDraft(page, "index.html"))!.content).toContain('data-filter="category=Featured"');
});

test("foreign native source edit retains the collection form and refuses stale Apply", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await selectGrid(page);
  const panel = inspector(page);
  await panel.getByRole("checkbox", { name: "/articles/", exact: true }).check();
  await panel.getByLabel("Maximum items (1–500)").fill("3");
  // The actual mounted editor changes while a collection recipe is still unsubmitted.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    editor.replaceActiveRange("index.html", 0, 0, "<!-- foreign native edit -->\n");
  });
  const foreign = await mounted(page);
  await expect(panel.getByLabel("Maximum items (1–500)")).toHaveValue("3");
  await panel.getByRole("button", { name: "Save collection", exact: true }).click();
  await expect(panel).toContainText("changed");
  expect(await mounted(page)).toBe(foreign);
  expect((await storedDraft(page, "index.html"))!.content).toBe(foreign);
  expect(foreign).not.toContain('data-each="/work/ /articles/"');
});


test("changing selection keeps unsubmitted collection input but refuses its old target", async ({ page, baseURL }) => {
  const before = await seed(page, baseURL);
  await selectGrid(page);
  const panel = inspector(page);
  await panel.getByRole("checkbox", { name: "/portfolio/", exact: true }).check();
  await panel.getByLabel("Maximum items (1–500)").fill("4");
  await frame(page).locator("h1").first().click();
  await expect(panel.getByLabel("Maximum items (1–500)")).toHaveValue("4");
  await panel.getByRole("button", { name: "Save collection", exact: true }).click();
  await expect(panel).toContainText("changed");
  expect(await mounted(page)).toBe(before);
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).not.toBeVisible();
});
