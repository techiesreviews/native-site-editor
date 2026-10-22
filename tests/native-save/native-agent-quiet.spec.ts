import { expect, test, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// Agent HTTP requests are counted separately from socket frames and normal editor traffic.
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

test("remote agents off: startup, the agent menu and idle visible or hidden tabs make no agent-hub calls, even with a connected agent; once on, a reload keeps them on", async ({ page, baseURL }) => {
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

    // Opening the menu mounts it, with remote agents off.
    await page.locator(".repository-menu__trigger").click();
    const action = page.locator(".agent-menu__action");
    await expect(action).toHaveText("Connect with MCP");
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    await expect(page.locator(".agent-menu__hint")).toBeHidden();
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
    expect(requests.filter((request) => request.path === "/api/agent/connect"), "no new token for a connected agent").toEqual([]);
    expect(requests.some((request) => request.path === "/api/agent/connections")).toBe(true);
    const idle = requests.length;
    await page.clock.runFor(65_000);
    expect(requests.slice(idle), "live idle has no polling or uploads").toEqual([]);
    expect(requests.some(request => /\/(context|drafts|claim|ack|pause)$/.test(request.path))).toBe(false);
    // A reload keeps them on (remembered for this site): one connections read and the socket, no new token.
    // Sockets are counted from their own events: Playwright may report a socket's opening request late.
    const http = (from: number) => requests.slice(from).filter(request => request.path !== "/api/agent/relay");
    const reloaded = requests.length;
    let sockets = 0, ready = 0, pings = 0, pongs = 0;
    page.on("websocket", socket => {
      if (!socket.url().includes("/api/agent/relay?")) return;
      sockets++;
      socket.on("framesent", ({ payload }) => { if (String(payload) === "ping") pings++; });
      socket.on("framereceived", ({ payload }) => {
        if (String(payload) === "pong") pongs++;
        else if (String(payload).includes('"type":"ready"')) ready++;
      });
    });
    // Idle in one-second steps, holding the clock at each heartbeat ping until the relay's real
    // answer arrives (one jump past the ping and its 10 s no-answer limit would close a healthy socket).
    const idleFor = async (ms: number) => {
      for (let left = ms; left > 0; left -= 1000) {
        await page.clock.runFor(1000);
        if (pongs < pings) await expect.poll(() => pongs, { timeout: 15_000 }).toBe(pings);
      }
    };
    await page.reload();
    await open(page, baseURL);
    await page.locator(".repository-menu__trigger").click();
    await expect(action).toHaveText("Disconnect MCP", { timeout: 15_000 });
    await page.keyboard.press("Escape");
    // The socket opens after the connections read. Its handshake needs no timers: holding the
    // fake clock still meanwhile keeps a slow machine from tripping the 10 s handshake limit.
    await expect.poll(async () => { if (!sockets) await page.clock.runFor(100); return sockets; }).toBe(1);
    await expect.poll(() => ready, { timeout: 15_000 }).toBe(1);
    expect(http(reloaded), "after a reload").toEqual([{ method: "GET", path: "/api/agent/connections" }]);
    const after = requests.length;
    await idleFor(65_000);
    await setVisibility(page, "hidden");
    await idleFor(65_000);
    expect(http(after), "idle after a reload").toEqual([]);
    expect({ sockets, ready }, "one socket, never reconnected").toEqual({ sockets: 1, ready: 1 });
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
  } finally {
    await client.close();
  }
});

test("an approval with another approval id or another repository or branch does not turn remote agents on", async ({ page, baseURL }) => {
  let calls = 0;
  await page.route("**/api/agent/connections", async (route) => {
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
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
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
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
  });
}

test("the exact approval enables its repository and branch even after a delayed token exchange", async ({ page, baseURL }) => {
  const approval = { at: Date.now(), repo: "native-demo-user/native-demo", branch: "main", approval: "exact-approval" };
  let calls = 0;
  await page.route("**/api/agent/connections", async (route) => {
    calls++;
    await route.fulfill({ json: { grants: [
      { id: "approved", repoId: 501, repo: approval.repo, branch: approval.branch, approval: approval.approval, via: "oauth", createdAt: 1 },
    ], tabId: null, updatedAt: null, commands: [], requests: [] } });
  });
  await page.clock.install();
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const announce = () => page.evaluate((approval) => window.dispatchEvent(new StorageEvent("storage", {
    key: "native-site-editor:agent-connected", newValue: JSON.stringify(approval),
  })), approval);
  await announce();
  await expect.poll(async () => { await page.clock.runFor(1000); return page.locator(".agent-menu__action").textContent(); }).toBe("Disconnect MCP");
});

// Ticket 18: quiet waiting and explicit Watch over the fixture's real Worker, relay and socket.
test("live: waits are quiet by default; Watch holds one wait until Ask agent, shows its deadline, never renews itself and ends without disconnecting", { tag: "@live" }, async ({ page, context, baseURL }) => {
  const frames: { tool?: string; remainingMs?: number }[] = [];
  page.on("websocket", socket => {
    if (!socket.url().includes("/api/agent/relay?")) return;
    socket.on("framereceived", ({ payload }) => {
      const message = String(payload);
      if (!message.startsWith("{")) return;
      const value = JSON.parse(message);
      if (value.type === "command") frames.push({ tool: value.command?.tool, remainingMs: value.remainingMs });
    });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  const client = new Client({ name: "watch-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const watchKey = 'native-site-editor:agent-watch:["native-demo-user",501,"main"]';
  const record = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), watchKey);
  try {
    await expect.poll(() => page.locator(".agent-menu").getAttribute("data-state"), { timeout: 15_000 }).toMatch(/idle|waiting|connected/);
    const requests = agentRequests(page);
    // Quiet default: an empty wait answers at once with no "call again", over one socket command.
    const started = Date.now();
    const quiet = await call("wait_for_requests");
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(quiet.requests).toEqual([]);
    expect(quiet.hint).toContain("Do not call wait_for_requests again on your own");
    expect(frames.map(frame => frame.tool)).toEqual(["wait_for_requests"]);

    // The agent is connected; the menu offers Watch, with no explainer lines and no Turn off.
    const action = page.locator(".agent-menu__action");
    await expect(action).toHaveText("Disconnect MCP");
    const watchText = page.locator(".agent-menu__watch-text");
    await expect(watchText).toBeHidden();
    await expect(page.locator(".agent-menu__hint")).toBeHidden();
    await expect(page.getByRole("button", { name: "Turn off", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Watch for requests" }).click();
    await expect(watchText).toContainText(/Watching for requests until .+ \((10:00|9:5\d) left, 25 waits left\)/);
    const watch = await record();
    expect(Object.keys(watch).sort()).toEqual(["startedAt", "until", "waits"]);
    expect(watch.until - watch.startedAt).toBe(600_000);
    await page.screenshot({ path: test.info().outputPath("watch-on.png") });

    // Watch: the wait is held (no answer yet), until the user asks from the edit bar.
    let settled = false;
    const held = call("wait_for_requests").finally(() => { settled = true; });
    await expect.poll(() => frames.length).toBe(2);
    expect(frames[1].remainingMs).toBeGreaterThan(20_000);
    await page.waitForTimeout(1_500); // fixed-wait: proving the wait stays unanswered (a negative) while Watch is on
    expect(settled, "held while Watch is on").toBe(false);
    await page.keyboard.press("Escape");
    await page.frameLocator(".native-preview-frame").locator(".hero h1").click();
    const bar = page.getByRole("toolbar", { name: "Edit bar" });
    await bar.getByRole("button", { name: "Ask agent" }).click();
    await page.keyboard.type("Make this heading friendlier");
    await page.keyboard.press("Enter");
    const woken = await held;
    expect(woken.requests.map((item: { text: string }) => item.text)).toEqual(["Make this heading friendlier"]);
    expect(woken.watch.waitsLeft).toBe(24);
    const [asked] = woken.requests;
    expect(asked.element.html).toContain("<h1");
    await expect(page.locator(".agent-pin").first()).toHaveAttribute("data-state", "seen");
    // Ask, the held wait and the take made no hub call: they live in this browser and the socket.
    expect(requests, "no /api/agent or polling while Watch waits").toEqual([]);

    // Replying reaches the pin over the socket.
    expect((await call("reply_to_request", { request: asked.id, status: "done", message: "Made it friendlier." })).state).toBe("done");
    await expect(page.locator(".agent-pin").first()).toHaveAttribute("data-state", "done");
    expect((await call("get_selection", { request: asked.id })).state).toBe("done");

    // An empty Watch wait runs out on its own (10 s asked: held about 9 s inside the relay's budget) and
    // invites the next call, but never renews Watch: its deadline stays, only the count moves.
    const before = await record();
    const quietStart = Date.now();
    const timedOut = await call("wait_for_requests", { waitSeconds: 10 });
    expect(Date.now() - quietStart).toBeGreaterThan(7_000);
    expect(timedOut.requests).toEqual([]);
    expect(timedOut.hint).toContain("you may call wait_for_requests again now");
    expect(await record()).toEqual({ ...before, waits: before.waits + 1 });

    // Expiry (forced by its own record): the next wait answers at once, paused; no renewal, the
    // connection stays and a separate edit still applies.
    await page.evaluate(key => {
      const value = JSON.parse(localStorage.getItem(key)!);
      const until = Date.now() - 1;
      localStorage.setItem(key, JSON.stringify({ ...value, startedAt: until - 600_000, until }));
    }, watchKey);
    const endedAt = Date.now();
    const ended = await call("wait_for_requests");
    expect(Date.now() - endedAt).toBeLessThan(8_000);
    expect(ended.hint).toContain("Watch ended, so stop waiting");
    await page.locator(".repository-menu__trigger").click();
    await expect(watchText).toContainText("Watch paused at");
    await expect(page.getByRole("button", { name: "Watch again" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("watch-paused.png") });
    await expect(action).toHaveText("Disconnect MCP");
    expect((await call("write_file", { path: "after-watch.txt", content: "still connected" })).state).toBe("applied");
    expect(requests.filter(request => request.path === "/api/agent/revoke"), "expiry revokes nothing").toEqual([]);
  } finally {
    await client.close();
  }
});

test("live: another tab of this browser shows the agent's progress on a request without a reload", { tag: "@live" }, async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  const client = new Client({ name: "two-tab-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const other = await context.newPage();
  try {
    expect((await call("wait_for_requests")).requests).toEqual([]);
    await expect(page.locator(".agent-menu__action")).toHaveText("Disconnect MCP");
    await page.keyboard.press("Escape");
    await page.frameLocator(".native-preview-frame").locator(".hero h1").click();
    await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Ask agent" }).click();
    await page.keyboard.type("Seen from the other tab");
    await page.keyboard.press("Enter");
    await expect(page.locator(".agent-pin")).toHaveCount(1);
    // A second tab of the same site shows the request from this browser's records (its agents are on, another tab receives).
    await open(other, baseURL);
    const pin = other.locator(".agent-pin").first();
    await expect(pin).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    const [request] = (await call("wait_for_requests")).requests;
    expect(request.text).toBe("Seen from the other tab");
    await expect(pin).toHaveAttribute("data-state", "seen");
    await call("reply_to_request", { request: request.id, status: "question", message: "Which words?" });
    await expect(pin).toHaveAttribute("data-state", "question");
  } finally {
    await other.close();
    await client.close();
  }
});

test("relay paused by owner: one explicit attempt, one manual Retry, no reconnect loop; manual edits and browser drafts survive", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
  await heading.dblclick();
  await expect(heading).toHaveAttribute("contenteditable", /.+/);
  await heading.fill("Draft before pause");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await storedDrafts(page)).find(draft => draft.path === "index.html")?.content).toContain("Draft before pause");
  const before = await storedDrafts(page);
  const grant = await (await page.request.post(`${baseURL}/api/agent/connect`, { headers: { Origin: baseURL! }, data: { repo: "native-demo-user/native-demo", repoId: 501, branch: "main" } })).json() as { id: string };
  expect(grant.id).toBeTruthy();
  expect((await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { relay: false } })).status()).toBe(204);
  await page.clock.install();
  const requests = agentRequests(page);
  let sockets = 0;
  page.on("websocket", socket => { if (socket.url().includes("/api/agent/relay")) sockets++; });
  await page.locator(".repository-menu__trigger").click();
  await page.clock.runFor(65_000);
  expect(requests, "opening the remote-off menu stays quiet").toEqual([]);
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const hint = page.locator(".agent-menu__hint");
  await expect(hint).toHaveText("Remote agents are paused by the site owner.");
  expect(requests).toEqual([{ method: "GET", path: "/api/agent/connections" }]);
  await page.screenshot({ path: test.info().outputPath("owner-paused.png") });
  await page.clock.runFor(600_000);
  await setVisibility(page, "hidden");
  await page.clock.runFor(65_000);
  await setVisibility(page, "visible");
  await page.clock.runFor(65_000);
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(hint).toHaveText("Remote agents are paused by the site owner.");
  await page.clock.runFor(600_000);
  expect(requests).toEqual(Array.from({ length: 2 }, () => ({ method: "GET", path: "/api/agent/connections" })));
  expect(sockets).toBe(0);
  expect(await storedDrafts(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await heading.dblclick();
  await heading.fill("Manual edit during pause");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await storedDrafts(page)).find(draft => draft.path === "index.html")?.content).toContain("Manual edit during pause");
  await page.reload();
  await expect(heading).toHaveText("Manual edit during pause", { timeout: 30_000 });
  expect((await storedDrafts(page)).find(draft => draft.path === "index.html")?.content).toContain("Manual edit during pause");
  // Remembered on for this site: the reload checks once, finds agents still paused and opens no socket.
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2]).toEqual({ method: "GET", path: "/api/agent/connections" });
  expect(sockets).toBe(0);
  // Removing access remains possible even though the paused check cannot list grants.
  await page.locator(".repository-menu__trigger").click();
  await expect(hint).toHaveText("Remote agents are paused by the site owner.");
  await page.getByRole("button", { name: "Disconnect MCP", exact: true }).click();
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
  expect(requests.at(-1)).toEqual({ method: "POST", path: "/api/agent/revoke" });
  await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { relay: true } });
  const remaining = await (await page.request.get(`${baseURL}/api/agent/connections`)).json() as { grants: { id: string }[] };
  expect(remaining.grants.some(entry => entry.id === grant.id)).toBe(false);
});

test("Watch paused by owner: the existing connection check updates the menu; quiet tools and edits remain available", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  expect((await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { watch: false } })).status()).toBe(204);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  const client = new Client({ name: "watch-paused", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  try {
    const requests = agentRequests(page);
    const result = await client.callTool({ name: "wait_for_requests", arguments: {} });
    await expect(page.locator(".agent-menu__action")).toHaveText("Disconnect MCP", { timeout: 15_000 });
    await expect(page.locator(".agent-menu__watch-text")).toHaveText("Watch is paused by the site owner.");
    await expect(page.getByRole("button", { name: "Watch for requests", exact: true })).toBeHidden();
    expect(result.isError).toBeFalsy();
    const value = JSON.parse((result.content as { text: string }[])[0].text);
    expect(value.requests).toEqual([]);
    expect(value.hint).toBe("Watch is paused by the site owner. Agents still get requests when they ask.");
    expect((await client.callTool({ name: "write_file", arguments: { path: "watch-paused.txt", content: "still available" } })).isError).toBeFalsy();
    expect(requests).toEqual([]);
  } finally { await client.close(); }
});
