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

test("an empty repository's checklist goes from 1/3 to 3/3 as the site is saved and named", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await expect(pill(page)).toHaveText("Setup 1/3");
  await openChecklist(page);
  await expect(page.locator(".setup-item")).toHaveCount(4);
  await expect(panel(page).locator(".setup-item[data-item]")).toHaveText([/Start your site/, /Save to GitHub/, /Name your site/, /Connect an agent\s*Optional/]);
  await expect(panel(page).getByText("Put it online")).toHaveCount(0);
  await expect(item(page, "start")).toHaveClass(/is-done/);
  await expect(item(page, "save")).not.toHaveClass(/is-done/);
  await expect(item(page, "agent")).toContainText("Optional");

  // Save to GitHub opens the Save panel.
  await item(page, "save").getByRole("button").click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#publish-files")).toBeVisible();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(pill(page)).toHaveText("Setup 2/3", { timeout: 30_000 });

  // Name your site: Site name field, saved as a draft, then with Save.
  await openChecklist(page);
  await item(page, "name").getByRole("button", { name: /Name it/ }).click();
  await panel(page).getByLabel("Site name").fill("Blank Studio");
  await panel(page).getByRole("button", { name: "Save name" }).click();
  await expect(item(page, "name")).toHaveClass(/is-done/);
  // Three required items done: the checklist is complete (the optional agent does not count).
  await expect(panel(page).locator(".setup-panel__complete")).toBeVisible();
  await expect(page.locator(".setup-checklist")).toHaveAttribute("data-complete", "true");
  await expect(item(page, "agent")).not.toHaveClass(/is-done/);
  await page.keyboard.press("Escape");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const config = JSON.parse(await (await file(page, baseURL, "blank-repo", ".editor/config.json")).text());
  expect(config.site.name).toBe("Blank Studio");
  expect(config.site.url).toBeUndefined();

  // "Your site is set up" for a moment, then the pill is gone, also after a reload.
  await expect(pill(page)).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await expect(pill(page)).toBeHidden();
});

test("dismissing setup keeps it hidden after reload and the repository menu offers no reopen entry", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await openChecklist(page);
  await panel(page).getByRole("button", { name: "Dismiss the checklist" }).click();
  await expect(pill(page)).toBeHidden();
  await page.reload();
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await expect(pill(page)).toBeHidden();
  // Dismissal remains effective; the removed menu entry does not reopen setup.
  await page.getByRole("button", { name: /repository actions/ }).click();
  const menu = page.locator("#repository-actions");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Set up your site", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(panel(page)).toBeHidden();
  await expect(pill(page)).toBeHidden();
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

test("an ordinary repository keeps setup hidden and omits the removed menu entry", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(pill(page)).toBeHidden();
  await page.getByRole("button", { name: /repository actions/ }).click();
  const menu = page.locator("#repository-actions");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Set up your site", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(panel(page)).toBeHidden();
  await expect(pill(page)).toBeHidden();
});

// Connect an agent: says what an agent is for and spotlights the project menu's
// tile (where the agent connection lives), dimming the rest of the page.
const spotlight = (page: Page) => page.getByRole("dialog", { name: "Connect an agent" });
const tile = (page: Page) => page.locator(".repository-menu__trigger");

test("Connect an agent spotlights the project menu, and Show me opens it with Connect with MCP lit", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await openChecklist(page);
  await item(page, "agent").getByRole("button").click();
  await expect(panel(page)).toBeHidden();
  const callout = spotlight(page);
  await expect(callout).toBeVisible();
  await expect(callout).toContainText("An AI agent such as Claude Code or Codex can build and edit your site for you.");
  await expect(callout).toContainText("It connects to this editor over MCP and its changes arrive here as drafts you review and save.");
  await expect(callout).toContainText("You can always disconnect.");
  await expect(callout).toContainText("Agents connect here, from the project menu. Open it and choose Connect with MCP to copy the setup for your agent.");
  // The focus is in the callout; the highlight sits over the tile, and the callout beside it, not over it.
  await expect(page.locator(".spotlight__callout")).toBeFocused();
  const hole = (await page.locator(".spotlight__hole").boundingBox())!;
  const target = (await tile(page).boundingBox())!;
  expect(hole.x).toBeLessThanOrEqual(target.x);
  expect(hole.y).toBeLessThanOrEqual(target.y);
  expect(hole.x + hole.width).toBeGreaterThanOrEqual(target.x + target.width);
  expect(hole.y + hole.height).toBeGreaterThanOrEqual(target.y + target.height);
  const box = (await page.locator(".spotlight__callout").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(hole.x + hole.width);
  await expect(page.locator(".spotlight__callout")).toHaveAttribute("data-side", "right");

  // It follows a resize.
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(async () => {
    const moved = (await page.locator(".spotlight__callout").boundingBox())!;
    expect(moved.x + moved.width).toBeLessThanOrEqual(900);
  }).toPass();
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Show me: the menu opens with the entry lit and focused.
  await callout.getByRole("button", { name: "Show me" }).click();
  await expect(callout).toHaveCount(0);
  await expect(page.locator("#repository-actions")).toBeVisible();
  const entry = page.getByRole("button", { name: "Connect with MCP" });
  await expect(entry).toBeVisible();
  await expect(entry).toHaveClass(/is-spotlit/);
  await expect(entry).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".agent-menu__action")).not.toHaveClass(/is-spotlit/);
});

test("the agent spotlight closes with Escape, Got it or a click outside, and gives the focus back", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  const open = async () => {
    await openChecklist(page);
    await item(page, "agent").getByRole("button").click();
    await expect(spotlight(page)).toBeVisible();
  };
  await open();
  await page.keyboard.press("Escape");
  await expect(spotlight(page)).toHaveCount(0);
  await expect(page.locator("#repository-actions"), "Escape only closes the spotlight").toBeHidden();
  await open();
  await spotlight(page).getByRole("button", { name: "Got it" }).click();
  await expect(spotlight(page)).toHaveCount(0);
  await open();
  await page.mouse.click(700, 600);
  await expect(spotlight(page)).toHaveCount(0);
  await expect(page.locator("#repository-actions")).toBeHidden();
  // Tab stays inside the callout.
  await open();
  for (let press = 0; press < 4; press++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest(".spotlight__callout") !== null)).toBe(true);
  await page.keyboard.press("Escape");
});

test("with the project menu's tile out of sight, the agent spotlight is a centred dialog", async ({ page, baseURL }) => {
  await startBlankSite(page, baseURL);
  await page.addStyleTag({ content: ".repository-menu__trigger { display: none !important; }" });
  await openChecklist(page);
  await item(page, "agent").getByRole("button").click();
  await expect(spotlight(page)).toBeVisible();
  await expect(page.locator(".spotlight")).toHaveAttribute("data-mode", "centered");
  await expect(page.locator(".spotlight__hole")).toBeHidden();
  const box = (await page.locator(".spotlight__callout").boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(4);
  await spotlight(page).getByRole("button", { name: "Got it" }).click();
});
