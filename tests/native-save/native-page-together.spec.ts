import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { editorMounted } from "./drafts";

// Typing together on the page (ticket am-23): Lex and Anna, two browsers on the same page with live sharing switched on
// (it is off by default). Typing on the page goes out letter by letter, and each sees the other's caret in the page's text,
// with the caret look of the code pane. Anna's tag ends with an undo that takes back only her words, in both tabs. An
// agent's change to the heading Lex types in waits until he clicks away; its caret then shows on the page in both tabs
// with its program's icon, and its tag's undo takes back only its words. Default fixture group: the real Worker route,
// relay and live rooms (src/live-text.ts).
const pageErrors: string[] = [];
const file = "index.html";

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
/** A caret's tag drawn on the page (not the code pane's), by the name it shows. */
const pageFlag = (page: Page, name: string) => page.locator(`.live-carets-page .live-caret__flag[aria-label="${name}"]`);

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

/** Both open the page and share it: Anna's typing in the code pane reaches Lex. */
async function shared(lex: Page, anna: Page, baseURL: string | undefined) {
  await openEditor(lex, baseURL);
  await openEditor(anna, baseURL);
  await editorMounted(lex);
  await editorMounted(anna);
  await expect(frame(lex).locator(".hero h1")).toHaveText("A native browser preview");
  await expect(frame(anna).locator(".hero h1")).toHaveText("A native browser preview");
  const at = (await source(anna)).indexOf("<head>") + "<head>".length;
  await anna.evaluate(async (at) => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
    editor.focus();
    editor.setPosition(editor.getModel()!.getPositionAt(at));
  }, at);
  await anna.keyboard.type("<!-- Anna -->");
  await expect.poll(() => source(lex), { timeout: 20_000 }).toContain("<head><!-- Anna -->");
}

/** Starts typing in `target` on the page, the caret at its text's end (or start). */
async function typeIn(page: Page, target: Locator, at: "End" | "Home") {
  // (Control: the text's very end or start, not its first line's.)
  await clickOnText(target);
  await expect(target).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press(`Control+${at}`);
}

/** Whether the caret drawn for `flag` stands inside `element`'s box on the page. */
async function caretInside(flag: Locator, element: Locator) {
  const caret = await flag.locator("xpath=..").locator(".live-caret__line").boundingBox();
  const box = await element.boundingBox();
  if (!caret || !box) return false;
  const middle = caret.y + caret.height / 2;
  return caret.x >= box.x - 2 && caret.x <= box.x + box.width + 2 && middle >= box.y && middle <= box.y + box.height;
}

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

test("Lex and Anna type in one paragraph on the page and end identical; each sees the other's caret in its text; Anna's tag takes back only her words", async ({ browser, baseURL }) => {
  const lex = await person(browser), anna = await person(browser, "Anna");
  try {
    await shared(lex.page, anna.page, baseURL);
    const lead = (page: Page) => frame(page).locator(".hero .lead");
    const before = await lead(lex.page).textContent() ?? "";

    // Both type in the lead paragraph at once: Anna at its start, Lex at its end, a key every 40 ms. (Anna clicks first:
    // a caret's circle stands over the line above it, and a click there opens its tag rather than typing.)
    await typeIn(anna.page, lead(anna.page), "Home");
    await typeIn(lex.page, lead(lex.page), "End");
    const lexTyped = " Lex types at the end", annaTyped = "Anna starts here. ";
    await Promise.all([lex.page.keyboard.type(lexTyped, { delay: 40 }), anna.page.keyboard.type(annaTyped, { delay: 40 })]);

    // Letter by letter, while both still type in it: every copy and both pages end identical, with both people's words.
    const both = `${annaTyped}${before.trim()}${lexTyped}`;
    for (const tab of [lex, anna]) {
      await expect.poll(async () => (await lead(tab.page).textContent())?.replace(/\s+/g, " ").trim(), { timeout: 20_000 }).toBe(both.trim());
      await expect(lead(tab.page)).toHaveAttribute("contenteditable", /.+/);
    }
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);
    expect(await source(lex.page)).toContain(annaTyped.trim());
    expect(await source(lex.page)).toContain(lexTyped.trim());

    // Each sees the other's caret in the paragraph's text: a circle with the first letter, the name only when it opens.
    const annaAtLex = pageFlag(lex.page, "Anna"), lexAtAnna = pageFlag(anna.page, "native-demo-user");
    await expect(annaAtLex).toBeVisible({ timeout: 20_000 });
    await expect(annaAtLex.locator(".live-caret__mark b")).toHaveText("A");
    await expect(lexAtAnna).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => caretInside(annaAtLex, lead(lex.page)), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => caretInside(lexAtAnna, lead(anna.page)), { timeout: 10_000 }).toBe(true);
    // Anna's caret stands after her words, Lex's at the paragraph's end: no element is outlined for them.
    const annaLine = await annaAtLex.locator("xpath=..").locator(".live-caret__line").boundingBox();
    const leadBox = await lead(lex.page).boundingBox();
    expect(annaLine!.x).toBeGreaterThan(leadBox!.x + 20);

    // Lex takes Anna's change back from her tag: her words go in both tabs, his stay.
    await annaAtLex.locator(".live-caret__mark").hover();
    const undo = annaAtLex.getByRole("button", { name: "Undo Anna's change" });
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) {
      await expect.poll(async () => (await lead(tab.page).textContent())?.replace(/\s+/g, " ").trim(), { timeout: 20_000 }).toBe(`${before.trim()}${lexTyped}`);
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain(annaTyped.trim());
      expect(await source(tab.page)).toContain(lexTyped.trim());
    }
    // Her earlier change (the comment typed in the code pane) is next; once that goes too, the undo goes.
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain("<!-- Anna -->");
    await expect(undo).toBeHidden();
    expect(await source(anna.page)).toBe(await source(lex.page));
    expect(await source(lex.page)).toContain(lexTyped.trim());
  } finally {
    await lex.context.close();
    await anna.context.close();
  }
});

test("an agent's heading change waits while Lex types in the heading and lands after he clicks away; its caret shows on the page with its icon, and its undo takes back only its words", async ({ browser, baseURL }) => {
  const lex = await person(browser), anna = await person(browser, "Anna");
  let agent: Awaited<ReturnType<typeof connectAgent>> | undefined;
  try {
    await shared(lex.page, anna.page, baseURL);
    agent = await connectAgent(lex.page, baseURL);
    const heading = (page: Page) => frame(page).locator(".hero h1");

    // Lex types in the heading; his letters reach Anna as he types, before he leaves it.
    await typeIn(lex.page, heading(lex.page), "End");
    await lex.page.keyboard.type(" today", { delay: 30 });
    await expect(heading(anna.page)).toHaveText("A native browser preview today", { timeout: 20_000 });
    await expect(pageFlag(anna.page, "native-demo-user")).toBeVisible({ timeout: 20_000 });

    // The agent's change to the heading waits while he types there.
    const read = await agent.call("read_file", { path: file });
    const args = { path: file, expectedHash: read.hash, edits: [{ oldText: "A native", newText: "One agent's" }], requestId: "page-heading", waitSeconds: 0 };
    expect(await agent.call("edit_file", args)).toMatchObject({ state: "waiting", message: expect.stringMatching(/lands once they leave it/) });
    await expect(heading(lex.page)).toHaveText("A native browser preview today");
    await expect(heading(anna.page)).toHaveText("A native browser preview today");

    // He clicks away: the change lands on his typing, in both tabs.
    await clickOnText(frame(lex.page).locator(".filler h2"));
    await expect.poll(async () => (await agent!.call("get_command_status", { requestId: "page-heading" })).state, { timeout: 15_000 }).toBe("applied");
    for (const tab of [lex, anna]) await expect(heading(tab.page)).toHaveText("One agent's browser preview today", { timeout: 20_000 });
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);

    // The agent's caret shows in the heading's text in both tabs, with its program's icon.
    for (const tab of [lex, anna]) {
      const flag = pageFlag(tab.page, "Claude Code");
      await expect(flag).toBeVisible({ timeout: 20_000 });
      await expect(flag.locator("svg.live-caret__program")).toBeVisible();
      await expect.poll(() => caretInside(flag, heading(tab.page)), { timeout: 10_000 }).toBe(true);
    }

    // Anna takes the agent's change back from its tag on her page: only its words go, in both tabs; Lex's stay.
    const flag = pageFlag(anna.page, "Claude Code");
    await flag.locator(".live-caret__mark").hover();
    const undo = flag.getByRole("button", { name: "Undo Claude Code's change" });
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) await expect(heading(tab.page)).toHaveText("A native browser preview today", { timeout: 20_000 });
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);
    await expect(undo).toBeHidden();
  } finally {
    await agent?.client.close();
    await lex.context.close();
    await anna.context.close();
  }
});
