import { readFileSync } from "node:fs";
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { textHash, type AgentCommand } from "../../shared/agent";
import type { AgentRead } from "../../shared/agent-read";

// Default native-save fixture. The first test injects commands before MCP edits migrate (ticket 16).
// The token/idle test and native-agent-reads.spec.ts use the fixture's real relay socket.
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}
async function connect(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
}
async function countPongs(page: Page) {
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
}
const visible = (page: Page, state: string) => page.evaluate(state => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}, state);

test("live commands correlate results; visible and hidden idle sends no HTTP; another tab takes over by itself when the owner closes", async ({ page, context, baseURL }) => {
  const requests: string[] = [], results: any[] = [], handshakes: any[] = [];
  let socket: WebSocketRoute | undefined;
  await context.route("**/api/agent/connections", route => route.fulfill({ json: {
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
  await countPongs(page);
  await open(page, baseURL);
  await page.clock.install();
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/agent/") || path === "/mcp") requests.push(path);
  });
  await connect(page);
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "connected");
  await expect.poll(() => handshakes.length).toBe(1);
  // The press reads the connections, then still makes and copies a prompt beside the connected agent.
  await expect.poll(() => requests).toEqual(["/api/agent/connections", "/api/agent/connections", "/api/agent/connect", "/api/agent/connections"]);
  // A second tab already showing the page before the owner's edit (its editor holds the old text).
  const second = await context.newPage();
  await open(second, baseURL);
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
  // Reads run through the lazy browser registry and see the just-applied unsaved draft.
  const reads: AgentRead[] = [
    { operation: "read", tool: "read_file", args: { path: "index.html" } },
    { operation: "read", tool: "get_site", args: {} },
    { operation: "read", tool: "get_page", args: { page: "/", source: false } },
  ];
  for (const [index, read] of reads.entries()) {
    socket!.send(JSON.stringify({ ...handshakes[0], type: "command", id: `read-${index}`, command: read }));
    await expect.poll(() => results.length).toBe(index + 2);
    expect(results[index + 1]).toMatchObject({ id: `read-${index}`, result: { ok: true } });
  }
  expect(results[1].result.value).toMatchObject({ source: "draft", content: command.content, hash: await textHash(command.content) });
  expect(results[2].result.value.changes).toContainEqual({ path: "index.html", kind: "M" });
  expect(results[3].result.value).toMatchObject({ file: "index.html", source: "draft", hash: results[1].result.value.hash });
  expect(results[3].result.value.html).toBeUndefined();
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

  // Remote agents are remembered on for this site: the second tab is on without Connect.
  // It offers Disconnect MCP with no tab text: another tab receives.
  await second.locator(".repository-menu__trigger").click();
  await expect(second.locator(".agent-menu")).toHaveAttribute("data-state", "other-owner");
  await expect(second.locator(".agent-menu__action")).toHaveText("Disconnect MCP");
  expect(handshakes).toHaveLength(1);
  await page.close();
  await expect.poll(() => handshakes.length, { timeout: 15_000 }).toBe(2);
  await expect(second.locator(".agent-menu")).toHaveAttribute("data-state", "connected");
  expect(handshakes[1].generation).toBeGreaterThan(handshakes[0].generation);
  // Takeover loaded the owner's committed draft into the open editor and preview.
  await expect(second.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText("Live transport edit");
  await second.close();
});

test("a copied token shows connected after its agent uses it: one hub read on return, no polling", async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  let grants: object[] = [];
  await context.route("**/api/agent/connections", route => route.fulfill({ json: { grants, tabId: null, updatedAt: null, commands: [], requests: [] } }));
  await context.route("**/api/agent/connect", route => {
    grants = [{ id: "token-grant", repoId: 501, repo: "native-demo-user/native-demo", branch: "main", via: "token", createdAt: Date.now() }];
    return route.fulfill({ json: { id: "token-grant", token: "ase_test" } });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await countPongs(page);
  await open(page, baseURL);
  await page.clock.install();
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/agent/") || path === "/mcp") requests.push(path);
  });
  await connect(page);
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "waiting");
  const before = requests.length;
  // Stop at the ping so the fixture relay's pong arrives before its 10 s deadline.
  await page.clock.runFor(45_000);
  await expect(page.locator("html")).toHaveAttribute("data-agent-pongs", "1");
  await page.clock.runFor(20_000);
  expect(requests.slice(before)).toEqual([]);
  grants = [{ ...grants[0], usedAt: Date.now() }];
  await visible(page, "hidden");
  await visible(page, "visible");
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "connected");
  expect(requests.slice(before)).toEqual(["/api/agent/connections"]);
  await page.clock.runFor(30_000);
  await expect(page.locator("html")).toHaveAttribute("data-agent-pongs", "2");
  await page.clock.runFor(35_000);
  await visible(page, "hidden");
  await visible(page, "visible");
  expect(requests.slice(before)).toEqual(["/api/agent/connections"]);
});
