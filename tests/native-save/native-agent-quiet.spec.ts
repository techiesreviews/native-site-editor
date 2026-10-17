import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// Remote agents are off in each tab until the user turns them on there
// (src/components/agent-menu.ts). While off, the tab sends nothing to the
// agent hub: every /api/agent/* request is one hub Durable Object call, so
// these counts are agent-hub calls (POSTs: context uploads and hub writes).
// Normal editor and GitHub traffic is not counted.

const open = async (page: Page, baseURL: string | undefined) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
};

function agentRequests(page: Page) {
  const seen: { method: string; path: string }[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/agent/") || path === "/mcp") seen.push({ method: request.method(), path });
  });
  return seen;
}

const setVisibility = (page: Page, state: "visible" | "hidden") =>
  page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
    if (state === "visible") window.dispatchEvent(new Event("focus"));
  }, state);

test("remote agents off: startup, the agent menu and idle visible or hidden tabs make no agent-hub calls, even with a connected agent", async ({ page, baseURL }) => {
  // A connection an agent already used, made in an earlier visit of this session.
  await open(page, baseURL);
  const { token } = await page.evaluate(async () => {
    const response = await fetch("/api/agent/connect", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "native-demo-user/native-demo", repoId: 501, branch: "main" }),
    });
    return response.json() as Promise<{ token: string }>;
  });
  const client = new Client({ name: "quiet-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  try {
    await page.clock.install();
    const requests = agentRequests(page);
    await page.reload();
    await open(page, baseURL);
    await page.clock.runFor(65_000);
    expect(requests, "startup").toEqual([]);

    // Opening the menu mounts it and says plainly that remote agents are off.
    await page.locator(".repository-menu__trigger").click();
    const action = page.locator(".agent-menu__action");
    await expect(action).toHaveText("Connect with MCP");
    await expect(page.locator(".agent-menu__hint")).toHaveText("Remote agents are off in this tab. Choose Connect with MCP to turn them on.");
    await page.clock.runFor(65_000);
    await page.keyboard.press("Escape");
    expect(requests, "menu opening").toEqual([]);

    await page.clock.runFor(65_000);
    await setVisibility(page, "hidden");
    await page.clock.runFor(65_000);
    await setVisibility(page, "visible");
    await page.clock.runFor(65_000);
    expect(requests, "idle visible and hidden").toEqual([]);

    // Connect turns them on in this tab and finds the agent connected before.
    await page.locator(".repository-menu__trigger").click();
    await action.click();
    await expect(action).toHaveText("Disconnect MCP", { timeout: 15_000 });
    await expect(page.locator(".agent-menu__hint")).toContainText("If an agent you connected before stopped, ask it to continue.");
    expect(requests.filter((request) => request.path === "/api/agent/connect"), "no new token for a connected agent").toEqual([]);
    expect(requests.some((request) => request.path === "/api/agent/hub")).toBe(true);
    await expect.poll(() => requests.some((request) => request.path === "/api/agent/context")).toBe(true);

    // Turn off stops it again, even with a context share on its way: that share is
    // withdrawn, then nothing more is sent, and the agent keeps its access.
    let release!: () => void;
    const held = new Promise<void>((done) => (release = done));
    let holding!: () => void;
    const caught = new Promise<void>((done) => (holding = done));
    await page.route("**/api/agent/context", async (route) => { holding(); await held; await route.continue(); });
    await page.clock.runFor(31_000); // The 30-second context heartbeat.
    await caught;
    await page.getByRole("button", { name: "Turn off", exact: true }).click();
    await expect(action).toHaveText("Connect with MCP");
    const turnedOff = requests.length;
    const withdrawn = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent/pause");
    release();
    await withdrawn;
    await page.unroute("**/api/agent/context");
    await page.clock.runFor(5_000);
    expect(requests.slice(turnedOff).filter((request) => request.path !== "/api/agent/pause"), "nothing but withdrawing the share").toEqual([]);
    const after = requests.length;
    await page.clock.runFor(65_000);
    await setVisibility(page, "hidden");
    await page.clock.runFor(65_000);
    expect(requests.slice(after), "after Turn off").toEqual([]);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
  } finally {
    await client.close();
  }
});

test("an approval with another approval id or another repository or branch does not turn remote agents on", async ({ page, baseURL }) => {
  let calls = 0;
  await page.route("**/api/agent/hub", async (route) => {
    calls++;
    await route.fulfill({ json: { grants: [
      // Made a minute before this approval (for example, then turned off here).
      { id: "old", repoId: 501, repo: "native-demo-user/native-demo", branch: "main", approval: "another-approval", via: "oauth", createdAt: Date.now() - 60_000, usedAt: Date.now() - 60_000 },
      { id: "other", repoId: 999, repo: "native-demo-user/other", branch: "main", approval: "another-approval", via: "oauth", createdAt: Date.now() + 60_000 },
      { id: "branch", repoId: 501, repo: "native-demo-user/native-demo", branch: "other", approval: "this-approval", via: "oauth", createdAt: Date.now() },
    ], tabId: null, updatedAt: null, commands: [], requests: [] } });
  });
  await page.clock.install();
  await open(page, baseURL);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "native-site-editor:agent-connected", newValue: JSON.stringify({ at: Date.now(), repo: "native-demo-user/native-demo", branch: "main", approval: "this-approval" }) })));
  // The approval's three checks, then nothing more.
  await expect.poll(async () => { await page.clock.runFor(1000); return calls; }, { timeout: 20_000 }).toBe(3);
  await page.clock.runFor(65_000);
  expect(calls).toBe(3);
  await page.locator(".repository-menu__trigger").click();
  await expect(page.locator(".agent-menu__action")).toHaveText("Connect with MCP");
  await expect(page.locator(".agent-menu__hint")).toContainText("Remote agents are off in this tab.");
});

for (const receiver of [{ repo: "native-demo-user/other", branch: "main" }, { repo: "native-demo-user/native-demo", branch: "other" }]) {
  test(`approval for ${receiver.repo} on ${receiver.branch} makes zero hub requests in a different tab`, async ({ page, baseURL }) => {
    await page.clock.install();
    await open(page, baseURL);
    // Mount first to exercise the lazy menu's own storage listener too.
    await page.locator(".repository-menu__trigger").click();
    const requests = agentRequests(page);
    await page.evaluate((receiver) => window.dispatchEvent(new StorageEvent("storage", {
      key: "native-site-editor:agent-connected",
      newValue: JSON.stringify({ at: Date.now(), ...receiver, approval: "other-tab" }),
    })), receiver);
    await page.clock.runFor(65_000);
    expect(requests).toEqual([]);
    await expect(page.locator(".agent-menu__hint")).toContainText("Remote agents are off in this tab.");
  });
}

test("the exact approval enables its repository and branch even after a delayed token exchange, but Turn off declines it", async ({ page, baseURL }) => {
  const approval = { at: Date.now(), repo: "native-demo-user/native-demo", branch: "main", approval: "exact-approval" };
  let calls = 0;
  await page.route("**/api/agent/hub", async (route) => {
    calls++;
    await route.fulfill({ json: { grants: [
      { id: "approved", repoId: 501, repo: approval.repo, branch: approval.branch, approval: approval.approval, via: "oauth", createdAt: 1 },
    ], tabId: null, updatedAt: null, commands: [], requests: [] } });
  });
  await page.route("**/api/agent/context", (route) => route.fulfill({ json: { ok: true, missing: [] } }));
  await page.route("**/api/agent/pause", (route) => route.fulfill({ json: { ok: true } }));
  await page.clock.install();
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const announce = () => page.evaluate((approval) => window.dispatchEvent(new StorageEvent("storage", {
    key: "native-site-editor:agent-connected", newValue: JSON.stringify(approval),
  })), approval);
  await announce();
  await expect.poll(async () => { await page.clock.runFor(1000); return page.locator(".agent-menu__action").textContent(); }).toBe("Disconnect MCP");
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await announce();
  const before = calls;
  await expect.poll(async () => { await page.clock.runFor(1000); return calls - before; }).toBe(3);
  await expect(page.locator(".agent-menu__action")).toHaveText("Connect with MCP");
});
