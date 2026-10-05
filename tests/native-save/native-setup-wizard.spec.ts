import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { publishButton, showPublish } from "./publish";

// The Setup wizard for new users, against the fake GitHub (see the top of
// server.ts): signed out -> Continue with GitHub (the one button) -> the
// worker sends an account without the App on to GitHub's install page by
// itself -> back signed in, the wizard opens on Create your site (Connect
// GitHub done) -> Create site with the Starter site as its first commit ->
// Your site is ready (the celebration) -> the editor opens on it with the
// Setup checklist. Connecting an agent is in that checklist; putting the site
// online comes later. An account that came back without installing sees
// Connect GitHub with a retry.
//
// A signed-out browser carries two cookies (ase_demo_signed_out: no demo
// session is minted; ase_demo_browser: its onboarding state before and after
// it signs in). The worker's redirects to GitHub are pointed at the fake GitHub's pages by the test server.

// The config reduces motion for every test; the celebration plays its confetti only without that setting.
test.use({ reducedMotion: "no-preference" });

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

/** Signed out, the account has nothing yet: the App is not installed and there are no repositories. One button; the worker does the rest. */
async function startSignedOut(page: Page, baseURL: string, controls: object = {}) {
  await newBrowser(page.context(), baseURL);
  await control(page, baseURL, { reset: true, repositories: "none", installed: false, ...controls });
  await page.goto(`${baseURL}/`);
  await page.getByRole("link", { name: "Continue with GitHub" }).click();
  // Sign in, install (GitHub's install page, never an editor screen in between), back signed in: the wizard.
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
}

/** The last page, where the site is made. */
async function toReady(page: Page) {
  await expect(page.getByRole("heading", { name: "Your site is ready" })).toBeVisible({ timeout: 30_000 });
}

async function createStarterSite(page: Page) {
  await page.getByLabel("Repository name").fill("my-site");
  await page.getByRole("radio", { name: /Starter site/ }).check();
  await page.getByRole("button", { name: "Create site" }).click();
  await toReady(page);
}

test("signed out: one Continue with GitHub, the install trip by itself, a site saved as its first commit, the celebration page, then the editor with the Setup checklist", async ({ page, baseURL, context }) => {
  await startSignedOut(page, baseURL!);
  // Signed in and installed on the way: sign-in (one authorization) and one install, no stop between.
  const trip = await state(page, baseURL!);
  expect(trip.installs).toBe(1);
  expect(trip.authorizations).toBe(1);
  // The steps: Connect GitHub is done, Create your site is current.
  await expect(page.locator(".wizard__step")).toHaveText([/Connect GitHub/, /Create your site/, /Your site is ready/]);
  await expect(page.locator(".wizard__step").first()).toHaveClass(/is-done/);
  await expect(page.locator(".wizard__step").nth(1)).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("github.com/native-demo-user/my-site")).toBeVisible();
  await expect(page.getByText("Free hosting needs Public.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Do this with an agent" })).toBeVisible();

  // An invalid name is refused in the form.
  await page.getByLabel("Repository name").fill("my-site.git");
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.locator(".wizard-form .onboard-field__hint.is-error")).toBeVisible();
  expect((await state(page, baseURL!)).created, "nothing was created for an invalid name").toEqual([]);

  await page.getByLabel("Repository name").fill("my-site");
  await page.getByRole("radio", { name: /Starter site/ }).check();
  await page.getByRole("button", { name: "Create site" }).click();
  // The repository exists and its first commit is the Starter site.
  await toReady(page);
  // A short confetti burst on arrival (checked first: it is over in about a second).
  await expect(page.locator(".confetti")).toHaveCount(1, { timeout: 3000 });
  expect(await head(page, baseURL!, "my-site")).toMatch(/^[0-9a-f]{40}$/);
  for (const path of ["index.html", "styles/site.css", "images/logo.svg", ".editor/config.json"])
    expect((await file(page, baseURL!, "my-site", path)).status(), path).toBe(200);
  for (const path of ["wrangler.jsonc", ".assetsignore", ".github/workflows/deploy.yml"])
    expect((await file(page, baseURL!, "my-site", path)).status(), path).toBe(404);
  const config = JSON.parse(await (await file(page, baseURL!, "my-site", ".editor/config.json")).text());
  expect(config.site.name).toBe("My site");
  expect(config.site.url).toBeUndefined();
  expect(await (await file(page, baseURL!, "my-site", "index.html")).text()).not.toContain("starter-test.example");

  // The celebration: a heading, the site's name, a live miniature of the home page, what was created, one big button, and confetti.
  await expect(page.locator(".wizard__step")).toHaveCount(3);
  await expect(page.locator(".wizard__step").nth(2)).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("heading", { name: "Your site is ready" })).toBeVisible();
  await expect(page.locator(".wizard-celebrate__name")).toHaveText("My site");
  await expect(page.locator(".wizard-celebrate__mark svg")).toBeVisible();
  // The live miniature: the committed home page, its stylesheets inlined, in a sandbox without scripts.
  await expect(page.frameLocator(".wizard-preview__frame").getByRole("heading", { name: "Starter site heading" })).toBeVisible({ timeout: 30_000 });
  expect(await page.locator(".wizard-preview__frame").getAttribute("sandbox"), "no scripts").toBe("");
  const note = page.locator(".wizard-celebrate__note");
  await expect(note).toContainText("github.com/native-demo-user/my-site");
  await expect(note.getByRole("link", { name: /github.com\/native-demo-user\/my-site/ })).toHaveAttribute("href", "https://github.com/native-demo-user/my-site");
  await expect(page.getByRole("button", { name: "Open the editor" })).toBeVisible();
  // The confetti is short and removes itself.
  await expect(page.locator(".confetti")).toHaveCount(0, { timeout: 5000 });
  // Nothing about connecting an agent or putting the site online here.
  await expect(page.getByText("Put it online")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Connect an agent" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open the editor" }).click();

  await expect(frame(page).getByRole("heading", { name: "Starter site heading" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".wizard")).toHaveCount(0);
  await expect(page.locator(".setup-pill")).toHaveText("Setup 2/3");
});

test("when GitHub does not send the state back, the code is discarded and a fresh sign-in completes it", async ({ page, baseURL }) => {
  await startSignedOut(page, baseURL!, { installState: "drop" });
  // The stateless return signed no one in; the fresh /auth/login did (a second authorization), and it did not start a second install.
  const trip = await state(page, baseURL!);
  expect(trip.authorizations).toBe(2);
  expect(trip.installs).toBe(1);
  await createStarterSite(page);
  expect(await head(page, baseURL!, "my-site")).toMatch(/^[0-9a-f]{40}$/);
});

test("with the App setting off, the return to the setup URL goes to /auth/login and signs in", async ({ page, baseURL }) => {
  await startSignedOut(page, baseURL!, { installOauth: false });
  const after = await state(page, baseURL!);
  expect(after.installs).toBe(1);
  // The session exists from the first sign-in, so the setup URL's return needs no second one.
  expect(after.authorizations).toBe(1);
  await createStarterSite(page);
});

test("installed but no repositories: the sign-in goes straight to Create your site, without a trip to GitHub's install page", async ({ page, baseURL }) => {
  await startSignedOut(page, baseURL!, { installed: true });
  const trip = await state(page, baseURL!);
  expect(trip.installs).toBe(0);
  expect(trip.authorizations).toBe(1);
  await expect(page.locator(".wizard__step").first()).toHaveClass(/is-done/);
});

test("installed with repositories: the sign-in opens the editor, with no wizard", async ({ page, baseURL }) => {
  await newBrowser(page.context(), baseURL!);
  await control(page, baseURL, { reset: true, repositories: "all", installed: true });
  await page.goto(`${baseURL}/`);
  await page.getByRole("link", { name: "Continue with GitHub" }).click();
  // Several repositories: the editor opens on the project menu, not on a wizard.
  await expect(page.locator(".repository-menu__trigger")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".wizard")).toHaveCount(0);
  expect((await state(page, baseURL!)).installs).toBe(0);
});

test("back from GitHub without installing the App: Connect GitHub explains the trip with screenshots and offers a retry, with no second redirect", async ({ page, baseURL }) => {
  await newBrowser(page.context(), baseURL!);
  // The user cancels on GitHub's install page: the browser comes back to the editor.
  await control(page, baseURL, { reset: true, repositories: "none", installed: false, cancelInstall: true });
  await page.goto(`${baseURL}/`);
  await page.getByRole("link", { name: "Continue with GitHub" }).click();
  await expect(page.getByRole("heading", { name: "Connect GitHub" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("You're signed in.")).toBeVisible();
  await expect(page.getByText(/One more step on GitHub: install the editor on your account/)).toBeVisible();
  await expect(page.getByText(/This is one trip: GitHub installs the editor and signs you in together/)).toBeVisible();
  // No Back to a sign-in choice, and nothing after this step works yet.
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  // The two real screenshots, with alt text, in a row on a wide screen.
  const signin = page.getByRole("img", { name: /GitHub's sign-in page/ });
  const install = page.getByRole("img", { name: /install page for Native Site Editor/ });
  await expect(signin).toBeVisible();
  await expect(install).toBeVisible();
  const [one, two] = [await signin.boundingBox(), await install.boundingBox()];
  expect(Math.abs(one!.y - two!.y), "side by side on a wide screen").toBeLessThan(40);
  await expect(page.getByText("If GitHub asks you to sign in")).toBeVisible();
  await expect(page.getByText("Choose All repositories, then click Install & Authorize")).toBeVisible();
  // Click to enlarge; Escape closes it.
  await install.click();
  const box = page.locator("dialog.lightbox");
  await expect(box).toBeVisible();
  await expect(box.getByRole("img", { name: /install page for Native Site Editor/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  // Narrow screens stack them.
  await page.setViewportSize({ width: 390, height: 900 });
  const [stackedOne, stackedTwo] = [await signin.boundingBox(), await install.boundingBox()];
  expect(stackedTwo!.y).toBeGreaterThan(stackedOne!.y + stackedOne!.height - 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Nothing sent the browser to GitHub again.
  const stopped = await state(page, baseURL!);
  expect(stopped.authorizations).toBe(1);
  expect(stopped.installs).toBe(0);

  // The retry goes to GitHub's install page once more, in this tab, and carries on.
  await control(page, baseURL, { cancelInstall: false });
  await page.getByRole("link", { name: "Connect GitHub" }).click();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  expect((await state(page, baseURL!)).installs).toBe(1);
  await expect(page.locator(".wizard__step").first()).toHaveClass(/is-done/);
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
  await toReady(page);
  // The Blank page renders as a live miniature: its stylesheet inlined, in a sandbox without scripts.
  const miniature = page.locator(".wizard-preview__frame");
  await expect(miniature).toBeVisible({ timeout: 30_000 });
  expect(await miniature.getAttribute("sandbox")).toBe("");
  const document = (await miniature.getAttribute("srcdoc"))!;
  expect(document).toContain("<style>");
  expect(document).not.toMatch(/<link[^>]+stylesheet|<script/i);
  await expect(page.frameLocator(".wizard-preview__frame").locator("h1")).toBeVisible();
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

test("at a narrow width the steps become Step 2 of 3", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await startSignedOut(page, baseURL!);
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
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
  await toReady(page);
  const first = await head(page, baseURL!, "half-site");
  expect(first).toMatch(/^[0-9a-f]{40}$/);
  expect((await file(page, baseURL!, "half-site", "index.html")).status()).toBe(200);
  expect((await file(page, baseURL!, "half-site", "styles/site.css")).status()).toBe(404);
  await expect(page.getByText(/Only part of your starting point was saved/)).toBeVisible();
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
  await toReady(page);
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
  await toReady(page);
});

test("the recovery banner belongs to its repository: switching away removes it, switching back brings it back, and Finish leaves none", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none", failTree: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Repository name").fill("half-site");
  await page.getByRole("button", { name: "Create site" }).click();
  await toReady(page);
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

test("with reduced motion the last page has no confetti, only a fade-in", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  await control(page, baseURL, { reset: true, repositories: "none" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Repository name").fill("calm-site");
  await page.getByRole("button", { name: "Create site" }).click();
  await toReady(page);
  await expect(page.locator(".wizard-celebrate__name")).toHaveText("Calm site");
  await expect(page.getByRole("button", { name: "Open the editor" })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator(".confetti")).toHaveCount(0);
  expect(await page.locator(".wizard__panel--celebrate").evaluate((element) => getComputedStyle(element).animationName)).toBe("celebrate-fade");
  await context.close();
});

// A fresh self-hosted editor (Deploy to Cloudflare) whose owner has not
// registered its GitHub App yet: the existing wizard opens on Connect GitHub,
// and only its button leads to the owner setup handoff.
const ownerSetupSession = (page: Page, open: boolean) =>
  page.route("**/api/session", (route) =>
    route.fulfill({ json: { configured: false, user: null, ownerSetupOpen: open, ownerSetupUrl: open ? "/auth/setup" : undefined } }),
  );

test("an editor without a GitHub App opens the wizard on Connect GitHub and goes to owner setup only from its button", async ({ page, baseURL }) => {
  const handoffs: string[] = [];
  await page.route("**/auth/setup*", (route) => {
    handoffs.push(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<title>owner setup handoff</title>" });
  });
  await ownerSetupSession(page, true);
  // A repository remembered from another session cannot skip step 1.
  await page.addInitScript(() => localStorage.setItem("native-site-editor:setup-wizard", JSON.stringify({ step: "open", at: Date.now(), repo: { id: 1, owner: "x", name: "y", fullName: "x/y" } })));
  await page.goto(`${baseURL}/`);
  const dialog = page.locator(".wizard");
  await expect(dialog.getByRole("heading", { level: 1, name: "Connect GitHub" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(handoffs, "no handoff before the click").toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(dialog.getByText("not signed in", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create site" })).toHaveCount(0);
  const connect = dialog.getByRole("link", { name: "Create this editor's GitHub App" });
  await expect(connect).toHaveAttribute("href", "/auth/setup");
  await connect.click();
  await expect(page).toHaveTitle("owner setup handoff");
  expect(handoffs.length).toBe(1);
});

test("an editor with a private owner setup link keeps the locked sign-in, with no wizard and no handoff", async ({ page, baseURL }) => {
  const handoffs: string[] = [];
  await page.route("**/auth/setup*", (route) => (handoffs.push(route.request().url()), route.abort()));
  await ownerSetupSession(page, false);
  await page.goto(`${baseURL}/`);
  await expect(page.getByText("GitHub sign-in has not been configured for this editor yet.")).toBeVisible();
  await expect(page.locator(".wizard")).toHaveCount(0);
  expect(handoffs).toEqual([]);
});
