import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { editorMounted } from "./drafts";

// Carets in Lex's real setups (TOOLS-219): Lex signed in with GitHub in one browser, and either a guest who opens his
// Edit together link in another browser (no account), or an agent he connected over MCP while nobody else has the page
// open. Each sees the other's caret, a thin line with a circle holding the first letter (an agent's program icon), on
// the page and, at Lex's, in the code pane. Default fixture group: the real Worker routes, relay and live rooms.
const pageErrors: string[] = [];
const file = "index.html";
const heading = "A native browser preview";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);
/** A caret's tag drawn on the page (not the code pane's), by the name it shows. */
const pageFlag = (page: Page, name: string) => page.locator(`.live-carets-page .live-caret__flag[aria-label="${name}"]`);
/** A caret's tag drawn in the code pane, by the name it shows. */
const codeFlag = (page: Page, name: string) => page.locator(`.monaco-editor .live-caret__flag[aria-label="${name}"]`);

/** Unfolds the code pane's sections (they open folded; a caret in a fold is not shown) and scrolls to `offset`. */
const reveal = (page: Page, offset: number) => page.evaluate(async (offset) => {
  const { monaco } = await import("/src/components/monaco.ts");
  const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
  await editor.getAction("editor.unfoldAll")?.run();
  editor.revealPosition(editor.getModel()!.getPositionAt(offset));
}, offset);

/** Whether the caret drawn for `flag` stands inside `element`'s box on the page. */
async function caretInside(flag: Locator, element: Locator) {
  const caret = await flag.locator("xpath=..").locator(".live-caret__line").boundingBox();
  const box = await element.boundingBox();
  if (!caret || !box) return false;
  const middle = caret.y + caret.height / 2;
  return caret.x >= box.x - 2 && caret.x <= box.x + box.width + 2 && middle >= box.y && middle <= box.y + box.height;
}

/** Starts typing in `target` on the page, the caret at its text's end. */
async function typeAtEnd(page: Page, target: Locator) {
  await clickOnText(target);
  await expect(target).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press("Control+End");
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

/** Lex shares from the project menu's Edit together row; the link from the clipboard. */
async function share(lex: Page) {
  await lex.evaluate(() => navigator.clipboard.writeText(""));
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Edit together", exact: true }).click();
  await expect.poll(() => lex.evaluate(() => navigator.clipboard.readText())).toMatch(/\/live\?s=/);
  const link = await lex.evaluate(() => navigator.clipboard.readText());
  await lex.keyboard.press("Escape");
  return link;
}

/** Another browser with nobody signed in opens the link and joins as `name`; resolves with its page and frame. */
async function guestJoins(browser: Browser, link: string, name: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(link);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  const shown = page.frameLocator(".live-guest__frame");
  await expect(shown.locator(".hero h1")).toHaveText(heading, { timeout: 20_000 });
  return { context, page, frame: shown };
}

test("a guest on Lex's edit link and Lex see each other's carets: on both pages, and in Lex's code pane", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  await expect(frame(lex).locator(".hero h1")).toHaveText(heading);
  const link = await share(lex);
  const anna = await guestJoins(browser, link, "Anna");
  try {
    // Anna types at the end of the heading: Lex sees her words, and her caret in them, with her first letter.
    const annaHeading = anna.frame.locator(".hero h1");
    await typeAtEnd(anna.page, annaHeading);
    await anna.page.keyboard.type(" together", { delay: 30 });
    await expect(frame(lex).locator(".hero h1")).toHaveText(`${heading} together`, { timeout: 20_000 });
    const annaOnPage = pageFlag(lex, "Anna");
    await expect(annaOnPage).toBeVisible({ timeout: 20_000 });
    await expect(annaOnPage.locator(".live-caret__mark b")).toHaveText("A");
    await expect.poll(() => caretInside(annaOnPage, frame(lex).locator(".hero h1")), { timeout: 10_000 }).toBe(true);
    // In his code pane too, at the end of her words.
    await reveal(lex, (await source(lex)).indexOf(" together") + " together".length);
    const annaInCode = codeFlag(lex, "Anna");
    await expect(annaInCode).toBeVisible({ timeout: 20_000 });
    await expect(annaInCode.locator(".live-caret__mark b")).toHaveText("A");

    // Lex types at the end of the lead paragraph: Anna sees his caret there on her page, with his first letter.
    const lead = frame(lex).locator(".hero .lead");
    await typeAtEnd(lex, lead);
    await lex.keyboard.type(" Lex", { delay: 30 });
    await expect(anna.frame.locator(".hero .lead")).toContainText("Lex", { timeout: 20_000 });
    const lexAtAnna = pageFlag(anna.page, "native-demo-user");
    await expect(lexAtAnna).toBeVisible({ timeout: 20_000 });
    await expect(lexAtAnna.locator(".live-caret__mark b")).toHaveText("N");
    await expect.poll(() => caretInside(lexAtAnna, anna.frame.locator(".hero .lead")), { timeout: 10_000 }).toBe(true);
    // Hover opens his full name.
    await lexAtAnna.locator(".live-caret__mark").hover();
    await expect(lexAtAnna.locator(".live-caret__name")).toHaveText("native-demo-user");
    // Anna's own caret is not drawn on her page.
    await expect(pageFlag(anna.page, "Anna")).toHaveCount(0);

    // Anna leaves: her caret goes from Lex's page and code pane.
    await anna.context.close();
    await expect(annaOnPage).toHaveCount(0, { timeout: 20_000 });
    await expect(annaInCode).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await anna.context.close();
  }
});

test("an agent Lex connected over MCP, with nobody else on the page, shows its caret with its program icon on the page and in the code pane", async ({ page: lex, baseURL }) => {
  test.setTimeout(120_000);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  await expect(frame(lex).locator(".hero h1")).toHaveText(heading);

  const messages: string[] = [];
  lex.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await lex.locator(".repository-menu__trigger").click();
  const made = lex.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await lex.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await lex.keyboard.press("Escape");
  const client = new Client({ name: "Claude Code", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  try {
    const call = async (tool: string, args: Record<string, unknown> = {}) => {
      const response = await client.callTool({ name: tool, arguments: args });
      const value = JSON.parse((response.content as { text: string }[])[0].text);
      expect(Boolean(response.isError), JSON.stringify(value)).toBe(false);
      return value;
    };
    const read = await call("read_file", { path: file });
    await call("edit_file", { path: file, expectedHash: read.hash, edits: [{ oldText: "A native", newText: "One agent's" }], requestId: "alone-heading", waitSeconds: 10 });
    await expect(frame(lex).locator(".hero h1")).toHaveText("One agent's browser preview", { timeout: 20_000 });
    await expect.poll(() => source(lex), { timeout: 10_000 }).toContain("One agent's browser preview");

    // Its caret shows in the heading's text on the page, with its program's icon and its name on hover.
    const onPage = pageFlag(lex, "Claude Code");
    await expect(onPage).toBeVisible({ timeout: 20_000 });
    await expect(onPage.locator("svg.live-caret__program")).toBeVisible();
    await expect.poll(() => caretInside(onPage, frame(lex).locator(".hero h1")), { timeout: 10_000 }).toBe(true);
    // And in the code pane.
    await reveal(lex, (await source(lex)).indexOf("One agent's"));
    const inCode = codeFlag(lex, "Claude Code");
    await expect(inCode).toBeVisible({ timeout: 20_000 });
    await expect(inCode.locator("svg.live-caret__program")).toBeVisible();
  } finally {
    await client.close();
  }
});
