import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { planSidecarRecipe } from "../../src/page-builder/collection-origins";
import { planNativeCollectionOperation } from "../../src/page-builder/native-collection-host";
import { documentDrift, readSidecar } from "../../src/page-builder/document-collections";
import { storedDraft } from "./drafts";

// Renaming an image that cards of a JSON collection show: the cards, the
// collection's recorded output and its per-card override follow the image in
// the same step, so the cards are not mistaken for hand edits afterwards.
const SIDECAR = ".editor/page-builder.json";
const fixture = "fixtures/native-starter";
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
const record = (title: string, date: string) => `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <meta name="date" content="${date}">\n  <meta property="og:image" content="/images/studio-desk.svg">\n</head>\n<body>\n<main><h1>${title}</h1></main>\n</body>\n</html>\n`;

/** Home with a JSON collection on a plain grid, baked by the editor's own planner, plus the JSON. */
function seed(template = '<article class="card"><img src="{image}" alt=""><img src="{photo}" data-if="photo" alt=""><h3>{title}</h3></article>', pages?: Record<string, unknown>, overrides: Record<string, Record<string, string>> = { "work/one/index.html": { photo: "/images/studio-desk.svg" } }): [string, string][] {
  const sources: Record<string, string> = {};
  for (const file of files(fixture)) if (/\.html?$/i.test(file)) sources[relative(fixture, file)] = readFileSync(file, "utf8");
  sources["work/one/index.html"] = record("One", "2025-01-01");
  sources["work/two/index.html"] = record("Two", "2026-01-01");
  sources["index.html"] = sources["index.html"].replace('<section class="filler"', '<section class="cards" data-key="work-list" aria-label="Work"></section>\n  <section class="filler"');
  if (pages) sources[SIDECAR] = JSON.stringify({ version: 1, pages, collections: {} }, null, 2) + "\n";
  const routes = deriveNativeRoutes(Object.keys(sources)), identity = { name: "" };
  const origin = planSidecarRecipe({ sources, routes, identity }, "index.html", sources["index.html"].indexOf('<section class="cards"'), {
    folders: ["/work/"], sort: "-date", filter: "", limit: 10, fields: ["photo"],
    template,
    overrides,
  });
  const plan = planNativeCollectionOperation({ sources, routes, files: Object.keys(sources), revision: "seed", identity, origin: { ...origin, acceptCollections: undefined, done: "", undone: "" } });
  if ("error" in plan) throw new Error(plan.error);
  const out = { ...sources };
  for (const [path, text] of plan.operation.edits ?? []) out[path] = text;
  for (const file of plan.operation.creates ?? []) out[file.path] = file.content;
  return [["work/one/index.html", out["work/one/index.html"]], ["work/two/index.html", out["work/two/index.html"]], ["index.html", out["index.html"]], [SIDECAR, out[SIDECAR]]];
}

test("renaming an image moves it in JSON cards, their recorded output and override, in one Undo", async ({ page, baseURL }) => {
  const seeded = seed();
  const home = seeded[2][1], sidecar = seeded[3][1];
  expect(home.match(/studio-desk\.svg/g)?.length).toBe(3);
  await page.goto(`${baseURL}/`);
  for (const [path, content] of seeded) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  const panel = page.getByRole("region", { name: "Images", exact: true });
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("New image filename", { exact: true }).fill("garden-desk.svg");
  await panel.getByRole("button", { name: "Rename", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain("garden-desk.svg");
  const json = JSON.parse((await storedDraft(page, SIDECAR))!.content), before = JSON.parse(sidecar);
  const [id] = Object.keys(before.collections);
  const renamedHome = (await storedDraft(page, "index.html"))!.content;
  expect(renamedHome).toBe(home.replaceAll("studio-desk.svg", "garden-desk.svg"));
  expect(json.collections[id].overrides).toEqual({ "work/one/index.html": { photo: "/images/garden-desk.svg" } });
  expect(json.collections[id].outputFingerprint).toBe(before.collections[id].outputFingerprint.replaceAll("studio-desk.svg", "garden-desk.svg"));
  // The cards are still the collection's own: no drift against the recorded output.
  expect(documentDrift({ "index.html": renamedHome }, readSidecar(JSON.stringify(json)))).toEqual([]);
  expect(documentDrift({ "index.html": renamedHome }, readSidecar(sidecar)).map((item) => item.kind)).toEqual(["edited"]);
  await page.getByRole("tab", { name: "Pages", exact: true }).click(); await page.keyboard.press("Escape");
  // One Undo takes the JSON back with the image and the page.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, SIDECAR)).toBeUndefined();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
});

test("a literal image in the card template follows a rename, so a later title rebuild never brings the old path back", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  const seeded = seed('<article class="card"><img src="/images/studio-desk.svg" alt=""><h3>{title}</h3></article>');
  await page.goto(`${baseURL}/`);
  for (const [path, content] of seeded) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  const panel = page.getByRole("region", { name: "Images", exact: true });
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("New image filename", { exact: true }).fill("garden-desk.svg");
  await panel.getByRole("button", { name: "Rename", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain("garden-desk.svg");
  const renamedJson = (await storedDraft(page, SIDECAR))!.content;
  const [record] = Object.values(JSON.parse(renamedJson).collections) as { template: string }[];
  expect(record.template).toBe('<article class="card"><img src="/images/garden-desk.svg" alt=""><h3>{title}</h3></article>');
  // A listed page's new title rebuilds the cards from the JSON template: the old image path must not return.
  await page.keyboard.press("Escape");
  await page.goto(`${baseURL}/#repo=501&branch=main&file=work/one/index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/one/index.html", { timeout: 30_000 });
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#explorer").getByRole("treeitem", { name: "One", exact: true }).locator(".pages-label").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Title of One" }).fill("One renamed");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("<h3>One renamed</h3>");
  const rebuilt = (await storedDraft(page, "index.html"))!.content, rebuiltJson = (await storedDraft(page, SIDECAR))!.content;
  expect(rebuilt).not.toContain("studio-desk.svg");
  expect(rebuilt.match(/<img src="\/images\/garden-desk\.svg" alt="">/g)?.length).toBe(2);
  expect(rebuiltJson).not.toContain("studio-desk.svg");
  // Undo takes back the title step only; Redo restores it exactly.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").not.toContain("One renamed");
  expect((await storedDraft(page, SIDECAR))!.content).toBe(renamedJson);
  expect((await storedDraft(page, "index.html"))!.content).not.toContain("studio-desk.svg");
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(rebuilt);
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(rebuiltJson);
  expect(errors).toEqual([]);
});

test("a relative image recipe override follows a rename and the next rebuild keeps the new path", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  // The recipe override is resolved on Home, where the card image is written.
  const seeded = seed('<article class="card"><img src="{photo}" data-if="photo" alt=""><h3>{title}</h3></article>', undefined, { "work/one/index.html": { photo: "images/studio-desk.svg" } });
  expect(seeded[2][1]).toContain('<img src="images/studio-desk.svg" alt=""><h3>One</h3>');
  await page.goto(`${baseURL}/`);
  for (const [path, content] of seeded) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  const panel = page.getByRole("region", { name: "Images", exact: true });
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("New image filename", { exact: true }).fill("garden-desk.svg");
  await panel.getByRole("button", { name: "Rename", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain("garden-desk.svg");
  const renamedJson = (await storedDraft(page, SIDECAR))!.content;
  expect(Object.values(JSON.parse(renamedJson).collections)[0].overrides["work/one/index.html"]).toEqual({ photo: "/images/garden-desk.svg" });
  // The field takes exactly what the page rewriter wrote into the card, so the card still matches its recorded output.
  expect((await storedDraft(page, "index.html"))!.content).toContain('<img src="/images/garden-desk.svg" alt=""><h3>One</h3>');
  await page.keyboard.press("Escape");
  await page.goto(`${baseURL}/#repo=501&branch=main&file=work/one/index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/one/index.html", { timeout: 30_000 });
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#explorer").getByRole("treeitem", { name: "One", exact: true }).locator(".pages-label").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Title of One" }).fill("One renamed");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("<h3>One renamed</h3>");
  const rebuilt = (await storedDraft(page, "index.html"))!.content, rebuiltJson = (await storedDraft(page, SIDECAR))!.content;
  expect(rebuilt).toContain('<img src="/images/garden-desk.svg" alt=""><h3>One renamed</h3>');
  expect(rebuilt + rebuiltJson).not.toContain("studio-desk.svg");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").not.toContain("One renamed");
  expect((await storedDraft(page, SIDECAR))!.content).toBe(renamedJson);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(rebuilt);
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(rebuiltJson);
  expect(errors).toEqual([]);
});
