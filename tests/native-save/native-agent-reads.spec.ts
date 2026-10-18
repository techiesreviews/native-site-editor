import { readFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { textHash } from "../../shared/agent";
import { editorMounted } from "./drafts";

// Default native-save fixture: real Worker, AgentRelay and browser socket, no socket routes/mocks.
test("all migrated MCP reads and the site resource answer from browser drafts; Turn off refuses immediately", async ({ page, context, baseURL }) => {
  const commands: { id: string; command: { tool: string } }[] = [];
  const messages: string[] = [], agentHttp: string[] = [], errors: string[] = [];
  let closed = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("websocket", socket => {
    if (!socket.url().includes("/api/agent/relay?")) return;
    socket.on("framereceived", ({ payload }) => {
      const message = String(payload);
      messages.push(message);
      if (message.startsWith("{")) {
        const value = JSON.parse(message);
        if (value.type === "command") commands.push(value);
      }
    });
    socket.on("close", () => { closed = true; });
  });
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/agent/")) agentHttp.push(path);
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  const original = readFileSync("fixtures/native-starter/index.html", "utf8");
  const content = original.replace("A native browser preview", "Unsaved socket read draft");
  await page.evaluate(async ({ content, modulePath }) => {
    const { monaco } = await import(modulePath) as typeof import("../../src/components/monaco");
    const view = monaco.editor.getEditors().find(item => item.getModel()?.uri.path.endsWith("/index.html"))!;
    view.executeEdits("socket-read-spec", [{ range: view.getModel()!.getFullModelRange(), text: content }]);
  }, { content, modulePath: "/src/components/monaco.ts" });
  await expect(heading).toHaveText("Unsaved socket read draft");
  // Do not flush with pagehide: that deliberately stops the remote transport.
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text()).toBe(original);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const answer = await made;
  expect(answer.ok()).toBe(true);
  const { token } = await answer.json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  const client = new Client({ name: "socket-read-spec", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const before = commands.length;
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    // Playwright delivers socket frame events asynchronously: the reply can arrive first.
    await expect.poll(() => commands.slice(before).map(value => value.command.tool)).toEqual([name]);
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  try {
    await page.keyboard.press("Escape");
    const site = await call("get_site");
    expect(site).toMatchObject({ repository: "native-demo-user/native-demo", branch: "main", pending: 0, openRequests: 0 });
    expect(site.changes).toContainEqual({ path: "index.html", kind: "M" });
    expect((await call("list_files")).files).toContain("index.html (M)");
    const hash = await textHash(content);
    expect(await call("read_file", { path: "index.html" })).toMatchObject({ path: "index.html", source: "draft", content, hash });
    expect((await call("export_site")).files).toContainEqual(expect.objectContaining({ path: "index.html", source: "draft", content, hash, draft: "M" }));
    expect(await call("get_page", { page: "/" })).toMatchObject({ file: "index.html", source: "draft", html: content, hash });
    await heading.click();
    await expect(page.getByRole("toolbar", { name: "Edit bar" })).toBeVisible();
    const selected = await call("get_selection");
    expect(selected.element).toMatchObject({ tag: "h1", file: "index.html", route: "/" });
    expect(selected.element.html).toContain("Unsaved socket read draft");
    const before = commands.length;
    const resource = await client.readResource({ uri: "native-site://site" });
    const summary = JSON.parse((resource.contents[0] as { text: string }).text);
    await expect.poll(() => commands.slice(before).map(value => value.command.tool)).toEqual(["get_site"]);
    expect(summary.changes).toContainEqual({ path: "index.html", kind: "M" });
    expect(summary.editor.previewSelection).toMatchObject({ tag: "h1" });
    expect(new Set(commands.map(value => value.id)).size).toBe(commands.length);
    expect(agentHttp.filter(path => /\/(context|drafts|claim|ack)$/.test(path))).toEqual([]);

    await page.locator(".repository-menu__trigger").click();
    await page.getByRole("button", { name: "Turn off", exact: true }).click();
    await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", "off");
    await expect.poll(() => closed).toBe(true);
    // Retain the grant: Turn off stops this tab, unlike Disconnect MCP which revokes it.
    const count = commands.length, started = Date.now();
    const unavailable = await client.callTool({ name: "read_file", arguments: { path: "index.html" } });
    expect(unavailable.isError).toBe(true);
    expect(JSON.stringify(unavailable)).toMatch(/editor.*(?:unavailable|not sharing)/i);
    expect(Date.now() - started).toBeLessThan(3000); // No ten-second dispatch wait or legacy mailbox polling.
    const off = await client.callTool({ name: "get_site", arguments: {} });
    expect(off.isError).toBeFalsy();
    expect(JSON.parse((off.content as { text: string }[])[0].text)).toMatchObject({ available: false });
    expect(commands).toHaveLength(count);
  } finally { await client.close(); }
  expect(errors).toEqual([]);
});
