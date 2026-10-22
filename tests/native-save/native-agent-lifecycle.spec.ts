import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { editorMounted } from "./drafts";

// Default native-save fixture: real Worker routes, relay core and browser sockets.
// No page routes or WebSocket mocks. The reset hook is isolated to this sign-in.
type Frame = { type: string; reason?: string; generation?: number; id?: string; command?: { id?: string; tool?: string } };
function frames(page: Page) {
  const received: Frame[] = [], sent: Frame[] = [];
  page.on("websocket", socket => {
    if (!socket.url().includes("/api/agent/relay?")) return;
    socket.on("framereceived", ({ payload }) => { const text = String(payload); if (text.startsWith("{")) received.push(JSON.parse(text)); });
    socket.on("framesent", ({ payload }) => { const text = String(payload); if (text.startsWith("{")) sent.push(JSON.parse(text)); });
  });
  return { received, sent, ready: () => received.filter(frame => frame.type === "ready"), commands: () => received.filter(frame => frame.type === "command") };
}
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await editorMounted(page);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
}
async function enable(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
}
async function connect(page: Page, baseURL: string | undefined) {
  const traffic = frames(page);
  await open(page, baseURL);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await enable(page);
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => traffic.ready().length).toBe(1);
  const client = new Client({ name: "lifecycle-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return JSON.parse((result.content as { text: string }[])[0].text);
  };
  return { traffic, token, client, call };
}
const heading = (page: Page) => page.frameLocator(".native-preview-frame").locator(".hero h1");
const durable = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("native-site-editor-drafts");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const read = (name: string) => new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return { drafts: await read("drafts"), receipts: await read("receipts") };
  } finally { db.close(); }
});

// Keep a real transaction ahead of every agent admission/commit. Its observable
// command/cancel frames order the race; releasing it never writes a draft.
async function holdCommit(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("native-site-editor-drafts");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["workspaces", "receipts", "drafts"], "readwrite");
    let held = true;
    const host = window as Window & { releaseAgentCommit?: () => void };
    host.releaseAgentCommit = () => { held = false; delete host.releaseAgentCommit; };
    tx.oncomplete = () => db.close(); tx.onabort = () => db.close();
    const keep = () => { const request = tx.objectStore("workspaces").get("lifecycle-test-gate"); request.onsuccess = () => { if (held) keep(); }; };
    keep();
  });
}
const releaseCommit = (page: Page) => page.evaluate(() => (window as Window & { releaseAgentCommit?: () => void }).releaseAgentCommit?.());

test("two tabs: explicit takeover raises generation; old owner is taken over and drafts survive", async ({ page, context, baseURL }) => {
  const h = await connect(page, baseURL), second = await context.newPage(), traffic = frames(second);
  try {
    await page.keyboard.press("Escape");
    const read = await h.call("read_file", { path: "index.html" });
    expect((await h.call("edit_file", { path: "index.html", expectedHash: read.hash, edits: [{ oldText: "A native browser preview", newText: "Kept on takeover" }], requestId: "lifecycle-kept" })).state).toBe("applied");
    const before = await durable(page);
    await open(second, baseURL); await second.locator(".repository-menu__trigger").click();
    await expect(second.locator(".agent-menu__hint")).toContainText("Another tab");
    await expect(second.getByRole("button", { name: "Take over", exact: true })).toBeVisible();
    expect(traffic.ready()).toHaveLength(0);
    await second.getByRole("button", { name: "Take over", exact: true }).click();
    await expect.poll(() => traffic.ready().length).toBe(1);
    expect(traffic.ready()[0].generation!).toBeGreaterThan(h.traffic.ready()[0].generation!);
    await expect(heading(second)).toHaveText("Kept on takeover");
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu__hint")).toContainText("Another tab took over");
    expect(await durable(second)).toEqual(before);
    expect((await second.request.get(`${baseURL}/api/session`)).ok()).toBe(true);
  } finally { await h.client.close(); await second.close(); }
});

test("owner close: the other tab with agents on takes over by itself, with no Take over click, and the agent continues", async ({ page, context, baseURL }) => {
  const h = await connect(page, baseURL), second = await context.newPage(), traffic = frames(second);
  try {
    // Remote agents are remembered on for this site: the new tab comes back with them on.
    await open(second, baseURL); await second.locator(".repository-menu__trigger").click();
    await expect(second.locator(".agent-menu__hint")).toContainText("Another tab");
    expect(traffic.ready()).toHaveLength(0);
    await page.close();
    await expect.poll(() => traffic.ready().length, "the remaining tab receives without a click").toBe(1);
    await expect(second.locator(".agent-menu__hint")).not.toContainText(/Another tab|receiving tab closed/);
    expect(traffic.ready()[0].generation!).toBeGreaterThan(h.traffic.ready()[0].generation!);
    expect((await h.call("read_file", { path: "index.html" })).content).toContain("A native browser preview");
  } finally { await h.client.close(); await second.close(); }
});

test("agents stay on: a reload and a new tab on the same site come back with them on, with no new prompt; Disconnect turns them off", async ({ page, context, baseURL }) => {
  const connects: string[] = [];
  context.on("request", request => { if (new URL(request.url()).pathname === "/api/agent/connect") connects.push(request.method()); });
  const h = await connect(page, baseURL);
  try {
    expect((await h.call("read_file", { path: "index.html" })).content).toContain("A native browser preview");
    await page.reload();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect.poll(() => h.traffic.ready().length).toBe(2);
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "connected");
    expect((await h.call("read_file", { path: "index.html" })).content).toContain("A native browser preview");
    const second = await context.newPage();
    try {
      await open(second, baseURL);
      await expect(second.locator(".agent-menu")).toHaveAttribute("data-state", "other-owner");
      expect((await h.call("read_file", { path: "index.html" })).content).toContain("A native browser preview");
    } finally { await second.close(); }
    expect(connects, "no new token or prompt").toEqual(["POST"]);
    await page.locator(".repository-menu__trigger").click();
    await page.getByRole("button", { name: "Disconnect MCP", exact: true }).click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    await page.reload();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    expect(h.traffic.ready()).toHaveLength(2);
  } finally { await h.client.close(); }
});

const agentsOnKey = (branch: string) => `native-site-editor:agents-on:["native-demo-user",501,"${branch}"]`;
const remembered = (page: Page, ...branches: string[]) =>
  page.evaluate(keys => keys.map(key => localStorage.getItem(key)), branches.map(agentsOnKey));
/** Holds every connections check until released; `reached` settles once the first one arrives. */
async function holdChecks(page: Page) {
  let release!: () => void, held!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { held = resolve; });
  await page.route("**/api/agent/connections", async route => { held(); await released; await route.continue().catch(() => undefined); });
  return { reached, release: async () => { release(); await page.unroute("**/api/agent/connections"); } };
}
async function featureBranch(page: Page, baseURL: string | undefined) {
  const index = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature", path: "index.html", content: index } });
}

test("a remembered site stays on when its connections check goes unanswered, and comes back off and forgotten once its connection was removed elsewhere", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    expect(await remembered(page, "main")).toEqual(["1"]);
    await page.route("**/api/agent/connections", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) }));
    await page.reload();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect.poll(() => h.traffic.ready().length, "one socket after an unanswered check").toBe(2);
    await expect(page.locator(".agent-menu")).not.toHaveAttribute("data-state", "off");
    expect(await remembered(page, "main")).toEqual(["1"]);
    await page.unroute("**/api/agent/connections");
    // Disconnected from another browser while no editor tab is open.
    await page.goto("about:blank");
    const revoked = await page.request.post(`${baseURL}/api/agent/revoke`, { headers: { Origin: baseURL! }, data: { all: true } });
    expect(revoked.ok()).toBe(true);
    await open(page, baseURL);
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    expect(await remembered(page, "main")).toEqual([null]);
    expect(h.traffic.ready(), "no socket for a removed connection").toHaveLength(2);
  } finally { await h.client.close(); }
});

test("a permission past its 8 hours while the sign-in lasts: the list leaves it out, so a reload forgets the site and opens no socket", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    // What GET /api/agent/connections answers once createdAt + 8 hours has passed (tests/mcp-oauth.test.ts proves the filter).
    await page.route("**/api/agent/connections", route => route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ grants: [], controls: { watch: true } }) }));
    await page.reload();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect.poll(() => remembered(page, "main")).toEqual([null]);
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    expect(h.traffic.ready(), "no socket for an ended permission").toHaveLength(1);
  } finally { await h.client.close(); }
});

test("an ended sign-in forgets the remembered site: after a reload agents are off with no socket", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    await page.route("**/api/agent/connections", route => route.fulfill({ status: 401, contentType: "application/json",
      body: JSON.stringify({ error: "Sign in again.", code: "signed-out" }) }));
    await page.reload();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect.poll(() => remembered(page, "main")).toEqual([null]);
    await page.unroute("**/api/agent/connections");
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    expect(h.traffic.ready(), "no socket after the sign-in ended").toHaveLength(1);
  } finally { await h.client.close(); }
});

test("a failed first Connect leaves the site forgotten: after a reload agents are off", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // A refusal, not a passing outage (a 503 keeps agents on and retries).
  await page.route("**/api/agent/connect", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "This repository cannot be connected." }) }));
  await enable(page);
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
  expect(await remembered(page, "main")).toEqual([null]);
  await page.unroute("**/api/agent/connect");
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator(".repository-menu__trigger").click();
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
  expect(await remembered(page, "main")).toEqual([null]);
});

test("switching in one tab to another site remembered on brings its agents back on; the site left stays remembered", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    await featureBranch(page, baseURL);
    // Opted in on feature before (an earlier visit): its connection and mark exist.
    const made = await page.request.post(`${baseURL}/api/agent/connect`, { headers: { Origin: baseURL! },
      data: { repo: "native-demo-user/native-demo", repoId: 501, branch: "feature" } });
    expect(made.ok()).toBe(true);
    await page.evaluate(key => localStorage.setItem(key, "1"), agentsOnKey("feature"));
    await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    await expect.poll(() => h.traffic.ready().length, "feature's own socket").toBe(2);
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu")).not.toHaveAttribute("data-state", /off|workspace-changed/);
    expect(await remembered(page, "main", "feature")).toEqual(["1", "1"]);
  } finally { await h.client.close(); }
});

test("a held connections check on resume: a site switch meanwhile opens no socket and leaves both sites' marks alone", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    await featureBranch(page, baseURL);
    // The menu offers no Disconnect before the check answers; a site switch is what can happen.
    const gate = await holdChecks(page);
    await page.reload();
    await gate.reached;
    await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    await gate.release();
    await page.locator(".repository-menu__trigger").click();
    // Agents stay pinned to main, offered here by Move agents here; the stale check changed nothing.
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "workspace-changed");
    expect(await remembered(page, "main", "feature")).toEqual(["1", null]);
    expect(h.traffic.ready(), "no socket for the stale check").toHaveLength(1);
  } finally { await h.client.close(); }
});

test("switching onto a remembered site while the first check is held: its own check runs after, finds its connection removed, forgets it, opens no socket", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    await featureBranch(page, baseURL);
    await page.evaluate(key => localStorage.setItem(key, "1"), agentsOnKey("feature")); // Its connection is gone since.
    const gate = await holdChecks(page);
    await page.reload();
    await gate.reached;
    await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    await gate.release();
    await expect.poll(() => remembered(page, "main", "feature")).toEqual(["1", null]);
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    expect(h.traffic.ready(), "no socket for the removed site").toHaveLength(1);
  } finally { await h.client.close(); }
});

test("switching onto a remembered site while the first check is held, with agents paused: no socket, the site stays remembered", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    await featureBranch(page, baseURL);
    const made = await page.request.post(`${baseURL}/api/agent/connect`, { headers: { Origin: baseURL! },
      data: { repo: "native-demo-user/native-demo", repoId: 501, branch: "feature" } });
    expect(made.ok()).toBe(true);
    await page.evaluate(key => localStorage.setItem(key, "1"), agentsOnKey("feature"));
    const gate = await holdChecks(page);
    await page.reload();
    await gate.reached;
    expect((await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { relay: false } })).status()).toBe(204);
    await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    await gate.release();
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu__hint")).toHaveText("Remote agents are paused by the site owner.");
    expect(await remembered(page, "main", "feature")).toEqual(["1", "1"]);
    expect(h.traffic.ready(), "no socket while paused").toHaveLength(1);
  } finally {
    await page.request.post(`${baseURL}/__demo/agent-controls`, { data: { relay: true } });
    await h.client.close();
  }
});

test("a connections check that never answers: after the API deadline agents stay on and the socket opens; a later switch onto a remembered site still resumes", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const h = await connect(page, baseURL);
  try {
    await featureBranch(page, baseURL);
    const made = await page.request.post(`${baseURL}/api/agent/connect`, { headers: { Origin: baseURL! },
      data: { repo: "native-demo-user/native-demo", repoId: 501, branch: "feature" } });
    expect(made.ok()).toBe(true);
    await page.evaluate(key => localStorage.setItem(key, "1"), agentsOnKey("feature"));
    await page.route("**/api/agent/connections", () => { /* Never answered. */ });
    await page.reload();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect.poll(() => h.traffic.ready().length, { message: "on after the deadline, not stuck connecting", timeout: 30_000 }).toBe(2);
    await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    await expect.poll(() => h.traffic.ready().length, { message: "the remembered site resumes too", timeout: 30_000 }).toBe(3);
    expect(await remembered(page, "main", "feature")).toEqual(["1", "1"]);
  } finally { await page.unroute("**/api/agent/connections"); await h.client.close(); }
});

test("Disconnect in another tab: this tab turns off at once, never takes over, and stays off after a reload", async ({ page, context, baseURL }) => {
  const h = await connect(page, baseURL), second = await context.newPage(), traffic = frames(second);
  try {
    await open(second, baseURL); await second.locator(".repository-menu__trigger").click();
    await expect(second.locator(".agent-menu__hint")).toContainText("Another tab");
    await second.keyboard.press("Escape");
    // The agent has used its connection, so the first tab offers Disconnect.
    expect((await h.call("read_file", { path: "index.html" })).content).toContain("A native browser preview");
    await page.bringToFront();
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      return page.locator(".agent-menu").getAttribute("data-state");
    }, { timeout: 15_000 }).toBe("connected");
    await page.locator(".repository-menu__trigger").click();
    await page.getByRole("button", { name: "Disconnect MCP", exact: true }).click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    expect(await remembered(second, "main")).toEqual([null]);
    await second.locator(".repository-menu__trigger").click();
    await expect(second.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    // fixed-wait: Longer than the succession delay, so a wrong takeover would show.
    await second.waitForTimeout(1_500);
    expect(traffic.ready(), "no takeover of agents turned off").toHaveLength(0);
    await second.reload();
    await expect(second.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await second.locator(".repository-menu__trigger").click();
    await expect(second.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    expect(traffic.ready()).toHaveLength(0);
  } finally { await h.client.close(); await second.close(); }
});

test("Move agents here: the new branch comes back on after a reload and the old one comes back off", async ({ page, context, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    expect((await h.call("read_file", { path: "index.html" })).content).toContain("A native browser preview");
    // The menu learns the agent used its token when the tab is next focused; only used connections move.
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      return page.locator(".agent-menu").getAttribute("data-state");
    }, { timeout: 15_000 }).toBe("connected");
    await featureBranch(page, baseURL);
    await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    await page.locator(".repository-menu__trigger").click();
    await page.getByRole("button", { name: "Move agents here", exact: true }).click();
    await expect.poll(() => h.traffic.ready().length).toBe(2);
    expect(await remembered(page, "main", "feature")).toEqual([null, "1"]);
    await page.reload();
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    await expect.poll(() => h.traffic.ready().length).toBe(3);
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "connected");
    expect((await h.call("read_file", { path: "index.html" })).content).toBeTruthy();
    const old = await context.newPage();
    try {
      let sockets = 0;
      old.on("websocket", socket => { if (socket.url().includes("/api/agent/relay?")) sockets++; });
      await open(old, baseURL);
      await old.locator(".repository-menu__trigger").click();
      await expect(old.locator(".agent-menu")).toHaveAttribute("data-state", "off");
      expect(sockets, "the old branch opens no socket").toBe(0);
    } finally { await old.close(); }
  } finally { await h.client.close(); }
});

test("freeze/resume via persisted pagehide/pageshow: ownership rechecked, no command replay", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    const before = await durable(page), count = h.traffic.commands().length;
    // Exercise the same bfcache lifecycle path used by the transport unit fixture.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    const read = await h.call("read_file", { path: "index.html" });
    expect(read.content).toContain("A native browser preview");
    await expect.poll(() => h.traffic.commands().length).toBe(count + 1);
    expect(h.traffic.commands().at(-1)?.command?.tool).toBe("read_file");
    expect(await durable(page)).toEqual(before);
  } finally { await h.client.close(); }
});

// Headless Chromium ignores CDP Page.setWebLifecycleState for a visible page (no freeze/resume
// events fire), so these tests dispatch the document lifecycle events the transport listens to.
// A real renderer freeze and discard are preview checks (validation.md).
const lifecycle = (page: Page, type: "freeze" | "resume") => page.evaluate(name => document.dispatchEvent(new Event(name)), type);

test("freeze/resume (document lifecycle events): a frozen owner keeps its socket and answers after resume", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  try {
    const before = await durable(page), count = h.traffic.commands().length;
    await lifecycle(page, "freeze");
    await lifecycle(page, "resume");
    expect((await h.call("read_file", { path: "index.html" })).content).toContain("A native browser preview");
    expect(h.traffic.commands()).toHaveLength(count + 1);
    expect(h.traffic.ready()).toHaveLength(1);
    expect(await durable(page)).toEqual(before);
  } finally { await h.client.close(); }
});

test("takeover while the owner is frozen: on resume the old owner says taken over and never commits", async ({ page, context, baseURL }) => {
  const h = await connect(page, baseURL), second = await context.newPage(), traffic = frames(second);
  try {
    await page.keyboard.press("Escape");
    // Remembered on for this site: the new tab comes back with agents on.
    await open(second, baseURL); await second.locator(".repository-menu__trigger").click();
    await expect(second.getByRole("button", { name: "Take over", exact: true })).toBeVisible();
    await lifecycle(page, "freeze");
    await second.getByRole("button", { name: "Take over", exact: true }).click();
    await expect.poll(() => traffic.ready().length).toBe(1);
    expect(traffic.ready()[0].generation!).toBeGreaterThan(h.traffic.ready()[0].generation!);
    expect((await h.call("write_file", { path: "frozen.txt", content: "New owner", requestId: "frozen-takeover" })).state).toBe("applied");
    await lifecycle(page, "resume");
    await page.locator(".repository-menu__trigger").click();
    await expect(page.locator(".agent-menu__hint")).toContainText("Another tab took over");
    expect(h.traffic.commands()).toHaveLength(0);
    expect(traffic.commands().filter(frame => frame.command?.id === "frozen-takeover")).toHaveLength(1);
  } finally { await h.client.close(); await second.close(); }
});

test("discarded owner page: a fresh page recovers drafts and receipts from IndexedDB; nothing is replayed", async ({ page, context, baseURL }) => {
  const h = await connect(page, baseURL);
  const fresh = await context.newPage(), traffic = frames(fresh);
  try {
    expect((await h.call("write_file", { path: "discarded.txt", content: "Kept in the browser", requestId: "before-discard" })).state).toBe("applied");
    const before = await durable(page);
    await page.close(); // The renderer and its memory are gone; only IndexedDB remains.
    await open(fresh, baseURL); // Remembered on for this site: no Connect needed.
    await expect.poll(() => traffic.ready().length).toBe(1);
    expect(traffic.ready()[0].generation!).toBeGreaterThan(h.traffic.ready()[0].generation!);
    expect(traffic.commands()).toHaveLength(0);
    expect(await durable(fresh)).toEqual(before);
    expect(await h.call("get_command_status", { requestId: "before-discard" })).toMatchObject({ state: "applied" });
    expect(await h.call("write_file", { path: "discarded.txt", content: "Kept in the browser", requestId: "before-discard" })).toMatchObject({ state: "applied" });
    expect((await h.call("read_file", { path: "discarded.txt" })).content).toBe("Kept in the browser");
    expect(await durable(fresh)).toEqual(before);
    // Only the three calls above reached the fresh page: status, the duplicate, the read.
    expect(traffic.commands().map(frame => frame.command?.tool)).toEqual([undefined, "write_file", "read_file"]);
  } finally { await h.client.close(); await fresh.close(); }
});

test("relay reset (hibernation restore, socket kept): re-handshake, lost edit stays unknown, no replay; browser draft and sign-in survive", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  let pending: Promise<unknown> | undefined;
  try {
    expect((await h.call("write_file", { path: "survives.txt", content: "Browser only", requestId: "before-restart" })).state).toBe("applied");
    const before = await durable(page), ready = h.traffic.ready().length, commands = h.traffic.commands().length;
    await holdCommit(page);
    pending = h.call("write_file", { path: "lost-on-restart.txt", content: "Must not replay", requestId: "during-restart" });
    await expect.poll(() => h.traffic.commands().length).toBe(commands + 1);
    const response = await page.request.post(`${baseURL}/__demo/relay-reset`);
    expect(await response.json()).toEqual({ reset: 1 });
    await expect.poll(() => h.traffic.received.filter(frame => frame.type === "reset").length).toBe(1);
    await releaseCommit(page);
    await expect.poll(() => h.traffic.ready().length).toBe(ready + 1);
    expect(await pending).toMatchObject({ state: "unknown" });
    // The lost response is unknown; the live browser can reconcile its definite
    // pre-commit cancellation from the reset. No receipt means no application.
    expect(await h.call("get_command_status", { requestId: "during-restart" })).toMatchObject({ state: "cancelled" });
    expect((await h.call("read_file", { path: "survives.txt" })).content).toBe("Browser only");
    expect(h.traffic.commands().filter(frame => frame.command?.id === "during-restart" && frame.command.tool === "write_file")).toHaveLength(1);
    expect(await durable(page)).toEqual(before);
    expect((await page.request.get(`${baseURL}/api/session`)).ok()).toBe(true);
  } finally {
    await releaseCommit(page);
    try { await pending; } finally { await h.client.close(); }
  }
});

test("server restart closes the socket: tab reconnects to a fresh relay, lost edit stays unknown, nothing replayed", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  let pending: Promise<unknown> | undefined;
  try {
    expect((await h.call("write_file", { path: "kept.txt", content: "Before restart", requestId: "before-close" })).state).toBe("applied");
    const before = await durable(page), commands = h.traffic.commands().length;
    await holdCommit(page);
    pending = h.call("write_file", { path: "closed.txt", content: "Must not replay", requestId: "during-close" });
    await expect.poll(() => h.traffic.commands().length).toBe(commands + 1);
    expect(await (await page.request.post(`${baseURL}/__demo/relay-restart`)).json()).toEqual({ closed: 1 });
    expect(await pending).toMatchObject({ state: "unknown" });
    await releaseCommit(page);
    // A new socket and a fresh handshake on the replaced relay (reconnect backoff starts at 1 s).
    await expect.poll(() => h.traffic.ready().length, { timeout: 20_000 }).toBe(2);
    expect(await h.call("get_command_status", { requestId: "during-close" })).toMatchObject({ state: "cancelled" });
    expect(h.traffic.commands().filter(frame => frame.command?.id === "during-close" && frame.command.tool === "write_file")).toHaveLength(1);
    expect((await h.call("read_file", { path: "kept.txt" })).content).toBe("Before restart");
    expect(await durable(page)).toEqual(before);
    expect((await page.request.get(`${baseURL}/api/session`)).ok()).toBe(true);
  } finally {
    await releaseCommit(page);
    try { await pending; } finally { await h.client.close(); }
  }
});

test("MCP notifications/cancelled before commit: 0 drafts applied, status cancelled, duplicate never applies", async ({ page, baseURL }) => {
  const h = await connect(page, baseURL);
  const raw = (body: object) => page.request.post(`${baseURL}/mcp`, { headers: { Authorization: `Bearer ${h.token}`, Accept: "application/json, text/event-stream" }, data: body });
  let pending: ReturnType<typeof raw> | undefined;
  try {
    const before = await durable(page), count = h.traffic.commands().length;
    await holdCommit(page);
    pending = raw({ jsonrpc: "2.0", id: "cancel-lifecycle-call", method: "tools/call", params: { name: "write_file", arguments: { path: "cancelled.txt", content: "Never applied", requestId: "cancel-lifecycle-operation" } } });
    await expect.poll(() => h.traffic.commands().length).toBe(count + 1);
    expect((await raw({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "cancel-lifecycle-call" } })).status()).toBe(202);
    await expect.poll(() => h.traffic.received.filter(frame => frame.type === "cancel" && frame.reason === "cancelled").length).toBe(1);
    await releaseCommit(page); await pending;
    await expect.poll(() => h.call("get_command_status", { requestId: "cancel-lifecycle-operation" })).toMatchObject({ state: "cancelled" });
    expect(await h.call("write_file", { path: "cancelled.txt", content: "Never applied", requestId: "cancel-lifecycle-operation" })).toMatchObject({ state: "cancelled" });
    expect(await durable(page)).toEqual(before);
    await expect(heading(page)).toHaveText("A native browser preview");
  } finally {
    await releaseCommit(page);
    try { await pending; } finally { await h.client.close(); }
  }
});
