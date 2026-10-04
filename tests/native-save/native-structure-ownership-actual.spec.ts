import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

requireActualFixture();

// Structure tells "made from page data" apart from "ownership could not be
// checked". With .editor/page-builder.json unreadable, ordinary rows are not
// called generated, they carry a neutral hint, and writes stay refused.
// Runs on a copy of the actual starter.
const SIDECAR = ".editor/page-builder.json";
const UNKNOWN = "Collection ownership could not be checked; edits are temporarily unavailable.";
const GENERATED = "Made from page data. Edit the page it comes from, or the collection.";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const servicesPage = `<!doctype html><html><head><title>New services · Larkspur Studio</title><meta name="description" content="About services."></head><body><main><h1>New services</h1></main></body></html>`;
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

async function load(page: Page, baseURL: string | undefined, seed: [string, string][] = []) {
  await page.goto(`${baseURL}/`);
  for (const [path, content] of seed) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

test("with an unreadable sidecar, plain rows read as unchecked, not generated, and Remove still writes nothing", async ({ page, baseURL }) => {
  await load(page, baseURL, [[SIDECAR, "{ not json\n"]]);
  const before = await mounted(page);
  await frame(page).locator("section#work h2").first().click();
  await expect(tree(page)).toBeVisible();
  const rows = tree(page).locator(".page-structure__row");
  await expect(rows.first()).toBeVisible();
  // No row is claimed as made from page data.
  await expect(tree(page).locator(".page-structure__row--generated")).toHaveCount(0);
  await expect(tree(page).locator(`[title="${GENERATED}"]`)).toHaveCount(0);
  // The heading's row carries the neutral hint, visibly and accessibly.
  const heading = tree(page).locator('.page-structure__row[aria-selected="true"]');
  await expect(heading).toHaveAttribute("title", UNKNOWN);
  await expect(heading).toHaveAttribute("aria-description", UNKNOWN);
  // A real write attempt through the edit bar is still refused: no drafts, source unchanged.
  await page.getByRole("button", { name: "section.flow", exact: true }).click();
  await bar(page).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(frame(page).locator("section#work h2").first()).toBeVisible();
  expect(await storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
});

test("with a readable sidecar, cards a collection made are still flagged generated and plain rows carry no hint", async ({ page, baseURL }) => {
  await load(page, baseURL, [["services/one/index.html", servicesPage]]);
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  const inspector = page.getByRole("region", { name: "Collection settings", exact: true });
  await inspector.getByRole("checkbox", { name: "/services/", exact: true }).check();
  await inspector.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain('"pagePath": "index.html"');
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  const cards = tree(page).locator(".page-structure__row--generated").filter({ hasText: /^Card project/ });
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toHaveAttribute("title", GENERATED);
  await expect(tree(page).locator(`[title="${UNKNOWN}"]`)).toHaveCount(0);
  // Generated cards offer no slot fields.
  await expect(tree(page).locator(".page-structure__row--generated .page-structure__slot-toggle, .page-structure__row--generated input")).toHaveCount(0);
});
