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
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("Connect to MCP → Wait for MCP → Disconnect MCP: the label confirms each copy, two agents share one connection, Disconnect ends both, the dot follows", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`Authorization: \`Bearer ${token}\``);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Start a "watchdog" subagent');
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
