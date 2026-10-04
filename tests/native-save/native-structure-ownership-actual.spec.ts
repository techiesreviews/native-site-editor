import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

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
  expect(typeof before).toBe("string");
  expect(before!.length).toBeGreaterThan(0);
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
  // The refusal is said, naming the unreadable file.
  await expect(page.locator("#status, [role=alert]").filter({ hasText: `The editor's page data file ${SIDECAR} is not valid` }).first()).toBeVisible();
  await expect(frame(page).locator("section#work h2").first()).toBeVisible();
  expect(await storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
});

async function convert(page: Page) {
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  const inspector = page.getByRole("region", { name: "Collection settings", exact: true });
  await inspector.getByRole("checkbox", { name: "/services/", exact: true }).check();
  await inspector.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain('"pagePath": "index.html"');
}

// Generated cards are flagged, carry no component tools and no slot rows;
// plain component instances elsewhere keep theirs.
async function expectKnownCards(page: Page) {
  const cards = tree(page).locator(".page-structure__row--generated").filter({ hasText: /^Card project/ });
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toHaveAttribute("title", GENERATED);
  await expect(tree(page).locator(`[title="${UNKNOWN}"]`)).toHaveCount(0);
  await expect(tree(page).locator(".page-structure__row--generated.page-structure__row--instance")).toHaveCount(0);
  await expect(tree(page).locator(".page-structure__row--generated.page-structure__row--slot")).toHaveCount(0);
  for (const card of await cards.all())
    for (const name of ["Attributes", "Edit component", "Disconnect this instance"]) await expect(card.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(tree(page).locator(".page-structure__row--instance").first()).toBeVisible();
}

test("with a readable sidecar, cards a collection made are still flagged generated and plain rows carry no hint", async ({ page, baseURL }) => {
  await load(page, baseURL, [["services/one/index.html", servicesPage]]);
  await convert(page);
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  await expectKnownCards(page);
});

test("while the sidecar is still loading rows read as unchecked; once it arrives cards are flagged and plain instances get their tools back", async ({ page, baseURL }) => {
  await load(page, baseURL, [["services/one/index.html", servicesPage]]);
  await convert(page);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  // The sidecar's blob on the branch (fetched through /api/files?shas=):
  // hold its real request until released.
  const snapshot = await (await page.request.get(`${baseURL}/api/snapshot?${new URLSearchParams({ repo: "native-demo-user/native-demo", branch: "main" })}`)).json();
  const sha = (snapshot.tree as { path: string; sha: string }[]).find((entry) => entry.path === SIDECAR)?.sha;
  expect(sha).toBeTruthy();
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let held = 0;
  await page.route("**/api/**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if ([params.get("sha"), ...(params.get("shas") ?? "").split(",")].includes(sha!)) { held++; await released; }
    await route.continue();
  });
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  await expect(tree(page)).toBeVisible();
  await expect(tree(page).locator(`[title="${UNKNOWN}"]`).first()).toBeVisible();
  await expect(tree(page).locator(".page-structure__row--generated")).toHaveCount(0);
  await expect(tree(page).locator(".page-structure__row--instance")).toHaveCount(0);
  expect(held).toBeGreaterThan(0);
  const before = await mounted(page);
  release();
  // No typing, no source change: the tree repaints once the JSON arrives.
  await expect(tree(page).locator(`[title="${UNKNOWN}"]`)).toHaveCount(0);
  await expectKnownCards(page);
  expect(await mounted(page)).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
  await page.unroute("**/api/**");
});
