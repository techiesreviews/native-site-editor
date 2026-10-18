import { readFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { editorMounted } from "./drafts";

// Default native-save fixture: real Worker, relay and browser socket. No page/socket mocks.
test("socket edits apply once; duplicate requestId and status return the receipt without another draft or Undo step", async ({ page, context, baseURL }) => {
  const messages: string[] = [], agentHttp: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/agent/")) agentHttp.push(path);
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await editorMounted(page);
  const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
  await expect(heading).toHaveText("A native browser preview");
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  const client = new Client({ name: "socket-edit-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const count = messages.filter(message => message.includes('"type":"command"')).length;
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    await expect.poll(() => messages.filter(message => message.includes('"type":"command"')).length).toBe(count + 1);
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  // Read durable records directly: storedDrafts() emits pagehide, which would stop the socket.
  const durable = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opened = indexedDB.open("native-site-editor-drafts");
      opened.onsuccess = () => resolve(opened.result); opened.onerror = () => reject(opened.error);
    });
    try {
      const read = (name: string) => new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return { drafts: await read("drafts"), receipts: await read("receipts") };
    } finally { db.close(); }
  });
  try {
    await page.keyboard.press("Escape");
    const original = await call("read_file", { path: "index.html" });
    const args = { path: "index.html", expectedHash: original.hash, edits: [{ oldText: "A native browser preview", newText: "One socket edit" }], requestId: "socket-edit-once", waitSeconds: 0 };
    const applied = await call("edit_file", args);
    expect(applied).toMatchObject({ requestId: args.requestId, state: "applied", result: { path: "index.html" } });
    await expect(heading).toHaveText("One socket edit");
    const beforeDuplicate = await durable();
    expect(beforeDuplicate.drafts).toHaveLength(1); expect(beforeDuplicate.receipts).toHaveLength(1);
    expect(await call("edit_file", args)).toEqual(applied);
    expect(await call("get_command_status", { requestId: args.requestId })).toEqual(applied);
    expect(await durable()).toEqual(beforeDuplicate);
    // Exactly one user Undo restores the original text after both deliveries.
    await page.locator(".code-editor__undo").first().click();
    await expect(heading).toHaveText("A native browser preview");
    expect(await call("edit_file", args)).toEqual(applied);
    await expect(heading).toHaveText("A native browser preview");
    const reused = await client.callTool({ name: "write_file", arguments: { path: "bad.txt", content: "different", requestId: args.requestId } });
    expect(reused.isError).toBe(true); expect(JSON.stringify(reused)).toMatch(/different work/);
    const unknown = await client.callTool({ name: "get_command_status", arguments: { requestId: "never-issued" } });
    expect(JSON.parse((unknown.content as { text: string }[])[0].text)).toMatchObject({ state: "unknown" });

    const created = await call("write_file", { path: "socket.txt", content: "Socket draft", requestId: "socket-create" });
    expect(created.state).toBe("applied");
    expect((await call("read_file", { path: "socket.txt" })).content).toBe("Socket draft");
    const moved = await call("move_file", { path: "socket.txt", to: "socket-moved.txt", requestId: "socket-move" });
    expect(moved.state).toBe("applied");
    expect((await call("read_file", { path: "socket-moved.txt" })).content).toBe("Socket draft");
    expect((await call("delete_file", { path: "socket-moved.txt", requestId: "socket-delete" })).state).toBe("applied");
    expect((await call("set_page_details", { page: "/", title: "Socket title", requestId: "socket-details" })).state).toBe("applied");
    expect((await call("create_page", { title: "Socket page", slug: "socket-page", requestId: "socket-page" })).state).toBe("applied");
    expect((await call("open_page", { page: "/", requestId: "socket-open" })).state).toBe("applied");
    expect((await call("inspect_preview", { page: "/", selector: ".hero h1" })).state).toBe("applied");

    // Section and component tools: prepared from the tab's own outline, one dispatch each; a duplicate is the receipt.
    const frame = page.frameLocator(".native-preview-frame");
    const home = await call("get_page", { page: "/", source: false });
    const addArgs = { page: "/", component: "feature-block", expectedHash: home.hash, after: "1.0", requestId: "socket-add" };
    const added = await call("add_section", addArgs);
    expect(added).toMatchObject({ state: "applied", result: { section: "1.1" } });
    await expect(frame.locator("main > feature-block")).toHaveCount(1);
    const afterAdd = await durable();
    expect(await call("add_section", addArgs)).toEqual(added);
    expect(await durable()).toEqual(afterAdd);
    await expect(frame.locator("main > feature-block")).toHaveCount(1);
    const withSection = await call("get_page", { page: "/", source: false });
    expect((await call("move_section", { page: "/", section: "1.1", after: "1.3", expectedHash: withSection.hash, requestId: "socket-move-section" })).state).toBe("applied");
    await expect(frame.locator("main > feature-block:last-child")).toHaveCount(1);
    const movedPage = await call("get_page", { page: "/", source: false });
    expect((await call("remove_section", { page: "/", section: "1.3", expectedHash: movedPage.hash, requestId: "socket-remove" })).state).toBe("applied");
    await expect(frame.locator("main > feature-block")).toHaveCount(0);
    const removed = await call("get_page", { page: "/", source: false });
    const filler = removed.sections.find((section: { key?: string }) => section.key === "filler");
    const made = await call("make_component", { page: "/", element: filler.id, tag: "section-socket", expectedHash: removed.hash, requestId: "socket-component" });
    expect(made).toMatchObject({ state: "applied", result: { tag: "section-socket" } });
    expect((await call("read_file", { path: "components/section-socket/section-socket.html" })).content).toContain("<slot");
    expect(agentHttp.filter(path => /\/(context|drafts|claim|ack)$/.test(path))).toEqual([]);
    expect(await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text()).toBe(readFileSync("fixtures/native-starter/index.html", "utf8"));
  } finally { await client.close(); }
  expect(errors).toEqual([]);
});
