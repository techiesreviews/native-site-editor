import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// An agent works on the site through the MCP site tools (worker/mcp.ts)
// while the editor tab is open: each change is queued, applied by the tab
// with the editor's own code (src/agent-site.ts), and shows at once in the
// preview as an ordinary unsaved draft (Undo, Save to GitHub). The official
// MCP client talks to the real worker handler on the native-save server;
// GitHub is the server's fake, which the agent never writes to.
const indexPath = "src/pages/index.html";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const undo = (page: Page) => page.locator(".code-editor__undo").first();

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function draft(page: Page, path: string) {
  return page.evaluate((path) => {
    const key = Object.keys(localStorage).find((key) => key.startsWith("astro-site-editor:draft:v1:") && JSON.parse(key.slice("astro-site-editor:draft:v1:".length))[3] === path);
    return key ? JSON.parse(localStorage.getItem(key)!) : undefined;
  }, path);
}

// Connects an agent with a token from the Agent context panel.
async function connectAgent(page: Page, baseURL: string | undefined) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Agent context", exact: true }).click();
  await page.getByRole("button", { name: "Connect with a token", exact: true }).click();
  await page.getByRole("button", { name: "Copy MCP connection", exact: true }).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  const server = copied.mcpServers["native-site-editor"];
  expect(server.url).toBe(`${baseURL}/mcp`);
  await expect(page.locator(".agent-menu__connection")).toHaveCount(1);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }),
  );
  return client;
}

function result(value: unknown): any {
  const text = (value as { content: { text: string }[] }).content[0].text;
  return JSON.parse(text);
}

test("an agent edits a page, adds and removes a section, creates a page and sets its details while the editor is open", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = result(response);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  try {
    // The tab shares the site as soon as the agent is connected.
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).available ?? true, { timeout: 15_000 }).toBe(true);
    const site = await call("get_site");
    expect(site.editor.openFile).toBe(indexPath);
    expect(site.pages[0]).toMatchObject({ route: "/", file: indexPath });
    expect(site.pages.map((item: { route: string }) => item.route)).toEqual(["/", "/about/"]);
    expect(site.components.find((item: { tag: string }) => item.tag === "feature-block")).toMatchObject({ section: true, slots: ["title", "body"] });

    // Page text through edit_file: the preview shows it, as a draft with Undo.
    const home = await call("get_page", { page: "/" });
    expect(home.html).toBe(indexSource);
    expect(home.sections.map((section: { key?: string }) => section.key)).toEqual(["hero", "cards", "filler"]);
    const edited = await call("edit_file", {
      path: indexPath,
      expectedHash: home.hash,
      edits: [{ oldText: "A native browser preview", newText: "Edited by an agent" }],
    });
    expect(edited.state).toBe("applied");
    await expect(frame(page).locator(".hero h1")).toHaveText("Edited by an agent");
    expect((await draft(page, indexPath)).content).toContain("Edited by an agent");
    // A stale hash is refused, and nothing changes.
    const stale = await client.callTool({ name: "edit_file", arguments: { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "Edited", newText: "x" }] } });
    expect(stale.isError).toBe(true);

    // A section component after the hero, then removed again.
    const edited2 = await call("get_page", { page: "/", source: false });
    expect(edited2.hash).toBe(edited.result.hash);
    const added = await call("add_section", { page: "/", component: "feature-block", expectedHash: edited2.hash, after: "1.0" });
    expect(added.state).toBe("applied");
    expect(added.result.section).toBe("1.1");
    await expect(frame(page).locator("main > feature-block")).toHaveCount(1);
    await expect(frame(page).locator("main > :nth-child(2)")).toHaveAttribute("data-key", "feature-block");
    const withSection = await call("get_page", { page: "/", source: false });
    expect(withSection.sections.map((section: { tag: string }) => section.tag)).toEqual(["section", "feature-block", "section", "section"]);
    // Moved to the end, then removed.
    const moved = await call("move_section", { page: "/", section: "1.1", after: "1.3", expectedHash: withSection.hash });
    expect(moved.state).toBe("applied");
    await expect(frame(page).locator("main > :last-child")).toHaveAttribute("data-key", "feature-block");
    const movedPage = await call("get_page", { page: "/", source: false });
    const removed = await call("remove_section", { page: "/", section: "1.3", expectedHash: movedPage.hash });
    expect(removed.state).toBe("applied");
    await expect(frame(page).locator("main > feature-block")).toHaveCount(0);
    // The user's Undo takes the agent's last change back.
    await undo(page).click();
    await expect(frame(page).locator("main > feature-block")).toHaveCount(1);

    // A new page under the site, opened in the editor, then its details.
    const created = await call("create_page", { title: "Our team" });
    expect(created.state).toBe("applied");
    expect(created.result).toMatchObject({ file: "src/pages/our-team.html", route: "/our-team/" });
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/our-team.html");
    await expect(frame(page).locator("h1").first()).toHaveText("Our team");
    const details = await call("set_page_details", { page: "/our-team/", description: "The people behind the studio." });
    expect(details.state).toBe("applied");
    expect((await draft(page, "src/pages/our-team.html")).content).toMatch(/^<!--\ntitle: Our team\ndescription: The people behind the studio\.\n-->/);
    const after = await call("get_site");
    expect(after.pages.find((item: { route: string }) => item.route === "/our-team/")).toMatchObject({ file: "src/pages/our-team.html", title: "Our team", new: true });
    expect(after.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "M", path: indexPath }),
      expect.objectContaining({ kind: "A", path: "src/pages/our-team.html" }),
    ]));

    // open_page shows another page; nothing reached GitHub.
    expect((await call("open_page", { page: "/about/" })).state).toBe("applied");
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/about.html");
    const snapshot = await (await page.request.get(`/api/snapshot?repo=native-demo-user/native-demo&branch=main`)).json();
    expect((snapshot.tree as { path: string }[]).some((item) => item.path === "src/pages/our-team.html")).toBe(false);
  } finally {
    await client.close();
  }
});

test("an MCP client connected by OAuth reaches the open editor tab", async ({ page, context, baseURL }) => {
  await open(page, baseURL);
  const callback = `${baseURL}/oauth-test-callback`;
  const registered = await (await page.request.post("/auth/mcp/register", {
    data: { client_name: "Playwright OAuth", redirect_uris: [callback] },
  })).json();
  const verifier = `verifier-${"x".repeat(40)}-${Date.now()}`;
  const challenge = await page.evaluate(async (verifier) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }, verifier);
  const authorize = new URL("/auth/mcp/authorize", baseURL);
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: callback,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: `${baseURL}/mcp`,
  })) authorize.searchParams.set(key, value);

  // The consent page, in another tab of the same signed-in browser.
  const consent = await context.newPage();
  await consent.goto(authorize.href);
  await expect(consent.getByRole("heading", { name: "Connect Playwright OAuth to your site" })).toBeVisible();
  await consent.getByRole("radio", { name: /native-demo-user\/native-demo\b/ }).check();
  // Allow sends the browser back to the client with the code.
  const redirected = consent.waitForRequest(/oauth-test-callback/);
  await consent.getByRole("button", { name: "Allow" }).click();
  const returned = new URL((await redirected).url());
  expect(returned.searchParams.get("state")).toBe("xyz");
  const token = await (await page.request.post("/auth/mcp/token", {
    form: {
      grant_type: "authorization_code",
      code: returned.searchParams.get("code")!,
      client_id: registered.client_id,
      redirect_uri: callback,
      code_verifier: verifier,
    },
  })).json();
  expect(token.token_type).toBe("Bearer");
  await consent.close();

  // The editor tab heard of the connection and shares its site.
  const client = new Client({ name: "playwright-oauth", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } },
  }));
  try {
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).editor?.openFile, { timeout: 15_000 }).toBe(indexPath);
    await page.locator(".repository-menu__trigger").click();
    await page.getByRole("button", { name: "Agent context", exact: true }).click();
    await expect(page.locator(".agent-menu__connection")).toContainText("Playwright OAuth");
    const opened = result(await client.callTool({ name: "open_page", arguments: { page: "/about/" } }));
    expect(opened.state).toBe("applied");
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/about.html");
  } finally {
    await client.close();
  }
});

test("a component an agent creates opens its new stylesheet beside the page", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = result(response);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  const cssPath = "src/components/hero-banner/hero-banner.css";
  try {
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).available ?? true, { timeout: 15_000 }).toBe(true);
    await call("write_file", { path: "src/components/hero-banner/hero-banner.html", content: '<section data-key="hero-banner">\n  <h2 data-key="banner-title"><slot name="title">A new banner</slot></h2>\n</section>\n' });
    await call("write_file", { path: cssPath, content: "h2 {\n  color: rebeccapurple;\n}\n" });
    await expect.poll(async () => (await call("get_site")).components.find((item: { tag: string }) => item.tag === "hero-banner")?.section, { timeout: 15_000 }).toBe(true);
    const home = await call("get_page", { page: "/", source: false });
    expect((await call("add_section", { page: "/", component: "hero-banner", expectedHash: home.hash, after: "1.0" })).state).toBe("applied");

    await frame(page).locator("main > hero-banner h2").click();
    await expect(page.locator("#secondary-title")).toHaveText(cssPath);
    await expect(page.locator("#content-secondary .view-lines")).toContainText("rebeccapurple");
    await expect(page.locator("#status")).not.toContainText("Could not open");
  } finally {
    await client.close();
  }
});

test("a component whose slot holds a heading puts that heading in the page", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = result(response);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  try {
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).available ?? true, { timeout: 15_000 }).toBe(true);
    await call("write_file", {
      path: "src/components/page-banner/page-banner.html",
      content: '<section data-key="page-banner">\n  <slot name="title"><h2 data-key="banner-title">A new banner</h2></slot>\n  <slot name="action"><a href="#/about/" data-key="banner-action">Get in touch</a></slot>\n</section>\n',
    });
    await expect.poll(async () => (await call("get_site")).components.find((item: { tag: string }) => item.tag === "page-banner")?.section, { timeout: 15_000 }).toBe(true);
    const home = await call("get_page", { page: "/", source: false });
    expect((await call("add_section", { page: "/", component: "page-banner", expectedHash: home.hash, after: "1.0" })).state).toBe("applied");

    await expect.poll(async () => (await draft(page, indexPath))?.content).toContain(
      `<page-banner data-key="page-banner">\n    <h2 slot="title" data-key="banner-title">A new banner</h2>\n    <a slot="action" href="#/about/" data-key="banner-action">Get in touch</a>\n  </page-banner>`,
    );
    await expect(frame(page).locator("main > page-banner > h2")).toHaveText("A new banner");
    await expect(frame(page).locator("main > page-banner > h2")).toBeVisible();
  } finally {
    await client.close();
  }
});
