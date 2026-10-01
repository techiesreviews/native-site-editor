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
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible({ timeout: 30_000 });
}

// Opens a repository the account has by name, through its workspace link.
async function openRepository(page: Page, baseURL: string | undefined, name: string) {
  const repos = (await (await page.request.get(`${baseURL}/api/repositories`)).json()) as { id: number; name: string }[];
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

test("the sign-in screen offers GitHub and a free account in a new tab", async ({ page, baseURL }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { configured: true, user: null } }));
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute("href", "/auth/login");
  const signup = page.getByRole("link", { name: "Create a free account" });
  await expect(signup).toHaveAttribute("href", "https://github.com/signup");
  await expect(signup).toHaveAttribute("target", "_blank");
  await expect(signup).toHaveAttribute("rel", /noopener/);
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
  const repos = (await (await page.request.get(`${baseURL}/api/repositories`)).json()) as { id: number; name: string }[];
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
    const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Agent site</title></head>\n<body><main><h1 data-key="title">Agent made</h1></main></body></html>\n';
    const written = await client.callTool({ name: "write_file", arguments: { path: "index.html", content: html } });
    expect(written.isError).toBeFalsy();
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
  const repos = (await (await page.request.get(`${baseURL}/api/repositories`)).json()) as { id: number; name: string }[];
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
