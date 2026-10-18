import { readFileSync } from "node:fs";
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { textHash, type AgentCommand } from "../../shared/agent";

// Default native-save fixture. Relay mocked in the browser; the fixture's Worker stays unchanged.
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}
async function connect(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
}
const visible = (page: Page, state: string) => page.evaluate(state => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}, state);

test("live commands correlate results; visible and hidden idle sends no HTTP; another tab requires explicit takeover", async ({ page, context, baseURL }) => {
  const requests: string[] = [], results: any[] = [], handshakes: any[] = [];
  let socket: WebSocketRoute | undefined;
  await context.route("**/api/agent/hub", route => route.fulfill({ json: {
    grants: [{ id: "live-grant", repoId: 501, repo: "native-demo-user/native-demo", branch: "main", via: "oauth", client: "Live agent", createdAt: Date.now() }],
    tabId: null, updatedAt: null, commands: [], requests: [],
  } }));
  await context.routeWebSocket("**/api/agent/relay?*", route => {
    socket = route;
    route.onMessage(message => {
      if (message === "ping") { route.send("pong"); return; }
      const value = JSON.parse(String(message));
      if (value.type === "handshake") { handshakes.push(value); route.send(JSON.stringify({ ...value, type: "ready" })); }
      else if (value.type === "result") results.push(value);
    });
  });
  await page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", event => {
          if (event.data === "pong") document.documentElement.dataset.agentPongs = String(Number(document.documentElement.dataset.agentPongs ?? 0) + 1);
        });
      }
    };
  });
  await open(page, baseURL);
  await page.clock.install();
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/agent/") || path === "/mcp") requests.push(path);
  });
  await connect(page);
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "connected");
  await expect.poll(() => handshakes.length).toBe(1);
  expect(requests).toEqual(["/api/agent/hub"]);
  const source = readFileSync("fixtures/native-starter/index.html", "utf8");
  const { commit } = await (await page.request.get(`${baseURL}/__demo/head`)).json() as { commit: string };
  const command: AgentCommand = { id: "live-operation", operation: "write_file", path: "index.html", content: source.replace("A native browser preview", "Live transport edit"),
    expectedHash: await textHash(source), branch: "main", commit, repoId: 501, grantId: "live-grant", state: "pending", createdAt: Date.now() };
  // Atomic writes prove their source hash and workspace; the host supplies the current revision.
  socket!.send(JSON.stringify({ ...handshakes[0], type: "command", id: "correlated-call", command }));
  await expect.poll(() => results.length).toBe(1);
  expect(results[0], JSON.stringify(results[0])).toMatchObject({ type: "result", id: "correlated-call", tabId: handshakes[0].tabId, generation: handshakes[0].generation,
    result: { state: "applied", operationId: "live-operation" } });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText("Live transport edit");
  const after = requests.length;
  // Stop at each ping so Playwright's external mocked server can deliver pong before advancing its deadline.
  await page.clock.runFor(45_000);
  await expect(page.locator("html")).toHaveAttribute("data-agent-pongs", "1");
  await page.clock.runFor(20_000);
  await visible(page, "hidden");
  await page.clock.runFor(25_000);
  await expect(page.locator("html")).toHaveAttribute("data-agent-pongs", "2");
  await page.clock.runFor(40_000);
  expect(requests.slice(after)).toEqual([]);
  expect(handshakes).toHaveLength(1);

  const second = await context.newPage();
  await open(second, baseURL); await connect(second);
  await expect(second.locator(".agent-menu__hint")).toContainText("Another tab");
  await expect(second.getByRole("button", { name: "Take over", exact: true })).toBeVisible();
  expect(handshakes).toHaveLength(1);
  await second.getByRole("button", { name: "Take over", exact: true }).click();
  await expect.poll(() => handshakes.length).toBe(2);
  await visible(page, "visible");
  await expect(page.locator(".agent-menu__hint")).toContainText("Another tab took over");
  expect(handshakes[1].generation).toBeGreaterThan(handshakes[0].generation);
  await second.close();
});
