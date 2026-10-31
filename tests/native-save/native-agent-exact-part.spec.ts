import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Ticket 10: several agents on one page. An edit targets the exact words or section it changes, so changes
// elsewhere on the page never refuse it; a true clash is refused with the part as it is now, and every reply
// tells the agent what changed since its last call. Default native-save fixture: real Worker, relay and socket.
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

const frame = (page: Page) => page.frameLocator(".native-preview-frame");

/** An MCP client on `token`, whose calls answer the reply's JSON and whether it was an error. */
async function agent(baseURL: string | undefined, token: string, name: string) {
  const client = new Client({ name, version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const raw = async (tool: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name: tool, arguments: args });
    return { error: Boolean(response.isError), value: JSON.parse((response.content as { text: string }[])[0].text) };
  };
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const { error, value } = await raw(tool, args);
    expect(error, JSON.stringify(value)).toBe(false);
    return value;
  };
  return { client, raw, call };
}

/** Opens main's index.html, turns agents on, and connects two agents, each on its own connection. */
async function connectTwo(page: Page, baseURL: string | undefined) {
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
  const second = await page.request.post(`${baseURL}/api/agent/connect`, { headers: { Origin: new URL(page.url()).origin },
    data: { repo: "native-demo-user/native-demo", repoId: 501, branch: "main" } });
  expect(second.ok()).toBe(true);
  return { a: await agent(baseURL, token, "agent-a"), b: await agent(baseURL, (await second.json() as { token: string }).token, "agent-b") };
}

test("two agents change different sections of one page at once, from the same read; both land with no refusal", async ({ page, baseURL }) => {
  const { a, b } = await connectTwo(page, baseURL);
  try {
    const [readA, readB] = await Promise.all([a.call("get_page", { page: "/" }), b.call("get_page", { page: "/" })]);
    expect(readA.hash).toBe(readB.hash);
    expect(readA.sections.map((section: { id: string }) => section.id)).toEqual(["1.0", "1.1", "1.2"]);
    // Sent together: whichever applies second finds the page changed elsewhere, and lands on it.
    const [hero, filler] = await Promise.all([
      a.call("edit_file", { path: "index.html", expectedHash: readA.hash, edits: [{ oldText: "Edit plain HTML", newText: "Edit simple HTML" }], requestId: "a-hero", waitSeconds: 0 }),
      b.call("edit_file", { path: "index.html", expectedHash: readB.hash, edits: [{ oldText: "Scroll to verify", newText: "Scroll to check" }], requestId: "b-filler", waitSeconds: 0 }),
    ]);
    expect([hero.state, filler.state]).toEqual(["applied", "applied"]);
    // A section command read before both changes still lands: the cards section itself is unchanged.
    expect(await b.call("remove_section", { page: "/", section: "1.1", expectedHash: readB.hash, requestId: "b-cards", waitSeconds: 0 })).toMatchObject({ state: "applied" });
    await expect(frame(page).locator(".hero .lead")).toContainText("Edit simple HTML");
    await expect(frame(page).locator(".filler h2")).toHaveText("Scroll to check");
    await expect(frame(page).locator(".cards")).toHaveCount(0);
    const source = (await a.call("read_file", { path: "index.html" })).content as string;
    expect(source).toContain("Edit simple HTML");
    expect(source).toContain("Scroll to check");
    expect(source).not.toContain('class="cards"');
  } finally { await Promise.all([a.client.close(), b.client.close()]); }
});

test("two agents change the same words: the second is refused with them as they are now, retries at once and lands", async ({ page, baseURL }) => {
  const { a, b } = await connectTwo(page, baseURL);
  try {
    const [readA, readB] = await Promise.all([a.call("get_page", { page: "/" }), b.call("get_page", { page: "/" })]);
    expect(await a.call("edit_file", { path: "index.html", expectedHash: readA.hash, edits: [{ oldText: "A native browser preview", newText: "Agent A's preview" }],
      requestId: "a-heading", waitSeconds: 0 })).toMatchObject({ state: "applied" });
    await expect(frame(page).locator(".hero h1")).toHaveText("Agent A's preview");
    const clash = await b.raw("edit_file", { path: "index.html", expectedHash: readB.hash, edits: [{ oldText: "A native browser preview", newText: "Agent B's preview" }],
      requestId: "b-heading", waitSeconds: 0 });
    expect(clash.error).toBe(true);
    expect(clash.value).toMatchObject({ state: "conflict", message: expect.stringMatching(/changed meanwhile/),
      part: { path: "index.html", text: expect.stringContaining(">Agent A's preview</h1>"), lines: { start: expect.any(Number), end: expect.any(Number) } },
      // The reply tells B what changed since its read: A's change of the home page.
      changesSinceLastRead: { files: [{ path: "index.html", change: "changed" }] } });
    // Nothing of B's landed; it retries against the part, at once, and lands.
    await expect(frame(page).locator(".hero h1")).toHaveText("Agent A's preview");
    const retry = await b.call("edit_file", { path: "index.html", expectedHash: clash.value.part.hash, edits: [{ oldText: "Agent A's preview", newText: "Agent B's preview" }],
      requestId: "b-heading-again", waitSeconds: 0 });
    expect(retry).toMatchObject({ state: "applied" });
    expect(retry.changesSinceLastRead).toBeUndefined();
    await expect(frame(page).locator(".hero h1")).toHaveText("Agent B's preview");
    // A is told of B's change on its next call; B's own change is never told back to B.
    expect((await a.call("get_site")).changesSinceLastRead).toMatchObject({ files: [{ path: "index.html", change: "changed", sections: ["1.0"] }] });
    expect((await b.call("get_site")).changesSinceLastRead).toBeUndefined();
  } finally { await Promise.all([a.client.close(), b.client.close()]); }
});
