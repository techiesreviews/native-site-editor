import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Collections through the real host: Monaco, native preview, drafts, Undo/Redo.
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const record = (title: string, date: string, extra = "") =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <meta name="date" content="${date}">${extra}\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n<main><h1>${title}</h1></main>\n</body>\n</html>\n`;
const listing = `<section class="cards" data-key="work-list" data-each="/work/" data-sort="-date"><template><article><a href="{url}">{title}</a><time>{date}</time></article></template></section>`;

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const edits: [string, string][] = [
    ["work/one/index.html", record("One", "2025-01-01")],
    ["work/two/index.html", record("Two", "2026-01-01")],
    ["index.html", home.replace('<section class="filler"', `${listing}\n  <section class="filler"`)],
  ];
  for (const [path, content] of edits) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
}
async function open(page: Page, baseURL: string | undefined, file: string) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openPageSettings(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  await expect(dialog(page, "Page settings")).toBeVisible();
  return dialog(page, "Page settings");
}
const homeDraft = async (page: Page) => (await storedDraft(page, "index.html"))?.content ?? "";

test("General and staged Fields apply with the dependent listing as one draft operation and one Undo/Redo", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/one/index.html");
  const before = await mounted(page, "work/one/index.html");
  const panel = await openPageSettings(page);
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(panel.getByLabel("Date", { exact: true })).toHaveValue("2025-01-01");
  for (const label of ["Title", "Description", "Image"]) await expect(panel.getByRole("tabpanel").getByLabel(label, { exact: true })).toHaveCount(0);
  await panel.getByLabel("Date", { exact: true }).fill("2027-05-01");
  await panel.getByLabel("New custom field name", { exact: true }).fill("category");
  await panel.getByLabel("New custom field value", { exact: true }).fill("Clay & glaze");
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await panel.getByLabel("Title", { exact: true }).fill("One renamed");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();

  await expect.poll(async () => (await storedDraft(page, "work/one/index.html"))?.content ?? "").toContain("<title>One renamed</title>");
  const one = (await storedDraft(page, "work/one/index.html"))!.content;
  expect(one).toContain('<meta name="date" content="2027-05-01">');
  expect(one).toContain('content="Clay &amp; glaze"');
  expect(one).toBe(await mounted(page, "work/one/index.html"));
  // The dependent listing on Home is baked from the result, newest first.
  const home = await homeDraft(page);
  const cards = home.slice(home.indexOf('data-key="work-list"'));
  expect(cards.indexOf("One renamed")).toBeGreaterThan(-1);
  expect(cards.indexOf("One renamed")).toBeLessThan(cards.indexOf(">Two<"));
  expect(cards).toContain("<time>2027-05-01</time>");
  expect(home).toContain("<template><article><a href=\"{url}\">{title}</a><time>{date}</time></article></template>");

  // One Undo restores both files exactly; one Redo writes both again.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "work/one/index.html")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  expect(await mounted(page, "work/one/index.html")).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "work/one/index.html"))?.content).toBe(one);
  await expect.poll(() => homeDraft(page)).toBe(home);
});

test("an unchanged Fields tab passes a metadata-only change through and bakes the listing title", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/two/index.html");
  const panel = await openPageSettings(page);
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await panel.getByLabel("Title", { exact: true }).fill("Two, retitled");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();
  await expect.poll(() => homeDraft(page)).toContain(">Two, retitled</a>");
  const two = (await storedDraft(page, "work/two/index.html"))!.content;
  expect(two).toContain('<meta name="date" content="2026-01-01">');
  expect(two).not.toContain("field:");
  // The home page renders the baked plain HTML.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator('[data-key="work-list"] article a').first()).toHaveText("Two, retitled");
});

test("an invalid staged field refuses the whole apply without writing", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/one/index.html");
  const panel = await openPageSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("Should not apply");
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await panel.getByLabel("New custom field name", { exact: true }).fill("Bad name");
  await panel.getByLabel("New custom field value", { exact: true }).fill("x");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel.locator(".site-settings__status")).toContainText(/valid editable page field|field/i);
  await expect(panel).toBeVisible();
  expect(await storedDraft(page, "work/one/index.html")).toBeUndefined();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
});
