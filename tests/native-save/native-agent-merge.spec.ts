import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { editorMounted } from "./drafts";

// Agents join the merge (ticket am-25): Lex and Anna, two browsers on the same page with live sharing switched on
// (it is off by default), and an agent connected over MCP whose commands Lex's tab receives. The agent rewrites the
// heading while Lex types in the next sentence; both land and every copy matches. The agent's words join the shared
// copy under its own Yjs client id: its caret shows in the code pane with its name, and its tag's undo takes back only
// its words, in both tabs. Default fixture group: the real Worker route, relay and live rooms (src/live-text.ts).
const pageErrors: string[] = [];
const file = "index.html";

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);

/** A browser signed in to the fixture's one GitHub account; with `name`, the session read names it so (Anna). Lex keeps the
 * account's own name: connecting an agent is for the account the session really names. */
async function person(browser: Browser, name?: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { if (window === window.top) localStorage.setItem("native-site-editor:live-sharing", "on"); });
  if (name) await context.route("**/api/session", async route => {
    const response = await route.fetch();
    const body = await response.json() as { user: { login: string } | null };
    if (body.user) body.user.login = name;
    await route.fulfill({ response, json: body });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}

/** Puts the code pane's caret after the first `after`; then the keyboard types there. */
async function caretAfter(page: Page, after: string) {
  const at = (await source(page)).indexOf(after) + after.length;
  await page.evaluate(async (at) => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
    editor.focus();
    editor.setPosition(editor.getModel()!.getPositionAt(at));
  }, at);
}

/** Shows `offset`'s place in the pane's code: unfolded (the head and sections open folded) and scrolled to. */
const reveal = (page: Page, offset: number) => page.evaluate(async (offset) => {
  const { monaco } = await import("/src/components/monaco.ts");
  const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
  await editor.getAction("editor.unfoldAll")?.run();
  editor.revealPosition(editor.getModel()!.getPositionAt(offset));
}, offset);

/** Connects an agent from Lex's repository menu (his tab receives its commands); an MCP client named "Claude Code". */
async function connectAgent(page: Page, baseURL: string | undefined) {
  const messages: string[] = [];
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "Claude Code", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name: tool, arguments: args });
    const value = JSON.parse((response.content as { text: string }[])[0].text);
    expect(Boolean(response.isError), JSON.stringify(value)).toBe(false);
    return value;
  };
  return { client, call };
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("an agent rewrites the heading while Lex types in the next sentence: both land on every copy, and its tag's undo takes back only its words", async ({ browser, baseURL }) => {
  const lex = await person(browser), anna = await person(browser, "Anna");
  let agent: Awaited<ReturnType<typeof connectAgent>> | undefined;
  try {
    await openEditor(lex.page, baseURL);
    await openEditor(anna.page, baseURL);
    await editorMounted(lex.page);
    await editorMounted(anna.page);
    // The shared copy is up: Anna's words reach Lex.
    await caretAfter(anna.page, "<head>");
    await anna.page.keyboard.type("<!-- Anna -->");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("<head><!-- Anna -->");

    agent = await connectAgent(lex.page, baseURL);
    const read = await agent.call("read_file", { path: file });

    // The agent rewrites the heading while Lex types in the sentence after it: he has typed since its read, his typing
    // is still open in the pane as its change lands, and he goes on typing after. (Keys pressed during the agent's own
    // commit are left out: see the ticket's Done for that race.)
    await caretAfter(lex.page, "Edit plain HTML");
    await lex.page.keyboard.type(", by", { delay: 30 });
    expect(await agent.call("edit_file", { path: file, expectedHash: read.hash, requestId: "agent-heading", waitSeconds: 0,
      edits: [{ oldText: "A native browser preview", newText: "A preview the agent wrote" }] })).toMatchObject({ state: "applied" });
    await lex.page.keyboard.type(" Lex,", { delay: 30 });
    for (const tab of [lex, anna]) {
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).toContain(">A preview the agent wrote</h1>");
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).toContain("Edit plain HTML, by Lex,");
    }
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);
    await expect(anna.page.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText("A preview the agent wrote");

    // The agent's caret shows in the code pane at Lex's and at Anna's, with its program's icon and its name.
    const flag = (page: Page) => page.locator('.live-caret__flag[data-agent][aria-label="Claude Code"]');
    for (const tab of [lex, anna]) {
      await reveal(tab.page, (await source(tab.page)).indexOf("A preview the agent wrote"));
      await expect(flag(tab.page)).toBeVisible({ timeout: 20_000 });
      await expect(flag(tab.page).locator("svg.live-caret__program")).toBeVisible();
    }

    // Lex takes it back from the agent's tag: only the agent's words go, in both tabs; Lex's and Anna's stay.
    await flag(lex.page).locator(".live-caret__mark").hover();
    const undo = flag(lex.page).getByRole("button", { name: "Undo Claude Code's change" });
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) {
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).toContain(">A native browser preview</h1>");
      const now = await source(tab.page);
      expect(now).not.toContain("A preview the agent wrote");
      expect(now).toContain("Edit plain HTML, by Lex,");
      expect(now).toContain("<head><!-- Anna -->");
    }
    expect(await source(anna.page)).toBe(await source(lex.page));
    await expect(anna.page.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText("A native browser preview");
    // Nothing more of the agent's to take back: the undo goes, its caret stays.
    await expect(undo).toBeHidden();
    await expect(flag(lex.page)).toBeVisible();
  } finally {
    await agent?.client.close();
    await lex.context.close();
    await anna.context.close();
  }
});
