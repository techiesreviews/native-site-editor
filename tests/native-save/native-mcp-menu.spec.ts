import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// The MCP menu's three states (Lex, 2026-10-23): Connect to MCP, Wait for MCP, Disconnect MCP.
// One button and its dot; feedback on the button itself, never a toast, hint or link.
// Default native-save fixture: the real Worker, relay and socket, proxied only to cut it.

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}
const dot = (page: Page) => page.locator(".agent-menu__action").evaluate(element => {
  const style = getComputedStyle(element, "::before");
  return { color: style.backgroundColor, animation: style.animationName };
});
/** The menu shows only its button's label: no hint, link, Watch control or tab text. */
async function onlyLabel(page: Page, label: string) {
  await expect(page.locator(".agent-menu")).toHaveText(label, { useInnerText: true });
  await expect(page.locator(".editor-toast")).toHaveCount(0);
}
async function agent(baseURL: string | undefined, token: string, name: string) {
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name: tool, arguments: args });
    expect(response.isError, `${name} ${tool}: ${JSON.stringify(response)}`).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  return { client, call };
}
/** The theme's problem colour, as a dot's background computes it. */
const danger = (page: Page) => page.evaluate(() => {
  const probe = document.createElement("div");
  probe.style.background = "var(--danger)";
  document.querySelector(".agent-menu")!.append(probe);
  const colour = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return colour;
});
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("Connect to MCP → Wait for MCP → Disconnect MCP: the label confirms each copy, two agents share one connection, Disconnect ends both, the dot follows", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // The fixture asks for reduced motion; this case checks the pulse itself.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const action = page.locator(".agent-menu__action"), menu = page.locator(".agent-menu");

  // Connect to MCP: off, a grey dot.
  await expect(action).toHaveText("Connect to MCP");
  await onlyLabel(page, "Connect to MCP");
  const off = await dot(page);
  await page.screenshot({ path: test.info().outputPath("menu-connect.png") });

  // Pressing it copies the prompt; the label confirms on the button (no toast), then reads Wait for MCP.
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await action.click();
  const { token } = await (await made).json() as { token: string };
  await expect(action).toHaveText("Copied");
  await expect(page.locator(".editor-toast")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`Authorization: \`Bearer ${token}\`[\\s\\S]*Start a "watchdog" subagent`));
  await expect(action).toHaveText("Wait for MCP");
  await expect(menu).toHaveAttribute("data-state", "waiting");
  await onlyLabel(page, "Wait for MCP");
  const waiting = await dot(page);
  expect(waiting.animation, "the dot pulses while waiting").toBe("agent-menu-pulse");
  expect(waiting.color).not.toBe(off.color);
  await page.screenshot({ path: test.info().outputPath("menu-wait.png") });

  // Wait for MCP copies the same prompt again, confirmed on the button.
  await page.evaluate(() => navigator.clipboard.writeText("something else"));
  await action.click();
  await expect(action).toHaveText("Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`Authorization: \`Bearer ${token}\``);
  await expect(action).toHaveText("Wait for MCP");

  // An agent connects: Disconnect MCP, a green dot.
  const first = await agent(baseURL, token, "first-agent");
  const second = await agent(baseURL, token, "second-agent");
  try {
    expect((await first.call("get_site")).repository).toBe("native-demo-user/native-demo");
    await expect.poll(async () => { await refresh(page); return action.textContent(); }, { timeout: 15_000 }).toBe("Disconnect MCP");
    await expect(menu).toHaveAttribute("data-state", "connected");
    await onlyLabel(page, "Disconnect MCP");
    const connected = await dot(page);
    expect(connected.color).not.toBe(waiting.color);
    expect(connected.animation).toBe("none");
    await page.screenshot({ path: test.info().outputPath("menu-disconnect.png") });

    // A second agent joins the same connection and prompt: both watchdogs wait at once, and a
    // request reaches exactly one of them.
    expect((await second.call("get_site")).repository).toBe("native-demo-user/native-demo");
    const waits = [first.call("wait_for_requests", { waitSeconds: 10 }), second.call("wait_for_requests", { waitSeconds: 10 })];
    await page.keyboard.press("Escape");
    await page.frameLocator(".native-preview-frame").locator(".hero h1").click();
    await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Ask agent" }).click();
    await page.keyboard.type("Shared by both agents");
    await page.keyboard.press("Enter");
    const answers = await Promise.all(waits);
    expect(answers.flatMap(answer => answer.requests.map((request: { text: string }) => request.text))).toEqual(["Shared by both agents"]);
    for (const answer of answers) expect(answer.hint ?? "").not.toMatch(/already|one at a time|Do not call/);

    // Disconnect MCP ends every agent on the connection; the button and dot return to Connect to MCP.
    await page.locator(".repository-menu__trigger").click();
    await action.click();
    await expect(action).toHaveText("Connect to MCP");
    await expect(menu).toHaveAttribute("data-state", "off");
    await onlyLabel(page, "Connect to MCP");
    expect(await dot(page)).toEqual(off);
    await expect(first.client.callTool({ name: "get_site", arguments: {} })).rejects.toThrow();
    await expect(second.client.callTool({ name: "get_site", arguments: {} })).rejects.toThrow();
  } finally {
    await first.client.close().catch(() => undefined);
    await second.client.close().catch(() => undefined);
  }
});

test("a lost connection returns the button to Connect to MCP with no toast or text; the dot shows it", async ({ page, context, baseURL }) => {
  // The tab's relay socket goes through to the real Worker until it is cut, then cannot reconnect.
  let cut = false;
  const sockets: WebSocketRoute[] = [];
  await context.routeWebSocket("**/api/agent/relay?*", route => {
    if (cut) { void route.close(); return; }
    sockets.push(route);
    route.connectToServer();
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const action = page.locator(".agent-menu__action"), menu = page.locator(".agent-menu");
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await action.click();
  const { token } = await (await made).json() as { token: string };
  const { client, call } = await agent(baseURL, token, "lost-agent");
  try {
    await call("get_site");
    await expect.poll(async () => { await refresh(page); return action.textContent(); }, { timeout: 15_000 }).toBe("Disconnect MCP");
    const connected = await dot(page);

    cut = true;
    for (const socket of sockets) await socket.close();
    await expect(action).toHaveText("Connect to MCP", { timeout: 15_000 });
    await expect(menu).toHaveAttribute("data-state", /reconnecting|paused/);
    await onlyLabel(page, "Connect to MCP");
    expect((await dot(page)).color).not.toBe(connected.color);
    await page.screenshot({ path: test.info().outputPath("menu-lost.png") });
  } finally { await client.close().catch(() => undefined); }
});

test("reduced motion: the dot does not pulse while waiting or reconnecting", async ({ page, context, baseURL }) => {
  let cut = false;
  const sockets: WebSocketRoute[] = [];
  await context.routeWebSocket("**/api/agent/relay?*", route => {
    if (cut) { void route.close(); return; }
    sockets.push(route);
    route.connectToServer();
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const action = page.locator(".agent-menu__action"), menu = page.locator(".agent-menu");
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await action.click();
  const { token } = await (await made).json() as { token: string };
  await expect(action).toHaveText("Wait for MCP");
  expect((await dot(page)).animation).toBe("none");
  const { client, call } = await agent(baseURL, token, "calm-agent");
  try {
    await call("get_site");
    await expect.poll(async () => { await refresh(page); return action.textContent(); }, { timeout: 15_000 }).toBe("Disconnect MCP");
    cut = true;
    for (const socket of sockets) await socket.close();
    await expect(menu).toHaveAttribute("data-state", "reconnecting", { timeout: 15_000 });
    expect((await dot(page)).animation).toBe("none");
  } finally { await client.close().catch(() => undefined); }
});

test("a second tab on the site shows Wait for MCP while the first tab's prompt waits; its press copies its own prompt and the first token keeps working", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.locator(".agent-menu__action").click();
  const first = (await (await made).json() as { token: string }).token;
  await expect(page.locator(".agent-menu__action")).toHaveText("Wait for MCP");
  const second = await context.newPage();
  try {
    // Remembered on for this site: the second tab comes back with agents on and the waiting token.
    await open(second, baseURL);
    await second.locator(".repository-menu__trigger").click();
    const action = second.locator(".agent-menu__action");
    await expect(action).toHaveText("Wait for MCP", { timeout: 15_000 });
    await onlyLabel(second, "Wait for MCP");
    const own = second.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
    await action.click();
    const { token } = await (await own).json() as { token: string };
    expect(token).not.toBe(first);
    await expect.poll(() => second.evaluate(() => navigator.clipboard.readText())).toContain(`Bearer ${token}`);
    for (const each of [first, token]) {
      const response = await page.request.post(`${baseURL}/mcp`, {
        headers: { Authorization: `Bearer ${each}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
      expect(response.status(), "both tabs' tokens answer").toBe(200);
    }
  } finally { await second.close(); }
});

test("Disconnect MCP also ends an agent that connected after the menu last read its connections", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const action = page.locator(".agent-menu__action");
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await action.click();
  const { token } = await (await made).json() as { token: string };
  const seen = await agent(baseURL, token, "seen-agent");
  try {
    await seen.call("get_site");
    await expect.poll(async () => { await refresh(page); return action.textContent(); }, { timeout: 15_000 }).toBe("Disconnect MCP");
    // A connection the menu never reads (connected, it reads no more): made in this session, then used.
    const late = await (await page.request.post(`${baseURL}/api/agent/connect`, { headers: { Origin: baseURL! },
      data: { repo: "native-demo-user/native-demo", repoId: 501, branch: "main" } })).json() as { token: string };
    const unseen = await agent(baseURL, late.token, "unseen-agent");
    try {
      await unseen.call("get_site");
      await action.click();
      await expect(action).toHaveText("Connect to MCP");
      await expect(unseen.client.callTool({ name: "get_site", arguments: {} })).rejects.toThrow();
      await expect(seen.client.callTool({ name: "get_site", arguments: {} })).rejects.toThrow();
    } finally { await unseen.client.close().catch(() => undefined); }
  } finally { await seen.client.close().catch(() => undefined); }
});

test("a refused copy: the label never reads Copied and stays Wait for MCP, with no toast", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) });
  });
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const action = page.locator(".agent-menu__action");
  // Every label the button shows from here on.
  await action.evaluate(element => {
    const host = window as Window & { agentLabels?: string[] };
    host.agentLabels = [];
    new MutationObserver(() => host.agentLabels!.push(element.textContent ?? "")).observe(element, { subtree: true, childList: true, characterData: true });
  });
  await action.click();
  await expect(action).toHaveText("Wait for MCP", { timeout: 15_000 });
  await action.click();
  // fixed-wait: longer than the 2 s confirmation, so a wrong Copied would have shown and gone.
  await page.waitForTimeout(2_500);
  await expect(action).toHaveText("Wait for MCP");
  expect(await page.evaluate(() => (window as Window & { agentLabels?: string[] }).agentLabels)).not.toContain("Copied");
  await onlyLabel(page, "Wait for MCP");
});

test("unused tokens never fill the site's five connections: five reloads, each pressing Wait for MCP, still copy a working prompt", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  const connect = () => page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST" && response.ok());
  const list = (token: string) => page.request.post(`${baseURL}/mcp`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  await page.locator(".repository-menu__trigger").click();
  let made = connect();
  await page.locator(".agent-menu__action").click();
  let token = (await (await made).json() as { token: string }).token;
  for (let round = 0; round < 5; round++) {
    await page.reload();
    await open(page, baseURL);
    await page.locator(".repository-menu__trigger").click();
    const action = page.locator(".agent-menu__action");
    await expect(action).toHaveText("Wait for MCP", { timeout: 15_000 });
    made = connect();
    await action.click();
    token = (await (await made).json() as { token: string }).token;
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { message: `round ${round}` }).toContain(`Bearer ${token}`);
    await expect(action).toHaveText("Wait for MCP");
    const { grants } = await (await page.request.get(`${baseURL}/api/agent/connections`)).json() as { grants: unknown[] };
    expect(grants.length, `round ${round}`).toBeLessThanOrEqual(5);
  }
  expect((await list(token)).status(), "the last prompt works").toBe(200);
});

test("while the site owner pauses agents the menu offers Connect to MCP; once unpaused it comes back to Disconnect MCP, which ends the agent", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const action = page.locator(".agent-menu__action"), menu = page.locator(".agent-menu");
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await action.click();
  const { token } = await (await made).json() as { token: string };
  const { client, call } = await agent(baseURL, token, "paused-agent");
  try {
    await call("get_site");
    await expect.poll(async () => { await refresh(page); return action.textContent(); }, { timeout: 15_000 }).toBe("Disconnect MCP");
    expect((await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { relay: false } })).status()).toBe(204);
    // A reload checks once and finds agents paused: the dot shows it, the button offers Connect to MCP.
    await page.reload();
    await open(page, baseURL);
    await page.locator(".repository-menu__trigger").click();
    await expect(menu).toHaveAttribute("data-state", "paused", { timeout: 15_000 });
    await onlyLabel(page, "Connect to MCP");
    // The dot is the problem colour, not the plain off grey.
    const paused = await dot(page);
    expect(paused.color).toBe(await danger(page));
    expect(paused.color).not.toBe("rgba(0, 0, 0, 0)");
    // The permission itself still holds (CONTEXT.md "Agent connection"): unpaused, the agent works again.
    expect((await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { relay: true } })).status()).toBe(204);
    await action.click();
    await expect(action).toHaveText("Disconnect MCP", { timeout: 15_000 });
    await action.click();
    await expect(action).toHaveText("Connect to MCP");
    await expect(client.callTool({ name: "get_site", arguments: {} })).rejects.toThrow();
  } finally {
    await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { relay: true } });
    await client.close().catch(() => undefined);
  }
});

test("another tab receives and nothing is connected: Connect to MCP in this tab makes and copies a prompt", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  await page.locator(".agent-menu__action").click();
  await expect(page.locator(".agent-menu__action")).toHaveText("Wait for MCP", { timeout: 15_000 });
  const second = await context.newPage();
  try {
    // The second tab's check goes unanswered: agents stay on with no connections known, another tab receiving.
    let first = true;
    await second.route("**/api/agent/connections", route => {
      if (!first) return route.continue();
      first = false;
      return route.abort();
    });
    await open(second, baseURL);
    await second.locator(".repository-menu__trigger").click();
    const action = second.locator(".agent-menu__action");
    await expect(second.locator(".agent-menu")).toHaveAttribute("data-state", "other-owner", { timeout: 30_000 });
    await expect(action).toHaveText("Connect to MCP");
    const made = second.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
    await action.click();
    const { token } = await (await made).json() as { token: string };
    await expect(action).toHaveText("Copied");
    await expect.poll(() => second.evaluate(() => navigator.clipboard.readText())).toContain(`Bearer ${token}`);
  } finally { await second.close(); }
});

test("a prompt another tab revoked as unused is never copied again: Wait for MCP makes a working one", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const list = (token: string) => page.request.post(`${baseURL}/mcp`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  const connect = (tab: Page) => tab.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  let made = connect(page);
  await page.locator(".agent-menu__action").click();
  const first = (await (await made).json() as { token: string }).token;
  await expect(page.locator(".agent-menu__action")).toHaveText("Wait for MCP");
  const second = await context.newPage();
  try {
    await open(second, baseURL);
    await second.locator(".repository-menu__trigger").click();
    await expect(second.locator(".agent-menu__action")).toHaveText("Wait for MCP", { timeout: 15_000 });
    // Three minutes on: the first tab's token is old enough to be reclaimed.
    await second.clock.setSystemTime(Date.now() + 3 * 60_000);
    made = connect(second);
    await second.locator(".agent-menu__action").click();
    const own = (await (await made).json() as { token: string }).token;
    await expect.poll(async () => (await list(first)).status(), { message: "the first tab's unused token was reclaimed" }).toBe(401);
    // Back to the real time (the clock is the browser context's, both tabs'): the second tab's token is fresh.
    await second.clock.setSystemTime(Date.now());
    // The first tab still offers Wait for MCP (the second tab's token waits); its press copies a token that works.
    await page.bringToFront();
    await expect(page.locator(".agent-menu__action")).toHaveText("Wait for MCP");
    made = connect(page);
    await page.locator(".agent-menu__action").click();
    const again = (await (await made).json() as { token: string }).token;
    expect(again).not.toBe(first);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`Bearer ${again}`);
    expect((await list(again)).status()).toBe(200);
    expect((await list(own)).status(), "the second tab's fresh token stays").toBe(200);
  } finally { await second.close(); }
});

test("a failed connect revokes nothing: another tab's fresh prompt keeps working, and the dot shows the failed press", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.locator(".agent-menu__action").click();
  const first = (await (await made).json() as { token: string }).token;
  const second = await context.newPage();
  try {
    await open(second, baseURL);
    await second.locator(".repository-menu__trigger").click();
    const action = second.locator(".agent-menu__action");
    await expect(action).toHaveText("Wait for MCP", { timeout: 15_000 });
    let refused = 0;
    await second.route("**/api/agent/connect", route => { refused++; return route.fulfill({ status: 500, json: { error: "Internal error" } }); });
    await action.click();
    await expect(second.locator(".agent-menu")).toHaveAttribute("data-state", "failed");
    expect(refused).toBe(1);
    await onlyLabel(second, "Connect to MCP");
    expect((await dot(second)).color).toBe(await danger(second));
    const response = await page.request.post(`${baseURL}/mcp`, {
      headers: { Authorization: `Bearer ${first}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(response.status(), "the first tab's token was not revoked").toBe(200);
  } finally { await second.close(); }
});

test("a failed first prompt: Connect to MCP shows the problem dot, not the plain off one, with no toast; the next press tries again", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const action = page.locator(".agent-menu__action"), menu = page.locator(".agent-menu");
  const off = await dot(page);
  let refuse = true;
  await page.route("**/api/agent/connect", route => refuse ? route.fulfill({ status: 500, json: { error: "Internal error" } }) : route.continue());
  await action.click();
  await expect(menu).toHaveAttribute("data-state", "failed");
  await onlyLabel(page, "Connect to MCP");
  const failed = await dot(page);
  expect(failed.color).not.toBe(off.color);
  expect(failed.color).toBe(await danger(page));
  refuse = false;
  await action.click();
  await expect(action).toHaveText("Wait for MCP", { timeout: 15_000 });
});
