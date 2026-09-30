import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
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

const draft = storedDraft;

// Connects an agent with the prompt "Connect with MCP" copies.
async function connectAgent(page: Page, baseURL: string | undefined) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Waiting for connection…", exact: true })).toBeVisible();
  await expect(page.locator(".agent-menu__hint")).toContainText("Paste it into Claude, Codex");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server URL: (\S+)/.exec(prompt)![1];
  const token = /Authorization: Bearer (ase_[a-f0-9]{64})/.exec(prompt)![1];
  expect(url).toBe(`${baseURL}/mcp`);
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toHaveAttribute("title", /playwright-agent connected/);
  await page.keyboard.press("Escape");
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
    expect(site.settings).toEqual({ file: ".editor/config.json", name: "Native Studio" });
    expect(site.stylesheets).toEqual([{ file: "styles/site.css", imports: [] }]);
    expect(site.notFound).toBeNull();
    expect(site.pages[0]).toMatchObject({ title: "Native Studio", description: "A small site built from plain HTML, CSS and shared components." });

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

    // The site gets an address, and the home page its canonical and og:url.
    const config = await call("read_file", { path: ".editor/config.json" });
    await call("edit_file", { path: ".editor/config.json", expectedHash: config.hash, edits: [{ oldText: '"name": "Native Studio"', newText: '"name": "Native Studio",\n    "url": "https://studio.example"' }] });
    const head = await call("read_file", { path: indexPath });
    await call("edit_file", {
      path: indexPath,
      expectedHash: head.hash,
      edits: [{ oldText: '<meta property="og:title"', newText: '<link rel="canonical" href="https://studio.example/">\n  <meta property="og:url" content="https://studio.example/">\n  <meta property="og:title"' }],
    });
    await expect.poll(async () => (await call("get_site")).settings?.url).toBe("https://studio.example/");

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
    // Its own address, not the home page's; og:title and og:description follow.
    expect(made).toContain('<link rel="canonical" href="https://studio.example/our-team/">');
    expect(made).toContain('<meta property="og:url" content="https://studio.example/our-team/">');
    expect(made).toContain('<meta property="og:title" content="Our team">');
    expect(made).toContain('<meta property="og:description" content="The people behind the studio.">');
    const after = await call("get_site");
    expect(after.pages.find((item: { route: string }) => item.route === "/our-team/")).toMatchObject({ file: "our-team/index.html", title: "Our team", description: "The people behind the studio.", new: true });
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

test("an agent measures elements as the preview renders them: box, computed styles, matching rules and text contrast", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  const inspect = async (args: Record<string, unknown>) => {
    const response = await client.callTool({ name: "inspect_preview", arguments: args });
    return { isError: Boolean(response.isError), body: result(response) };
  };
  try {
    // By selector: the heading and the lead, inked on the page's background.
    const bySelector = await inspect({ selector: ".hero h1, .hero .lead" });
    expect(bySelector.isError, JSON.stringify(bySelector.body)).toBe(false);
    expect(bySelector.body.state).toBe("applied");
    const report = bySelector.body.result;
    expect(report.route).toBe("/");
    expect(report.matched).toBe(2);
    expect(report.viewport.width).toBeGreaterThan(200);
    const [heading, lead] = report.elements;
    expect(heading).toMatchObject({ file: indexPath, tag: "h1", text: "A native browser preview", visible: true });
    expect(heading.contrast).toMatchObject({ ratio: 14.77, text: "#20231f", background: "#f6f7f3", largeText: true, AA: true, AAA: true });
    expect(heading.styles["margin"]).toBe("0px 0px 12px");
    expect(heading.rules).toEqual(expect.arrayContaining([expect.objectContaining({ file: "styles/site.css", selector: ".hero h1" })]));
    expect(lead.contrast).toMatchObject({ ratio: 5.57, text: "#5c665a", largeText: false, AA: true, AAA: false });
    expect(lead.styles["font-size"]).toBe("18px");
    const box = await frame(page).locator(".hero h1").boundingBox();
    expect(heading.box.height).toBeCloseTo(box!.height, 0);

    // By the id get_page gives, on another page, which the editor then shows.
    const about = await client.callTool({ name: "get_page", arguments: { page: "/about/", source: false } });
    const section = result(about).sections[0];
    const byId = await inspect({ page: "/about/", element: section.id });
    expect(byId.isError, JSON.stringify(byId.body)).toBe(false);
    expect(byId.body.result.elements[0]).toMatchObject({ file: "about/index.html", element: section.id, tag: section.tag });
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");

    // Nothing to measure is said plainly.
    const none = await inspect({ selector: ".no-such-thing" });
    expect(none.isError).toBe(true);
    expect(none.body.message).toContain("Nothing on the page shown matches");
    const bad = await inspect({ selector: "h1[" });
    expect(bad.isError).toBe(true);
    expect(bad.body.message).toContain("Not a CSS selector");
  } finally {
    await client.close();
  }
});

test("Disconnect MCP revokes the agent's token, and Cancel drops a token no agent used", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const client = await connectAgent(page, baseURL);
  try {
    await page.locator(".repository-menu__trigger").click();
    await page.getByRole("button", { name: "Disconnect MCP", exact: true }).click();
    await expect(page.getByRole("button", { name: "Connect with MCP", exact: true })).toBeVisible();
    await expect(client.callTool({ name: "get_site", arguments: {} })).rejects.toThrow();
  } finally {
    await client.close().catch(() => undefined);
  }
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Waiting for connection…", exact: true })).toBeVisible();
  const token = /Bearer (ase_[a-f0-9]{64})/.exec(await page.evaluate(() => navigator.clipboard.readText()))![1];
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect with MCP", exact: true })).toBeVisible();
  const response = await page.request.post(`${baseURL}/mcp`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(response.status()).toBe(401);
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
    await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toHaveAttribute("title", /Playwright OAuth connected/);
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

test("Ask agent: a request about an element in the preview reaches the agent with its context, and its reply shows on the element's pin", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  const heading = frame(page).locator(".hero h1");
  // Without an agent there is no one to ask.
  await heading.click();
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Ask agent" })).toHaveCount(0);
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = result(response);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  const pins = page.locator(".agent-pin");
  try {
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).available ?? true, { timeout: 15_000 }).toBe(true);
    // The agent sees the selection whole.
    await heading.click();
    await expect.poll(async () => (await call("get_selection")).element?.selector).toBe("h1");
    const selected = (await call("get_selection")).element;
    expect(selected).toMatchObject({ file: indexPath, route: "/", id: "1.0.0", tag: "h1", lines: { start: 17, end: 17 } });
    expect(selected.html).toBe('<h1 data-key="hero-title">A native browser preview</h1>');

    // The button is the editor's star, named by its label.
    const ask = bar.getByRole("button", { name: "Ask agent" });
    await expect(ask).toHaveText("");
    await expect(ask).toHaveAttribute("title", "Ask agent");
    await expect(ask.locator("svg path")).toHaveAttribute("fill", "currentColor");

    // A note over the heading's top-left corner, numbered as its pin will
    // be, with no hint text. Escape cancels; Shift+Enter is a new line and
    // Enter sends.
    await ask.click();
    const note = page.getByRole("dialog", { name: "Ask agent" });
    const box = note.getByRole("textbox", { name: "Ask agent" });
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute("placeholder", "Ask the agent…");
    await expect(note).toHaveText("1.");
    const noteBox = (await note.boundingBox())!;
    const headingBox = (await heading.boundingBox())!;
    expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(headingBox.y);
    expect(Math.abs(noteBox.x - headingBox.x)).toBeLessThan(2);
    await box.fill("Never mind");
    await page.keyboard.press("Escape");
    await expect(box).toHaveCount(0);
    await expect(ask).toBeFocused();
    await ask.click();
    await page.keyboard.type("Make this heading friendlier");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Keep it short");
    await page.keyboard.press("Enter");
    // The note closes into its pin, on the same spot; the heading stays
    // selected, so another request can follow at once.
    await expect(note).toHaveCount(0);
    await expect(pins).toHaveCount(1);
    await expect(pins.first().locator(".agent-pin__number")).toHaveText("1");
    await expect(pins.first()).toHaveAttribute("data-state", "open");
    const pinBox = (await pins.first().boundingBox())!;
    expect(Math.abs(pinBox.x - noteBox.x)).toBeLessThan(2);
    expect(Math.abs(pinBox.y + pinBox.height - (noteBox.y + noteBox.height))).toBeLessThan(2);
    await expect(bar).toBeVisible();
    await expect(bar.locator(".edit-bar__kind")).toHaveText("Heading");
    await expect(ask).toBeFocused();

    // A second one, about a card's slotted text, before the agent looks.
    await frame(page).locator("project-card").nth(1).locator('p[slot="body"]').click();
    await bar.getByRole("button", { name: "Ask agent" }).click();
    await page.keyboard.type("Is this sentence true?");
    await page.keyboard.press("Enter");
    await expect(pins).toHaveCount(2);

    // The agent gets both, with where they are and what they are.
    const { requests } = await call("wait_for_requests", { waitSeconds: 10 });
    expect(requests.map((item: { text: string }) => item.text)).toEqual(["Make this heading friendlier\nKeep it short", "Is this sentence true?"]);
    const [first, second] = requests;
    expect(first.element).toMatchObject({ file: indexPath, route: "/", id: "1.0.0", tag: "h1", selector: "h1", lines: { start: 17, end: 17 } });
    expect(first.element.html).toBe('<h1 data-key="hero-title">A native browser preview</h1>');
    expect(second.element).toMatchObject({ file: indexPath, tag: "p", component: { tag: "project-card", in: "slot", slot: "body" } });
    expect(second.element.text).toContain("header and footer are custom elements");
    // Taken: each pin spins and its element has a marching outline.
    await expect(page.locator('.agent-pin[data-state="seen"]')).toHaveCount(2);
    await expect(page.locator('.agent-pin[data-state="seen"] .agent-pin__spinner')).toHaveCount(2);
    await expect(page.locator(".agent-pin-outline")).toHaveCount(2);

    // It edits the heading, and says so; the pin shows it.
    const home = await call("read_file", { path: indexPath });
    const edited = await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "Hello there" }], requestId: "friendlier" });
    expect(edited.state).toBe("applied");
    await expect(heading).toHaveText("Hello there");
    await call("reply_to_request", { request: first.id, status: "done", message: "Changed the heading to Hello there.", requestIds: ["friendlier"] });
    await call("reply_to_request", { request: second.id, status: "answered", message: "Yes: both are components." });
    const done = page.locator('.agent-pin[data-state="done"]');
    await expect(done).toHaveCount(1);
    await expect(page.locator('.agent-pin[data-state="answered"]')).toHaveCount(1);
    await expect(done.locator(".agent-pin__status")).toHaveText("✓");
    await expect(page.locator(".agent-pin-outline:not(.is-done)")).toHaveCount(0);
    // Hovering a pin opens its card for a look, beside its element and
    // without taking the focus; the pointer moving away closes it.
    const card = page.getByRole("dialog", { name: "Request 1" });
    const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    await done.hover();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Make this heading friendlier");
    await expect(card).toContainText("Changed the heading to Hello there.");
    await expect(done.locator(".agent-pin__text")).toBeHidden();
    expect(await card.evaluate((element) => element.contains(document.activeElement))).toBe(false);
    // The heading spans the page: its card goes below it.
    await expect(card).toHaveAttribute("data-side", "below");
    expect(intersects((await card.boundingBox())!, (await heading.boundingBox())!)).toBe(false);
    await page.mouse.move(5, 500);
    await expect(card).toBeHidden();
    // The card's text has room beside it: its card goes to its right.
    const other = page.locator('.agent-pin[data-state="answered"]');
    const otherCard = page.getByRole("dialog", { name: "Request 2" });
    await other.hover();
    await expect(otherCard).toBeVisible();
    await expect(otherCard).toHaveAttribute("data-side", "right");
    const text = frame(page).locator("project-card").nth(1).locator('p[slot="body"]');
    expect(intersects((await otherCard.boundingBox())!, (await text.boundingBox())!)).toBe(false);
    // Moving on to another pin switches to its card.
    await done.hover();
    await expect(card).toBeVisible();
    await expect(otherCard).toBeHidden();
    // A click holds it open, the pointer gone; hovering another pin then
    // unfolds its first line.
    await done.click();
    await expect(card.getByRole("button", { name: "Clear" })).toBeFocused();
    await other.hover();
    await expect(other.locator(".agent-pin__text")).toHaveText("Is this sentence true?");
    await expect(other.locator(".agent-pin__text")).toBeVisible();
    await page.mouse.move(5, 500);
    await page.waitForTimeout(900);
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Clear" }).click();
    await expect(pins).toHaveCount(1);
    await expect.poll(async () => (await call("wait_for_requests", { all: true, waitSeconds: 0 })).requests.length).toBe(0);
    // The pins are the editor's: nothing of them is in the page's draft.
    expect((await draft(page, indexPath)).content).not.toContain("agent-pin");
  } finally {
    await client.close();
  }
});

// A colour as the browser renders it, in sRGB (computed styles may be oklch()).
async function rgb(page: Page, selector: string, property: string) {
  return page.evaluate(([selector, property]) => {
    const value = getComputedStyle(document.querySelector(selector)!).getPropertyValue(property);
    const context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  }, [selector, property]);
}
const orange = ({ r, g, b }: { r: number; g: number; b: number }) => r > 180 && r >= g && g > b && r - b > 30;
const grey = ({ r, g, b }: { r: number; g: number; b: number }) => Math.max(r, g, b) - Math.min(r, g, b) < 14;

test("Ask agent: an agent's question turns its pin orange, the user answers it on the card, and the agent gets the answer with the thread", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  const heading = frame(page).locator(".hero h1");
  const client = await connectAgent(page, baseURL);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = result(response);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  const pin = page.locator(".agent-pin");
  try {
    await expect.poll(async () => result(await client.callTool({ name: "get_site", arguments: {} })).available ?? true, { timeout: 15_000 }).toBe(true);
    await heading.click();
    await bar.getByRole("button", { name: "Ask agent" }).click();
    await page.keyboard.type("Make this heading friendlier");
    await page.keyboard.press("Enter");
    await expect(pin).toHaveAttribute("data-state", "open");
    const [asked] = (await call("wait_for_requests", { waitSeconds: 10 })).requests;
    await expect(pin).toHaveAttribute("data-state", "seen");

    // The agent asks: the pin turns orange with a "?", and the project
    // selector counts the question.
    await call("reply_to_request", { request: asked.id, status: "question", message: "Warmer, or shorter?" });
    await expect(pin).toHaveAttribute("data-state", "question");
    await expect(pin.locator(".agent-pin__status")).toHaveText("?");
    expect(orange(await rgb(page, ".agent-pin", "background-color"))).toBe(true);
    expect(orange(await rgb(page, ".agent-pin", "border-top-color"))).toBe(true);
    await expect(page.locator(".repository-menu__questions")).toHaveText("1");
    await expect(page.locator(".repository-menu__trigger")).toHaveAttribute("aria-label", /an agent asks you a question/);

    // Its card is the conversation, the question in orange. Hovered, the
    // answer box waits unfocused; a click holds it open, the box focused.
    const card = page.getByRole("dialog", { name: "Request 1" });
    const answer = card.getByRole("textbox", { name: "Answer the agent" });
    await pin.hover();
    await expect(answer).toBeVisible();
    await expect(answer).not.toBeFocused();
    await page.mouse.move(5, 500);
    await expect(card).toBeHidden();
    await pin.click();
    await page.mouse.move(5, 500);
    await page.waitForTimeout(900);
    await expect(card).toBeVisible();
    await expect(card.locator(".agent-pin-card__state")).toHaveText("Question");
    await expect(card.locator(".agent-pin-card__from")).toHaveText(["You", "Agent"]);
    await expect(card.locator(".agent-pin-card__bubble")).toHaveText(["Make this heading friendlier", "Warmer, or shorter?"]);
    expect(orange(await rgb(page, ".agent-pin-card__message.is-question .agent-pin-card__bubble", "border-top-color"))).toBe(true);
    await expect(answer).toBeFocused();
    await expect(answer).toHaveAttribute("placeholder", "Answer…");
    // Escape closes the card, keeping what was typed.
    await page.keyboard.type("Warmer");
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    await expect(pin).toBeFocused();
    // Enter on the pin opens it again, as a click does.
    await page.keyboard.press("Enter");
    await expect(answer).toBeFocused();
    await expect(answer).toHaveValue("Warmer");
    const before = (await answer.boundingBox())!.height;
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("and keep it short");
    await expect.poll(async () => (await answer.boundingBox())!.height).toBeGreaterThan(before);
    await page.keyboard.press("Enter");

    // Sent: the card closes, and the request waits for agents again.
    await expect(card).toHaveCount(0);
    await expect(pin).toHaveAttribute("data-state", "open");
    await expect(page.locator(".repository-menu__questions")).toBeHidden();
    const [again] = (await call("wait_for_requests", { waitSeconds: 10 })).requests;
    expect(again.id).toBe(asked.id);
    expect(again.thread.map((item: { from: string; text: string }) => [item.from, item.text])).toEqual([
      ["user", "Make this heading friendlier"],
      ["agent", "Warmer, or shorter?"],
      ["user", "Warmer\nand keep it short"],
    ]);
    await expect(pin).toHaveAttribute("data-state", "seen");
    await expect(pin.locator(".agent-pin__spinner")).toHaveCount(1);

    // Done: the pin and its card turn grey.
    const home = await call("read_file", { path: indexPath });
    await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "Hello there" }], requestId: "warmer" });
    await call("reply_to_request", { request: asked.id, status: "done", message: "Changed it to Hello there.", requestIds: ["warmer"] });
    await expect(pin).toHaveAttribute("data-state", "done");
    await expect(pin.locator(".agent-pin__status")).toHaveText("✓");
    expect(grey(await rgb(page, ".agent-pin", "background-color"))).toBe(true);
    expect(grey(await rgb(page, ".agent-pin", "border-top-color"))).toBe(true);
    await pin.click();
    await expect(card).toHaveAttribute("data-state", "done");
    await expect(card.locator(".agent-pin-card__state")).toHaveText("Done");
    expect(grey(await rgb(page, ".agent-pin-card", "background-color"))).toBe(true);
    await expect(card.locator(".agent-pin-card__from")).toHaveText(["You", "Agent", "You", "Agent"]);
    await expect(card.getByRole("textbox")).toHaveCount(0);
    await card.getByRole("button", { name: "Clear" }).click();
    await expect(pin).toHaveCount(0);
  } finally {
    await client.close();
  }
});
