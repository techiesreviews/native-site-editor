import { expect, test, type Page } from "@playwright/test";
import { publishButton } from "./publish";

// Setup in the Inbox (TOOLS-188): a site Start your site made lists Name your site and Connect an agent (optional)
// at the top of the Inbox until each is done, with no Setup pill in the slim top bar. Against the fake GitHub's
// onboarding controls (see the top of server.ts).

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
const inboxButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Inbox", exact: true });
const inbox = (page: Page) => page.getByRole("dialog", { name: "Inbox", exact: true });
const setupRows = (page: Page) => inbox(page).locator('[data-kind="setup"]');
const nameRow = (page: Page) => inbox(page).getByRole("button", { name: /^Name your site/ });
const agentRow = (page: Page) => inbox(page).getByRole("button", { name: /^Connect an agent/ });
const waiting = (page: Page) => page.evaluate(() => document.documentElement.hasAttribute("data-inbox-waiting"));

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
  await page.getByRole("button", { name: /^Blank page/ }).click();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
}

async function openInbox(page: Page) {
  if (!(await inbox(page).isVisible())) await inboxButton(page).click();
  await expect(inbox(page)).toBeVisible();
}

test("a new site lists its setup in the Inbox, not a pill, and Save name takes its row away", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await expect(page.locator(".setup-pill, #setup-checklist")).toHaveCount(0);
  // Open setup rows light the Inbox's dot.
  await expect.poll(() => waiting(page)).toBe(true);
  await openInbox(page);
  await expect(setupRows(page)).toHaveText([/Name your site\s*Setup$/, /Connect an agent\s*Setup · Optional$/]);
  // The setup rows come before anything the checks found.
  await expect(inbox(page).locator(".inbox__row").first()).toHaveAttribute("data-key", "setup:name");

  // Name your site opens its form in the row, the repository's name in its field.
  await expect(nameRow(page)).toHaveAttribute("aria-expanded", "false");
  await nameRow(page).click();
  await expect(nameRow(page)).toHaveAttribute("aria-expanded", "true");
  const field = inbox(page).getByLabel("Site name");
  await expect(field).toBeFocused();
  await expect(field).not.toHaveValue("");
  await field.fill("Blank Studio");
  await inbox(page).getByRole("button", { name: "Save name" }).click();
  await expect(setupRows(page)).toHaveText([/Connect an agent/]);
  await expect(inbox(page).getByLabel("Site name")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const config = JSON.parse(await (await file(page, baseURL, "blank-repo", ".editor/config.json")).text());
  expect(config.site.name).toBe("Blank Studio");

  // Remembered: after a reload only Connect an agent is left.
  await page.reload();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await openInbox(page);
  await expect(setupRows(page)).toHaveText([/Connect an agent/]);
});

test("an empty name says so on the field, and the form keeps the keyboard", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await openInbox(page);
  await nameRow(page).focus();
  await page.keyboard.press("Enter");
  const field = inbox(page).getByLabel("Site name");
  await expect(field).toBeFocused();
  await field.fill("");
  await page.keyboard.press("Enter");
  await expect(inbox(page).getByText("Enter a name for the site.")).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(nameRow(page)).toHaveAttribute("aria-expanded", "true");
  // The row closes its form again.
  await nameRow(page).click();
  await expect(nameRow(page)).toHaveAttribute("aria-expanded", "false");
  await expect(inbox(page).getByLabel("Site name")).toHaveCount(0);
});

test("Connect an agent opens the project menu with Connect to MCP lit and focused", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await openInbox(page);
  await agentRow(page).click();
  await expect(inbox(page)).toBeHidden();
  await expect(page.locator("#repository-actions")).toBeVisible();
  const entry = page.getByRole("button", { name: "Connect to MCP" });
  await expect(entry).toHaveClass(/is-spotlit/);
  await expect(entry).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#repository-actions")).toBeHidden();
  await expect(page.locator(".agent-menu__action")).not.toHaveClass(/is-spotlit/);
});

test("with every setup row done and nothing found, the Inbox says All done and its dot goes", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await openInbox(page);
  await nameRow(page).click();
  await inbox(page).getByLabel("Site name").fill("Blank Studio");
  await inbox(page).getByRole("button", { name: "Save name" }).click();
  await expect(setupRows(page)).toHaveCount(1);
  // An agent connected once counts as done (what the editor remembers when one connects).
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((each) => each.startsWith("native-site-editor:setup:"))!;
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), agent: true }));
  });
  await page.keyboard.press("Escape");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.reload();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await openInbox(page);
  await expect(inbox(page).getByText("All done")).toBeVisible({ timeout: 30_000 });
  await expect(setupRows(page)).toHaveCount(0);
  await expect.poll(() => waiting(page)).toBe(false);
});

test("on a phone the setup rows open from the Menu's Inbox, and the bar stays one row", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await startBlankSite(page, baseURL);
  const bar = (await page.locator(".topbar").boundingBox())!;
  expect(bar.height).toBeLessThanOrEqual(45);
  const menu = page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const sheet = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(sheet.getByRole("button", { name: /Set up your site/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: /^Inbox/ }).click();
  await expect(inbox(page)).toBeVisible();
  await expect(setupRows(page)).toHaveCount(2);
  const box = (await inbox(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(inbox(page)).toBeHidden();
});

test("an ordinary repository lists no setup rows", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await openInbox(page);
  await expect(inbox(page).locator(".inbox__list, .inbox__empty").first()).toBeVisible({ timeout: 30_000 });
  await expect(setupRows(page)).toHaveCount(0);
  await expect(page.locator(".setup-pill")).toHaveCount(0);
});
