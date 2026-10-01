import { publishButton } from "./publish";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Repositories owned by organisations, against the fake GitHub's `org`
// controls (see the top of server.ts): the repository menu groups by owner and
// opens an organisation's repository, which is edited and saved; Get started's
// Owner picker creates in the organisation, and a refusal falls back to GitHub's
// New repository page for that organisation. The access boundary is checked
// through the API: a repository that is not in the listing is still refused.

const pageErrors: string[] = [];
const indexSource = readFileSync(resolve("fixtures/native-starter/index.html"), "utf8");

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
  await control(page, baseURL, { reset: true });
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const control = (page: Page, baseURL: string | undefined, body: unknown) =>
  page.request.post(`${baseURL}/__demo/onboarding`, { data: body });
const state = async (page: Page, baseURL: string | undefined) => (await page.request.get(`${baseURL}/__demo/onboarding`)).json();
const head = async (page: Page, baseURL: string | undefined, repo: string) =>
  (await (await page.request.get(`${baseURL}/__demo/head?repo=${repo}`)).json()).commit as string | null;

async function openOrgSite(page: Page, baseURL: string | undefined) {
  await control(page, baseURL, { org: true });
  await page.goto(`${baseURL}/#repo=700&branch=main&file=index.html`);
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
}

async function openGetStarted(page: Page, baseURL: string | undefined) {
  await control(page, baseURL, { org: true, repositories: "none" });
  await page.goto(`${baseURL}/`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible({ timeout: 30_000 });
}

test("the menu groups repositories by owner, the personal account first, and opens an organisation's repository to edit and save it", async ({ page, baseURL }) => {
  await openOrgSite(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const headings = page.locator(".repository-menu__owner");
  await expect(headings).toHaveCount(2);
  await expect(headings.nth(0)).toContainText("native-demo-user");
  await expect(headings.nth(0)).toContainText("You");
  await expect(headings.nth(1)).toContainText("demo-org");
  await expect(headings.nth(1)).toContainText("Organisation");
  const names = await page.locator(".repository-menu__repos > li").evaluateAll((items) =>
    items.map((item) => (item.classList.contains("repository-menu__owner") ? `# ${item.getAttribute("data-owner")}` : item.querySelector(".repository-menu__repo-name")?.textContent)),
  );
  expect(names.indexOf("# native-demo-user")).toBe(0);
  expect(names.slice(names.indexOf("# demo-org"))).toEqual(["# demo-org", "org-empty", "org-site"]);

  // The open repository is the organisation's, with its branch flyout.
  const open = page.locator('.repository-menu__repo[aria-current="true"]');
  await expect(open.locator(".repository-menu__repo-name")).toHaveText("org-site");
  await expect(open.locator(".repository-menu__repo-owner")).toHaveText("demo-org · private · ⑂ main");
  await open.hover();
  await expect(page.getByRole("menu", { name: "Branches" })).toBeVisible();

  // Each owner's repository is managed on its own installation's page.
  const manage = async (repo: string) => {
    await page.locator(".repository-menu__item").filter({ has: page.getByText(repo, { exact: true }) }).hover();
    await page.getByRole("button", { name: `Remove ${repo}` }).click();
    const go = page.getByRole("link", { name: /Remove on GitHub/ });
    const href = await go.getAttribute("href");
    await page.getByRole("button", { name: "Cancel" }).click();
    return href;
  };
  expect(await manage("org-site")).toBe("https://github.com/organizations/demo-org/settings/installations/2");
  expect(await manage("native-demo")).toBe("https://github.com/settings/installations/1");
  await expect(page.getByRole("link", { name: /Install on another account/ })).toBeVisible();

  // Edit and save in the organisation's repository.
  await page.keyboard.press("Escape");
  const before = await head(page, baseURL, "org-site");
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), indexSource.replace("A native browser preview", "Org heading"));
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.frameLocator(".native-preview-frame").getByRole("heading", { name: "Org heading" })).toBeVisible({ timeout: 30_000 });
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const after = await head(page, baseURL, "org-site");
  expect(after).not.toBe(before);
  expect((await (await page.request.get(`${baseURL}/__demo/file?repo=org-site&path=index.html`)).text())).toContain("Org heading");
});

test("a repository outside the listing is refused, an organisation's inside it is not", async ({ page, baseURL }) => {
  const read = (repo: string) => page.request.get(`${baseURL}/api/branches?repo=${encodeURIComponent(repo)}`);
  expect((await read("demo-org/org-site")).status(), "no installation yet").toBe(403);
  await control(page, baseURL, { org: true });
  expect((await read("demo-org/org-site")).status()).toBe(200);
  expect((await read("demo-org/unlisted")).status()).toBe(403);
  expect((await read("elsewhere/org-site")).status()).toBe(403);
  await control(page, baseURL, { org: false });
  expect((await read("demo-org/org-site")).status()).toBe(403);
});

test("Get started's Owner picker creates the repository in the organisation", async ({ page, baseURL }) => {
  await openGetStarted(page, baseURL);
  const owner = page.getByLabel("Owner");
  await expect(owner).toBeVisible();
  await expect(owner.locator("option")).toHaveText(["native-demo-user", "demo-org (organisation)"]);
  await owner.selectOption("demo-org");
  await expect(page.locator("#repository-name-hint")).toHaveText("Creates demo-org/my-site");
  await page.getByLabel("Repository name").fill("team-site");
  await page.getByRole("radio", { name: "Blank page" }).check();
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  const done = await state(page, baseURL);
  expect(done.orgCreated.map((repo: { name: string }) => repo.name)).toEqual(["team-site"]);
  expect(done.created).toEqual([]);
  await page.locator(".repository-menu__trigger").click();
  await expect(page.locator('.repository-menu__repo[aria-current="true"] .repository-menu__repo-owner')).toContainText("demo-org");
});

test("the personal account stays the default owner", async ({ page, baseURL }) => {
  await openGetStarted(page, baseURL);
  await expect(page.getByLabel("Owner")).toHaveValue("native-demo-user");
  await page.getByLabel("Repository name").fill("mine");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  const done = await state(page, baseURL);
  expect(done.created.map((repo: { name: string }) => repo.name)).toEqual(["mine"]);
  expect(done.orgCreated).toEqual([]);
});

test("an organisation that forbids members from creating repositories falls back to GitHub's page for that organisation", async ({ page, baseURL }) => {
  await control(page, baseURL, { orgCreate: "forbidden" });
  await openGetStarted(page, baseURL);
  await page.getByLabel("Owner").selectOption("demo-org");
  await page.getByLabel("Repository name").fill("team-site");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".get-started__create .onboard-message")).toContainText("organisation owner may need to", { timeout: 30_000 });
  const link = page.locator(".onboard-fallback").getByRole("link", { name: /Create team-site on GitHub/ });
  const url = new URL((await link.getAttribute("href"))!);
  expect(url.origin + url.pathname).toBe("https://github.com/new");
  expect(url.searchParams.get("owner")).toBe("demo-org");
  expect(url.searchParams.get("name")).toBe("team-site");
  await expect(page.locator(".onboard-fallback").getByRole("link", { name: /Give the editor access to it/ })).toBeVisible();
});

test("a name already taken in the organisation is said so and nothing is opened", async ({ page, baseURL }) => {
  await control(page, baseURL, { orgCreate: "taken" });
  await openGetStarted(page, baseURL);
  await page.getByLabel("Owner").selectOption("demo-org");
  await page.getByLabel("Repository name").fill("team-site");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".get-started__create .onboard-message")).toContainText("demo-org may already have a repository", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
});

test("when the editor is installed only on an organisation, it is the owner and Create goes there", async ({ page, baseURL }) => {
  await control(page, baseURL, { installed: false });
  await openGetStarted(page, baseURL);
  const owner = page.getByLabel("Owner");
  await expect(owner).toBeVisible();
  await expect(owner.locator("option")).toHaveText(["demo-org (organisation)"]);
  await expect(owner).toBeDisabled();
  await expect(page.locator("#repository-name-hint")).toHaveText("Creates demo-org/my-site");
  await page.getByLabel("Repository name").fill("team-site");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  const done = await state(page, baseURL);
  expect(done.orgCreated.map((repo: { name: string }) => repo.name)).toEqual(["team-site"]);
  expect(done.created).toEqual([]);
});

test("the copied agent prompt names the selected organisation, in its instructions and its command", async ({ page, baseURL, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openGetStarted(page, baseURL);
  await page.getByLabel("Owner").selectOption("demo-org");
  await page.getByLabel("Repository name").fill("team-site");
  await expect(page.locator(".onboard-agent code")).toHaveText("gh repo create demo-org/team-site --public");
  await page.getByRole("button", { name: "Copy agent prompt" }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("gh repo create demo-org/team-site --public");
  expect(prompt).toContain("team-site in my GitHub organisation demo-org");
  expect(prompt).not.toContain("on my GitHub account");
  // The personal account keeps the plain command.
  await page.getByLabel("Owner").selectOption("native-demo-user");
  await page.getByRole("button", { name: "Copy agent prompt" }).click();
  const own = await page.evaluate(() => navigator.clipboard.readText());
  expect(own).toContain("gh repo create team-site --public");
  expect(own).toContain("on my GitHub account");
});
