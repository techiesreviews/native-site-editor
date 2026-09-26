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
const indexPath = "index.html";
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
    await expect(frame(page).locator("main > feature-block:nth-child(2)")).toHaveCount(1);
    const withSection = await call("get_page", { page: "/", source: false });
    expect(withSection.sections.map((section: { tag: string }) => section.tag)).toEqual(["section", "feature-block", "section", "section"]);
    // Moved to the end, then removed.
    const moved = await call("move_section", { page: "/", section: "1.1", after: "1.3", expectedHash: withSection.hash });
    expect(moved.state).toBe("applied");
    await expect(frame(page).locator("main > feature-block:last-child")).toHaveCount(1);
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
    expect(created.result).toMatchObject({ file: "our-team/index.html", route: "/our-team/" });
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "our-team/index.html");
    await expect(page.locator("#current-page")).toHaveText("Our team");
    await expect(frame(page).locator("main")).toBeEmpty();
    const details = await call("set_page_details", { page: "/our-team/", description: "The people behind the studio." });
    expect(details.state).toBe("applied");
    const made = (await draft(page, "our-team/index.html")).content;
    expect(made).toContain("<title>Our team</title>");
    expect(made).toContain('<meta name="description" content="The people behind the studio.">');
    const after = await call("get_site");
    expect(after.pages.find((item: { route: string }) => item.route === "/our-team/")).toMatchObject({ file: "our-team/index.html", title: "Our team", new: true });
    expect(after.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "M", path: indexPath }),
      expect.objectContaining({ kind: "A", path: "our-team/index.html" }),
    ]));

    // open_page shows another page; nothing reached GitHub.
    expect((await call("open_page", { page: "/about/" })).state).toBe("applied");
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
    const snapshot = await (await page.request.get(`/api/snapshot?repo=native-demo-user/native-demo&branch=main`)).json();
    expect((snapshot.tree as { path: string }[]).some((item) => item.path === "our-team/index.html")).toBe(false);
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
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
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
  const cssPath = "components/hero-banner/hero-banner.css";
  try {
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).available ?? true, { timeout: 15_000 }).toBe(true);
    await call("write_file", { path: "components/hero-banner/hero-banner.html", content: '<section data-key="hero-banner">\n  <h2 data-key="banner-title"><slot name="title">A new banner</slot></h2>\n</section>\n' });
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
      path: "components/page-banner/page-banner.html",
      content: '<section data-key="page-banner">\n  <slot name="title"><h2 data-key="banner-title">A new banner</h2></slot>\n  <slot name="action"><a href="/about/" data-key="banner-action">Get in touch</a></slot>\n</section>\n',
    });
    await expect.poll(async () => (await call("get_site")).components.find((item: { tag: string }) => item.tag === "page-banner")?.section, { timeout: 15_000 }).toBe(true);
    const home = await call("get_page", { page: "/", source: false });
    expect((await call("add_section", { page: "/", component: "page-banner", expectedHash: home.hash, after: "1.0" })).state).toBe("applied");

    await expect.poll(async () => (await draft(page, indexPath))?.content).toContain(
      `<page-banner>\n    <h2 slot="title">A new banner</h2>\n    <a slot="action" href="/about/">Get in touch</a>\n  </page-banner>`,
    );
    await expect(frame(page).locator("main > page-banner > h2")).toHaveText("A new banner");
    await expect(frame(page).locator("main > page-banner > h2")).toBeVisible();
  } finally {
    await client.close();
  }
});

test("clicking a section component's own area selects it on the page, and Remove takes it out of the page alone", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = result(response);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  const templatePath = "components/page-banner/page-banner.html";
  const template = '<section data-key="page-banner">\n  <slot name="title"><h2 data-key="banner-title">A new banner</h2></slot>\n</section>\n';
  try {
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).available ?? true, { timeout: 15_000 }).toBe(true);
    await call("write_file", { path: templatePath, content: template });
    await call("write_file", { path: "components/page-banner/page-banner.css", content: "section {\n  padding: 48px;\n}\n" });
    await expect.poll(async () => (await call("get_site")).components.find((item: { tag: string }) => item.tag === "page-banner")?.section, { timeout: 15_000 }).toBe(true);
    const home = await call("get_page", { page: "/", source: false });
    expect((await call("add_section", { page: "/", component: "page-banner", expectedHash: home.hash, after: "1.0" })).state).toBe("applied");
    const banner = frame(page).locator("main > page-banner");
    await expect(frame(page).locator("main > page-banner > h2")).toBeVisible();

    // The padding belongs to the template's <section>; the instance is selected.
    await banner.click({ position: { x: 8, y: 8 } });
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
    await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Remove" }).click();
    await expect(banner).toHaveCount(0);
    // Back to the committed page, so its draft is gone.
    await expect.poll(async () => (await draft(page, indexPath))?.content ?? indexSource).toBe(indexSource);
    expect((await draft(page, templatePath)).content).toBe(template);
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  } finally {
    await client.close();
  }
});

test("an optional slot's fallback hides once the page removes what filled it", async ({ page, baseURL }) => {
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
      path: "components/page-banner/page-banner.html",
      content: '<section data-key="page-banner">\n  <slot name="title"><h2 data-key="banner-title">A new banner</h2></slot>\n  <div class="actions" data-key="banner-actions">\n    <slot name="primary" data-if><a href="/about/" data-key="banner-primary">Get in touch</a></slot>\n    <slot name="secondary" data-if><a href="/" data-key="banner-secondary">See our work</a></slot>\n  </div>\n</section>\n',
    });
    await expect.poll(async () => (await call("get_site")).components.find((item: { tag: string }) => item.tag === "page-banner")?.section, { timeout: 15_000 }).toBe(true);
    const home = await call("get_page", { page: "/", source: false });
    expect((await call("add_section", { page: "/", component: "page-banner", expectedHash: home.hash, after: "1.0" })).state).toBe("applied");
    const banner = frame(page).locator("main > page-banner");
    await expect(banner.locator("> a")).toHaveCount(2);
    await expect(banner.getByRole("link", { name: "See our work" })).toBeVisible();

    // The page's second button goes: the template's own "See our work" does not come back.
    const added = await call("read_file", { path: indexPath });
    const secondary = /\n\s*<a slot="secondary"[^\n]*<\/a>/.exec(added.content)![0];
    await call("edit_file", { path: indexPath, expectedHash: added.hash, edits: [{ oldText: secondary, newText: "" }] });
    await expect(banner.locator("> a")).toHaveCount(1);
    await expect(banner.getByRole("link", { name: "See our work" })).toBeHidden();
    await expect(banner.getByRole("link", { name: "Get in touch" })).toBeVisible();

    // Both gone: the empty row goes too.
    const one = await call("read_file", { path: indexPath });
    const primary = /\n\s*<a slot="primary"[^\n]*<\/a>/.exec(one.content)![0];
    await call("edit_file", { path: indexPath, expectedHash: one.hash, edits: [{ oldText: primary, newText: "" }] });
    await expect(banner.getByRole("link")).toHaveCount(0);
    await expect(banner.locator(".actions")).toBeHidden();
    await expect(banner.locator("> h2")).toBeVisible();
  } finally {
    await client.close();
  }
});
