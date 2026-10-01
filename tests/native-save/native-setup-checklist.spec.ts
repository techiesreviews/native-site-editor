import { expect, test, type Page } from "@playwright/test";
import { publishButton } from "./publish";

// The Set up your site checklist (a pill in the top bar and its popover),
// against the fake GitHub's onboarding controls (see the top of server.ts).

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
  await control(page, baseURL, { reset: true });
  await page.evaluate(() => localStorage.clear());
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const control = (page: Page, baseURL: string | undefined, body: unknown) =>
  page.request.post(`${baseURL}/__demo/onboarding`, { data: body });
const file = (page: Page, baseURL: string | undefined, repo: string, path: string) =>
  page.request.get(`${baseURL}/__demo/file?repo=${repo}&path=${encodeURIComponent(path)}`);
const pill = (page: Page) => page.locator(".setup-pill");
const panel = (page: Page) => page.locator("#setup-checklist-panel");
const item = (page: Page, id: string) => panel(page).locator(`.setup-item[data-item="${id}"]`);

async function openRepository(page: Page, baseURL: string | undefined, name: string) {
  const repos = (await (await page.request.get(`${baseURL}/api/repositories`)).json()) as { id: number; name: string }[];
  const repo = repos.find((candidate) => candidate.name === name);
  expect(repo, `${name} is listed`).toBeTruthy();
  await page.goto(`${baseURL}/#repo=${repo!.id}&branch=main`);
  await page.reload();
}

async function startBlankSite(page: Page, baseURL: string | undefined, name = "blank-repo") {
  await control(page, baseURL, { repositories: "none", add: [{ name, kind: "empty" }] });
  await openRepository(page, baseURL, name);
  await expect(page.getByRole("heading", { name: "Start your site" })).toBeVisible({ timeout: 30_000 });
  await expect(pill(page), "nothing to set up before a starting point").toBeHidden();
  await page.getByRole("button", { name: /^Blank page/ }).click();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
}

async function openChecklist(page: Page) {
  if (!(await panel(page).isVisible())) await pill(page).click();
  await expect(panel(page)).toBeVisible();
}

test("an empty repository's checklist goes from 1/4 to done as the site is saved, named and put online", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await expect(pill(page)).toHaveText("Setup 1/4");
  await openChecklist(page);
  await expect(item(page, "start")).toHaveClass(/is-done/);
  await expect(item(page, "save")).not.toHaveClass(/is-done/);
  await expect(item(page, "agent")).toContainText("Optional");

  // Save to GitHub opens the Save panel.
  await item(page, "save").getByRole("button").click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#publish-files")).toBeVisible();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(pill(page)).toHaveText("Setup 2/4", { timeout: 30_000 });

  // Name your site: Site name field, saved as a draft, then with Save.
  await openChecklist(page);
  await item(page, "name").getByRole("button", { name: /Name it/ }).click();
  await panel(page).getByLabel("Site name").fill("Blank Studio");
  await panel(page).getByRole("button", { name: "Save name" }).click();
  await expect(item(page, "name")).toHaveClass(/is-done/);
  await expect(pill(page)).toHaveText("Setup 3/4");
  await page.keyboard.press("Escape");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const config = JSON.parse(await (await file(page, baseURL, "blank-repo", ".editor/config.json")).text());
  expect(config.site.name).toBe("Blank Studio");

  // Put it online explains hosting and takes the address.
  await openChecklist(page);
  await item(page, "online").getByRole("button", { name: /Show how/ }).click();
  for (const host of ["Cloudflare Pages", "Netlify", "Vercel", "Any other host"]) await expect(item(page, "online")).toContainText(host);
  await panel(page).getByLabel("Address once it is live").fill("not an address");
  await panel(page).getByRole("button", { name: "Add the address" }).click();
  await expect(item(page, "online")).not.toHaveClass(/is-done/);
  await expect(item(page, "online").locator(".put-online__message")).toContainText("does not look like a web address");
  await panel(page).getByLabel("Address once it is live").fill("blank-studio.pages.dev");
  await panel(page).getByRole("button", { name: "Add the address" }).click();
  await expect(panel(page).locator(".setup-panel__complete")).toBeVisible();
  await page.keyboard.press("Escape");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const saved = JSON.parse(await (await file(page, baseURL, "blank-repo", ".editor/config.json")).text());
  expect(saved.site).toEqual({ name: "Blank Studio", url: "https://blank-studio.pages.dev/" });

  // "Your site is set up" for a moment, then the pill is gone, also after a reload.
  await expect(pill(page)).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await expect(pill(page)).toBeHidden();
});

test("dismissing the checklist hides it for the repository and stays hidden after a reload", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await openChecklist(page);
  await panel(page).getByRole("button", { name: "Dismiss the checklist" }).click();
  await expect(pill(page)).toBeHidden();
  await page.reload();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await expect(pill(page)).toBeHidden();
  // Still there from the project menu.
  await page.getByRole("button", { name: /repository actions/ }).click();
  await page.getByRole("button", { name: "Set up your site" }).click();
  await expect(panel(page)).toBeVisible();
  await expect(pill(page)).toHaveText("Setup 1/4");
});

test("the checklist is keyboard operable and fits a narrow window", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await startBlankSite(page, baseURL);
  await pill(page).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  const box = (await panel(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(pill(page)).toBeFocused();
});

test("an ordinary repository shows no checklist by itself but has it in the project menu", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(pill(page)).toBeHidden();
  await page.getByRole("button", { name: /repository actions/ }).click();
  await page.getByRole("button", { name: "Set up your site" }).click();
  await expect(panel(page)).toBeVisible();
  await expect(item(page, "start")).toHaveClass(/is-done/);
  await expect(item(page, "save")).toHaveClass(/is-done/);
  await expect(pill(page)).toBeVisible();
});

test("the address field starts afresh in another repository", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "site-a", kind: "empty" }, { name: "site-b", kind: "empty" }] });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories`)).json()) as { id: number; name: string }[];
  const id = (name: string) => repos.find((entry) => entry.name === name)!.id;
  await page.goto(`${baseURL}/#repo=${id("site-a")}&branch=main`);
  await page.reload();
  await page.getByRole("button", { name: /^Blank page/ }).click();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await openChecklist(page);
  await item(page, "online").getByRole("button", { name: /Show how/ }).click();
  await panel(page).getByLabel("Address once it is live").fill("a.pages.dev");
  await panel(page).getByRole("button", { name: "Add the address" }).click();
  await expect(item(page, "online")).toHaveClass(/is-done/);
  await page.keyboard.press("Escape");

  await page.goto(`${baseURL}/#repo=${id("site-b")}&branch=main`);
  await page.getByRole("button", { name: /^Blank page/ }).click();
  await expect(pill(page)).toHaveText("Setup 1/4", { timeout: 30_000 });
  await openChecklist(page);
  await item(page, "online").getByRole("button", { name: /Show how/ }).click();
  await expect(panel(page).getByLabel("Address once it is live")).toHaveValue("");
});
