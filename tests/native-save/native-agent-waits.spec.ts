import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page } from "@playwright/test";
import { clickOnText } from "./click-text";
import { editorMounted } from "./drafts";

// Ticket 52: an agent's change to the part Lex is typing in waits until he clicks away; a change
// elsewhere lands at once. Default native-save fixture: real Worker, relay and browser socket.
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

const frame = (page: Page) => page.frameLocator(".native-preview-frame");

/** Opens main's index.html, turns agents on and connects an MCP client. */
async function connect(page: Page, baseURL: string | undefined) {
  const messages: string[] = [];
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await editorMounted(page);
  await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview");
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "agent-waits-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  const ready = () => messages.filter(message => message.includes('"type":"ready"')).length;
  return { client, call, ready };
}

/** Lex types `text` at the end of the hero heading, which stays in typing. */
async function typeInHeading(page: Page, text: string) {
  const heading = frame(page).locator(".hero h1");
  await clickOnText(heading);
  await expect(heading).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press("End");
  await page.keyboard.type(text);
  await expect(heading).toContainText(text);
}

/** The stored drafts of `branch`, read without pagehide (which would stop the socket). */
const drafts = (page: Page, branch: string) => page.evaluate(async branch => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const opened = indexedDB.open("native-site-editor-drafts");
    opened.onsuccess = () => resolve(opened.result); opened.onerror = () => reject(opened.error);
  });
  try {
    const all = await new Promise<{ branch: string; path: string; content: string }[]>((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return all.filter(draft => draft.branch === branch).map(draft => ({ path: draft.path, content: draft.content }));
  } finally { db.close(); }
}, branch);

test("an agent's edit of the heading Lex types in waits until he clicks away, then lands on his typing; an edit elsewhere lands at once", async ({ page, baseURL }) => {
  const { client, call } = await connect(page, baseURL);
  try {
    await typeInHeading(page, " to");
    // Agents are told where he works.
    const working = { file: "index.html", route: "/", element: "1.0.0", tag: "h1", note: expect.stringMatching(/waiting/) };
    await expect.poll(async () => (await call("get_site")).editor.userEditing).toMatchObject(working);
    const shown = await call("get_page", { page: "/" });
    expect(shown.userEditing).toMatchObject(working);
    // An edit elsewhere on the page lands at once, beside his typing.
    const elsewhere = await call("edit_file", { path: "index.html", expectedHash: shown.hash, edits: [{ oldText: "Edit plain HTML", newText: "Edit simple HTML" }], requestId: "wait-elsewhere", waitSeconds: 0 });
    expect(elsewhere).toMatchObject({ state: "applied" });
    await expect(frame(page).locator(".hero .lead")).toContainText("Edit simple HTML");
    const heading = frame(page).locator(".hero h1");
    await expect(heading).toHaveText("A native browser preview to");
    // He types on (within the pause); the agent's edit of his heading waits, and a duplicate joins it.
    await page.keyboard.type("day");
    await expect(heading).toHaveText("A native browser preview today");
    const args = { path: "index.html", expectedHash: elsewhere.result.hash, edits: [{ oldText: "A native", newText: "One agent's" }], requestId: "wait-heading", waitSeconds: 0 };
    const waiting = await call("edit_file", args);
    expect(waiting).toMatchObject({ requestId: "wait-heading", state: "waiting", message: expect.stringMatching(/lands when they click away/) });
    expect(await call("get_command_status", { requestId: "wait-heading" })).toMatchObject({ state: "waiting" });
    expect(await call("edit_file", args)).toMatchObject({ state: "waiting" });
    await expect(heading).toHaveText("A native browser preview today");

    // He clicks away: his typing is written, then the agent's change lands on it, once.
    await clickOnText(frame(page).locator(".filler h2"));
    await expect.poll(async () => (await call("get_command_status", { requestId: "wait-heading" })).state, { timeout: 15_000 }).toBe("applied");
    await expect(heading).toHaveText("One agent's browser preview today");
    expect(await call("edit_file", args)).toMatchObject({ state: "applied" });
    await expect(heading).toHaveText("One agent's browser preview today");
    const source = (await call("read_file", { path: "index.html" })).content as string;
    expect(source).toContain(">One agent's browser preview today</h1>");
    expect(source).toContain("Edit simple HTML");
    expect((await call("get_site")).editor.userEditing).toBeNull();
  } finally { await client.close(); }
});

test("an agent's edit waiting for Lex lands on its own site as an unsaved change once he switches to another", async ({ page, baseURL }) => {
  const { client, call, ready } = await connect(page, baseURL);
  try {
    await typeInHeading(page, " now");
    const shown = await call("get_page", { page: "/" });
    expect(shown.userEditing).toMatchObject({ element: "1.0.0" });
    expect(await call("edit_file", { path: "index.html", expectedHash: shown.hash, edits: [{ oldText: "A native", newText: "Main's agent" }],
      requestId: "wait-switch", waitSeconds: 0 })).toMatchObject({ state: "waiting" });
    const before = ready();
    await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature" } });
    await page.evaluate(() => { location.hash = "repo=501&branch=feature&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
    // Left on main (typing there has paused since): it lands there, not here.
    await expect.poll(async () => (await drafts(page, "main")).map(draft => [draft.path, draft.content.includes(">Main's agent browser preview</h1>")]), { timeout: 20_000 })
      .toEqual([["index.html", true]]);
    expect(await drafts(page, "feature")).toEqual([]);
    await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview");
    // Back on main, agents on there again: it was applied.
    await page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect.poll(ready, { timeout: 30_000 }).toBeGreaterThan(before);
    await expect.poll(async () => (await call("get_command_status", { requestId: "wait-switch" })).state, { timeout: 15_000 }).toBe("applied");
    await expect(frame(page).locator(".hero h1")).toHaveText("Main's agent browser preview");
  } finally { await client.close(); }
});
