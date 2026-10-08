import { test, expect, type Page, type Route } from "@playwright/test";

// The preview runtime loads alongside the boot reads (lean-fast-editor p5-15):
// once the repo is known to be native, the preview frame is attached parked
// (hidden, inert, out of the accessibility tree) and only shown when its first
// page is ready. Leaving a site parks the frame again and reloads it, so no
// page of the old site lingers; a repo that is not native never loads it.

const pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const pane = (page: Page) => page.locator(".native-preview-pane");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const runtimeRequests = (page: Page) => {
  const urls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("native-preview-runtime")) urls.push(request.url()); });
  return urls;
};

// Holds every /api/file(s) read until released, so the pane stays parked.
async function holdReads(page: Page) {
  const held: Route[] = [];
  let holding = true;
  await page.route(/\/api\/files?(\?|$)/, (route) => { if (holding) held.push(route); else void route.continue(); });
  return {
    held,
    release() { holding = false; for (const route of held.splice(0)) void route.continue(); },
  };
}

test("the frame loads its runtime parked, before the page is read, then shows", async ({ page, baseURL }) => {
  const runtime = runtimeRequests(page);
  const reads = await holdReads(page);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect.poll(() => reads.held.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => runtime.length, { message: "the runtime is requested while reads wait" }).toBeGreaterThan(0);
  await expect(pane(page)).toHaveClass(/is-parked/);
  await expect(pane(page)).toHaveAttribute("aria-hidden", "true");
  expect(await pane(page).evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(page.locator(".native-preview-frame")).toBeHidden();
  await expect(page.locator("main")).not.toHaveClass(/has-preview/);

  reads.release();
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(pane(page)).not.toHaveClass(/is-parked/);
  await expect(pane(page)).not.toHaveAttribute("aria-hidden", "true");
  expect(await pane(page).evaluate((element) => (element as HTMLElement).inert)).toBe(false);
  await expect(page.locator("main")).toHaveClass(/has-preview/);
  await expect(pane(page)).toHaveCount(1);
});

test("a branch switch shows none of the old page while the new one is read", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/branch`, {
    data: { name: "feature", path: "index.html", content: home.replace("A native browser preview", "Feature branch preview") },
  });
  await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview", { timeout: 30_000 });

  const reads = await holdReads(page);
  await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
  await expect.poll(() => reads.held.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(pane(page)).toHaveClass(/is-parked/);
  await expect(frame(page).locator(".hero")).toHaveCount(0);

  reads.release();
  await expect(frame(page).locator(".hero h1")).toHaveText("Feature branch preview", { timeout: 30_000 });
  await expect(pane(page)).not.toHaveClass(/is-parked/);
});

const control = (page: Page, baseURL: string | undefined, body: unknown) =>
  page.request.post(`${baseURL}/__demo/onboarding`, { data: body });

async function notesRepo(page: Page, baseURL: string | undefined) {
  await control(page, baseURL, { reset: true });
  await control(page, baseURL, { add: [{ name: "notes", kind: "no-site" }] });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  return repos.find((repo) => repo.name === "notes")!.id;
}

test("a repo that is not native never requests the runtime", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const id = await notesRepo(page, baseURL);
  const runtime = runtimeRequests(page);
  await page.goto(`${baseURL}/#repo=${id}&branch=main`);
  await expect(page.getByText("No home page")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  expect(runtime).toEqual([]);
  await expect(pane(page)).toHaveCount(0);
  await control(page, baseURL, { reset: true });
});

test("a repo that is not native, after a native one, leaves the frame parked and empty", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const id = await notesRepo(page, baseURL);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await page.evaluate((next) => { location.hash = `#repo=${next}&branch=main`; }, id);
  await expect(page.getByText("No home page")).toBeVisible({ timeout: 30_000 });
  await expect(pane(page)).toHaveClass(/is-parked/);
  await expect(page.locator("main")).not.toHaveClass(/has-preview/);
  await expect(frame(page).locator(".hero")).toHaveCount(0);
  await control(page, baseURL, { reset: true });
});
