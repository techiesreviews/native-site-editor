import { publishButton, showPublish } from "./publish";
import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// New-user flows in the real editor UI, against the fake GitHub's onboarding
// controls (see the top of server.ts): sign-in, Get started (creating a
// repository), and Start your site (an empty or site-less repository).
// Controls are per browser session, so each test sends them after the first
// page load has minted the session cookie, and resets them first.

const owner = "native-demo-user";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const pageErrors: string[] = [];

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
const file = async (page: Page, baseURL: string | undefined, repo: string, path: string) =>
  page.request.get(`${baseURL}/__demo/file?repo=${repo}&path=${encodeURIComponent(path)}`);

async function openGetStarted(page: Page, baseURL: string | undefined) {
  await control(page, baseURL, { repositories: "none" });
  await page.goto(`${baseURL}/`);
  await page.reload();
  // The Setup wizard replaces Get started for an account with no repository; leaving it shows Get started.
  await page.getByRole("button", { name: "Leave setup" }).click({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible({ timeout: 30_000 });
}

// Opens a repository the account has by name, through its workspace link.
async function openRepository(page: Page, baseURL: string | undefined, name: string) {
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  const repo = repos.find((candidate) => candidate.name === name);
  expect(repo, `${name} is listed`).toBeTruthy();
  await page.goto(`${baseURL}/#repo=${repo!.id}&branch=main`);
  await page.reload();
}

async function listChanges(page: Page) {
  await showPublish(page);
  return page.locator("#publish-files");
}

async function startSiteWith(page: Page, choice: string) {
  await expect(page.getByRole("heading", { name: "Start your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: new RegExp(`^${choice}`) }).click();
}

async function publishNow(page: Page) {
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
}

// The sign-in screen: one button for everyone. The worker decides where the
// sign-in leads (see native-setup-wizard.spec.ts for each branch).
const signedOutSession = (page: Page, delay = 0) =>
  page.route("**/api/session", async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ json: { configured: true, user: null } });
  });

test("the sign-in screen shows a loading state first, then one Continue with GitHub button and no choice", async ({ page, baseURL }) => {
  await signedOutSession(page, 1200);
  await page.goto(`${baseURL}/`);
  // Until the session answers: a spinner in the same card, and no button to flash.
  await expect(page.getByRole("status").filter({ hasText: "Checking your account…" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveCount(0);
  const card = page.locator(".login-card");
  const before = await card.boundingBox();
  const button = page.getByRole("link", { name: "Continue with GitHub" });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("href", "/auth/login");
  expect(Math.abs((await card.boundingBox())!.height - before!.height), "the card does not jump").toBeLessThan(80);
  await expect(page.getByRole("heading", { name: "Welcome to Native Site Editor" })).toBeVisible();
  // One way in: no second button, no choice cards.
  await expect(page.getByRole("button", { name: "Create your site" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in with GitHub" })).toHaveCount(0);
  await expect(page.locator(".login-card").getByRole("button")).toHaveCount(0);
  // The card is the heading and the button, nothing else: no subtitle, no notes, no sign-up line, no disclosure.
  await expect(page.getByText("Open your sites, or create your first one.")).toHaveCount(0);
  await expect(page.getByText(/asks GitHub for access only to the repositories you choose/)).toHaveCount(0);
  await expect(page.getByText(/New to GitHub\?/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Create a free account" })).toHaveCount(0);
  await expect(page.getByText("What happens next?")).toHaveCount(0);
  await expect(page.locator(".login-card details")).toHaveCount(0);
  await expect(page.locator(".login-card img")).toHaveCount(0);
  await expect(page.locator(".login-card p")).toHaveCount(0);
  await expect(page.locator(".login-card a")).toHaveCount(2);
});

test("a valid session skips the sign-in screen: the editor opens with no button", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await expect(page.locator(".repository-menu__trigger")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("ase:signed-in-before")), "a flag, never a name or token").toBe("1");
});

for (const retry of ["menu", "Reload"] as const) test(`${retry} recovers an initial repository loading failure with an empty list`, async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none" });
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    delete session.repositories;
    await route.fulfill({ response, json: session });
  });
  let failedReads = 0;
  let retryReads = 0;
  let reloadReads = 0;
  let retrySucceeds = false;
  await page.route("**/api/repositories**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("refresh") === "1") {
      reloadReads++;
      await route.fulfill({ json: [], headers: { "X-Repository-Onboarding": "create" } });
    } else if (retrySucceeds) {
      retryReads++;
      await route.fulfill({ json: [], headers: { "X-Repository-Onboarding": "create" } });
    } else {
      failedReads++;
      await route.fulfill({ status: 403, json: { error: "Initial repository loading failed." } });
    }
  });
  await page.goto(`${baseURL}/`);
  await expect(page.locator("#notice")).toContainText("Initial repository loading failed.");
  await expect(page.locator("#content")).toContainText("Repositories could not be loaded. Use Reload to try again.");
  expect(failedReads).toBeGreaterThan(0);

  retrySucceeds = retry === "menu";
  await page.locator(".repository-menu__trigger").click();
  if (retry === "Reload") await page.getByRole("button", { name: "Reload repositories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create your site", exact: true })).toBeVisible();
  await expect(page.locator("#notice")).toBeHidden();
  await expect(page.locator("#content")).not.toContainText("Repositories could not be loaded.");
  expect(retryReads).toBe(retry === "menu" ? 1 : 0);
  expect(reloadReads).toBe(retry === "Reload" ? 1 : 0);
});

test("a browser that signed in before continues to GitHub by itself, once", async ({ page, baseURL }) => {
  await signedOutSession(page);
  let logins = 0;
  await page.route("**/auth/login", (route) => {
    logins++;
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>GitHub</p>" });
  });
  await page.addInitScript(() => localStorage.setItem("ase:signed-in-before", "1"));
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole("status").filter({ hasText: "Signing you in with GitHub…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use the button instead" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveCount(0);
  await expect(page.getByText("GitHub", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(logins).toBe(1);
  // Back with no session (it did not work): the normal screen, and no second try in this tab.
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  await page.waitForTimeout(2200);
  expect(logins).toBe(1);
});

test("an error on return shows the button and the message, and does not try again; Use the button instead cancels", async ({ page, baseURL }) => {
  await signedOutSession(page);
  let logins = 0;
  await page.route("**/auth/login", (route) => {
    logins++;
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>GitHub</p>" });
  });
  await page.addInitScript(() => localStorage.setItem("ase:signed-in-before", "1"));
  await page.goto(`${baseURL}/?error=${encodeURIComponent("GitHub access was not granted.")}`);
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "GitHub access was not granted." })).toBeVisible();
  await page.waitForTimeout(2200);
  expect(logins).toBe(0);

  // A fresh tab session would try; the link cancels it within the moment the message shows.
  await page.evaluate(() => sessionStorage.removeItem("ase:auto-signin-tried"));
  await page.goto(`${baseURL}/`);
  await page.getByRole("button", { name: "Use the button instead" }).click();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  await page.waitForTimeout(2200);
  expect(logins).toBe(0);
});

test("signing out of the last account forgets that this browser signed in before, so nothing continues by itself", async ({ page, baseURL, context }) => {
  await page.goto(`${baseURL}/`);
  await expect(page.locator(".repository-menu__trigger")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem("ase:signed-in-before"))).toBe("1");
  // The demo server would mint a session again on the next load: it is told not to.
  await context.addCookies([{ name: "ase_demo_signed_out", value: "1", url: baseURL! }]);
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: /^Sign out/ }).click();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem("ase:signed-in-before"))).toBeNull();
  await page.waitForTimeout(2000);
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
});

test("creating a site from the Starter site makes the repository, shows the starter and saves it as the first commit", async ({ page, baseURL }) => {
  await openGetStarted(page, baseURL);
  await page.getByLabel("Repository name").fill("my-site");
  await page.getByRole("radio", { name: /Starter site/ }).check();
  await page.getByRole("button", { name: "Create repository" }).click();

  await expect(frame(page).getByRole("heading", { name: "Starter site heading" })).toBeVisible({ timeout: 30_000 });
  const created = (await state(page, baseURL)).created as { name: string }[];
  expect(created.map((repo) => repo.name)).toEqual(["my-site"]);
  expect(await head(page, baseURL, "my-site"), "nothing is committed before Save").toBeNull();

  const panel = await listChanges(page);
  for (const path of ["index.html", "styles/site.css", "images/logo.svg", ".editor/config.json"])
    await expect(panel).toContainText(path);
  await expect(panel).not.toContainText("wrangler.jsonc");
  await expect(panel).not.toContainText(".github/");
  await publishNow(page);

  expect(await head(page, baseURL, "my-site")).toMatch(/^[0-9a-f]{40}$/);
  for (const path of ["index.html", "styles/site.css", "images/logo.svg"])
    expect((await file(page, baseURL, "my-site", path)).status(), path).toBe(200);
  const config = JSON.parse(await (await file(page, baseURL, "my-site", ".editor/config.json")).text());
  expect(config.site.name).toBe("My site");
  expect(config.site.url).toBeUndefined();
  expect(JSON.stringify(config)).not.toContain("starter-test.example");
  for (const path of ["wrangler.jsonc", ".assetsignore", ".github/workflows/deploy.yml"])
    expect((await file(page, baseURL, "my-site", path)).status(), path).toBe(404);
  const home = await (await file(page, baseURL, "my-site", "index.html")).text();
  expect(home).not.toContain("starter-test.example");
  expect(home).not.toContain("noindex");
});

test("when the editor may not create repositories, GitHub's New repository page is offered", async ({ page, baseURL }) => {
  await control(page, baseURL, { create: "forbidden" });
  await openGetStarted(page, baseURL);
  await page.getByLabel("Repository name").fill("my-site");
  await page.getByRole("button", { name: "Create repository" }).click();
  const link = page.locator(".onboard-fallback").getByRole("link", { name: /Create my-site on GitHub/ });
  await expect(link).toBeVisible({ timeout: 30_000 });
  const url = new URL((await link.getAttribute("href"))!);
  expect(url.origin + url.pathname).toBe("https://github.com/new");
  expect(url.searchParams.get("name")).toBe("my-site");
  // An empty repository, never a copy of the template: the editor adds the prepared starter itself.
  expect(url.searchParams.has("template_name")).toBe(false);
  expect(url.searchParams.has("template_owner")).toBe(false);
  await expect(page.locator(".onboard-fallback")).toContainText("Leave it empty");
  // The attempt is recorded as received, but nothing was made: the account still lists no repository.
  expect((await state(page, baseURL)).repositories).toEqual([]);
});

test("a taken repository name is an inline error and the form stays", async ({ page, baseURL }) => {
  await control(page, baseURL, { create: "taken" });
  await openGetStarted(page, baseURL);
  await page.getByLabel("Repository name").fill("my-site");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".get-started .onboard-message").first()).toContainText(/did not accept the name my-site/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Create repository" })).toBeEnabled();
  await expect(page.getByLabel("Repository name")).toHaveValue("my-site");
  await expect(page.locator(".onboard-fallback")).toBeHidden();
  expect((await state(page, baseURL)).repositories).toEqual([]);
});

test("an empty repository starts from a blank page and the first save makes the first commit", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] });
  await openRepository(page, baseURL, "blank-repo");
  await expect(page.getByText("Empty repository")).toBeVisible({ timeout: 30_000 });
  await startSiteWith(page, "Blank page");
  await expect(frame(page).locator("a.site-name")).toHaveText("Blank repo", { timeout: 30_000 });
  expect(await head(page, baseURL, "blank-repo")).toBeNull();

  const panel = await listChanges(page);
  await expect(panel).toContainText("index.html");
  await expect(panel).toContainText("styles/site.css");
  await publishNow(page);

  expect(await head(page, baseURL, "blank-repo")).toMatch(/^[0-9a-f]{40}$/);
  expect((await file(page, baseURL, "blank-repo", "index.html")).status()).toBe(200);
  expect((await file(page, baseURL, "blank-repo", "styles/site.css")).status()).toBe(200);
  expect(await (await page.request.get(`${baseURL}/api/snapshot?repo=${owner}/blank-repo&branch=main`)).json()).toMatchObject({ branch: "main" });
});

test("a repository without index.html offers the Starter site and leaves its README alone", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "notes", kind: "no-site" }] });
  await openRepository(page, baseURL, "notes");
  await expect(page.getByText("No home page")).toBeVisible({ timeout: 30_000 });
  const readme = await (await file(page, baseURL, "notes", "README.md")).text();
  await startSiteWith(page, "Starter site");
  // The starter has a README too: the dialog asks, and Keep mine leaves the repository's own.
  const dialog = page.getByRole("dialog", { name: "A file is already there" });
  await expect(dialog).toContainText("README.md");
  await dialog.getByRole("button", { name: "Keep mine" }).click();
  await expect(frame(page).getByRole("heading", { name: "Starter site heading" })).toBeVisible({ timeout: 30_000 });

  const panel = await listChanges(page);
  await expect(panel).toContainText("index.html");
  await expect(panel).not.toContainText("README.md");
  await publishNow(page);
  expect((await file(page, baseURL, "notes", "index.html")).status()).toBe(200);
  expect(await (await file(page, baseURL, "notes", "README.md")).text()).toBe(readme);
});

test("Build it with an agent copies a prompt that connects an agent and starts with get_site", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] });
  await openRepository(page, baseURL, "blank-repo");
  await startSiteWith(page, "Build it with an agent");
  await page.getByLabel("What is the site about?").fill("a pottery studio in Bristol");
  await page.getByRole("button", { name: "Copy agent prompt" }).click();
  await expect(page.locator(".start-site__agent .onboard-message")).toContainText("Copied");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("get_site");
  expect(prompt).toContain("/mcp");
  expect(prompt).toContain("MCP");
  expect(prompt).toContain("pottery studio in Bristol");
  // The repository is open, so the prompt names it and does not ask the agent to create one.
  expect(prompt).toContain(`${owner}/blank-repo`);
  expect(prompt).not.toContain("gh repo create");
  expect(prompt).not.toMatch(/Create the repository/i);
});

test("History of an empty repository with drafts says No commits yet", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] });
  await openRepository(page, baseURL, "blank-repo");
  await startSiteWith(page, "Blank page");
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await page.locator("#history-button").click();
  await expect(page.locator("#changes")).toContainText("No commits yet");
});

test("a normal native repository opens straight into the preview", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(page.getByRole("heading", { name: "Start your site" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Get started" })).toHaveCount(0);
});

test("a repository made on GitHub's page gets the chosen starting point when it opens", async ({ page, baseURL }) => {
  await control(page, baseURL, { create: "forbidden" });
  await openGetStarted(page, baseURL);
  await page.getByLabel("Repository name").fill("later-site");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".onboard-fallback")).toBeVisible({ timeout: 30_000 });
  // The user makes it empty on GitHub and gives the editor access; it opens with the starter, unasked.
  await control(page, baseURL, { add: [{ name: "later-site", kind: "empty" }] });
  // Opened once, without a reload in between: the choice is taken the first time the repository opens.
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  await page.goto(`${baseURL}/#repo=${repos.find((repo) => repo.name === "later-site")!.id}&branch=main`);
  await expect(frame(page).getByRole("heading", { name: "Starter site heading" })).toBeVisible({ timeout: 30_000 });
  const panel = await listChanges(page);
  await expect(panel).toContainText("index.html");
  // The template's own deployment is not part of it.
  await expect(panel).not.toContainText("wrangler.jsonc");
});

test("the first save of an empty repository works after the tab has been open for hours", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] });
  await page.clock.install();
  await openRepository(page, baseURL, "blank-repo");
  await expect(page.getByText("Empty repository")).toBeVisible({ timeout: 30_000 });
  await startSiteWith(page, "Blank page");
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await page.clock.fastForward("02:00:00");
  await listChanges(page);
  await publishNow(page);
  expect(await head(page, baseURL, "blank-repo")).toMatch(/^[0-9a-f]{40}$/);
});

test("a home page an agent writes switches the site on, and discarding all brings Start your site back", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "agent-repo", kind: "empty" }] });
  await openRepository(page, baseURL, "agent-repo");
  await expect(page.getByText("Empty repository")).toBeVisible({ timeout: 30_000 });
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.locator(".agent-menu__hint")).toContainText("Paste it into Claude, Codex");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server: `(\S+)`/.exec(prompt)![1];
  const token = /Authorization: `Bearer (ase_[a-f0-9]{64})`/.exec(prompt)![1];
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  const site = async () => JSON.parse(((await client.callTool({ name: "get_site", arguments: {} })) as any).content[0].text);
  try {
    expect((await site()).native).toBe(false);
    const stylesheet = "h1 { color: rebeccapurple; }\n";
    const styled = await client.callTool({ name: "write_file", arguments: { path: "styles/site.css", content: stylesheet } });
    expect(styled.isError, JSON.stringify(styled)).toBeFalsy();
    expect(JSON.parse((styled.content[0] as { text: string }).text).state).toBe("applied");
    expect((await site()).native).toBe(false);
    // Existing files, invalid paths and a file used as a folder still refuse.
    for (const path of ["styles/site.css", "../index.html", "styles/site.css/nested.css"]) {
      const refused = await client.callTool({ name: "write_file", arguments: { path, content: "changed" } });
      expect(refused.isError, JSON.stringify(refused)).toBe(true);
    }
    const read = await client.callTool({ name: "read_file", arguments: { path: "styles/site.css" } });
    expect(read.isError, JSON.stringify(read)).toBeFalsy();
    expect(JSON.parse((read.content[0] as { text: string }).text).content).toBe(stylesheet);
    const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Agent site</title></head>\n<body><main><h1 data-key="title">Agent made</h1></main></body></html>\n';
    const written = await client.callTool({ name: "write_file", arguments: { path: "index.html", content: html } });
    expect(written.isError, JSON.stringify(written)).toBeFalsy();
    expect(JSON.parse((written.content[0] as { text: string }).text).state).toBe("applied");
    await expect(frame(page).getByRole("heading", { name: "Agent made" })).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await site()).native, { timeout: 15_000 }).toBe(true);
    expect((await site()).pages?.length ?? 1).toBeGreaterThan(0);

    // Discard changes on the unsaved site: the repository is site-less again.
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Discard all" }).click();
    await expect(page.getByRole("heading", { name: "Start your site" })).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await site()).native, { timeout: 15_000 }).toBe(false);
  } finally {
    await client.close();
  }
});

test("a remembered starting point is dropped, not applied, when the repository has files", async ({ page, baseURL }) => {
  await control(page, baseURL, { create: "forbidden" });
  await openGetStarted(page, baseURL);
  await page.getByLabel("Repository name").fill("notes");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.locator(".onboard-fallback")).toBeVisible({ timeout: 30_000 });
  await control(page, baseURL, { add: [{ name: "notes", kind: "no-site" }] });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  await page.goto(`${baseURL}/#repo=${repos.find((repo) => repo.name === "notes")!.id}&branch=main`);
  await expect(page.getByText("No home page")).toBeVisible({ timeout: 30_000 });
  // Nothing was drafted unasked, and the choice is gone.
  await expect(page.getByRole("heading", { name: "Start your site" })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("starting-point")))).toEqual([]);
});

test("a second save works after the snapshot refresh of the first one failed", async ({ page, baseURL }) => {
  await control(page, baseURL, { repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] });
  await openRepository(page, baseURL, "blank-repo");
  await startSiteWith(page, "Blank page");
  await expect(frame(page).locator("a.site-name")).toBeVisible({ timeout: 30_000 });
  await page.route("**/api/snapshot**", (route) => route.abort());
  await listChanges(page);
  await publishNow(page);
  const first = await head(page, baseURL, "blank-repo");
  expect(first).toMatch(/^[0-9a-f]{40}$/);
  // A second draft, saved on top of the first commit rather than as another first save.
  await page.keyboard.press("Escape");
  await page.locator(".monaco-editor").first().click();
  await page.keyboard.type("<!-- more -->");
  await listChanges(page);
  await publishNow(page);
  expect(await head(page, baseURL, "blank-repo")).not.toBe(first);
});
