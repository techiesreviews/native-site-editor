import { readFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { textHash } from "../../shared/agent";
import { editorMounted } from "./drafts";

// Default native-save fixture: real Worker, AgentRelay and browser socket, no socket routes/mocks.
test("all migrated MCP reads and the site resource answer from browser drafts; a reload refuses immediately", async ({ page, context, baseURL }) => {
  const commands: { id: string; command: { tool: string } }[] = [];
  const messages: string[] = [], agentHttp: string[] = [], errors: string[] = [];
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

    // Typing on while the agent is connected: its reads give exactly what the preview shows.
    const typed = content.replace("Unsaved socket read draft", "Unsaved socket read draft, still typing");
    await page.evaluate(async ({ typed, modulePath }) => {
      const { monaco } = await import(modulePath) as typeof import("../../src/components/monaco");
      const view = monaco.editor.getEditors().find(item => item.getModel()?.uri.path.endsWith("/index.html"))!;
      view.executeEdits("socket-read-spec", [{ range: view.getModel()!.getFullModelRange(), text: typed }]);
    }, { typed, modulePath: "/src/components/monaco.ts" });
    await expect(heading).toHaveText("Unsaved socket read draft, still typing");
    const shown = await heading.textContent();
    const typedHash = await textHash(typed);
    expect(await call("read_file", { path: "index.html" })).toMatchObject({ source: "draft", content: typed, hash: typedHash });
    const typedPage = await call("get_page", { page: "/" });
    expect(typedPage).toMatchObject({ source: "draft", html: typed, hash: typedHash });
    expect(typedPage.html).toContain(`>${shown}</h1>`);
    // The hash read from the tab's text is the one a guarded edit checks against.
    await page.keyboard.press("Escape");
    const edited = await client.callTool({ name: "edit_file", arguments: { path: "index.html", expectedHash: typedHash, requestId: "socket-read-then-edit", waitSeconds: 0,
      edits: [{ oldText: "still typing", newText: "still typing, then edited" }] } });
    expect(edited.isError, JSON.stringify(edited)).toBeFalsy();
    expect(JSON.parse((edited.content as { text: string }[])[0].text)).toMatchObject({ state: "applied" });
    await expect(heading).toHaveText("Unsaved socket read draft, still typing, then edited");

    await page.reload();
    // Remote agents are remembered on for this site: the reloaded tab receives again, on the same grant.
    await expect.poll(async () => JSON.parse(((await client.callTool({ name: "get_site", arguments: {} })).content as { text: string }[])[0].text).available, { timeout: 30_000 }).not.toBe(false);
    const again = await client.callTool({ name: "read_file", arguments: { path: "index.html" } });
    expect(again.isError, JSON.stringify(again)).toBeFalsy();
    expect(JSON.parse((again.content as { text: string }[])[0].text).content).toContain("Unsaved socket read draft");
  } finally { await client.close(); }
  expect(errors).toEqual([]);
});
