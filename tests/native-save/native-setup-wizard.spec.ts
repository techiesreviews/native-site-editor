import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { publishButton, showPublish } from "./publish";

// The Setup wizard for new users, against the fake GitHub (see the top of
// server.ts): signed out -> Create your site -> one trip to GitHub (install
// plus sign-in) -> Create site with the Starter site as its first commit ->
// finish -> the editor opens on it with the Setup checklist.
//
// A signed-out browser carries two cookies (ase_demo_signed_out: no demo
// session is minted; ase_demo_browser: its onboarding state before and after
// it signs in). The worker's redirects to GitHub are pointed at the fake GitHub's pages by the test server.

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const control = (page: Page, baseURL: string | undefined, body: unknown) =>
  page.request.post(`${baseURL}/__demo/onboarding`, { data: body });
const state = async (page: Page, baseURL: string | undefined) => (await page.request.get(`${baseURL}/__demo/onboarding`)).json();
const head = async (page: Page, baseURL: string | undefined, repo: string) =>
  (await (await page.request.get(`${baseURL}/__demo/head?repo=${repo}`)).json()).commit as string | null;
const file = (page: Page, baseURL: string | undefined, repo: string, path: string) =>
  page.request.get(`${baseURL}/__demo/file?repo=${repo}&path=${encodeURIComponent(path)}`);

async function newBrowser(context: BrowserContext, baseURL: string) {
  const key = `wizard-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await context.addCookies([
    { name: "ase_demo_signed_out", value: "1", url: baseURL },
    { name: "ase_demo_browser", value: key, url: baseURL },
  ]);
}

/** Signed out, the account has nothing yet: the App is not installed and there are no repositories. */
async function startSignedOut(page: Page, baseURL: string, controls: object = {}) {
  await newBrowser(page.context(), baseURL);
  await control(page, baseURL, { reset: true, repositories: "none", installed: false, ...controls });
  await page.goto(`${baseURL}/`);
  await page.getByRole("button", { name: "Create your site" }).click();
  await expect(page.getByRole("heading", { name: "Connect GitHub" })).toBeVisible();
}

/** Connect GitHub opens a tab; it comes back signed in, and this tab carries on at step 2. */
async function connect(page: Page) {
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Connect GitHub" }).click()]);
  await expect(page.getByRole("status").filter({ hasText: "GitHub opened in a new tab. Come back here when you've finished." })).toBeVisible();
  await expect(popup.getByRole("heading", { name: "GitHub is connected" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await popup.close();
}

async function createStarterSite(page: Page) {
  await page.getByLabel("Repository name").fill("my-site");
  await page.getByRole("radio", { name: /Starter site/ }).check();
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("heading", { name: "Put it online" })).toBeVisible({ timeout: 30_000 });
}

test("signed out: Create your site, one trip to GitHub, a site saved as its first commit, then the editor with the Setup checklist", async ({ page, baseURL }) => {
  await startSignedOut(page, baseURL!);
  // Step 1: the account line, the reason for All repositories, and the placeholder for the recording.
  await expect(page.getByRole("link", { name: /Create one free/ })).toHaveAttribute("href", "https://github.com/signup");
  await expect(page.getByText(/choose All repositories/)).toBeVisible();
  await expect(page.getByRole("img", { name: /illustration of GitHub's install page/ })).toBeVisible();
  await expect(page.getByText("Choose All repositories.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Do this with an agent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  await connect(page);
  expect((await state(page, baseURL!)).installs).toBe(1);
  // Step 2 knows the signed-in account; step 1 is done.
  await expect(page.locator(".wizard__step").first()).toHaveClass(/is-done/);
  await expect(page.getByText("github.com/native-demo-user/my-site")).toBeVisible();
  await expect(page.getByText("Free hosting needs Public.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Do this with an agent" })).toBeVisible();

  // An invalid name is refused in the form.
  await page.getByLabel("Repository name").fill("my-site.git");
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.locator(".wizard-form .onboard-field__hint.is-error")).toBeVisible();
  expect((await state(page, baseURL!)).created, "nothing was created for an invalid name").toEqual([]);

  await createStarterSite(page);
  // The repository exists and its first commit is the Starter site.
  expect(await head(page, baseURL!, "my-site")).toMatch(/^[0-9a-f]{40}$/);
  for (const path of ["index.html", "styles/site.css", "images/logo.svg", ".editor/config.json"])
    expect((await file(page, baseURL!, "my-site", path)).status(), path).toBe(200);
  for (const path of ["wrangler.jsonc", ".assetsignore", ".github/workflows/deploy.yml"])
    expect((await file(page, baseURL!, "my-site", path)).status(), path).toBe(404);
  const config = JSON.parse(await (await file(page, baseURL!, "my-site", ".editor/config.json")).text());
  expect(config.site.name).toBe("My site");
  expect(config.site.url).toBeUndefined();
  expect(await (await file(page, baseURL!, "my-site", "index.html")).text()).not.toContain("starter-test.example");

  // Step 3 is the mount point for publishing; skipping goes on.
  await expect(page.getByText("Coming next: one-click publishing.")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "Your site is ready" })).toBeVisible();
  await page.getByRole("button", { name: "Open the editor" }).click();

  await expect(frame(page).getByRole("heading", { name: "Starter site heading" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".wizard")).toHaveCount(0);
  await expect(page.locator(".setup-pill")).toHaveText("Setup 2/4");
});

test("when GitHub does not send the state back, the code is discarded and a fresh sign-in completes it", async ({ page, baseURL }) => {
  await startSignedOut(page, baseURL!, { installState: "drop" });
  await connect(page);
  // The stateless return never signed anyone in: a fresh /auth/login did (one authorization).
  expect((await state(page, baseURL!)).authorizations).toBe(1);
  await createStarterSite(page);
  expect(await head(page, baseURL!, "my-site")).toMatch(/^[0-9a-f]{40}$/);
});

test("with the App setting off, the return to the setup URL goes to /auth/login and signs in", async ({ page, baseURL }) => {
  await startSignedOut(page, baseURL!, { installOauth: false });
  await connect(page);
  const after = await state(page, baseURL!);
  expect(after.installs).toBe(1);
  expect(after.authorizations, "a second authorization completed the sign-in").toBe(1);
  await createStarterSite(page);
});

test("a returning user whose App is installed skips step 1", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".wizard__step").first()).toHaveClass(/is-done/);
  await expect(page.locator(".wizard__step").nth(1)).toHaveAttribute("aria-current", "step");
  // Back shows step 1 as done, with no trip to GitHub.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText(/GitHub is connected as native-demo-user/)).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  // Blank page, private: committed too.
  await page.getByLabel("Repository name").fill("blank-site");
  await page.getByRole("radio", { name: /Blank page/ }).check();
  await page.getByRole("radio", { name: /Private/ }).check();
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("heading", { name: "Put it online" })).toBeVisible({ timeout: 30_000 });
  expect(await head(page, baseURL!, "blank-site")).toMatch(/^[0-9a-f]{40}$/);
  expect((await file(page, baseURL!, "blank-site", "styles/site.css")).status()).toBe(200);
  expect(((await state(page, baseURL!)).created as { name: string; private: boolean }[])[0]).toMatchObject({ name: "blank-site", private: true });
});

test("Leave setup shows Get started for a signed-in account", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Leave setup" }).click();
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Use a repository you have" })).toBeVisible();
});

test("at a narrow width the steps become Step 1 of 4", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await startSignedOut(page, baseURL!);
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await expect(page.locator(".wizard__steps")).toBeHidden();
  const overflow = await page.evaluate(() => document.querySelector(".wizard")!.scrollWidth > document.querySelector(".wizard")!.clientWidth);
  expect(overflow).toBe(false);
});

test("a first commit that stops after index.html is finished from the editor, without overwriting it", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none", failTree: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Repository name").fill("half-site");
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("heading", { name: "Put it online" })).toBeVisible({ timeout: 30_000 });
  const first = await head(page, baseURL!, "half-site");
  expect(first).toMatch(/^[0-9a-f]{40}$/);
  expect((await file(page, baseURL!, "half-site", "index.html")).status()).toBe(200);
  expect((await file(page, baseURL!, "half-site", "styles/site.css")).status()).toBe(404);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByText(/only part of your starting point was saved/)).toBeVisible();
  await control(page, baseURL, { failTree: false });
  await page.getByRole("button", { name: "Open the editor" }).click();

  await page.getByRole("button", { name: "Finish adding the Starter site" }).click({ timeout: 30_000 });
  await expect(page.locator("#finish-starter"), "no banner is left after Finish").toHaveCount(0);
  const panel = await (async () => { await showPublish(page); return page.locator("#publish-files"); })();
  await expect(panel).toContainText("styles/site.css");
  await expect(panel).toContainText("images/logo.svg");
  await expect(panel, "the committed home page is not touched").not.toContainText("index.html");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  for (const path of ["index.html", "styles/site.css", "images/logo.svg", ".editor/config.json"])
    expect((await file(page, baseURL!, "half-site", path)).status(), path).toBe(200);
});

test("when the editor cannot create the repository, the wizard finds the one made on GitHub when the user says so", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none", create: "forbidden" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Repository name").fill("manual-site");
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("link", { name: /Create manual-site on GitHub/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "I've created it" }).click();
  await expect(page.getByText(/manual-site is not there yet/)).toBeVisible();
  // The user makes it on GitHub (an empty repository the editor has access to) and says so.
  await control(page, baseURL, { add: [{ name: "manual-site", kind: "empty" }] });
  await page.getByRole("button", { name: "I've created it" }).click();
  await expect(page.getByRole("heading", { name: "Put it online" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Open the editor" }).click();
  // Opened empty, it gets the starting point it was asked for.
  await expect(frame(page).getByRole("heading", { name: "Starter site heading" })).toBeVisible({ timeout: 30_000 });
});

test("retrying a name that exists and that the account can reach opens it instead of failing", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none", create: "taken" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  // Made by hand meanwhile (the name is taken, and the account can reach it).
  await control(page, baseURL, { add: [{ name: "retry-site", kind: "empty" }] });
  await page.getByLabel("Repository name").fill("retry-site");
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("heading", { name: "Put it online" })).toBeVisible({ timeout: 30_000 });
});

test("the recovery banner belongs to its repository: switching away removes it, switching back brings it back, and Finish leaves none", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none", failTree: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Repository name").fill("half-site");
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("heading", { name: "Put it online" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Skip for now" }).click();
  await control(page, baseURL, { failTree: false, repositories: "all" });
  await page.getByRole("button", { name: "Open the editor" }).click();
  const banner = page.locator("#finish-starter");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories`)).json()) as { id: number; name: string }[];
  const half = repos.find((repo) => repo.name === "half-site")!;

  // Another repository: the banner is gone, and nothing is drafted into it.
  await page.goto(`${baseURL}/#repo=501&branch=main`);
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveCount(0);
  // Back: it is offered again, and it works.
  await page.goto(`${baseURL}/#repo=${half.id}&branch=main`);
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finish adding the Starter site" }).click();
  await showPublish(page);
  await expect(page.locator("#publish-files")).toContainText("styles/site.css");
  // Finished: no banner is left, not even a fresh one from the reload, and it stays gone.
  await expect(banner).toHaveCount(0);
  await page.goto(`${baseURL}/#repo=501&branch=main`);
  await page.goto(`${baseURL}/#repo=${half.id}&branch=main`);
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveCount(0);
});
